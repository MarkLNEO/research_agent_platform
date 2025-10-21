import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildSystemPrompt, type AgentType } from '../_lib/systemPrompt.js';
import { buildMemoryBlock } from '../_lib/memory.js';
import { assertEmailAllowed } from '../_lib/access.js';
import {
  buildResolvedPreferences,
  upsertPreferences,
  type PreferenceUpsert,
  type PreferenceRow,
  type ResolvedPrefs,
} from '../../../lib/preferences/store.js';
import { resolveEntity, learnAlias } from '../../../lib/entities/aliasResolver.js';
import { addOpenQuestion, resolveOpenQuestion } from '../../../lib/followups/openQuestions.js';
import { SummarySchemaZ, type SummarySchema } from '../../../shared/summarySchema.js';

// Feature flag: preferences/aliases/structured summary
// Server reads from process.env; default OFF for safety
const PREFS_SUMMARY_ENABLED = (process.env.PREFS_SUMMARY_ENABLED === 'true');

const NON_RESEARCH_TERMS = new Set([
  'hi', 'hello', 'hey', 'thanks', 'thank you', 'agenda', 'notes', 'help', 'update', 'updates',
  'plan', 'planning', 'what', 'who', 'why', 'how', 'where', 'when', 'test'
]);

const SUMMARY_JSON_SCHEMA = {
  name: 'summary_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      company_overview: { type: 'string' },
      value_drivers: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      eco_profile: {
        type: 'object',
        additionalProperties: false,
        required: ['initiatives'],
        properties: {
          initiatives: { type: 'array', items: { type: 'string' } },
          certifications: { type: 'array', items: { type: 'string' } },
        },
      },
      tech_stack: { type: 'array', items: { type: 'string' } },
      buying_centers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'relevance'],
          properties: {
            title: { type: 'string' },
            relevance: { type: 'string' },
          },
        },
      },
      next_actions: { type: 'array', items: { type: 'string' } },
    },
    required: ['company_overview', 'value_drivers', 'risks', 'tech_stack', 'buying_centers', 'next_actions'],
  },
} as const;

const AFFIRMATIVE_RE = /\b(yes|yep|yeah|yup|sure|absolutely|definitely|of course|sounds good|please do|do it|go ahead|let's do it|make it so|confirmed|that's right|sure thing|ok|okay|k|roger|yessir)\b/i;
const NEGATIVE_RE = /\b(no|nope|nah|not now|maybe later|don't|do not|not really|pass)\b/i;

function normalizePreferenceKey(key: string | null | undefined): string {
  if (typeof key !== 'string') return '';
  return key.trim().toLowerCase();
}

function slugifyPreferenceTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function labelFromPreferenceKey(key: string): string {
  if (!key) return '';
  const segments = key.split('.');
  const last = segments[segments.length - 1] || key;
  return last.replace(/_/g, ' ');
}

function extractExplicitPreferencePhrases(text: string): string[] {
  const phrases = new Set<string>();
  const pattern = /\b(remember|keep|include|focus on|prioritize|highlight|emphasize|spotlight|track|monitor)\b([\s\S]*?)(?=[.!?\n]|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    let fragment = (match[2] || '').trim();
    fragment = fragment.replace(/^[:\-\s]+/, '');
    fragment = fragment.replace(/^(?:on|the|all|any|about)\s+/i, '');
    fragment = fragment.replace(/(?:for|in)\s+(?:future|all|every)\s+(?:briefs?|reports?|research|responses|writeups)(?:\s+(?:going|moving)\s+forward)?[^.?!]*$/i, '');
    fragment = fragment.replace(/(?:going forward|moving forward|next time|from now on)[^.?!]*$/i, '');
    fragment = fragment.replace(/^(?:to|that)\s+/i, '');
    fragment = fragment.replace(/^["'`]+|["'`]+$/g, '');
    fragment = fragment.replace(/\s+/g, ' ').trim();
    if (!fragment) continue;
    const wordCount = fragment.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0 || wordCount > 12) continue;
    phrases.add(fragment);
  }

  const savePattern = /(?:save|remember)\s+(?:preference\s*)?:?\s*["'`]?(?<phrase>[a-z0-9][^"'`\n]{2,80})["'`]?\s*(?:for\s+(?:future|all)\s+(?:briefs?|reports?|research|responses))?(?=[.!?\n]|$)/gi;
  let saveMatch: RegExpExecArray | null;
  while ((saveMatch = savePattern.exec(text)) !== null) {
    const fragment = (saveMatch.groups?.phrase || '').trim();
    if (!fragment) continue;
    const wordCount = fragment.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0 || wordCount > 12) continue;
    phrases.add(fragment.replace(/\s+/g, ' '));
  }

  return Array.from(phrases);
}

function detectPreferenceAffirmations(
  message: string,
  openQuestions: any[]
): Array<{ pref: PreferenceUpsert; label?: string }> {
  const trimmed = (message || '').trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const results: Array<{ pref: PreferenceUpsert; label?: string }> = [];
  const seen = new Set<string>();

  const addPreference = (key: string, label?: string, value?: any, confidence = 0.95) => {
    const normalized = normalizePreferenceKey(key);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    results.push({
      pref: {
        key: normalized,
        value: value ?? { on: true, label: label || labelFromPreferenceKey(normalized) },
        confidence,
        source: 'followup',
      },
      label: label || labelFromPreferenceKey(normalized),
    });
  };

  const explicitPhrases = extractExplicitPreferencePhrases(trimmed);
  for (const phrase of explicitPhrases) {
    const slug = slugifyPreferenceTerm(phrase);
    if (!slug) continue;
    addPreference(`focus.${slug}`, phrase);
  }

  if (results.length === 0) {
    if (NEGATIVE_RE.test(lower) && !AFFIRMATIVE_RE.test(lower)) {
      return [];
    }

    if (AFFIRMATIVE_RE.test(lower)) {
      for (const question of openQuestions || []) {
        const prefKey = normalizePreferenceKey(question?.context?.preference_key);
        if (!prefKey) continue;
        const label = typeof question?.context?.label === 'string'
          ? question.context.label
          : labelFromPreferenceKey(prefKey);
        const fallbackValue = question?.context?.preference_value ?? { on: true, label };
        addPreference(prefKey, label, fallbackValue, 0.9);
      }
    }
  }

  return results;
}

// Helper function to estimate tokens
function estimateTokens(text = '') {
  return Math.ceil((text || '').length / 4);
}

// Helper function to check user credits
async function checkUserCredits(supabase, userId) {
  const INITIAL_CREDITS = 1000;
  let { data: userRow } = await supabase
    .from('users')
    .select('id, credits_remaining, credits_total_used, approval_status')
    .eq('id', userId)
    .maybeSingle();

  if (!userRow) {
    const { data: inserted } = await supabase
      .from('users')
      .insert({
        id: userId,
        credits_remaining: INITIAL_CREDITS,
        credits_total_used: 0,
        // Default to approved to avoid first-run block; admins can adjust later
        approval_status: 'approved'
      })
      .select('id, credits_remaining, credits_total_used, approval_status')
      .single();
    userRow = inserted;
  }

  // Allow pending users to proceed in self-serve flows
  if (userRow?.approval_status === 'pending') {
    return {
      hasCredits: true,
      remaining: userRow?.credits_remaining || INITIAL_CREDITS,
      needsApproval: false,
      message: null,
    };
  }

  if (userRow?.approval_status === 'rejected') {
    return {
      hasCredits: false,
      remaining: 0,
      needsApproval: true,
      message: 'Your account access has been restricted. Please contact support'
    };
  }

  const remaining = userRow?.credits_remaining || 0;
  if (remaining <= 0) {
    return {
      hasCredits: false,
      remaining: 0,
      message: 'You have used all your free credits. Please contact support to request additional credits.'
    };
  }

  return {
    hasCredits: true,
    remaining,
    message: null
  };
}

// Helper function to log usage
async function logUsage(supabase, userId, actionType, tokensUsed, metadata = {}) {
  await supabase
    .from('usage_logs')
    .insert({
      user_id: userId,
      action_type: actionType,
      tokens_used: tokensUsed,
      tool_name: 'chat',
      metadata
    });
}

// Helper function to deduct credits
async function deductCredits(supabase, userId, tokensUsed) {
  const creditsToDeduct = Math.ceil(tokensUsed / 1000);

  const { error } = await supabase.rpc('deduct_user_credits', {
    p_user_id: userId,
    p_credits: creditsToDeduct
  });

  if (error) {
    console.error('Failed to deduct credits:', error);
  }
}

async function fetchUserContext(client, userId: string) {
  const { data, error } = await client.rpc('get_user_context', { p_user: userId });
  if (error) {
    console.error('get_user_context error:', error);
    throw error;
  }
  const ctx = (data || {}) as any;
  const preferences = Array.isArray(ctx?.preferences) ? (ctx.preferences as PreferenceRow[]) : [];
  const resolvedPrefs = buildResolvedPreferences(ctx?.prompt_config || null, preferences);
  const openQuestions = Array.isArray(ctx?.open_questions) ? ctx.open_questions : [];
  (ctx as any).recent_preference_confirmations = [];
  (ctx as any).recent_alias_confirmations = [];
  return {
    profile: ctx?.profile || null,
    customCriteria: ctx?.custom_criteria || [],
    signals: ctx?.signals || [],
    disqualifiers: ctx?.disqualifiers || [],
    promptConfig: ctx?.prompt_config || null,
    reportPreferences: ctx?.report_preferences || [],
    preferences,
    resolvedPrefs,
    openQuestions,
    unresolvedEntities: [],
    recentPreferenceConfirmations: [],
    recentAliasConfirmations: [],
  };
}

function classifyResearchIntent(raw: string) {
  const text = (raw || '').trim();
  if (!text) return false;
  const RESEARCH_VERBS = /(research|analy[sz]e|investigate|look\s*up|deep\s*dive|latest\s+news|competitive|funding|hiring|tech(?:\s|-)?stack|security|signals?|tell me about|what is|who is)/i;
  const COMPANY_INDICATORS = /(inc\.|corp\.|ltd\.|llc|company|co\b)/i;
  const ALL_SYNONYMS = /\ball(\s+of\s+the\s+(above|those|them))?\b/i;
  const hasVerb = RESEARCH_VERBS.test(text);
  const companyLike = /\b[A-Z][\w&]+(?:\s+[A-Z][\w&]+){0,3}\b/.test(text) && COMPANY_INDICATORS.test(text);
  const allPhrase = ALL_SYNONYMS.test(text);
  if (hasVerb || companyLike || allPhrase) return true;

  const extracted = extractCompanyName(text);
  if (extracted) {
    if (NON_RESEARCH_TERMS.has(text.toLowerCase())) {
      return false;
    }
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount <= 4) {
      return true;
    }
  }

  return false;
}

function summarizeContextForPlan(userContext: any) {
  if (!userContext) return '';
  const bits: string[] = [];
  const profile = userContext.profile || {};
  if (profile.company_name) bits.push(`Your org: ${profile.company_name}`);
  if (profile.industry) bits.push(`Industry: ${profile.industry}`);
  if (Array.isArray(profile.target_titles) && profile.target_titles.length) {
    bits.push(`Target titles: ${profile.target_titles.slice(0, 4).join(', ')}`);
  }
  if (Array.isArray(userContext.customCriteria) && userContext.customCriteria.length) {
    const criteria = userContext.customCriteria
      .slice(0, 4)
      .map((c: any) => `${c.field_name}${c.importance ? ` (${c.importance})` : ''}`)
      .join(', ');
    bits.push(`Custom criteria: ${criteria}`);
  }
  if (userContext.resolvedPrefs?.focus) {
    const focusKeys = Object.keys(userContext.resolvedPrefs.focus).slice(0, 3);
    if (focusKeys.length) bits.push(`Focus prefs: ${focusKeys.join(', ')}`);
  }
  if (Array.isArray(userContext.signals) && userContext.signals.length) {
    const signals = userContext.signals
      .slice(0, 3)
      .map((s: any) => s.signal_type || s.type)
      .filter(Boolean)
      .join(', ');
    if (signals) bits.push(`Monitored signals: ${signals}`);
  }

  return bits.join('\n');
}

function extractCompanyName(raw: string | null | undefined) {
  if (!raw) return '';
  let text = String(raw || '').trim();
  if (!text) return '';

  const actionPrefix = /^(summarize|continue|resume|draft|write|compose|email|refine|save|track|start|generate|rerun|retry|copy|share|compare)\b/i;
  if (actionPrefix.test(text)) {
    return '';
  }

  const leadingVerb = /^(research|analy[sz]e|investigate|look\s*up|deep\s*dive|tell me about|find|discover|explore|dig into)\s+/i;
  text = text.replace(leadingVerb, '').trim();
  text = text.replace(/\?/g, '').trim();

  const stopMatch = text.match(/\s+(?:in|at|for|with|that|who|which|using|focused|within)\s+/i);
  if (stopMatch?.index) {
    text = text.slice(0, stopMatch.index).trim();
  }

  text = text.replace(/^[^A-Za-z0-9(]+/, '').replace(/[^A-Za-z0-9)&.\-\s]+$/, '').trim();
  if (!text) return '';

  const words = text.split(/\s+/).slice(0, 6);
  if (!words.length) return '';

  const formatted = words
    .map((word) => {
      if (!word) return '';
      if (word.toUpperCase() === word) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();

  if (/^\d+$/.test(formatted)) return '';
  if (formatted.length > 80) return '';
  return formatted;
}

function buildRecentDialog(messages: any[], limit = 6): string {
  return (messages || [])
    .slice(-limit)
    .map((m: any) => {
      const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
      const content = String(m.content || '').replace(/\s+/g, ' ').trim();
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
}

function shouldAttemptPreferenceExtraction(message: string): boolean {
  if (!message || message.length < 6) return false;
  const lowered = message.toLowerCase();
  if (/\b(skip|hi|hello|thanks|thank you|bye)\b/.test(lowered) && message.length < 40) return false;
  return (
    /\b(prefer|preference|focus|more about|less about|always|never|stop|include|exclude|priority|care about|need more|look for)\b/i.test(message)
    || /[A-Z]{2,}/.test(message)
    || /!\s*$/.test(message)
    || message.length > 40
  );
}

function parseSummaryJson(raw: string): { summary: SummarySchema | null; error?: Error } {
  try {
    const parsed = JSON.parse(raw);
    const result = SummarySchemaZ.safeParse(parsed);
    if (!result.success) {
      return { summary: null, error: result.error }; // zod error extends Error
    }
    return { summary: result.data, error: undefined };
  } catch (err: any) {
    return { summary: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

async function extractPreferenceCandidates(
  openai: OpenAI,
  userId: string,
  lastUserMessage: any,
  messages: any[],
  resolvedPrefs: ResolvedPrefs | undefined
): Promise<PreferenceUpsert[]> {
  const text = String(lastUserMessage?.content || '').trim();
  if (!text || !shouldAttemptPreferenceExtraction(text)) return [];

  try {
    const recentDialog = buildRecentDialog(messages);
    const payload = {
      latest_message: text,
      recent_dialog: recentDialog,
      resolved_preferences: resolvedPrefs || {},
    };

    const instructions = [
      'You extract persistent research preferences from the user\'s latest message.',
      'Return STRICT JSON with shape: {"preferences":[{"key":string,"value":any,"confidence":number,"source":"followup"}]}',
      'Only emit preferences if the user states or confirms a durable preference.',
      'Use lowercase dot-notation keys (e.g., "focus.eco", "coverage.depth").',
      'Values must be valid JSON (objects for complex preferences).',
      'Confidence must be between 0 and 1. Default source is "followup".',
      'Return {"preferences":[]} when there is nothing to save.',
    ].join('\n');

    const stream = await openai.responses.stream(
      {
        model: 'gpt-5-mini',
        instructions,
        input: JSON.stringify(payload, null, 2),
        text: { format: { type: 'text' }, verbosity: 'low', max_output_tokens: 200 },
        store: false,
        metadata: { agent: 'preference_extractor', user_id: userId },
      },
    );

    let buffer = '';
    for await (const event of stream as any) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        buffer += event.delta;
      }
    }

    try { await stream.finalResponse(); } catch {}

    let parsed: any = null;
    try {
      const trimmed = buffer.trim();
      if (!trimmed) return [];
      parsed = JSON.parse(trimmed);
    } catch (parseError) {
      console.warn('[preferences] extractor returned non-JSON payload', parseError);
      return [];
    }

    const preferences = Array.isArray(parsed?.preferences) ? parsed.preferences : [];
    return preferences
      .filter((pref: any) => pref && typeof pref.key === 'string')
      .map((pref: any) => ({
        key: pref.key,
        value: pref.value ?? null,
        confidence: typeof pref.confidence === 'number' ? pref.confidence : undefined,
        source: pref.source === 'setup' ? 'setup' : pref.source === 'implicit' ? 'implicit' : 'followup',
      })) as PreferenceUpsert[];
  } catch (error) {
    console.error('[preferences] extraction failed', error);
    return [];
  }
}

function mergePreferenceRows(
  existing: PreferenceRow[],
  upserts: PreferenceUpsert[],
  userId: string
): PreferenceRow[] {
  if (!upserts.length) return existing;
  const map = new Map<string, PreferenceRow>();
  for (const row of existing || []) {
    if (row && typeof row.key === 'string') {
      map.set(row.key, row);
    }
  }

  const now = new Date().toISOString();
  for (const pref of upserts) {
    const key = pref.key;
    const current = map.get(key);
    if (current) {
      map.set(key, {
        ...current,
        value: pref.value,
        confidence: pref.confidence ?? current.confidence,
        source: pref.source || current.source || 'followup',
        updated_at: now,
      });
    } else {
      map.set(key, {
        id: `local-${key}-${now}`,
        user_id: userId,
        key,
        value: pref.value,
        confidence: pref.confidence ?? 0.8,
        source: pref.source || 'followup',
        created_at: now,
        updated_at: now,
      } as PreferenceRow);
    }
  }
  return Array.from(map.values());
}

function extractAliasCandidates(text: string): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  const regex = /\b[0-9A-Za-z][0-9A-Za-z\-\+\._/]{1,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const term = match[0];
    if (!term) continue;
    if (term.length < 3 || term.length > 48) continue;
    const hasDigit = /\d/.test(term);
    const hasUpper = /[A-Z]/.test(term);
    if (!hasDigit && !hasUpper) continue;
    tokens.add(term);
  }
  return Array.from(tokens).slice(0, 12);
}

async function resolveCanonicalEntities(text: string, additionalTerms: string[] = []): Promise<{ resolved: Array<{
  canonical: string;
  type: string;
  confidence: number;
  matched: string;
}>; unresolved: string[] }> {
  const rawCandidates = [...extractAliasCandidates(text), ...additionalTerms.filter(Boolean)];
  const uniqueCandidates = Array.from(new Set(rawCandidates.map(candidate => candidate.trim()))).filter(Boolean);
  if (!uniqueCandidates.length) {
    return { resolved: [], unresolved: [] };
  }

  const remaining = new Set(uniqueCandidates.map(candidate => candidate.toLowerCase()));
  const results: Array<{
    canonical: string;
    type: string;
    confidence: number;
    matched: string;
  }> = [];

  for (const term of uniqueCandidates) {
    try {
      const resolved = await resolveEntity(term);
      if (resolved) {
        const canonicalKey = resolved.canonical.toLowerCase();
        const exists = results.find(r => r.canonical.toLowerCase() === canonicalKey);
        if (!exists) {
          results.push({
            canonical: resolved.canonical,
            type: resolved.type,
            confidence: resolved.confidence,
            matched: term,
          });
        }
        remaining.delete(term.toLowerCase());
      }
    } catch (error) {
      console.warn('[aliasResolver] resolve failed for term', term, error);
    }
  }

  return { resolved: results, unresolved: Array.from(remaining) };
}

function selectRelevantOpenQuestions(openQuestions: any[] | null | undefined, request: string, limit = 2): any[] {
  if (!Array.isArray(openQuestions) || openQuestions.length === 0) return [];
  const loweredRequest = (request || '').toLowerCase();
  const tokens = loweredRequest ? loweredRequest.split(/[^a-z0-9]+/i).filter(tok => tok.length >= 3) : [];

  const scored = openQuestions.map((question: any) => {
    const text = String(question?.question || '').toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (text.includes(token)) score += 2;
    }
    const topic = String(question?.context?.topic || '').toLowerCase();
    if (topic && loweredRequest.includes(topic)) score += 3;
    const askedAt = question?.asked_at ? Date.parse(question.asked_at) : 0;
    return { question, score, askedAt };
  });

  const filtered = scored
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.askedAt - b.askedAt;
    })
    .slice(0, Math.max(1, limit))
    .map(item => item.question);

  return filtered;
}

function detectAliasAffirmations(message: string): Array<{ canonical: string; alias: string }> {
  const results: Array<{ canonical: string; alias: string }> = [];
  if (!message) return results;
  const pattern = /"?([A-Za-z0-9][A-Za-z0-9\s\-\+\/&]{1,})"?\s*(?:=|is|equals|means)\s*"?([A-Za-z0-9][A-Za-z0-9\s\-\+\/&]{1,})"?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message))) {
    const left = match[1].trim();
    const right = match[2].trim();
    if (!left || !right || left.toLowerCase() === right.toLowerCase()) continue;
    const leftScore = left.split(/\s+/).length + (/[0-9]/.test(left) ? 1.5 : 0);
    const rightScore = right.split(/\s+/).length + (/[0-9]/.test(right) ? 1.5 : 0);
    // Prefer the phrase with more words as canonical to capture full product names
    const canonical = rightScore >= leftScore ? right : left;
    const alias = canonical === right ? left : right;
    if (alias.length <= 40 && canonical.length <= 80) {
      results.push({ canonical, alias });
    }
  }
  return results;
}

export const config = {
  runtime: 'nodejs',
  // Allow up to 600s if plan supports it; we still self‑abort earlier.
  maxDuration: 600,
  // Pin close to users/OpenAI for lower latency. Adjust if your users are elsewhere.
  regions: ['sfo1'],
};

export default async function handler(req: any, res: any) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Supabase
  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string | undefined;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    project: process.env.OPENAI_PROJECT,
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = (req.body || {}) as any;

  // Get auth header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  let keepAlive: NodeJS.Timeout | null = null;
  // Global abort controller to ensure we never exceed platform limits
  const abortController = new AbortController();
  const overallTimeoutMs = (() => {
    const fromEnv = Number(process.env.STREAMING_DEADLINE_MS);
    if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv; // trust operator-provided deadline
    // Default: conservative 280s for older deployments
    return 280000;
  })();
  const overallTimeout = setTimeout(() => {
    try { abortController.abort(); } catch {}
  }, overallTimeoutMs);

  try {
    const processStart = Date.now();
    const token = authHeader.replace('Bearer ', '').trim();
    let user: any = null;

    if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
      const impersonateId = body?.impersonate_user_id || body?.user_id || body?.bulk_user_id;
      if (!impersonateId || typeof impersonateId !== 'string') {
        return res.status(400).json({ error: 'impersonate_user_id is required when using a service role token' });
      }
      const { data: impersonated, error: adminErr } = await supabase.auth.admin.getUserById(impersonateId);
      if (adminErr || !impersonated?.user) {
        console.error('Impersonation lookup failed:', adminErr);
        return res.status(401).json({ error: 'Unable to impersonate user for service request' });
      }
      user = impersonated.user;
    } else {
      const { data, error: authError } = await supabase.auth.getUser(token);
      if (authError || !data?.user) {
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
      user = data.user;
    }

    try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }

    // Check user credits
    const creditCheck = await checkUserCredits(supabase, user.id);
    if (!creditCheck.hasCredits) {
      return res.status(403).json({
        error: creditCheck.message,
        needsApproval: creditCheck.needsApproval,
        remaining: creditCheck.remaining
      });
    }
    const authAndCreditMs = Date.now() - processStart;

    // Parse request body
    const { messages, systemPrompt, chatId, chat_id, agentType = 'company_research', config: userConfig = {}, research_type, active_subject } = body as any;
    const fastMode = false;
    const activeContextCompany = typeof active_subject === 'string' ? active_subject.trim() : '';
    const runId = `${chatId || chat_id || 'chat'}:${Date.now()}`;
    const requestedMode = (research_type as 'deep' | 'quick' | 'specific' | undefined);

    const contextFetchStart = Date.now();
    const userContext = await fetchUserContext(supabase, user.id);
    const originalOpenQuestions = Array.isArray(userContext.openQuestions)
      ? [...userContext.openQuestions]
      : [];
    const contextFetchMs = Date.now() - contextFetchStart;

    const pendingPreferenceEvents: Array<{ key: string; label?: string }> = [];
    const pendingAliasEvents: Array<{ alias: string; canonical: string }> = [];

    // Subject recall: tiny snapshot of last saved research for active_subject
    let subjectSnapshot = '';
    try {
      if (active_subject && typeof active_subject === 'string' && active_subject.trim().length >= 2) {
        const { data: ro } = await supabase
          .from('research_outputs')
          .select('subject, executive_summary')
          .eq('user_id', user.id)
          .ilike('subject', `%${active_subject}%`)
          .order('created_at', { ascending: false })
          .limit(1);
        if (ro && ro.length) {
          const exec = (ro[0].executive_summary || '').slice(0, 400);
          subjectSnapshot = `\n\n## SUBJECT CONTEXT\nUse only if relevant; prefer fresh research.\n### ${ro[0].subject}\n${exec}`;
        }
      }
    } catch {}

    // Avoid encouraging verbose internal narration; let the model decide when brief progress helps.
    let input;
    let lastUserMessage: any = null;
    let effectiveRequest = '';
    let fallbackInstructions: string | null = null;
    let effectiveMode: 'quick' | 'deep' | 'specific' | undefined;

    // If we have messages array, convert it to the Responses API format
    if (messages && messages.length > 0) {
      // For Responses API, we need to convert messages to a string format
      // The Responses API expects input as a string, not an array
      // Get just the last user message for research
      lastUserMessage = messages
        .filter(msg => msg.role === 'user')
        .pop();

      if (lastUserMessage) {
        // Intent classification: decide whether to perform research or just reply briefly
        const _text = String(lastUserMessage.content || '').trim();
        let _isResearchQuery = classifyResearchIntent(_text);
        if (!_isResearchQuery && (research_type || activeContextCompany)) {
          _isResearchQuery = true;
        }
        console.log('[DEBUG] Research classification', {
          raw: _text,
          classified: _isResearchQuery,
          research_type,
          activeContextCompany
        });
        req.__isResearchQuery = _isResearchQuery;

        effectiveRequest = lastUserMessage.content || '';
        if (_isResearchQuery && activeContextCompany) {
          const extractedCompanyName = extractCompanyName(lastUserMessage.content);
          const pronounMatch = /\b(their|they|them|it|its)\b/i.test(lastUserMessage.content);
          const followUpMatch = /\b(ceo|cto|cfo|founder|leadership|headquarters|hq|revenue|funding|employees|valuation|security|stack|product|roadmap)\b/i.test(lastUserMessage.content);
          if (!extractedCompanyName && (pronounMatch || followUpMatch)) {
            effectiveRequest = `${lastUserMessage.content}\n\nContext: The company in focus is ${activeContextCompany}.`;
          }
        } else if (_isResearchQuery && !activeContextCompany) {
          // Fallback: extract a subject from the request and pass it as explicit context
          const dc = extractCompanyName(lastUserMessage.content);
          if (dc) {
            effectiveRequest = `${lastUserMessage.content}\n\nContext: The company in focus is ${dc}.`;
          }
        }

        if (_isResearchQuery || research_type) {
          // Build explicit research task input and include brief recent context
          const recentWindow = 4;
          const recent = (messages || []).slice(-recentWindow).map((m: any) => {
            const role = m.role === 'user' ? 'User' : (m.role === 'assistant' ? 'Assistant' : 'System');
            const text = String(m.content || '').replace(/\s+/g, ' ').trim();
            return `${role}: ${text}`;
          }).join('\n');
          input = `Task: Perform company research as specified in the instructions.\n\nRecent context (last turns):\n${recent}\n\nRequest: ${effectiveRequest}\n\nPlease use the web_search tool to research this company and provide a concise, well-formatted analysis following the output structure defined in the instructions.`;
        } else {
          // Generic small talk / non-research: short helpful reply only (no web_search)
          // Defer assignment to declared instructions later in the flow
          fallbackInstructions = 'You are a concise assistant for a company research tool. Respond briefly and help the user formulate a research request. Do not perform web_search unless explicitly asked for research.';
          input = lastUserMessage.content;
        }
      } else {
        // Fallback to conversation format if no user message
        const conversationText = messages
          .map(msg => {
            if (msg.role === 'user') {
              return `User: ${msg.content}`;
            } else if (msg.role === 'assistant') {
              return `Assistant: ${msg.content}`;
            }
            return msg.content;
          })
          .join('\n\n');

        input = conversationText;
      }

      // Add debug logging to see what we're sending
      console.log('[DEBUG] Formatted input for Responses API:', input.substring(0, 200) + '...');
    } else {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Extract follow-up preferences and canonical entities before building prompt
    if (lastUserMessage) {
      try {
        if (PREFS_SUMMARY_ENABLED) {
          const labelMap = new Map<string, string>();
          const preferenceMap = new Map<string, PreferenceUpsert>();

          const affirmed = detectPreferenceAffirmations(String(lastUserMessage.content || ''), originalOpenQuestions);
          for (const detection of affirmed) {
            const normalizedKey = normalizePreferenceKey(detection.pref?.key);
            if (!normalizedKey) continue;
            const existing = preferenceMap.get(normalizedKey);
            if (!existing || (detection.pref.confidence ?? 0) >= (existing.confidence ?? 0)) {
              preferenceMap.set(normalizedKey, { ...detection.pref, key: normalizedKey });
            }
            if (!labelMap.has(normalizedKey)) {
              labelMap.set(normalizedKey, detection.label || labelFromPreferenceKey(normalizedKey));
            }
          }

          const extracted = await extractPreferenceCandidates(
            openai,
            user.id,
            lastUserMessage,
            messages,
            userContext.resolvedPrefs
          );
          for (const pref of extracted) {
            const normalizedKey = normalizePreferenceKey(pref.key);
            if (!normalizedKey) continue;
            const existing = preferenceMap.get(normalizedKey);
            if (!existing || (pref.confidence ?? 0) >= (existing.confidence ?? 0)) {
              preferenceMap.set(normalizedKey, { ...pref, key: normalizedKey });
            }
            if (!labelMap.has(normalizedKey)) {
              labelMap.set(normalizedKey, labelFromPreferenceKey(normalizedKey));
            }
          }

          const combinedPreferences = Array.from(preferenceMap.values());
          if (combinedPreferences.length) {
            const savedKeys = await upsertPreferences(user.id, combinedPreferences, supabase);
            if (savedKeys.length) {
              const savedSet = new Set(savedKeys.map(normalizePreferenceKey));
              const savedEntries = combinedPreferences.filter(pref => savedSet.has(normalizePreferenceKey(pref.key)));
              if (savedEntries.length) {
                userContext.preferences = mergePreferenceRows(userContext.preferences || [], savedEntries, user.id);
                userContext.resolvedPrefs = buildResolvedPreferences(userContext.promptConfig, userContext.preferences as PreferenceRow[]);
                const savedConfirmations = savedEntries.map(pref => ({
                  key: pref.key,
                  label: labelMap.get(pref.key) || labelFromPreferenceKey(pref.key),
                }));
                (userContext as any).recentPreferenceConfirmations = savedConfirmations;
                if (savedConfirmations.length) {
                  pendingPreferenceEvents.push(...savedConfirmations);
                }
                try {
                  await logUsage(supabase, user.id, 'preference.upsert', 0, {
                    keys: savedEntries.map(pref => pref.key),
                    source: savedEntries.map(pref => pref.source || 'followup'),
                    run_id: runId,
                  });
                } catch (logErr) {
                  console.warn('[telemetry] preference.upsert log failed', logErr);
                }
                const remainingQuestions: any[] = [];
                for (const question of userContext.openQuestions || []) {
                  const targetKey = normalizePreferenceKey(question?.context?.preference_key);
                  const prefMatch = savedEntries.find(pref => targetKey && pref.key === targetKey);
                  if (prefMatch && question?.id) {
                    try {
                      await resolveOpenQuestion(question.id, { resolution: `Preference ${prefMatch.key} captured.` }, supabase);
                      try {
                        await logUsage(supabase, user.id, 'followup.resolved', 0, { question_id: question.id, preference_key: prefMatch.key, run_id: runId });
                      } catch (logErr) {
                        console.warn('[telemetry] followup.resolved log failed', logErr);
                      }
                    } catch (resolveErr) {
                      console.error('[openQuestions] failed to resolve question', resolveErr);
                      remainingQuestions.push(question);
                    }
                  } else {
                    remainingQuestions.push(question);
                  }
                }
                userContext.openQuestions = remainingQuestions;
              }
            }
          }
        }
      } catch (prefErr) {
        console.error('[preferences] failed to process extracted preferences', prefErr);
      }

      try {
        const aliasTerms: string[] = [];
        if (activeContextCompany) aliasTerms.push(activeContextCompany);
        const { resolved: resolvedEntities, unresolved } = await resolveCanonicalEntities(String(lastUserMessage.content || ''), aliasTerms);
        if (resolvedEntities.length) {
          (userContext as any).canonicalEntities = resolvedEntities;
          const canonicalSummary = resolvedEntities
            .map(item => `${item.canonical}${item.matched ? ` (from “${item.matched}”)` : ''}`)
            .join(', ');
          effectiveRequest = `${effectiveRequest}\n\nCanonical entities resolved: ${canonicalSummary}.`;
          if (typeof input === 'string' && input) {
            input = `${input}\n\nCanonical entities resolved for context: ${canonicalSummary}`;
          }
        }
        if (unresolved.length) {
          (userContext as any).unresolvedEntities = unresolved;
          try {
            const existingAliasQuestions = new Set<string>();
            if (Array.isArray(userContext.openQuestions)) {
              for (const question of userContext.openQuestions || []) {
                const aliasTerm = typeof question?.context?.alias_term === 'string'
                  ? String(question.context.alias_term).toLowerCase()
                  : '';
                if (aliasTerm) existingAliasQuestions.add(aliasTerm);
              }
            }
            for (const term of unresolved) {
              const lowered = term.toLowerCase();
              if (!lowered || existingAliasQuestions.has(lowered)) continue;
              const created = await addOpenQuestion(user.id, {
                question: `Quick clarification: what does "${term}" stand for so I can remember it for future research?`,
                context: {
                  topic: 'alias',
                  alias_term: term,
                },
              }, supabase);
              if (created) {
                existingAliasQuestions.add(lowered);
                userContext.openQuestions = [...(userContext.openQuestions || []), created];
              }
            }
          } catch (aliasFollowErr) {
            console.error('[aliasResolver] failed to queue alias follow-up', aliasFollowErr);
          }
        }
      } catch (aliasErr) {
        console.error('[aliasResolver] canonical resolution failed', aliasErr);
      }

      try {
        const aliasPairs = detectAliasAffirmations(String(lastUserMessage.content || ''));
        if (aliasPairs.length) {
          const aliasConfirmations: Array<{ alias: string; canonical: string }> = Array.isArray((userContext as any).recentAliasConfirmations)
            ? [...(userContext as any).recentAliasConfirmations]
            : [];

          for (const pair of aliasPairs) {
            let alreadyKnown = false;
            try {
              const existing = await resolveEntity(pair.alias);
              if (existing && existing.canonical.toLowerCase() === pair.canonical.toLowerCase() && existing.confidence >= 0.95) {
                alreadyKnown = true;
              }
            } catch (resolveErr) {
              console.warn('[aliasResolver] failed to check existing alias', resolveErr);
            }

            await learnAlias(pair.canonical, pair.alias, { source: 'followup' });
            try {
              await logUsage(supabase, user.id, 'alias.learned', 0, {
                canonical: pair.canonical,
                alias: pair.alias,
                run_id: runId,
              });
            } catch (logErr) {
              console.warn('[telemetry] alias.learned log failed', logErr);
            }

            if (!alreadyKnown) {
              aliasConfirmations.push({ alias: pair.alias, canonical: pair.canonical });
            }
          }

          if (aliasConfirmations.length) {
            (userContext as any).recentAliasConfirmations = aliasConfirmations;
            pendingAliasEvents.push(...aliasConfirmations);
            if (Array.isArray((userContext as any).unresolvedEntities) && (userContext as any).unresolvedEntities.length) {
              const lowered = aliasConfirmations.map(entry => entry.alias.toLowerCase());
              (userContext as any).unresolvedEntities = (userContext as any).unresolvedEntities.filter((term: string) => !lowered.includes(term.toLowerCase()));
            }

            if (Array.isArray(userContext.openQuestions) && userContext.openQuestions.length) {
              const aliasLookup = new Map<string, string>();
              for (const entry of aliasConfirmations) {
                aliasLookup.set(entry.alias.toLowerCase(), entry.canonical);
              }
              const remainingAliasQuestions: any[] = [];
              for (const question of userContext.openQuestions || []) {
                const aliasTerm = typeof question?.context?.alias_term === 'string'
                  ? String(question.context.alias_term).toLowerCase()
                  : '';
                if (aliasTerm && aliasLookup.has(aliasTerm) && question?.id) {
                  try {
                    await resolveOpenQuestion(question.id, { resolution: `Alias "${aliasTerm}" learned as ${aliasLookup.get(aliasTerm)}.` }, supabase);
                    try {
                      await logUsage(supabase, user.id, 'followup.resolved', 0, {
                        question_id: question.id,
                        alias_term: aliasTerm,
                        canonical: aliasLookup.get(aliasTerm),
                        run_id: runId,
                      });
                    } catch (logErr) {
                      console.warn('[telemetry] followup.resolved log failed', logErr);
                    }
                  } catch (resolveErr) {
                    console.error('[openQuestions] failed to resolve alias question', resolveErr);
                    remainingAliasQuestions.push(question);
                  }
                } else {
                  remainingAliasQuestions.push(question);
                }
              }
              userContext.openQuestions = remainingAliasQuestions;
            }
          }
        }
      } catch (aliasLearnErr) {
        console.error('[aliasResolver] learn alias failed', aliasLearnErr);
      }
    }

    if (lastUserMessage) {
      userContext.openQuestions = selectRelevantOpenQuestions(
        userContext.openQuestions,
        String(lastUserMessage.content || ''),
        2
      );
    } else {
      userContext.openQuestions = [];
    }

    // Estimate tokens for usage tracking
    const totalEstimatedTokens = estimateTokens(JSON.stringify(messages));

    // Build canonical system instructions with updated preferences/context
    let instructions = buildSystemPrompt(userContext as any, agentType as AgentType, body.research_type);
    if (fallbackInstructions) {
      instructions = fallbackInstructions;
    }
    try {
      const allowClientPrompt = Boolean((userConfig || {}).allow_client_prompt === true);
      if (allowClientPrompt && typeof systemPrompt === 'string' && systemPrompt.trim().length > 0) {
        instructions += `\n\n<client_addendum>(Non-authoritative) Additional client instructions:\n${systemPrompt.trim()}\n</client_addendum>`;
      }
    } catch {}

    try {
      const memoryBlock = await buildMemoryBlock(user.id, agentType as string);
      if (memoryBlock) {
        instructions = `${memoryBlock}\n\n${instructions}`;
      }
    } catch (memoryError) {
      console.error('[memory] failed to load memory block', memoryError);
    }

    if (subjectSnapshot) instructions += subjectSnapshot;

    const lockClarifiers = Boolean(userConfig?.clarifiers_locked || research_type);
    if (lockClarifiers) {
      instructions += `\n\n<clarifiers_policy>Clarifiers are locked for this request. Do not ask setup questions or present checklists. Proceed with standard coverage using sensible defaults.</clarifiers_policy>`;
    }
    if (typeof userConfig?.facet_budget === 'number') {
      instructions += `\n\n<facet_budget>${userConfig.facet_budget}</facet_budget>`;
    }
    if (typeof userConfig?.summary_brevity === 'string') {
      instructions += `\n\n<summary_brevity>${userConfig.summary_brevity}</summary_brevity>`;
    }

    try {
      const guard = (userContext.promptConfig as any)?.guardrail_profile;
      if (guard) instructions += `\n\n<guardrails>Use guardrail profile: ${guard}. Respect source allowlists and safety constraints.</guardrails>`;
    } catch {}

    try {
      const tpl = (userConfig as any)?.template;
      if (requestedMode !== 'specific' && tpl && Array.isArray(tpl.sections) && tpl.sections.length > 0) {
        const sectionList = tpl.sections.map((s: any) => `## ${s.label || s.id}`).join(`\n`);
        const tplBlock = `\n\n<output_sections>Use the following sections in this exact order. Do not add placeholders and do not invent extra headings.\n${sectionList}\n</output_sections>`;
        instructions += tplBlock;
      }
    } catch {}

    // Set up streaming response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    try {
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    } catch (flushErr) {
      console.warn('Failed to flush headers early:', flushErr);
    }

    let responseClosed = false;
    const safeWrite = (payload: string) => {
      if (responseClosed) return;
      try {
        res.write(payload);
      } catch (writeErr) {
        responseClosed = true;
        console.error('SSE write failed:', writeErr);
      }
    };
    res.on('close', () => {
      responseClosed = true;
      if (keepAlive) {
        clearTimeout(keepAlive);
        keepAlive = null;
      }
      // Ensure upstream OpenAI stream cancels if client disconnects
      try { abortController.abort(); } catch {}
      try { clearTimeout(overallTimeout); } catch {}
    });

    if (pendingPreferenceEvents.length) {
      safeWrite(`data: ${JSON.stringify({ type: 'preference_saved', preferences: pendingPreferenceEvents })}\n\n`);
    }
    if (pendingAliasEvents.length) {
      safeWrite(`data: ${JSON.stringify({ type: 'alias_learned', aliases: pendingAliasEvents })}\n\n`);
    }

    try {
      // Add more detailed debugging
      console.log('[DEBUG] System instructions length:', instructions?.length || 0);
      console.log('[DEBUG] System instructions full text:\n', instructions);
      console.log('[DEBUG] Input full text:\n', input);
      console.log('[DEBUG] ENABLE_PROMPT_DEBUG resolved to:', process.env.ENABLE_PROMPT_DEBUG);

      const requestText = lastUserMessage?.content || '';
      const normalizedRequest = requestText.toLowerCase();
      const isResearchQuery = research_type ? true : !!req.__isResearchQuery;
      const defaultModel = (() => {
        // Default all research modes to gpt-5-mini for cost efficiency
        return 'gpt-5-mini';
      })();
      const selectedModel = userConfig.model || defaultModel;
      // Auto-detect mode for short follow-ups when active subject exists
      const shortQ = /^(who|what|when|where|which|how|do|does|did|is|are|was|were)\b/i.test((lastUserMessage?.content || '').trim()) && ((lastUserMessage?.content || '').trim().length <= 120);
      const autoMode = (activeContextCompany && shortQ) ? 'specific' : undefined;
      effectiveMode = (autoMode || research_type) as 'quick'|'deep'|'specific'|undefined;
      // Deep runs demand richer reasoning; quick/specific stay lightweight
      const reasoningEffort = (effectiveMode === 'deep') ? 'medium' : 'low';
      const isQuick = effectiveMode === 'quick';

      // Summarization mode: if the client passed summarize_source, bypass research flow
      const summarizeSource = (userConfig as any)?.summarize_source as string | undefined;
      if (summarizeSource && typeof summarizeSource === 'string' && summarizeSource.trim().length > 0) {
        if (!PREFS_SUMMARY_ENABLED) {
          // Flag disabled: do not run summary JSON flow; notify client gracefully
          try { await logUsage(supabase, user.id, 'summary_error', 0, { parse_reason: 'feature_flag_disabled', model: 'gpt-5-mini', run_id: runId }); } catch {}
          safeWrite(`data: ${JSON.stringify({ type: 'summary_error', message: 'Structured summary is disabled.' })}\n\n`);
          safeWrite('data: [DONE]\n\n');
          responseClosed = true;
          return;
        }
        const baseInstructions = [
          'Summarize the research for an enterprise Account Executive as structured JSON.',
          'Return exactly the SummarySchema fields: company_overview (string), value_drivers[], risks[], optional eco_profile{initiatives[], certifications[]}, tech_stack[], buying_centers[{title,relevance}], next_actions[].',
          'Each array should contain 3-5 concise, evidence-backed items when information exists; use descriptive fallbacks like "Unknown" inside the array when data is missing.',
          'Buying centers must explain why each role matters. Highlight risks that could stall a deal. Keep company_overview to 2 sentences.',
          'Do not include markdown, prose, or commentary outside JSON. Do not call web_search.',
        ].join('\n');
        const baseInput = `SOURCE\n---\n${summarizeSource}\n---\nGenerate SummarySchema JSON only.`;

        const attemptSummary = async (attempt: number): Promise<{ summary: SummarySchema | null; error?: Error }> => {
          const tighten = attempt > 1;
          const instructions = tighten
            ? `${baseInstructions}\nReturn strict JSON that matches SummarySchema exactly. No markdown, no commentary.`
            : baseInstructions;

          const stream = await openai.responses.stream({
            model: 'gpt-5-mini',
            instructions,
            input: baseInput,
            response_format: { type: 'json_schema', json_schema: SUMMARY_JSON_SCHEMA },
            store: false,
            metadata: {
              agent: 'company_research',
              stage: tighten ? 'user_summarize_retry' : 'user_summarize',
              chat_id: chatId || null,
              user_id: user.id,
            },
          }, { signal: abortController.signal });

          let jsonBuffer = '';
          try {
            for await (const chunk of stream as any) {
              if (responseClosed) break;
              if (chunk.type === 'response.output_json.delta' && typeof chunk.delta === 'string') {
                jsonBuffer += chunk.delta;
              } else if (chunk.type === 'response.output_text.delta' && typeof chunk.delta === 'string') {
                jsonBuffer += chunk.delta;
              }
            }

            if (!jsonBuffer) {
              const final = await stream.finalResponse();
              const directJson = (final as any)?.output_json || (final as any)?.output_text;
              if (typeof directJson === 'string') {
                jsonBuffer = directJson;
              } else if (Array.isArray((final as any)?.output)) {
                const flattened = (final as any).output
                  .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
                  .find((entry: any) => typeof entry?.json === 'string' || typeof entry?.text === 'string');
                if (flattened?.json) jsonBuffer = flattened.json;
                else if (flattened?.text) jsonBuffer = flattened.text;
              }
            } else {
              await stream.finalResponse();
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              throw err;
            }
            console.error('[summary] streaming error', err);
            return { summary: null, error: err instanceof Error ? err : new Error(String(err)) };
          }

          if (!jsonBuffer.trim()) {
            return { summary: null, error: new Error('Empty summary payload') };
          }

          return parseSummaryJson(jsonBuffer.trim());
        };

        let summaryPayload: SummarySchema | null = null;
        let attempt = 0;
        let lastError: Error | undefined;

        while (attempt < 2 && !summaryPayload) {
          attempt += 1;
          try {
            const { summary, error } = await attemptSummary(attempt);
            summaryPayload = summary;
            lastError = error;
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              safeWrite(`data: ${JSON.stringify({ type: 'timeout', message: 'Stream aborted (deadline).' })}\n\n`);
              safeWrite('data: [DONE]\n\n');
              responseClosed = true;
              return;
            }
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }

        if (!summaryPayload) {
          if (lastError) {
            console.error('[summary] unable to parse structured summary', lastError);
          }
          try { await logUsage(supabase, user.id, 'summary_error', 0, { parse_reason: String(lastError?.message || 'unknown'), model: 'gpt-5-mini', run_id: runId }); } catch {}
          safeWrite(`data: ${JSON.stringify({ type: 'summary_error', message: 'Unable to generate structured summary.' })}\n\n`);
          safeWrite('data: [DONE]\n\n');
          responseClosed = true;
          return;
        }

        safeWrite(`data: ${JSON.stringify({ type: 'summary_json', content: summaryPayload })}\n\n`);
        safeWrite('data: [DONE]\n\n');
        responseClosed = true;
        return;
      }

      // Short bare-name queries: infer the most likely company and proceed (no clarifying questions)
      const requestedText = (lastUserMessage?.content || '').trim();
      const strippedLeading = requestedText.replace(/^(research|tell me about|what can you tell me about|who is|analy[sz]e|find)\s+/i, '').trim();
      const looksLikeBareName = (() => {
        if (!strippedLeading) return false;
        if (/https?:\/\//i.test(strippedLeading)) return false;
        if (/\./.test(strippedLeading)) return false; // likely domain
        if (/(inc\.|corp\.|ltd\.|llc|company|co\b|group|holdings|technologies|systems)/i.test(strippedLeading)) return false;
        const words = strippedLeading.split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        return words.length <= 2; // very short, likely ambiguous
      })();
      const forceDisambiguate = Boolean((userConfig as any)?.disambiguate_subject === true);
      if (looksLikeBareName || forceDisambiguate) {
        try {
          const term = strippedLeading || extractCompanyName(requestedText) || 'the company';
          safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: `Interpreting “${term}” as a company — selecting the most likely match…` })}\n\n`);

          const resolveInstructions = [
            'Resolve a possibly ambiguous company term to the most likely real company.',
            'Output ONLY compact JSON with fields: {"top":{"name":"","industry":"","website":"","confidence":0-1},"alternates":[{"name":"","industry":"","website":"","confidence":0-1}] }',
            'Prefer the most prominent company when multiple exist. No commentary, no code fences.'
          ].join('\n');

          const rstream = await openai.responses.stream({
            model: 'gpt-5-mini',
            instructions: resolveInstructions,
            input: `term: ${term}`,
            text: { format: { type: 'text' }, verbosity: 'low' },
            store: false,
            metadata: { agent: 'company_research', stage: 'subject_resolution', chat_id: chatId || null, user_id: user.id },
          }, { signal: abortController.signal });
          let buf = '';
          for await (const ch of rstream as any) {
            if (ch.type === 'response.output_text.delta' && ch.delta) buf += ch.delta;
          }
          try { await rstream.finalResponse(); } catch {}
          let assumed: { name?: string; industry?: string; website?: string; confidence?: number } | null = null;
          try {
            const s = buf.indexOf('{');
            const e = buf.lastIndexOf('}');
            if (s >= 0 && e > s) {
              const parsed = JSON.parse(buf.slice(s, e + 1));
              if (parsed?.top?.name) assumed = parsed.top;
            }
          } catch {}
          if (assumed?.name) {
            const assumedLine = `Proceeding with ${assumed.name}${assumed.industry ? ` (${assumed.industry})` : ''}${assumed.website ? ` — ${assumed.website}` : ''}.`;
            safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: assumedLine })}\n\n`);
            // Emit structured event so UI can show an "Assumed" badge like Claude
            try {
              safeWrite(`data: ${JSON.stringify({
                type: 'assumed_subject',
                name: assumed.name,
                industry: assumed.industry || null,
                website: assumed.website || null,
                confidence: typeof assumed.confidence === 'number' ? assumed.confidence : null
              })}\n\n`);
            } catch {}
            // Bias both instructions and request with the assumption; do not ask clarifying questions
            instructions = `Assumed subject: ${assumed.name}${assumed.website ? ` (${assumed.website})` : ''}.\nDo not ask clarifying questions; proceed with research on this subject. If the user later corrects, pivot silently.\n\n` + instructions;
            effectiveRequest = `${effectiveRequest}\n\nContext: The company in focus is ${assumed.name}${assumed.website ? ` (${assumed.website})` : ''}.`;
          }
        } catch (disErr) {
          console.warn('[subject_resolution] non-fatal error; continuing default flow', disErr);
        }
      }

      const wantsFreshIntel = /recent|latest|today|yesterday|this week|signals?|news|breach|breaches|leadership|funding|acquisition|hiring|layoff|changed|update|report/i.test(normalizedRequest);
      const mentionsTimeframe = /\b(last|past)\s+\d+\s+(day|days|week|weeks|month|months|year|years)\b/i.test(requestText);
      const explicitlyRequestsSearch = /\bweb[_\s-]?search\b/.test(normalizedRequest) || /\b(search online|look up|google|check the web)\b/.test(normalizedRequest);
      const needsFreshLookup = wantsFreshIntel || mentionsTimeframe || explicitlyRequestsSearch;

      let useTools = isResearchQuery || explicitlyRequestsSearch;
      if (research_type === 'deep' || research_type === 'quick') {
        useTools = true;
      }
      if (research_type === 'specific' && !useTools) {
        useTools = true;
      }

      if (!useTools) {
        instructions += '\n\n<tool_policy>Call web_search only when the user explicitly asks for fresh external data or provides a recent timeframe. Otherwise prioritise saved profile context and internal knowledge.</tool_policy>';
      } else {
        instructions += '\n\n<tool_policy>Use web_search when the user explicitly asks for it or references recent timeframes (e.g., last 12 months). Avoid unnecessary calls when profile context already answers the question.</tool_policy>';
      }

      if (isResearchQuery) {
        const contextSummary = summarizeContextForPlan(userContext).replace(/\s+/g, ' ').trim();
        const detectedCompany = extractCompanyName(lastUserMessage?.content);
        let preview = '';
        if (detectedCompany) {
          preview = `Researching ${detectedCompany} using your saved profile and qualifying criteria…`;
        } else if (activeContextCompany) {
          preview = `Researching ${activeContextCompany} using your saved profile and qualifying criteria…`;
        } else if (contextSummary) {
          preview = `Researching using your saved profile: ${contextSummary.slice(0, 160)}${contextSummary.length > 160 ? '…' : ''}`;
        } else {
          preview = 'Researching using your saved profile and preferences…';
        }
        safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: preview })}\n\n`);
      }
      const storeRun = true;
      const shouldPlanStream = isResearchQuery && !userConfig?.disable_fast_plan;

      // Emit a hard-coded acknowledgment only if the fast plan stream is disabled
      if (!shouldPlanStream) {
        try {
          const lastUser = Array.isArray(messages) ? messages.filter(m => m.role === 'user').pop() : null;
          const q = String(lastUser?.content || '').toLowerCase();
          let ack = '';
          if (research_type) {
            if (research_type === 'deep') ack = 'Starting Deep Research — streaming findings…';
            else if (research_type === 'quick') ack = 'Quick Facts — fetching essentials…';
            else if (research_type === 'specific') ack = 'On it — answering your specific question…';
          } else if (isResearchQuery) {
            ack = "Got it — I'll research that and stream findings.";
          } else if (q) {
            ack = 'Okay — answering briefly.';
          }
          if (ack) {
            safeWrite(`data: ${JSON.stringify({ type: 'acknowledgment', content: ack })}\n\n`);
          }
        } catch {}
      }

      console.log('[DEBUG] Creating OpenAI Responses API call with:', {
        model: selectedModel,
        hasInstructions: !!instructions,
        instructionsLength: instructions?.length || 0,
        hasInput: !!input,
        inputLength: input?.length || 0,
        stream: true,
        store: storeRun,
        isResearchQuery,
        useTools,
        reasoningEffort
      });

      let planPromise: Promise<void> | null = null;
      if (shouldPlanStream && lastUserMessage?.content) {
        const planInstructions = `You are the fast planning cortex for a research assistant.\n- Start with a single standalone acknowledgement sentence that confirms you are beginning now, states the research mode (deep/quick/specific/auto), mentions the **research subject** from the input, and gives a realistic ETA (deep ≈2 min, quick ≈30 sec, specific ≈1 min, auto ≈2 min).\n- Immediately follow with 2-3 markdown bullet steps (prefix each with "- ") describing the investigative actions you will take.\n- Keep bullets under 12 words, action-oriented, and reference saved preferences when they change sequencing.\n- When referencing the company you are researching, always use the "Research subject" field from the input (never the profile context labels).\n- Do not ask the user questions or request clarifications; assume sensible defaults.\n- Do not add closing statements or extra blank lines.`;
        const contextSummary = summarizeContextForPlan(userContext).slice(0, 600);
        const detectedCompanyRaw = extractCompanyName(lastUserMessage.content);
        const fallbackCompany = typeof activeContextCompany === 'string' ? activeContextCompany.trim() : '';
        const isLikelySubject = (value: string | undefined): boolean => {
          if (!value) return false;
          const trimmed = value.trim();
          if (!trimmed) return false;
          if (trimmed.length > 80) return false;
          if (/^(who|what|when|where|which|why|how)\b/i.test(trimmed)) return false;
          if (/\?\s*$/.test(trimmed)) return false;
          return !/^(summarize|continue|resume|draft|write|compose|email|refine|help me|start|begin|generate|rerun|retry)/i.test(trimmed);
        };
        const detectedCompany = isLikelySubject(detectedCompanyRaw)
          ? detectedCompanyRaw
          : isLikelySubject(fallbackCompany)
            ? fallbackCompany
            : '';
        const planInput = `Research mode: ${research_type || (isResearchQuery ? 'auto' : 'general')}\nResearch subject: ${detectedCompany || 'Not specified'}\nUser request: ${effectiveRequest}\nETA guide: deep ≈2 min, quick ≈30 sec, specific ≈1 min, auto ≈2 min.\nSaved profile context (do not confuse with research subject):\n${contextSummary || 'No saved profile context yet.'}`;

        planPromise = (async () => {
          try {
            const fastStream = await openai.responses.stream({
              model: 'gpt-5-mini',
              instructions: planInstructions,
              input: planInput,
              text: { format: { type: 'text' }, verbosity: 'low' },
              reasoning: { effort: 'low' },
              store: false,
              metadata: {
                agent: 'company_research',
                stage: 'fast_plan',
                chat_id: chatId || null,
                user_id: user.id
              }
            }, { signal: abortController.signal });

            let planFirstDeltaSent = false;

            for await (const fastChunk of fastStream as any) {
              if (responseClosed) break;
              if (fastChunk.type === 'response.output_text.delta' && fastChunk.delta) {
                if (!planFirstDeltaSent) {
                  planFirstDeltaSent = true;
                  safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'fast_plan', event: 'first_delta', ttfb_ms: Date.now() - processStart })}\n\n`);
                }
                safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: fastChunk.delta, stage: 'plan' })}\n\n`);
              }
            }

            try {
              await fastStream.finalResponse();
            } catch (fastFinalErr: any) {
              if (fastFinalErr?.name === 'AbortError') {
                console.warn('Fast plan aborted due to deadline');
              } else {
                console.error('Fast plan finalization error:', fastFinalErr);
              }
            }
          } catch (fastErr) {
            console.error('Fast plan stream failed:', fastErr);
            try {
              safeWrite(`data: ${JSON.stringify({ type: 'reasoning_progress', content: 'Plan generation failed, continuing anyway…' })}\n\n`);
            } catch {}
          }
        })();
      }

      // Create streaming response using GPT-5 Responses API
      const openAIConnectStart = Date.now();
      const stream = await openai.responses.stream({
        model: selectedModel,
        instructions,
        input,
        text: { format: { type: 'text' }, verbosity: 'low' },
        reasoning: { effort: reasoningEffort },
        tools: useTools ? [{ type: 'web_search' }] : [],
        parallel_tool_calls: useTools,
        // Allow full-depth for deep mode; keep light caps for quick/specific to improve latency
        max_output_tokens: (effectiveMode === 'deep')
          ? undefined
          : (isQuick ? 450 : undefined),
        store: storeRun,
        metadata: {
          agent: 'company_research',
          research_type: research_type || (isResearchQuery ? 'auto' : 'none'),
          chat_id: chatId || null,
          user_id: user.id
        }
        // Do not limit include fields; allow default event stream so we can surface reasoning + tool events
      }, { signal: abortController.signal });
      const openAIConnectMs = Date.now() - openAIConnectStart;

      try {
        const routeMeta = {
          type: 'meta',
          response_id: 'pending',
          model: selectedModel,
          route: 'vercel/api/ai/chat',
          runtime: 'nodejs',
          project_masked: (process.env.OPENAI_PROJECT || '').slice(0, 8) || null,
          project_set: Boolean(process.env.OPENAI_PROJECT),
          store: storeRun,
          timings: {
            auth_ms: authAndCreditMs,
            context_ms: contextFetchMs,
            openai_connect_ms: openAIConnectMs
          }
        };
        safeWrite(`data: ${JSON.stringify(routeMeta)}\n\n`);
      } catch (metaErr) {
        console.error('Failed to emit meta event', metaErr);
      }

      let accumulatedContent = '';
      let chunkCount = 0;
      let metaSent = false;
      let firstContentSent = false;
      let firstContentAt: number | null = null;
      let reasoningStartedAt: number | null = null;
      let contentLatencyEmitted = false;

      let keepAliveDelay = 2000;
      const scheduleKeepAlive = () => {
        keepAlive = setTimeout(() => {
          if (firstContentSent) return;
          try {
            safeWrite(`data: ${JSON.stringify({ type: 'ping', ts: Date.now() })}\n\n`);
          } catch (intervalError) {
            console.error('Keep-alive write failed:', intervalError);
            return;
          }
          keepAliveDelay = Math.min(10000, keepAliveDelay + 3000);
          scheduleKeepAlive();
        }, keepAliveDelay);
      };
      scheduleKeepAlive();

      console.log('[DEBUG] Starting to process stream...');

      if (process.env.ENABLE_PROMPT_DEBUG === 'true') {
        try {
          safeWrite(`data: ${JSON.stringify({ type: 'debug_prompt', instructions, input })}\n\n`);
        } catch (debugErr) {
          console.warn('Failed to emit prompt debug event', debugErr);
        }
      }

      // Configure reasoning streaming behaviour
      // We keep reasoning visible in all modes. For quick mode, we throttle/compact updates.
      const forwardReasoning = true;
      let quickReasoningBuffer = '';
      let quickReasoningLastEmit = 0;

      // Process the stream
      for await (const chunk of stream as any) {
        chunkCount++;

        // Handle different event types from the Responses API
        if (!metaSent && chunk?.response?.id) {
          try { console.log('[OPENAI] response.id:', chunk.response.id); } catch {}
          safeWrite(`data: ${JSON.stringify({ type: 'meta', response_id: chunk.response.id, model: selectedModel })}\n\n`);
          metaSent = true;
        }
        if ((chunk.type === 'response.reasoning_summary_text.delta' || chunk.type === 'response.reasoning.delta')) {
          const delta = chunk.delta || '';
          if (delta && forwardReasoning) {
            if (reasoningStartedAt == null) {
              reasoningStartedAt = Date.now();
              safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'reasoning_start', ms_since_request: reasoningStartedAt - processStart })}\n\n`);
            }
            if (isQuick) {
              // Throttle and compact reasoning updates for quick mode
              quickReasoningBuffer += delta;
              const now = Date.now();
              if (now - quickReasoningLastEmit >= 800) {
                const lines = quickReasoningBuffer.split(/\n+/).filter(Boolean);
                const lastLine = lines.length ? lines[lines.length - 1] : quickReasoningBuffer;
                const compact = (lastLine || quickReasoningBuffer).trim().slice(-200);
                if (compact) {
                  safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: compact })}\n\n`);
                  quickReasoningLastEmit = now;
                  quickReasoningBuffer = '';
                }
              }
            } else {
              // Deep/specific: stream as-is
              safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: delta })}\n\n`);
            }
          }
        } else if (chunk.type === 'response.output_text.delta') {
          // This is a text delta event - send the content
          if (chunk.delta) {
            accumulatedContent += chunk.delta;
            safeWrite(`data: ${JSON.stringify({
              type: 'content',
              content: chunk.delta
            })}\n\n`);
            if (!firstContentSent) {
              firstContentSent = true;
              firstContentAt = Date.now();
              safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'primary', event: 'first_delta', ttfb_ms: firstContentAt - processStart })}\n\n`);
              if (!contentLatencyEmitted && reasoningStartedAt != null) {
                contentLatencyEmitted = true;
                safeWrite(`data: ${JSON.stringify({ type: 'meta', stage: 'content_latency', reasoning_to_content_ms: firstContentAt - reasoningStartedAt })}\n\n`);
              }
              if (keepAlive) {
                clearTimeout(keepAlive);
                keepAlive = null;
              }
            }
          }
        } else if (
          chunk.type?.includes('tool') ||
          chunk.type === 'response.function_call.arguments.delta' ||
          chunk.type === 'response.function_call.done'
        ) {
          // Surface web_search tool activity across different event types
          const name = (chunk as any).name || (chunk as any).tool_name || '';
          const args = (chunk as any).arguments || (chunk as any).tool_arguments || {};
          const result = (chunk as any).result || (chunk as any).tool_result || {};
          const query = (args && (args.query || args.q)) || (result && result.query) || '';
          let sources: string[] = [];
          const r = result?.results || result?.items || result?.sources || [];
          if (Array.isArray(r)) {
            sources = r
              .map((item: any) => typeof item === 'string' ? item : (item?.url || item?.link || item?.source_url))
              .filter(Boolean)
              .slice(0, 5);
          }
          if (String(name).includes('web_search')) {
            safeWrite(`data: ${JSON.stringify({ type: 'web_search', query, sources })}\n\n`);
          }
        } else if (chunk.type === 'response.completed') {
          // Flush any remaining compacted quick-mode reasoning
          if (quickReasoningBuffer.trim()) {
            const lines = quickReasoningBuffer.split(/\n+/).filter(Boolean);
            const lastLine = lines.length ? lines[lines.length - 1] : quickReasoningBuffer;
            const compact = (lastLine || quickReasoningBuffer).trim().slice(-200);
            if (compact) {
              safeWrite(`data: ${JSON.stringify({ type: 'reasoning', content: compact })}\n\n`);
            }
            quickReasoningBuffer = '';
          }
          // Response is complete
          safeWrite(`data: ${JSON.stringify({
            type: 'done',
            response_id: chunk.response?.id || chunk.id
          })}\n\n`);
          break;
        }

        // Log for debugging
        if (chunkCount <= 5 || chunk.type === 'response.completed') {
          console.log('[DEBUG] Chunk', chunkCount, 'type:', chunk.type);
        }

      }

      let finalResponseData: any = null;
      try {
        finalResponseData = await stream.finalResponse();
      } catch (finalErr: any) {
        if (finalErr?.name === 'AbortError') {
          console.warn('Stream aborted due to deadline');
          safeWrite(`data: ${JSON.stringify({ type: 'timeout', message: 'Processing exceeded time limit; partial results above.' })}\n\n`);
        } else {
          console.error('Stream finalization error:', finalErr);
        }
      }

      if (storeRun && finalResponseData?.id) {
        const id = finalResponseData.id;
        const delays = [200, 400, 800, 1500, 2500];
        let verified: any = null;
        for (const d of delays) {
          try {
            verified = await openai.responses.retrieve(id);
            break;
          } catch (e) {
            await new Promise(r => setTimeout(r, d));
          }
        }
        if (verified?.status) {
          console.log('[OPENAI] Stored response status:', verified.status);
        } else {
          console.warn('[OPENAI] Response not yet visible for id:', id);
        }
      }

      try {
        if (finalResponseData?.id) {
          safeWrite(`data: ${JSON.stringify({
            type: 'meta',
            stage: 'primary',
            event: 'finalized',
            response_id_authoritative: finalResponseData.id
          })}\n\n`);
        }
      } catch (finalMetaErr) {
        console.error('Failed to emit final meta event', finalMetaErr);
      }

      console.log('[DEBUG] Stream processing complete. Total chunks:', chunkCount);
      console.log('[DEBUG] Total content length:', accumulatedContent.length);

      const shouldGenerateTldr = false; // Generate summaries only on demand (no live TL;DR streaming)
      if (shouldGenerateTldr) {
        try {
          safeWrite(`data: ${JSON.stringify({ type: 'tldr_status', content: 'Preparing high level summary…' })}\n\n`);
          const trimmedForSummary = accumulatedContent.length > 24000
            ? accumulatedContent.slice(0, 24000)
            : accumulatedContent;
          const summaryStream = await openai.responses.stream({
            model: 'gpt-5-mini',
            instructions: 'You craft concise executive high level summaries for sales research. Output format:\n## High Level Summary\n**Headline:** <<=140 char headline>\n- Bullet 1\n- Bullet 2\n(5-7 bullets, each ≤18 words, action-focused, referencing concrete facts.)\nDo not add extra sections.',
            input: [
              {
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: `Create an executive high level summary for the following research. Do not repeat the full report, focus on headline insight and 5-7 decision-ready bullets.\n\n${trimmedForSummary}`
                }]
              },
            ],
            text: { format: { type: 'text' }, verbosity: 'low' },
            store: false,
            metadata: {
              agent: 'company_research',
              stage: 'auto_tldr',
              chat_id: chatId || null,
              user_id: user.id
            }
          }, { signal: abortController.signal });

          for await (const summaryChunk of summaryStream as any) {
            if (responseClosed) break;
            if (summaryChunk.type === 'response.output_text.delta' && summaryChunk.delta) {
              safeWrite(`data: ${JSON.stringify({ type: 'tldr', content: summaryChunk.delta })}\n\n`);
            }
          }

          try {
            await summaryStream.finalResponse();
          } catch (summaryFinalizeErr: any) {
            if (summaryFinalizeErr?.name === 'AbortError') {
              console.warn('TL;DR aborted due to deadline');
            } else {
              console.error('TL;DR finalization error:', summaryFinalizeErr);
            }
          }
          safeWrite(`data: ${JSON.stringify({ type: 'tldr_done' })}\n\n`);
        } catch (summaryErr) {
          console.error('Auto TL;DR generation failed:', summaryErr);
          safeWrite(`data: ${JSON.stringify({ type: 'tldr_error', message: 'High level summary unavailable' })}\n\n`);
        }
      }

      // Do not block finalization on the auxiliary fast plan stream.
      // It can overrun and cause apparent timeouts even after content is done.
      // We intentionally skip awaiting planPromise here.
      safeWrite(`data: [DONE]\n\n`);
      responseClosed = true;
      res.end();
      try { abortController.abort(); } catch {}

      if (keepAlive) {
        clearTimeout(keepAlive);
        keepAlive = null;
      }
      try { clearTimeout(overallTimeout); } catch {}

      // Log usage and deduct credits
      await logUsage(supabase, user.id, 'chat_completion', totalEstimatedTokens, {
        chat_id: chatId,
        agent_type: agentType,
        model: selectedModel,
        api: 'responses', // Note that we're using Responses API
        chunks: chunkCount,
        prompt_head: (instructions || '').slice(0, 1000),
        input_head: (input || '').slice(0, 400),
        final_response_id: finalResponseData?.id || finalResponseData?.response?.id || null
      });
      await deductCredits(supabase, user.id, totalEstimatedTokens);

      // Background: rolling summary
      ;(async () => {
        try {
          const cid = chat_id || chatId || null;
          if (!cid) return;
          const summaryInput = `Summarize in 1–2 sentences (main subject + intent).\n\n${(input || '').slice(0, 3500)}`;
          const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });
          const sum = await openai.responses.create({
            model: 'gpt-5-mini',
            input: [
              { role: 'system', content: [{ type: 'input_text', text: 'Summarize in 1–2 sentences with the main subject and intent.' }] },
              { role: 'user', content: [{ type: 'input_text', text: summaryInput }] },
            ],
            text: { format: { type: 'text' }, verbosity: 'low' },
            store: false,
          });
          const chatSummary = sum?.output_text || '';
          if (chatSummary) {
            await supabase
              .from('chats')
              .update({ summary: chatSummary, message_count_at_summary: Array.isArray(messages) ? messages.length : null })
              .eq('id', cid);
          }
        } catch (e) {
          console.warn('Rolling summary (vercel) failed', e);
        }
      })();

    } catch (streamError: any) {
      console.error('Streaming error:', streamError);

      if (keepAlive) {
        clearTimeout(keepAlive);
        keepAlive = null;
      }
      try { clearTimeout(overallTimeout); } catch {}

      // Send error through SSE
      if (streamError?.name === 'AbortError') {
        safeWrite(`data: ${JSON.stringify({ type: 'timeout', message: 'Processing exceeded time limit; partial results above.' })}\n\n`);
      } else {
        safeWrite(`data: ${JSON.stringify({
          type: 'error',
          error: streamError.message || 'Streaming failed'
        })}\n\n`);
      }
      safeWrite(`data: [DONE]\n\n`);
      responseClosed = true;
      res.end();
    }

  } catch (error) {
    console.error('Request error:', error);

    // ensure keep-alive interval is cleaned up
    try {
      if (keepAlive) {
        clearTimeout(keepAlive);
        keepAlive = null;
      }
    } catch {}
    try { clearTimeout(overallTimeout); } catch {}

    // If headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || 'Internal server error'
      });
    } else {
      // Otherwise send error through SSE
      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message || 'Internal server error'
        })}\n\n`);
      } catch {}
      try { res.end(); } catch {}
    }
  }
}
