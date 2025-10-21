import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { MessageBubble } from '../components/MessageBubble';
import { MessageInput } from '../components/MessageInput';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { SaveResearchDialog } from '../components/SaveResearchDialog';
import { SaveSignatureDialog } from '../components/SaveSignatureDialog';
import { CSVUploadDialog } from '../components/CSVUploadDialog';
import { BulkResearchDialog } from '../components/BulkResearchDialog';
import { BulkResearchStatus } from '../components/BulkResearchStatus';
import { ProfileCompletenessBanner } from '../components/ProfileCompletenessBanner';
import { AccountSignalsDrawer } from '../components/AccountSignalsDrawer';
import { AssumedSubjectDialog } from '../components/AssumedSubjectDialog';
import { isGibberish, sanitizeCandidate } from '../utils/companyValidation';
import { DraftEmailDialog, type DraftEmailRecipient } from '../components/DraftEmailDialog';
import { listRecentSignals, type AccountSignalSummary } from '../services/signalService';
import { fetchDashboardGreeting } from '../services/accountService';
import { useToast } from '../components/ToastProvider';
import { buildResearchDraft, approximateTokenCount, extractDecisionMakerContacts } from '../utils/researchOutput';
import type { ResearchDraft } from '../utils/researchOutput';
import { normalizeMarkdown, stripClarifierBlocks } from '../utils/markdown';
import type { TrackedAccount, AccountStats } from '../services/accountService';
import { useUserProfile, invalidateUserProfileCache } from '../hooks/useUserProfile';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { OptimizeICPModal } from '../components/OptimizeICPModal';
import { useResearchEngine } from '../contexts/ResearchEngineContext';
import { getDefaultTemplate } from '../config/researchTemplates';
import { SummarySchemaZ, type SummarySchema } from '../../shared/summarySchema.js';
import type { ResolvedPrefs } from '../../shared/preferences.js';
import { SummaryCard } from '../components/SummaryCard';

const ALL_REFINE_FACETS = ['leadership', 'funding', 'tech stack', 'news', 'competitors', 'hiring'] as const;

type ResearchAction = 'new' | 'continue' | 'email' | 'refine' | 'follow_up';

type Suggestion = {
  icon: string;
  title: string;
  description: string;
  prompt: string;
};

type DashboardAction = {
  id: string;
  icon: string;
  title: string;
  description: string;
  kind: 'seed' | 'prompt' | 'bulk' | 'track' | 'navigate';
  value?: string;
};

type AliasPrompt = {
  alias: string;
  suggestion?: string | null;
  questionId?: string | null;
  stage: 'choice' | 'manual';
  manualValue: string;
  submitting?: boolean;
};

const extractCompanyNameFromQuery = (raw: string): string | null => {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Prefer explicit URLs/domains in the message
  const urlMatch = cleaned.match(/(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.[a-z]{2,}\b)/i);
  if (urlMatch) {
    try {
      const rawUrl = urlMatch[1];
      const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      const u = new URL(normalized);
      const host = u.hostname.replace(/^www\./i, '');
      const seg = host.split('.') [0];
      if (seg) {
        return seg.split(/[-_]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ').trim();
      }
    } catch {}
  }
  cleaned = cleaned.replace(/^research\s+/i, '')
    .replace(/^tell me about\s+/i, '')
    .replace(/^find\s+/i, '')
    .replace(/^analyze\s+/i, '')
    .replace(/^who is\s+/i, '')
    .replace(/^what is\s+/i, '')
    .trim();
  if (!cleaned) return null;

  const actionPrefix = /^(summarize|continue|draft|write|compose|email|refine|save|track|start|begin|generate|rerun|retry|copy|share|compare)\b/i;
  if (actionPrefix.test(cleaned)) {
    return null;
  }

  if (!cleaned) return null;
  const stopPattern = /\s+(in|at|for|with|that|who|which)\s+/i;
  const parts = cleaned.split(stopPattern);
  const candidate = (parts[0] || '').replace(/[^A-Za-z0-9&.\s-]/g, '').trim();
  if (!candidate) return null;
  return candidate
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
};

const isBareNameQuery = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const text = raw.trim();
  if (!text) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/\./.test(text)) return false;
  const cleaned = text.replace(/^(research|tell me about|find|analy[sz]e|who is|what is)\s+/i, '').trim();
  if (!cleaned) return false;
  if (/(inc\.|corp\.|ltd\.|llc|company|co\b|group|holdings|technologies|systems)/i.test(cleaned)) return false;
  return cleaned.split(/\s+/).filter(Boolean).length <= 2;
};

// Heuristic: infer a short "industry/space" label from markdown content
const inferIndustryFromMarkdown = (markdown: string | null | undefined): string | undefined => {
  if (!markdown) return undefined;
  const text = String(markdown);
  // Focus on Executive Summary section if present
  const execMatch = text.match(/##\s+Executive Summary\s*([\s\S]*?)(?=\n##\s+|$)/i);
  const body = (execMatch ? execMatch[1] : text).slice(0, 800);
  // Patterns like: "X is a <space> company/vendor/platform/provider"
  const re = /\bis a[n]?\s+([^\n.,;]{3,80}?)\s+(?:company|vendor|platform|provider|solution|software)\b/i;
  const m = re.exec(body);
  if (m && m[1]) {
    const raw = m[1]
      .replace(/^(well[- ]funded|scale[- ]stage|mid[- ]?market|enterprise|leading|global|fast[- ]growing|publicly traded)\b\s*/i, '')
      .replace(/\b(SaaS|cloud[- ]based)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (raw) return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
  }
  // Backup: capture comma phrase after name: "X, a <space> ..."
  const re2 = /,\s+a[n]?\s+([^\n.,;]{3,80}?)\s+(?:company|vendor|platform|provider|solution|software)\b/i;
  const m2 = re2.exec(body);
  if (m2 && m2[1]) return m2[1].trim();
  return undefined;
};

const deriveChatTitle = (text: string): string => {
  const company = extractCompanyNameFromQuery(text);
  if (company) return `Research: ${company}`;
  const trimmed = text.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'New Chat';
};

const formatDisplaySubject = (subject: string | null | undefined): string => {
  if (!subject) return 'General';
  const trimmed = subject.trim();
  if (!trimmed) return 'General';
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}…` : trimmed;
};

const isLikelySubject = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(summarize|continue|draft|write|compose|email|refine|help me|start|begin|generate|retry|rerun)/i.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 80) return false;
  if (/\s{2,}/.test(trimmed)) return false;
  return true;
};

const DEFAULT_AGENT = 'company_research';

const sendPreferenceSignal = async (
  key: string,
  observed: Record<string, any>,
  opts?: { agent?: string; weight?: number }
) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (anonKey) headers['apikey'] = String(anonKey);

    const payload: Record<string, any> = {
      agent: opts?.agent || DEFAULT_AGENT,
      key,
      observed,
    };
    if (typeof opts?.weight === 'number') payload.weight = opts.weight;

    await fetch('/api/agent/signal', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[research-chat] preference signal failed', error);
  }
};

const GENERIC_HELP_PROMPTS = new Set([
  'what can you help me with',
  'what can you help me with?',
  'what can you help with',
  'what can you help with?',
  'what do you do',
  'what do you do?',
  'help',
  'help me',
  'help me?',
  'how can you help',
  'how can you help?',
]);

const isGenericHelpPrompt = (text: string): boolean => GENERIC_HELP_PROMPTS.has(text.trim().toLowerCase());

const getGenericHelpResponse = (): string => [
  'Happy to help — here’s what I can do right now:',
  '',
  '## Research & Intelligence',
  '- Deep-dive company research in ~2 minutes (signals, tech stack, decision makers, next actions).',
  '- Quick fact pulls when you just need headcount, funding, or leadership highlights.',
  '- Specific answers about tools, breaches, compliance, or timing signals.',
  '',
  '## Meeting Prep',
  '- Auto-generate briefing docs for upcoming calls with talking points, objections, and follow-ups.',
  '- Capture context from past conversations so you never start cold.',
  '',
  '## Account Tracking & Signals',
  '- Monitor your strategic accounts for leadership changes, breaches, funding, procurement, and more.',
  '- Prioritize accounts with hot signals and suggest the right outreach.',
  '',
  '## Actions You Can Take Now',
  '- Ask me to “Research <Company>” for a full report.',
  '- Say “Prep me for my call with <Company> tomorrow.”',
  '- Drop a CSV of accounts and I’ll track and update them automatically.',
].join('\n');

const isResearchPrompt = (text: string): boolean => {
  const lower = text.toLowerCase();
  if (isGenericHelpPrompt(lower)) return false;
  return (
    lower.startsWith('research ') ||
    lower.includes(' research ') ||
    lower.startsWith('tell me about') ||
    lower.startsWith('analyze ') ||
    lower.startsWith('find ') ||
    lower.startsWith('who is ') ||
    lower.startsWith('what is ') ||
    (() => {
      // Fallback: a short noun phrase that looks like a company
      const candidate = extractCompanyNameFromQuery(text);
      if (!candidate) return false;
      const words = text.trim().split(/\s+/).length;
      return words <= 4; // treat short company-only prompts as research
    })()
  );
};

const generateSuggestions = (profile: any, criteria: any[], signalPrefs: any[]): Suggestion[] => {
  if (!profile) return [];
  const suggestions: Suggestion[] = [];
  const industry = profile.industry || '';
  const icp = profile.icp_definition || profile.icp || '';
  const criticalCriteria = criteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'critical');
  const importantCriteria = criteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'important');
  const signalTypes = signalPrefs.map((s: any) => s?.signal_type).filter(Boolean);

  if (icp) {
    suggestions.push({
      icon: '🎯',
      title: 'Find ICP Matches',
      description: 'Search for companies that match your ideal customer profile',
      prompt: `Find companies that match this ICP: ${icp}`,
    });
  }

  if (criticalCriteria.length > 0) {
    suggestions.push({
      icon: '🔥',
      title: 'Critical Signals Watchlist',
      description: `Monitor companies hitting: ${criticalCriteria.map((c: any) => c.name).join(', ')}`,
      prompt: `Show ${industry || 'relevant'} companies with signals for: ${criticalCriteria.map((c: any) => c.name).join(', ')}`,
    });
  }

  if (signalTypes.length > 0) {
    suggestions.push({
      icon: '📡',
      title: 'New Signal Alerts',
      description: `Companies with recent ${signalTypes.slice(0, 2).join(' & ')} activity`,
      prompt: `Find ${industry || 'relevant'} companies with recent ${signalTypes.join(', ')} events`,
    });
  }

  if (importantCriteria.length > 0) {
    suggestions.push({
      icon: '🧭',
      title: 'Deep Dive Priorities',
      description: `Evaluate prospects on ${importantCriteria.slice(0, 3).map((c: any) => c.name).join(', ')}`,
      prompt: `Research a company focusing on: ${importantCriteria.map((c: any) => c.name).join(', ')}`,
    });
  }

  return suggestions.slice(0, 4);
};

const summarizeForMemory = (markdown: string): string => {
  if (!markdown) return '';
  const execMatch = markdown.match(/##\s+Executive Summary\s*([\s\S]*?)(?=\n##\s+|$)/i);
  if (execMatch?.[1]) {
    return execMatch[1].replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return markdown.split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
};

const SIMPLE_FOLLOW_UP = /^(who|what|when|where|which|how|is|are|was|were|do|does|did|show me|give me|tell me)\b/i;

function inferResearchMode(prompt: string): 'deep' | 'quick' | 'specific' {
  const trimmed = prompt.trim();
  if (!trimmed) return 'deep';
  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksLikeQuestion = trimmed.endsWith('?') || SIMPLE_FOLLOW_UP.test(trimmed);
  if (looksLikeQuestion && words.length <= 12) {
    return 'specific';
  }
  return 'deep';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  streaming?: boolean;
}

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ThinkingEvent {
  id: string;
  type: 'reasoning' | 'web_search' | 'reasoning_progress' | 'acknowledgment' | 'content_extraction' | 'accounts_added' | 'context_preview';
  content?: string;
  query?: string;
  sources?: string[];
  url?: string;
  count?: number;
  companies?: string[];
  company?: string;
  icp?: string;
  critical?: string[];
  important?: string[];
}

export function ResearchChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const [verifyingEmails, setVerifyingEmails] = useState(false);
  const [actionBarCompany, setActionBarCompany] = useState<string | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
  // acknowledgment messages are displayed via ThinkingIndicator events
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [showInlineReasoning, setShowInlineReasoning] = useState<boolean>(() => {
    try { return localStorage.getItem('showInlineReasoning') !== '0'; } catch { return true; }
  });
  const persistInlineReasoning = (v: boolean) => {
    setShowInlineReasoning(v);
    try { localStorage.setItem('showInlineReasoning', v ? '1' : '0'); } catch {}
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const autoSentRef = useRef(false);
  const [focusComposerTick, setFocusComposerTick] = useState(0);
  const [preferredResearchType, setPreferredResearchType] = useState<'deep' | 'quick' | 'specific' | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const saveDraft: ResearchDraft | null = null;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDefaults, setSigDefaults] = useState<{ name?: string; title?: string; company?: string; signature?: string }>({});
  const [lastUsage, setLastUsage] = useState<{ tokens: number; credits: number } | null>(null);
  const [draftEmailPending, setDraftEmailPending] = useState(false);
  // Cache for background-generated summaries keyed by assistant message id
  const [summaryCache, setSummaryCache] = useState<Record<string, SummarySchema>>({});
  const [activeSummary, setActiveSummary] = useState<{ data: SummarySchema; messageId: string } | null>(null);
  const PREFS_SUMMARY_ENABLED = import.meta.env.VITE_PREFS_SUMMARY_ENABLED === 'true';
  const [resolvedPrefs, setResolvedPrefs] = useState<ResolvedPrefs | null>(null);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [csvUploadOpen, setCSVUploadOpen] = useState(false);
  const [bulkResearchOpen, setBulkResearchOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const assistantInsertedRef = useRef(false);
  const [signalsDrawerOpen, setSignalsDrawerOpen] = useState(false);
  const [signalsAccountId, setSignalsAccountId] = useState<string | null>(null);
  const [signalsCompanyName, setSignalsCompanyName] = useState<string | undefined>(undefined);
  const [aliasPrompts, setAliasPrompts] = useState<AliasPrompt[]>([]);

  const updateAliasPrompt = useCallback((alias: string, updater: (prompt: AliasPrompt) => AliasPrompt) => {
    setAliasPrompts(prev =>
      prev.map(item =>
        item.alias.toLowerCase() === alias.toLowerCase() ? updater(item) : item
      )
    );
  }, []);

  const removeAliasPrompt = useCallback((alias: string) => {
    setAliasPrompts(prev => prev.filter(item => item.alias.toLowerCase() !== alias.toLowerCase()));
  }, []);

  const confirmAliasPrompt = useCallback(async (alias: string, canonical: string, questionId?: string | null) => {
    const trimmedAlias = alias.trim();
    const trimmedCanonical = canonical.trim();
    if (!trimmedAlias || !trimmedCanonical) {
      addToast({ type: 'error', title: 'Alias not saved', description: 'Provide a valid name for the shorthand.' });
      return;
    }
    updateAliasPrompt(trimmedAlias, prompt => ({ ...prompt, submitting: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch('/api/aliases/confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alias: trimmedAlias,
          canonical: trimmedCanonical,
          question_id: questionId ?? null,
          action: 'confirm',
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to save alias');
      }
      addToast({
        type: 'success',
        title: 'Alias saved',
        description: `I’ll treat ${trimmedAlias} as ${trimmedCanonical} from now on.`,
      });
      removeAliasPrompt(trimmedAlias);
    } catch (error: any) {
      const message = error?.message || 'Failed to save alias';
      addToast({ type: 'error', title: 'Alias not saved', description: message });
      updateAliasPrompt(trimmedAlias, prompt => ({ ...prompt, submitting: false }));
    }
  }, [addToast, supabase, updateAliasPrompt, removeAliasPrompt]);

  const skipAliasPrompt = useCallback(async (alias: string, questionId?: string | null) => {
    const trimmedAlias = alias.trim();
    updateAliasPrompt(trimmedAlias, prompt => ({ ...prompt, submitting: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      if (questionId) {
        await fetch('/api/aliases/confirm', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            alias: trimmedAlias,
            question_id: questionId,
            action: 'reject',
          }),
        });
      }
      removeAliasPrompt(trimmedAlias);
    } catch (error: any) {
      const message = error?.message || 'Unable to skip alias';
      addToast({ type: 'error', title: 'Could not skip alias', description: message });
      updateAliasPrompt(trimmedAlias, prompt => ({ ...prompt, submitting: false }));
    }
  }, [addToast, supabase, updateAliasPrompt, removeAliasPrompt]);

  const promptManualAlias = useCallback((alias: string) => {
    updateAliasPrompt(alias, prompt => ({ ...prompt, stage: 'manual', manualValue: prompt.manualValue || '', submitting: false }));
  }, [updateAliasPrompt]);

  const setAliasManualValue = useCallback((alias: string, value: string) => {
    updateAliasPrompt(alias, prompt => ({ ...prompt, manualValue: value }));
  }, [updateAliasPrompt]);
  const [recentSignals, setRecentSignals] = useState<AccountSignalSummary[]>([]);
  const [greeting, setGreeting] = useState<{ time_of_day: string; user_name: string } | null>(null);
  const [greetingOpeningLine, setGreetingOpeningLine] = useState<string | null>(null);
  const [greetingSpotlights, setGreetingSpotlights] = useState<Array<{ icon: string; label: string; detail: string; prompt: string; tone?: 'critical' | 'info' | 'success' }>>([]);
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  // Global compact indicator for bulk research progress
  const [bulkProgress, setBulkProgress] = useState<{ running: boolean; pct: number; label: string } | null>(null);
  const bulkStatusRef = useRef<HTMLDivElement>(null);
  const [accountStats, setAccountStats] = useState<AccountStats | null>(null);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);
  const [postSummarizeNudge, setPostSummarizeNudge] = useState(false);
  const [summaryPending, setSummaryPending] = useState(false);
  const [lastAssumedSubject, setLastAssumedSubject] = useState<{ name: string; industry?: string | null; website?: string | null } | null>(null);
  const [clarifiersLocked, setClarifiersLocked] = useState(false);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [recentlySavedMessageId, setRecentlySavedMessageId] = useState<string | null>(null);
  const [assumedDialogOpen, setAssumedDialogOpen] = useState(false);
  const [assumedDialogName, setAssumedDialogName] = useState('');
  const [assumedDialogIndustry, setAssumedDialogIndustry] = useState<string | null>(null);
  const [assumedSuggestions, setAssumedSuggestions] = useState<Array<{ name: string; industry?: string | null }>>([]);
  const [assumedSuggestionsLoading, setAssumedSuggestionsLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailCandidates, setEmailCandidates] = useState<DraftEmailRecipient[]>([]);
  const [emailDialogLoading, setEmailDialogLoading] = useState(false);
  const currentActionCompany = actionBarCompany || activeSubject;
  const canRefreshResearch = Boolean(currentActionCompany);
  // Keep the refresh label concise and stable to avoid accidental long subjects
  const refreshLabel = canRefreshResearch ? 'Refresh on this' : 'Refresh';
  const [showRefine, setShowRefine] = useState(false);
  const [refineFacets, setRefineFacets] = useState<string[]>([]);
  const [refineTimeframe, setRefineTimeframe] = useState<string>('last 12 months');
  const [crumbOpen, setCrumbOpen] = useState(false);
  const [switchInput, setSwitchInput] = useState('');
  const lastSubjectRef = useRef<{ prev: string | null; at: number | null }>({ prev: null, at: null });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lastRunMode, setLastRunMode] = useState<'deep'|'quick'|'specific'|'auto'|null>(null);
  const skipInitialLoadRef = useRef(false);
  const { profile: userProfile } = useUserProfile();
  const profileMetadata = (userProfile?.metadata ?? {}) as Record<string, any>;
  const pickFirstString = (...values: Array<string | null | undefined>): string => {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return '';
  };
  const defaultSenderName = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, any>;
    const combined = [meta.first_name, meta.last_name].filter(Boolean).join(' ');
    return pickFirstString(
      profileMetadata.sender_name,
      meta.sender_name,
      meta.full_name,
      meta.name,
      combined
    );
  }, [profileMetadata.sender_name, user?.user_metadata]);

  const defaultSenderTitle = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, any>;
    return pickFirstString(
      profileMetadata.sender_title,
      userProfile?.user_role,
      meta.sender_title,
      meta.title,
      meta.role
    );
  }, [profileMetadata.sender_title, userProfile?.user_role, user?.user_metadata]);
  const {
    selectedTemplate,
    selectedTemplateId,
    templateInputs,
    selectedGuardrailProfile,
    selectedSignalSet
  } = useResearchEngine();
  const [customCriteria, setCustomCriteria] = useState<any[]>([]);
  const [signalPreferences, setSignalPreferences] = useState<any[]>([]);
  const [creatingNewChat, setCreatingNewChat] = useState(false);
  const [showContextTooltip, setShowContextTooltip] = useState(false);
  const contextTooltipRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => generateSuggestions(userProfile, customCriteria, signalPreferences),
    [userProfile, customCriteria, signalPreferences]
  );
  const icpQuickSuggestions = useMemo(() => {
    if (!userProfile) return [] as Array<{ title: string; description: string; prompt: string }>;
    const items: Array<{ title: string; description: string; prompt: string }> = [];
    const icp = userProfile.icp_definition || userProfile.icp || '';
    if (icp) {
      items.push({
        title: 'Companies that match your ICP',
        description: icp.length > 140 ? `${icp.slice(0, 137)}…` : icp,
        prompt: `Find companies that match this ICP: ${icp}`,
      });
    }
    const criticalCriteria = customCriteria.filter((c: any) => (c?.importance || '').toLowerCase() === 'critical').map((c: any) => c.name).filter(Boolean);
    if (criticalCriteria.length) {
      items.push({
        title: 'Accounts hitting your critical criteria',
        description: `Surface companies where ${criticalCriteria.slice(0, 2).join(' & ')} are true.`,
        prompt: `Show companies with ${criticalCriteria.join(', ')} signals in the last 90 days`,
      });
    }
    const signalTypes = signalPreferences.map((s: any) => s?.signal_type).filter(Boolean);
    if (signalTypes.length) {
      items.push({
        title: 'Accounts with buying signals',
        description: `Focus on ${signalTypes.slice(0, 2).join(' & ')} signals this week.`,
        prompt: `Which tracked accounts triggered ${signalTypes.join(', ')} signals this week?`,
      });
    }
    if (accountStats?.stale) {
      items.push({
        title: 'Refresh stale accounts',
        description: `${accountStats.stale} tracked account${accountStats.stale === 1 ? '' : 's'} need an update.`,
        prompt: 'Which tracked accounts have not been researched in the last two weeks?',
      });
    }
    if (accountStats?.hot) {
      items.push({
        title: 'Hot accounts right now',
        description: `${accountStats.hot} account${accountStats.hot === 1 ? ' has' : 's have'} critical signals.`,
        prompt: 'Which of my tracked accounts are hot opportunities today?',
      });
    }
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.prompt.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }, [userProfile, customCriteria, signalPreferences, accountStats]);

  const combinedSuggestions = useMemo(() => {
    const base = suggestions.slice(0, 4);
    const extras = serverSuggestions
      .filter((prompt) => typeof prompt === 'string' && prompt.trim().length > 0)
      .map((prompt) => ({
        icon: '✨',
        title: prompt.length > 42 ? `${prompt.slice(0, 39)}…` : prompt,
        description: 'Quick suggestion from your dashboard activity.',
        prompt
      }));
    const merged = [...base, ...extras];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = item.prompt.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [suggestions, serverSuggestions]);

  const dashboardActions = useMemo<DashboardAction[]>(() => {
    const actions: DashboardAction[] = [];
    const remainingQuick = [...icpQuickSuggestions];
    const takeQuick = (title: string) => {
      const idx = remainingQuick.findIndex(item => item.title === title);
      if (idx >= 0) {
        return remainingQuick.splice(idx, 1)[0];
      }
      return null;
    };

    actions.push({
      id: 'research-company',
      icon: '🏢',
      title: 'Research a company',
      description: 'Run a deep account brief in about 2 minutes.',
      kind: 'seed',
      value: 'Research '
    });

    actions.push({
      id: 'bulk-research',
      icon: '📥',
      title: 'Bulk research',
      description: 'Upload a short list and generate reports together.',
      kind: 'bulk'
    });

    actions.push({
      id: 'find-contacts',
      icon: '🔎',
      title: 'Find contacts',
      description: 'Surface decision makers with personalization cues.',
      kind: 'prompt',
      value: 'Find decision makers and personalization points for my top accounts'
    });

    const icpMatch = takeQuick('Companies that match your ICP');
    actions.push({
      id: 'icp-matches',
      icon: '🎯',
      title: 'Find ICP matches',
      description: icpMatch?.description || 'Discover companies that look like your best customers.',
      kind: 'prompt',
      value: icpMatch?.prompt || 'Find companies that match my ideal customer profile'
    });

    const seenTitles = new Set(actions.map(item => item.title.toLowerCase()));
    const dynamicPool = [...remainingQuick, ...combinedSuggestions];
    for (const item of dynamicPool) {
      if (actions.length >= 6) break;
      const titleKey = item.title.toLowerCase();
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      actions.push({
        id: `dynamic-${titleKey}`,
        icon: 'icon' in item ? (item as Suggestion).icon : '✨',
        title: item.title,
        description: item.description,
        kind: 'prompt',
        value: item.prompt
      });
    }

    return actions.slice(0, 6);
  }, [icpQuickSuggestions, combinedSuggestions]);

  const appliedContext = useMemo(() => {
    const profile = userProfile || null;
    const icp = profile?.icp_definition || profile?.icp || profile?.industry || null;
    const targetTitles = Array.isArray(profile?.target_titles)
      ? profile!.target_titles.filter((t: string) => typeof t === 'string' && t.trim().length > 0).slice(0, 4)
      : [];
    const criteria = customCriteria
      .filter((c: any) => c?.name)
      .slice(0, 4)
      .map((c: any) => ({ name: c.name, importance: c?.importance || null }));
    const signals = signalPreferences
      .map((s: any) => (s?.signal_type ? String(s.signal_type).replace(/_/g, ' ') : null))
      .filter((v: string | null): v is string => Boolean(v))
      .slice(0, 4);

    if (!icp && targetTitles.length === 0 && criteria.length === 0 && signals.length === 0) {
      return null;
    }

    return {
      icp,
      targetTitles,
      criteria,
      signals,
    };
  }, [userProfile, customCriteria, signalPreferences]);
  const refreshResolvedPreferences = useCallback(async () => {
    setResolvedLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (isMountedRef.current) setResolvedPrefs(null);
        return;
      }
      const response = await fetch('/api/preferences', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Failed to load preferences (${response.status})`);
      const payload = await response.json();
      if (isMountedRef.current) {
        setResolvedPrefs(payload?.resolved ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('Failed to load resolved preferences', error);
        setResolvedPrefs(null);
      }
    } finally {
      if (isMountedRef.current) setResolvedLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refreshResolvedPreferences();
  }, [refreshResolvedPreferences]);
  const focusHighlights = useMemo(() => {
    if (!resolvedPrefs) return [] as Array<{ key: string; weight: number | null }>;
    const entries = Object.entries(resolvedPrefs.focus || {});
    return entries
      .map(([key, raw]) => {
        const value = typeof raw === 'object' && raw !== null ? raw as any : { on: Boolean(raw) };
        if (value?.on === false) return null;
        const weight = typeof value?.weight === 'number' ? value.weight as number : null;
        return { key, weight };
      })
      .filter((entry): entry is { key: string; weight: number | null } => Boolean(entry))
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 3);
  }, [resolvedPrefs]);

  const preferenceBadges = useMemo(() => {
    if (!resolvedPrefs) return [] as string[];
    const badges: string[] = [];
    focusHighlights.forEach(({ key, weight }) => {
      const label = key.replace(/[_\.]/g, ' ');
      const arrow = typeof weight === 'number' && weight >= 0.8 ? '↑' : typeof weight === 'number' && weight <= 0.4 ? '↓' : '';
      badges.push(`Focus: ${label}${arrow}`);
    });
    if (resolvedPrefs.coverage?.depth) {
      const depthLabel = resolvedPrefs.coverage.depth === 'shallow' ? 'Quick' : resolvedPrefs.coverage.depth === 'deep' ? 'Deep' : 'Standard';
      badges.push(`Depth: ${depthLabel}`);
    }
    if (resolvedPrefs.summary?.brevity) {
      const brevity = resolvedPrefs.summary.brevity;
      badges.push(`Summary: ${brevity.charAt(0).toUpperCase()}${brevity.slice(1)}`);
    }
    if (resolvedPrefs.tone) {
      badges.push(`Tone: ${resolvedPrefs.tone.charAt(0).toUpperCase()}${resolvedPrefs.tone.slice(1)}`);
    }
    if (Array.isArray(resolvedPrefs.industry?.filters) && resolvedPrefs.industry!.filters!.length) {
      badges.push(`Industry: ${resolvedPrefs.industry!.filters!.slice(0, 2).join(', ')}`);
    }
    return badges;
  }, [resolvedPrefs, focusHighlights]);
  const dismissContextTooltip = () => {
    setShowContextTooltip(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('contextTooltipSeen', 'true');
    }
  };
  const lastResearchSummaryRef = useRef<string>('');

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantMessage = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;
  const canDraftEmail = !draftEmailPending && !streamingMessage && Boolean((() => {
    const latest = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m?.role !== 'assistant') continue;
        if (/^##\s*Draft Email\b/i.test((m.content || '').trim())) continue;
        return m;
      }
      return null;
    })();
    return latest;
  })());
  const lastIsDraftEmail = useMemo(() => {
    const text = (lastAssistantMessage?.content || '').trim();
    return /^##\s*Draft Email\b/i.test(text);
  }, [lastAssistantMessage]);
  const chatPaddingClass = actionBarVisible && !streamingMessage ? 'pb-32 md:pb-40' : '';

  // Find the most recent assistant message that looks like research (not a draft email)
  const findLatestResearchAssistant = useCallback((): { index: number; message: Message } | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== 'assistant') continue;
      const text = (m.content || '').trim();
      if (/^##\s*Draft Email\b/i.test(text)) continue; // skip email drafts
      return { index: i, message: m };
    }
    return null;
  }, [messages]);

  const buildDraftFromLastAssistant = useCallback((): ResearchDraft | null => {
    const latest = findLatestResearchAssistant();
    if (!latest) return null;
    const assistantMsg = latest.message;
    const userMessage = [...messages].slice(0, latest.index).reverse().find(msg => msg.role === 'user')?.content;
    const sources = thinkingEvents
      .filter(ev => ev.type === 'web_search' && ev.query && ev.sources)
      .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];

    const draft = buildResearchDraft({
      assistantMessage: assistantMsg.content,
      userMessage,
      chatTitle: chats.find(c => c.id === currentChatId)?.title,
      agentType: 'company_research',
      sources,
      activeSubject,
      userProfile,
    });

    const normalizedDraft = (() => {
      const active = activeSubject?.trim();
      if (!active) return draft;
      const current = (draft.subject || '').trim();
      if (current && current.toLowerCase() === active.toLowerCase()) {
        return draft;
      }
      return { ...draft, subject: active };
    })();

    return normalizedDraft;
  }, [findLatestResearchAssistant, messages, thinkingEvents, chats, currentChatId, activeSubject, userProfile]);

  // Helper: get latest research assistant message id (skip Draft Email)
  const getLatestResearchMessageId = useCallback((): string | null => {
    const latest = findLatestResearchAssistant();
    return latest?.message?.id ?? null;
  }, [findLatestResearchAssistant]);

  useEffect(() => {
    if (user) void loadChats();
  }, [user]);

  // Allow any child component to open the ICP optimizer
  useEffect(() => {
    const open = () => setOptimizeOpen(true);
    window.addEventListener('optimize-icp:open', open);
    return () => window.removeEventListener('optimize-icp:open', open);
  }, []);

  useEffect(() => {
    if (!lastAssistantMessage) {
      setActionBarVisible(false);
    }
  }, [lastAssistantMessage]);

  // Fallback: if a new assistant message arrived and we are not streaming, ensure the Action Bar is visible
  useEffect(() => {
    if (lastAssistantMessage && !streamingMessage) {
      setActionBarVisible(true);
    }
  }, [lastAssistantMessage, streamingMessage]);

  const fetchUserPreferences = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [{ data: criteria }, { data: signals }] = await Promise.all([
        supabase
          .from('user_custom_criteria')
          .select('id, field_name, field_type, importance, hints, display_order')
          .eq('user_id', user.id)
          .order('display_order', { ascending: true }),
        supabase
          .from('user_signal_preferences')
          .select('id, signal_type, importance')
          .eq('user_id', user.id),
      ]);

      if (criteria) {
        setCustomCriteria(
          (criteria as any[]).map((item: any) => ({
            ...item,
            name: item.field_name ?? item.name ?? '',
          }))
        );
      } else {
        setCustomCriteria([]);
      }

      if (signals) {
        setSignalPreferences(signals as any[]);
      } else {
        setSignalPreferences([]);
      }
    } catch (error) {
      console.error('Failed to load user preferences', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchUserPreferences();
  }, [user?.id, fetchUserPreferences]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ criteria?: any[] }>).detail;
      if (detail?.criteria) {
        setCustomCriteria(
          detail.criteria.map((item: any) => ({
            ...item,
            name: item.field_name ?? item.name ?? '',
          }))
        );
      } else {
        void fetchUserPreferences();
      }
    };
    window.addEventListener('icp:criteria-updated', handler as EventListener);
    return () => window.removeEventListener('icp:criteria-updated', handler as EventListener);
  }, [fetchUserPreferences]);

  useEffect(() => {
    if (!currentChatId) {
      setMessages([]);
      return;
    }
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }
    void loadMessages(currentChatId);
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, thinkingEvents]);

  // Allow other pages to request opening a specific chat by id
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId?: string }>).detail;
      const target = detail?.chatId;
      if (typeof target === 'string' && target.trim()) {
        setCurrentChatId(target);
      }
    };
    window.addEventListener('chat:open', handler as EventListener);
    return () => window.removeEventListener('chat:open', handler as EventListener);
  }, []);

useEffect(() => {
  if (showRefine && refineFacets.length === 0) {
    setRefineFacets([...ALL_REFINE_FACETS]);
  }
}, [showRefine, refineFacets.length]);

  // Load preference and handle quick starter
  useEffect(() => {
    // Recover last unsent or mid-stream message after refresh
    try {
      const raw = localStorage.getItem('last_research_message');
      if (raw) {
        const saved = JSON.parse(raw) as { text: string; at: number } | null;
        if (saved && Date.now() - saved.at < 20000 && !inputValue) {
          setInputValue(saved.text);
          setFocusComposerTick(tick => tick + 1);
          addToast({ type: 'info', title: 'Recovered your last request', description: 'Press Send to continue.' });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pref = localStorage.getItem('preferred_research_type');
    if (pref === 'deep' || pref === 'quick' || pref === 'specific') {
      setPreferredResearchType(pref);
    }
  }, []);

  // Listen for optimize ICP events from message bubbles
  useEffect(() => {
    const handler = () => setOptimizeOpen(true);
    window.addEventListener('icp:optimize', handler as any);
    return () => window.removeEventListener('icp:optimize', handler as any);
  }, []);

  // Load greeting + signals for proactive dashboard
  useEffect(() => {
    const load = async () => {
      try {
        try {
          const data = await fetchDashboardGreeting();
          if (data?.greeting) setGreeting(data.greeting as any);
          if (Array.isArray(data?.signals)) setRecentSignals(data.signals as any);
          if (data?.account_stats) setAccountStats(data.account_stats);
          setGreetingOpeningLine(data?.opening_line ?? null);
          setGreetingSpotlights(Array.isArray(data?.spotlights) ? data.spotlights : []);
          setServerSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        } catch {
          const list = await listRecentSignals(6);
          setRecentSignals(list);
        }
      } catch {
        // best effort; silent
      }
    };
    void load();
  }, []);

  // Keep header account stats in sync when accounts change elsewhere
  useEffect(() => {
    const refreshStats = async () => {
      try {
        const { listTrackedAccounts } = await import('../services/accountService');
        const result = await listTrackedAccounts('all');
        setAccountStats(result.stats);
      } catch {}
    };
    const handler = () => { void refreshStats(); };
    window.addEventListener('accounts-updated', handler);
    return () => window.removeEventListener('accounts-updated', handler);
  }, []);

  // Poll compact bulk progress in the background; decoupled from status component
  useEffect(() => {
    let timer: any;
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data, error } = await supabase
          .from('bulk_research_jobs')
          .select('status, completed_count, total_count')
          .eq('user_id', session.user.id)
          .in('status', ['pending','running'] as any)
          .order('created_at', { ascending: false });
        if (error) return;
        const jobs = data || [];
        if (jobs.length === 0) {
          setBulkProgress(null);
          return;
        }
        const totals = jobs.reduce((acc, j: any) => {
          acc.completed += Number(j.completed_count || 0);
          acc.total += Number(j.total_count || 0);
          return acc;
        }, { completed: 0, total: 0 });
        const pct = totals.total > 0 ? Math.min(100, Math.round((totals.completed / totals.total) * 100)) : 0;
        setBulkProgress({ running: true, pct, label: `${pct}%` });
      } catch {}
    };
    const start = () => {
      void poll();
      timer = setInterval(poll, 5000);
    };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    start();
    const onStarted = () => { void poll(); };
    window.addEventListener('bulk-research:job-started', onStarted as any);
    return () => { stop(); window.removeEventListener('bulk-research:job-started', onStarted as any); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (!q || autoSentRef.current) return;
    autoSentRef.current = true;
    const sendStarter = async () => {
      let chatId = currentChatId;
      if (!chatId) {
        const newId = await createNewChat();
        chatId = newId;
      }
      if (chatId) {
        await handleSendMessageWithChat(chatId, q);
      }
    };
    void sendStarter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    const prefillHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (typeof detail?.prompt === 'string') {
        setInputValue(detail.prompt);
        setFocusComposerTick(tick => tick + 1);
      }
    };

    window.addEventListener('chat:prefill', prefillHandler as EventListener);
    const continueWithout = () => setSaveOpen(false);
    window.addEventListener('save:continue-without', continueWithout as EventListener);
    const keyHandler = (e: KeyboardEvent) => {
      const mac = navigator.platform.toLowerCase().includes('mac');
      const combo = (mac && e.metaKey && e.key.toLowerCase() === 'k') || (!mac && e.ctrlKey && e.key.toLowerCase() === 'k');
      if (combo) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('chat:prefill', prefillHandler as EventListener);
      window.removeEventListener('save:continue-without', continueWithout as EventListener);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

useEffect(() => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('contextTooltipSeen') === 'true') return;
  let hideTimer: number | undefined;
  const showTimer = window.setTimeout(() => {
    setShowContextTooltip(true);
    hideTimer = window.setTimeout(() => {
      dismissContextTooltip();
    }, 6000);
  }, 1500);
  return () => {
    window.clearTimeout(showTimer);
    if (hideTimer) window.clearTimeout(hideTimer);
  };
}, [dismissContextTooltip]);

  useEffect(() => {
    if (!showContextTooltip) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const tooltipEl = contextTooltipRef.current;
      if (!tooltipEl) {
        dismissContextTooltip();
        return;
      }
      if (!tooltipEl.contains(event.target as Node)) {
        dismissContextTooltip();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [showContextTooltip, dismissContextTooltip]);

  useEffect(() => {
    if (showRefine && refineFacets.length === 0) {
      setRefineFacets(Array.from(ALL_REFINE_FACETS));
    }
  }, [showRefine, refineFacets.length]);

  // Allow tests and power users to open the signals drawer programmatically
  useEffect(() => {
    const openHandler = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ accountId?: string; companyName?: string }>).detail;
        if (detail && typeof detail.accountId === 'string' && detail.accountId.length > 0) {
          setSignalsAccountId(detail.accountId);
          setSignalsCompanyName(detail.companyName);
          setSignalsDrawerOpen(true);
        }
      } catch {
        // no-op
      }
    };
    window.addEventListener('signals:open', openHandler as EventListener);
    return () => window.removeEventListener('signals:open', openHandler as EventListener);
  }, []);

  // Allow tests to open Bulk Research dialog programmatically
  useEffect(() => {
    const openBulk = () => setBulkResearchOpen(true);
    window.addEventListener('bulk:open', openBulk);
    return () => window.removeEventListener('bulk:open', openBulk);
  }, []);

  const loadChats = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setChats(data);
  };

  // Helper: find current chat if needed
  // const getCurrentChat = () => chats.find(c => c.id === currentChatId) || null;

  // Save dialog opens via onPromote in MessageBubble (last assistant message)

  const syncTrackedAccountResearch = useCallback(async (rawSubject: string | null | undefined, summary?: string | null) => {
    if (!user?.id) return false;
    const subject = typeof rawSubject === 'string' ? rawSubject.trim() : '';
    if (!subject) return false;
    try {
      const updates: Record<string, any> = {
        last_researched_at: new Date().toISOString(),
      };
      if (typeof summary === 'string' && summary.trim()) {
        updates.last_research_summary = summary.trim();
      }
      const { data, error } = await supabase
        .from('tracked_accounts')
        .update(updates)
        .eq('user_id', user.id)
        .eq('company_name', subject)
        .select('id');
      if (error) {
        throw error;
      }
      return Array.isArray(data) && data.length > 0;
    } catch (err) {
      console.warn('syncTrackedAccountResearch failed', err);
      return false;
    }
  }, [supabase, user?.id]);

  const persistResearchDraft = useCallback(async (draft: ResearchDraft) => {
    const dataPayload = {
      subject: draft.subject,
      executive_summary: draft.executive_summary,
      markdown_report: draft.markdown_report,
      icp_fit_score: draft.icp_fit_score,
      signal_score: draft.signal_score,
      composite_score: draft.composite_score,
      priority_level: draft.priority_level,
      confidence_level: draft.confidence_level,
      company_data: draft.company_data || {},
      leadership_team: draft.leadership_team || [],
      buying_signals: draft.buying_signals || [],
      custom_criteria_assessment: draft.custom_criteria_assessment || [],
      personalization_points: draft.personalization_points || [],
      recommended_actions: draft.recommended_actions || {},
      sources: draft.sources || [],
    };
    const tokens = approximateTokenCount(`${draft.executive_summary}\n\n${draft.markdown_report}`);
    const { data: inserted, error } = await supabase.from('research_outputs').insert({
      user_id: user?.id,
      subject: draft.subject,
      research_type: draft.research_type,
      data: dataPayload,
      tokens_used: tokens,
      // Also store structured columns for easy querying
      executive_summary: draft.executive_summary,
      markdown_report: draft.markdown_report,
      icp_fit_score: draft.icp_fit_score,
      signal_score: draft.signal_score,
      composite_score: draft.composite_score,
      priority_level: draft.priority_level,
      confidence_level: draft.confidence_level,
      sources: draft.sources || [],
      company_data: draft.company_data || {},
      leadership_team: draft.leadership_team || [],
      buying_signals: draft.buying_signals || [],
      custom_criteria_assessment: draft.custom_criteria_assessment || [],
      personalization_points: draft.personalization_points || [],
      recommended_actions: draft.recommended_actions || {},
    }).select('*').single();
    if (error) throw error;

    // After saving, upsert a vector entry and fetch related notes
    try {
      const auth = (await supabase.auth.getSession()).data.session?.access_token;
      if (auth && inserted?.id) {
        // Compute deterministic embedding from content
        const { textToDeterministicEmbedding } = await import('../utils/embeddings');
        const content = `${draft.executive_summary || ''}\n\n${draft.markdown_report || ''}`.trim();
        const emb = textToDeterministicEmbedding(content, 1536);
        // Upsert embedding
        await fetch('/api/search/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({
            object_type: 'research',
            object_key: String(inserted.id),
            chunk_id: 0,
            content,
            metadata: { subject: draft.subject || null },
            embedding: emb,
          })
        }).catch(() => {});

        // Query related notes (exclude self after fetch)
        const q = await fetch('/api/search/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ embedding: emb, object_type: 'research', top_k: 5 })
        });
        if (q.ok) {
          const json = await q.json();
          const results = Array.isArray(json?.results) ? json.results : [];
          const filtered = results.filter((r: any) => String(r?.id || r?.object_key) !== String(inserted.id));
          if (filtered.length) {
            // Compose a compact assistant note
            const bullets = filtered.slice(0, 3).map((r: any) => {
              const key = String(r.object_key || r.id || '').slice(0, 8);
              const snippet = String(r.content || '').replace(/\s+/g, ' ').slice(0, 120);
              return `- ${key}: ${snippet}${snippet.length >= 120 ? '…' : ''}`;
            }).join('\n');
            const body = `## Related Notes\nI found a few related items in your research history:\n\n${bullets}`;

            // Persist as an assistant message so it shows in the thread
            if (currentChatId) {
              try {
                const { data: msg } = await supabase
                  .from('messages')
                  .insert({ chat_id: currentChatId, role: 'assistant', content: body })
                  .select()
                  .single();
                if (msg) setMessages(prev => [...prev, msg as any]);
              } catch {
                // fall back to ephemeral state-only append
                setMessages(prev => [...prev, { id: `related-${Date.now()}`, role: 'assistant', content: body, created_at: new Date().toISOString() } as any]);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Embedding upsert/query failed', e);
    }
    try {
      const auth = (await supabase.auth.getSession()).data.session?.access_token;
      if (auth) {
        await fetch('/api/research/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ research_id: inserted?.id, markdown: draft.markdown_report })
        });
      }
    } catch (e) {
      console.warn('Criteria evaluation failed', e);
    }
    if (draft.subject) {
      await syncTrackedAccountResearch(draft.subject, draft.executive_summary || null);
    }
    window.dispatchEvent(new CustomEvent('accounts-updated'));
    window.dispatchEvent(new CustomEvent('research-history-updated'));
    return inserted;
  }, [supabase, user?.id, syncTrackedAccountResearch]);

  const handleTrackAccount = async (rawCompanyName: string) => {
    if (!user) return;
    const companyName = String(rawCompanyName || '')
      .replace(/^\s*\d+[).-]?\s*/, '') // drop leading list markers like "1)"
      .replace(/^[-*]\s*/, '')
      .trim();
    if (!companyName) {
      addToast({ title: 'Invalid company name', description: 'Could not determine a company name to track.', type: 'error' });
      return;
    }

    try {
      // Check if account already exists
      const { data: existingAccount } = await supabase
        .from('tracked_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_name', companyName)
        .single();

      const draft = buildDraftFromLastAssistant();
      const normalizedDraft = draft ? { ...draft, subject: companyName } : null;

      if (existingAccount) {
        if (normalizedDraft) {
          try {
            await persistResearchDraft(normalizedDraft);
            addToast({
              title: 'Research updated',
              description: `Saved latest findings for ${companyName}.`,
              type: 'success',
            });
          } catch (err: any) {
            addToast({
              title: 'Failed to save research',
              description: err?.message || 'Could not attach the latest report.',
              type: 'error',
            });
          }
        } else {
          addToast({
            title: 'Account already tracked',
            description: `${companyName} is already in your tracked accounts`,
            type: 'info',
          });
        }
        return;
      }

      // Add new tracked account
      const { error } = await supabase
        .from('tracked_accounts')
        .insert({
          user_id: user.id,
          company_name: companyName,
          monitoring_enabled: true,
          priority: 'standard',
        });

      if (error) throw error;

      addToast({ title: 'Account tracked', description: `${companyName} has been added to your tracked accounts`, type: 'success' });

      if (normalizedDraft) {
        try {
          await persistResearchDraft(normalizedDraft);
          const latestId = getLatestResearchMessageId();
          if (latestId) setRecentlySavedMessageId(latestId);
          addToast({
            title: 'Research attached',
            description: `Saved the current ${companyName} report and started monitoring.`,
            type: 'success',
          });
        } catch (err: any) {
          addToast({
            title: 'Could not save research',
            description: err?.message || 'Account is tracked, but the latest report was not saved automatically.',
            type: 'error',
          });
        }
      }

      // Trigger signal detection for new account
      fetch(`/api/signals/trigger-detection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      }).catch(console.error);

      // Dispatch event to update AccountListWidget
      window.dispatchEvent(new CustomEvent('accounts-updated'));

    } catch (error: any) {
      console.error('Failed to track account:', error);
      addToast({
        title: 'Failed to track account',
        description: error.message || 'Unable to add account to tracking',
        type: 'error',
      });
    }
  };

  const handleSaveResearch = async (draft: ResearchDraft) => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persistResearchDraft(draft);
      setSaveOpen(false);
      const latestId = getLatestResearchMessageId();
      if (latestId) setRecentlySavedMessageId(latestId);
      const subjectForToast = (activeSubject && activeSubject.trim().length > 0)
        ? activeSubject
        : (draft.subject || '').trim();
      if (subjectForToast) {
        // Ensure an account exists for this subject so saves and dashboard stay unified
        const newlyTracked = await ensureTrackedAccount(subjectForToast);
        addToast({
          type: 'success',
          title: newlyTracked ? 'Tracked and saved' : 'Saved to history',
          description: newlyTracked
            ? `${subjectForToast} is now tracked. You will see it on your dashboard.`
            : `Attached to ${subjectForToast}. Find it in Tracked Accounts.`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Saved to history',
          description: 'Find it in Research History → Recent saved.',
          actionText: 'Open history',
          onAction: () => navigate('/research')
        });
      }
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save research');
      addToast({ type: 'error', title: 'Save failed', description: 'Could not save this response. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Ensure an account row exists; returns true if newly created
  const ensureTrackedAccount = async (rawCompanyName: string): Promise<boolean> => {
    if (!user) return false;
    const companyName = String(rawCompanyName || '').trim();
    if (!companyName) return false;
    try {
      const { data: existing } = await supabase
        .from('tracked_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_name', companyName)
        .maybeSingle();
      if (existing) {
        await syncTrackedAccountResearch(companyName, lastResearchSummaryRef.current || null);
        return false;
      }
      const { error } = await supabase
        .from('tracked_accounts')
        .insert({ user_id: user.id, company_name: companyName, monitoring_enabled: true, priority: 'standard' });
      if (error) throw error;
      await syncTrackedAccountResearch(companyName, lastResearchSummaryRef.current || null);
      // Notify listeners to refresh tracked lists
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      return true;
    } catch (e) {
      console.warn('ensureTrackedAccount failed:', e);
      return false;
    }
  };

  const loadAssumedSuggestions = useCallback(async (term: string) => {
    if (!user?.id) {
      setAssumedSuggestions([]);
      return;
    }
    const query = term.trim();
    if (!query) {
      setAssumedSuggestions([]);
      return;
    }
    const pattern = `%${query.replace(/[%_]/g, '')}%`;
    setAssumedSuggestionsLoading(true);
    try {
      const [tracked, recent, web] = await Promise.all([
        supabase
          .from('tracked_accounts')
          .select('company_name, industry')
          .eq('user_id', user.id)
          .ilike('company_name', pattern)
          .limit(10),
        supabase
          .from('research_outputs')
          .select('subject')
          .eq('user_id', user.id)
          .ilike('subject', pattern)
          .order('created_at', { ascending: false })
          .limit(15),
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { items: [] } as any;
            const r = await fetch(`/api/companies/resolve?term=${encodeURIComponent(query)}`, {
              headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!r.ok) return { items: [] } as any;
            return await r.json();
          } catch { return { items: [] } as any; }
        })(),
      ]);

      const merged = new Map<string, { name: string; industry?: string | null }>();
      const seed = query ? { name: query, industry: assumedDialogIndustry } : null;
      if (seed) merged.set(seed.name.toLowerCase(), seed);
      if (tracked.data) {
        tracked.data.forEach((row: any) => {
          if (!row?.company_name) return;
          const key = String(row.company_name).toLowerCase();
          if (!merged.has(key)) {
            merged.set(key, { name: row.company_name, industry: row.industry || null });
          }
        });
      }
      if (recent.data) {
        recent.data.forEach((row: any) => {
          if (!row?.subject) return;
          const key = String(row.subject).toLowerCase();
          if (!merged.has(key)) {
            merged.set(key, { name: row.subject });
          }
        });
      }
      if (web?.items && Array.isArray(web.items)) {
        web.items.forEach((item: any) => {
          const nm = String(item?.name || '').trim();
          if (!nm) return;
          const key = nm.toLowerCase();
          if (!merged.has(key)) merged.set(key, { name: nm, industry: item.industry || null });
        });
      }
      setAssumedSuggestions(Array.from(merged.values()).slice(0, 5));
    } catch (error) {
      console.warn('Failed to load assumed suggestions', error);
      setAssumedSuggestions([]);
    } finally {
      setAssumedSuggestionsLoading(false);
    }
  }, [supabase, user?.id, assumedDialogIndustry]);

  const handleAssumedChangeRequest = useCallback((assumed: { name: string; industry?: string | null }) => {
    const base = (assumed?.name || '').trim();
    if (!base) return;
    setAssumedDialogName(base);
    setAssumedDialogIndustry(assumed?.industry || null);
    setAssumedDialogOpen(true);
    setAssumedSuggestions(prev => {
      const filtered = prev.filter(item => item.name.toLowerCase() !== base.toLowerCase());
      return [{ name: base, industry: assumed?.industry || null }, ...filtered];
    });
    void loadAssumedSuggestions(base);
  }, [loadAssumedSuggestions]);

  const loadMessages = async (chatId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  // When switching to an existing chat, infer an active subject from the latest
  // assistant content so follow-up questions like "who is the CEO?" use context.
  useEffect(() => {
    if (!currentChatId) return;
    if (activeSubject) return; // already set
    if (!messages || messages.length === 0) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant?.content) return;
    try {
      const text = lastAssistant.content.slice(0, 800);
      const patterns = [
        /researching\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
        /analysis of\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
        /^#\s+([^\n]+)/m,
      ];
      let candidate: string | null = null;
      for (const p of patterns) {
        const mm = text.match(p);
        if (mm && mm[1] && mm[1].trim()) { candidate = mm[1].trim(); break; }
      }
      if (!candidate) {
        candidate = extractCompanyNameFromQuery(text || '');
      }
      if (candidate && isLikelySubject(candidate)) {
        setActiveSubject(candidate);
      }
    } catch {}
  }, [currentChatId, messages, activeSubject]);

  const createNewChat = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from('chats')
      .insert({ user_id: user.id, title: 'Company Research', agent_type: 'company_research' })
      .select()
      .single();
    if (data) {
      setChats(prev => [data, ...prev]);
      setCurrentChatId(data.id);
      setMessages([]);
      skipInitialLoadRef.current = true;
      lastResearchSummaryRef.current = '';
      return data.id;
    }
    return null;
  }, [supabase, user]);

  const handleNewChatClick = async () => {
    if (creatingNewChat) return;
    setCreatingNewChat(true);
    try {
      const id = await createNewChat();
      if (id) {
        addToast({
          type: 'success',
          title: 'New session ready',
          description: 'Start typing to kick off your next research.',
        });
      }
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Could not start new chat',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setCreatingNewChat(false);
    }
  };

  const fetchSummaryFromSource = useCallback(async (source: string): Promise<SummarySchema> => {
    if (!PREFS_SUMMARY_ENABLED) {
      throw new Error('Structured summary is disabled.');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const payload = {
      messages: [{ role: 'user', content: 'Summarize the previous research findings.' }],
      stream: true,
      chatId: currentChatId,
      config: { summarize_source: source },
    };

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Summary request failed (${response.status})`);
    }
    if (!response.body) {
      throw new Error('Summary stream unavailable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: SummarySchema | null = null;
    let summaryError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw);
          if (evt?.type === 'summary_json' && evt?.content) {
            const parsed = SummarySchemaZ.safeParse(evt.content);
            if (parsed.success) {
              summary = parsed.data;
            } else {
              summaryError = parsed.error.message;
            }
          } else if (evt?.type === 'summary_error') {
            summaryError = typeof evt?.message === 'string' ? evt.message : 'Summary generation failed';
          }
        } catch (err) {
          console.error('Failed to parse summary event', err, raw);
        }
      }
    }

    if (!summary) {
      throw new Error(summaryError || 'Summary was not returned by the model');
    }
    return summary;
  }, [supabase, currentChatId, PREFS_SUMMARY_ENABLED]);

  const handleSendMessageWithChat = async (
    chatId: string,
    text: string,
    runModeOverride?: 'deep' | 'quick' | 'specific',
    options?: { force?: boolean }
  ) => {
    if (!text.trim() || loading) return;
    const normalized = text.trim();
    const now = Date.now();
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!options?.force && (
      (lastUser && lastUser.content.trim().toLowerCase() === normalized.toLowerCase()) ||
      (lastSentRef.current && lastSentRef.current.text === normalized.toLowerCase() && now - lastSentRef.current.at < 4000)
    )) {
      return; // prevent duplicate immediate sends of same text
    }
    lastSentRef.current = { text: normalized.toLowerCase(), at: now };
    setLoading(true);
    setStreamingMessage('');
    setThinkingEvents([]);
    setActionBarVisible(false);
    setActionBarCompany(null);
    assistantInsertedRef.current = false;

    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: normalized,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);

    const isGenericHelp = isGenericHelpPrompt(normalized);
    const looksLikeResearch = !isGenericHelp && isResearchPrompt(normalized);
    const continuationMatch = normalized.match(/^(?:continue|resume)\s+(?:research(?:\s+on)?\s+)?(.+)/i);
    const continuationTarget = continuationMatch?.[1]?.trim() || null;
    const normalizedLower = normalized.toLowerCase();
    const isExistingAccountsIntent = /^research\s+(my\s+)?existing\s+accounts?\b/.test(normalizedLower);

    let detectedCompany = extractCompanyNameFromQuery(normalized);
    if (!detectedCompany && continuationTarget) {
      detectedCompany = extractCompanyNameFromQuery(`research ${continuationTarget}`);
    }

    // Guardrail: if this looks like research but the subject is nonsense or low-confidence,
    // open suggestions dialog instead of spending credits AND do not set activeSubject.
    const isWHQuestion = /^(who|what|when|where|which|why|how)\b/i.test(normalized);
    const endsWithQuestion = /\?\s*$/.test(normalized);
    if (isExistingAccountsIntent) {
      try {
        const { data: savedUser } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'user', content: normalized })
          .select()
          .single();

        const helper =
          `I can absolutely help with existing accounts once I know which companies to track.\n\n` +
          `Try one of these next:\n` +
          `• Type a specific company (e.g., "Research Okta")\n` +
          `• Paste a short list of account names\n` +
          `• Open the Accounts panel to upload a CSV for tracking`;
        const { data: savedAssistant } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'assistant', content: helper })
          .select()
          .single();

        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUser.id);
          const next: Message[] = [...filtered];
          if (savedUser) next.push(savedUser);
          if (savedAssistant) next.push(savedAssistant);
          return next;
        });
      } catch (error) {
        console.error('Failed to handle generic existing accounts prompt', error);
        addToast({
          type: 'error',
          title: 'Need specific accounts',
          description: 'Name a company to research or upload your account list.',
        });
        setMessages(prev => prev.filter(m => m.id !== tempUser.id));
      } finally {
        setLoading(false);
        setStreamingMessage('');
        setThinkingEvents([]);
      }
      return;
    }

    if (looksLikeResearch) {
      const candidate = sanitizeCandidate(detectedCompany || normalized);
      const wordCount = normalized.split(/\s+/).filter(Boolean).length;
      const treatAsFollowUp = isWHQuestion || endsWithQuestion || normalized.length >= 60 || wordCount >= 6 || Boolean(activeSubject);
      if (!treatAsFollowUp && (isGibberish(candidate) || !isLikelySubject(detectedCompany || candidate))) {
        setAssumedDialogName(candidate);
        setAssumedDialogIndustry(null);
        setAssumedDialogOpen(true);
        try { await loadAssumedSuggestions(candidate); } catch {}
        setMessages(prev => prev.filter(m => m.id !== tempUser.id));
        setLoading(false);
        setStreamingMessage('');
        setThinkingEvents([]);
        return;
      }
    }

    // Only set active subject if value looks like a proper entity
    const questionCandidateLooksLikeEntity =
      isWHQuestion &&
      isLikelySubject(detectedCompany) &&
      Boolean(detectedCompany) &&
      !/^(the|a|an)\b/i.test((detectedCompany || '').toLowerCase()) &&
      (detectedCompany || '').split(/\s+/).length <= 4;
    const shouldAssignSubject =
      (looksLikeResearch || continuationTarget || questionCandidateLooksLikeEntity) &&
      isLikelySubject(detectedCompany);

    if (shouldAssignSubject) {
      setActiveSubject(detectedCompany);
    }
    if (shouldAssignSubject && detectedCompany && detectedCompany !== activeSubject) {
      lastResearchSummaryRef.current = '';
    }

    if (isGenericHelp) {
      try {
        const { data: savedUser } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'user', content: normalized })
          .select()
          .single();

        const helperMessage = getGenericHelpResponse();
        const { data: savedAssistant } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, role: 'assistant', content: helperMessage })
          .select()
          .single();

        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUser.id);
          const next: Message[] = [...filtered];
          if (savedUser) next.push(savedUser);
          if (savedAssistant) next.push(savedAssistant);
          return next;
        });
      } catch (err) {
        console.error('Failed to handle help prompt', err);
        addToast({
          type: 'error',
          title: 'Something went wrong',
          description: 'Try again or ask about a specific company.',
        });
        setMessages(prev => prev.filter(m => m.id !== tempUser.id));
      } finally {
        setLoading(false);
        setStreamingMessage('');
        setThinkingEvents([]);
      }
      return;
    }

    if (looksLikeResearch && userProfile) {
      const criticalNames = customCriteria
        .filter((c: any) => (c?.importance || '').toLowerCase() === 'critical')
        .map((c: any) => c.name)
        .filter(Boolean)
        .slice(0, 4);
      const importantNames = customCriteria
        .filter((c: any) => (c?.importance || '').toLowerCase() === 'important')
        .map((c: any) => c.name)
        .filter(Boolean)
        .slice(0, 4);

      setThinkingEvents([{
        id: `context-${Date.now()}`,
        type: 'context_preview',
        company: detectedCompany || activeSubject || 'this company',
        icp: userProfile.icp_definition || userProfile.icp || userProfile.industry || '',
        critical: criticalNames,
        important: importantNames,
      }]);
    }

    try {
      // Persist last message for recovery in case of refresh
      try { localStorage.setItem('last_research_message', JSON.stringify({ text: normalized, at: Date.now() })); } catch {}
      const { data: savedUser } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'user', content: normalized })
        .select()
        .single();

      let assistant = await streamAIResponse(text, chatId, { overrideDepth: runModeOverride });
      const usedDepth = (runModeOverride || preferredResearchType || 'deep') as 'deep'|'quick'|'specific';
      assistant = normalizeMarkdown(assistant, { enforceResearchSections: usedDepth !== 'specific' });

      // Persist any save_profile commands returned by the agent
      await processSaveCommands(assistant);

      // Prevent duplicate assistant insertion if this handler races or is re-entered
      if (assistantInsertedRef.current) {
        // Already appended once; just ensure UI state is clean
        setStreamingMessage('');
        setThinkingEvents([]);
        return;
      }
      assistantInsertedRef.current = true;
      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, role: 'assistant', content: assistant })
        .select()
        .single();

      const updatedAt = new Date().toISOString();
      if (messages.length === 0) {
        const title = deriveChatTitle(normalized);
        await supabase
          .from('chats')
          .update({ updated_at: updatedAt, title })
          .eq('id', chatId);
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title, updated_at: updatedAt } : chat));
      } else {
        await supabase
          .from('chats')
          .update({ updated_at: updatedAt })
          .eq('id', chatId);
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, updated_at: updatedAt } : chat));
      }

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUser.id);
        const next: Message[] = [...filtered];
        if (savedUser) next.push(savedUser);
        if (savedAssistant) next.push(savedAssistant);
        return next.filter((m, index, self) => m && index === self.findIndex(msg => msg?.id === m.id));
      });
      setStreamingMessage('');
      setThinkingEvents([]);
      lastResearchSummaryRef.current = summarizeForMemory(assistant);

      // Background: precompute a concise summary for instant access on click
      try {
        const msgId = (savedAssistant as any)?.id as string | undefined;
        if (msgId && assistant && assistant.trim().length > 0) {
          (async () => {
            try {
              const summary = await fetchSummaryFromSource(assistant);
              setSummaryCache(prev => ({ ...prev, [msgId]: summary }));
            } catch {}
          })();
        }
      } catch {}

      if (assistant?.trim()) {
        const assistantCandidate = extractCompanyNameFromQuery(assistant);
        const nextCompany = isLikelySubject(detectedCompany)
          ? detectedCompany
          : isLikelySubject(activeSubject)
            ? activeSubject
            : isLikelySubject(assistantCandidate)
              ? assistantCandidate
              : null;
        setActionBarCompany(nextCompany);
        setActionBarVisible(true);
        if (nextCompany) {
          ensureTrackedAccount(nextCompany)
            .then((newlyTracked) => {
              if (newlyTracked) {
                addToast({
                  type: 'success',
                  title: `${nextCompany} added to tracking`,
                  description: 'I’ll keep monitoring signals for this account.',
                });
                try { window.dispatchEvent(new CustomEvent('show-tracked-accounts')); } catch {}
              }
            })
            .catch((err) => console.warn('Auto-track failed', err));
        }
      }

      // JIT prompts based on usage milestones and profile state
      try {
        // Increment research count (local + server)
        const key = 'research_count';
        const current = Number(localStorage.getItem(key) || '0') || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));

        // Persist in user_prompt_config (best-effort)
        try {
          const host = typeof window !== 'undefined' ? window.location.hostname : '';
          const isLocal = host === 'localhost' || host === '127.0.0.1';
          if (!isLocal) {
            const sessionResult = await supabase.auth.getSession();
            const profileUpdate = await fetch('/api/update-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionResult.data.session?.access_token}`,
              },
              body: JSON.stringify({ prompt_config: { research_count: next } })
            });

            if (!profileUpdate.ok && profileUpdate.status !== 204) {
              const detail = `Failed with status ${profileUpdate.status}`;
              console.warn('[ProfileCoach] prompt_config update failed:', detail);
              addToast({
                type: 'error',
                title: 'Could not save research preferences',
                description: detail,
              });
            }
          } else {
            console.debug('[ProfileCoach] skipping prompt_config update while running without local API server');
          }
        } catch (updateErr) {
          console.warn('Prompt config update error', updateErr);
        }

        // After 1st research: suggest tracking account if none tracked
        if (next === 1) {
          const { count } = await supabase
            .from('tracked_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user!.id);
          if ((count || 0) === 0) {
            addToast({
              type: 'info',
              title: 'Track this account?',
              description: 'I can monitor it for signals and changes.',
              actionText: 'Track',
              onAction: async () => {
                const company = (assistant || '').split('\n')[0]?.replace(/^#+\s*/, '') || 'This account';
                await handleTrackAccount(company);
              }
            });
          }
        }

        // After 3rd research: suggest setting industry if missing
        if (next === 3) {
          const { data: profileRow } = await supabase
            .from('company_profiles')
            .select('industry')
            .eq('user_id', user!.id)
            .maybeSingle();
          if (!profileRow?.industry) {
            addToast({
              type: 'info',
              title: 'Set your target industry?',
              description: 'This helps tailor research quality.',
              actionText: 'Update',
              onAction: () => navigate('/profile-coach')
            });
          }
        }

        // After 5th research: suggest signal tracking if none configured
        if (next === 5) {
          const { count: sigCount } = await supabase
            .from('user_signal_preferences')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user!.id);
          if ((sigCount || 0) === 0) {
            addToast({
              type: 'info',
              title: 'Set up signal tracking?',
              description: 'Get alerts on leadership changes, breaches, funding, and more.',
              actionText: 'Configure',
              onAction: () => navigate('/settings/signals')
            });
          }
        }
      } catch {}
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || 'There was a problem sending your message. Please try again.';
      addToast({
        type: 'error',
        title: 'Message failed',
        description: errorMessage,
      });
      
      // Add error message to chat
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ I encountered an error while processing your request: **${errorMessage}**\n\nPlease try again, or rephrase your question.`,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => prev.filter(m => m.id !== tempUser.id).concat([tempUser, errorMsg] as any));
      setStreamingMessage('');
      setThinkingEvents([]);
      setActionBarVisible(false);
    } finally {
      setLoading(false);
      try { localStorage.removeItem('last_research_message'); } catch {}
    }
  };

  const startSuggestion = (prompt: string) => {
    if (!prompt) return;
    setInputValue(prompt);
    setFocusComposerTick(t => t + 1);
  };

  const showSetupSummary = useCallback(() => {
    const p: any = userProfile || {};
    const bullets: string[] = [];
    bullets.push('## Your Setup');
    if (p.company_name || p.company_url) {
      bullets.push(`- Organization: ${p.company_name || '—'}${p.company_url ? ` (${p.company_url})` : ''}`);
    }
    if (p.user_role || p.use_case) {
      const roleParts = [p.user_role, p.use_case].filter(Boolean).join(' — ');
      bullets.push(`- Role/Use case: ${roleParts || '—'}`);
    }
    if (p.icp_definition || p.industry) {
      bullets.push(`- ICP: ${p.icp_definition || p.industry}`);
    }
    if (Array.isArray(signalPreferences) && signalPreferences.length) {
      const sigs = signalPreferences
        .map((s: any) => s.signal_type?.replace(/_/g, ' '))
        .filter(Boolean)
        .join(', ');
      bullets.push(`- Signals: ${sigs}`);
    }
    if (Array.isArray(customCriteria) && customCriteria.length) {
      const crit = customCriteria
        .map((c: any) => `${c.name} (${(c.importance || '').toLowerCase() || 'optional'})`)
        .join('; ');
      bullets.push(`- Custom criteria: ${crit}`);
    }
    if (Array.isArray(p.research_focus) && p.research_focus.length) {
      bullets.push(`- Research focus: ${p.research_focus.map((x: string) => x.replace(/_/g, ' ')).join(', ')}`);
    }
    const terms = p?.preferred_terms;
    const indicatorLabel = terms && typeof terms === 'object' && typeof (terms as any)?.indicators_label === 'string'
      ? (terms as any).indicators_label.trim()
      : '';
    if (indicatorLabel) {
      bullets.push(`- Indicator section label: ${indicatorLabel}`);
    }
    const indicatorChoices = Array.isArray(p?.indicator_choices)
      ? p.indicator_choices.map((entry: any) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
      : [];
    if (indicatorChoices.length) {
      bullets.push(`- Indicator watchlist: ${indicatorChoices.join(', ')}`);
    }
    bullets.push('\nShortcuts: type "Edit setup" to reopen onboarding, or go to Settings → Profile.');
    const msg: Message = {
      id: `setup-${Date.now()}`,
      role: 'assistant',
      content: bullets.join('\n'),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
  }, [customCriteria, signalPreferences, userProfile]);

  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content) return;

    const isResearch = isResearchPrompt(content);

    // Allow user to view a summary of onboarding/setup without invoking the LLM
    if (/^\s*(view|show)\s+(my\s+)?(setup|setup\s+logic|profile|preferences)\b/i.test(content)) {
      setInputValue('');
      showSetupSummary();
      return;
    }

    const inferredMode = isResearch ? inferResearchMode(content) : undefined;

    const runMode = preferredResearchType ?? inferredMode;

    setInputValue('');
    if (!currentChatId) {
      const id = await createNewChat();
      if (id) await handleSendMessageWithChat(id, content, runMode || undefined);
      return;
    }
    await handleSendMessageWithChat(currentChatId, content, runMode || undefined);
  };

  const persistPreference = async (type: 'deep' | 'quick' | 'specific') => {
    setPreferredResearchType(type);
    try { localStorage.setItem('preferred_research_type', type); } catch {}
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const updateProfileUrl = '/api/update-profile';
      await fetch(updateProfileUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ prompt_config: { preferred_research_type: type } }),
      });
    } catch (err) {
      console.error('Failed to persist preference:', err);
    }
  };

  const streamAIResponse = async (
    userMessage: string,
    chatId?: string,
    options?: { config?: Record<string, any>; overrideDepth?: 'deep' | 'quick' | 'specific' }
  ): Promise<string> => {
    try {
      // Reset assumption badge for this run
      setLastAssumedSubject(null);
      setRecentlySavedMessageId(null);
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const looksLikeResearch = isResearchPrompt(userMessage);
      // New: preflight intent + subject extraction to improve routing
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const resp = await fetch('/api/ai/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ text: userMessage, active_subject: activeSubject || '' })
          });
          if (resp.ok) {
            const json = await resp.json();
            const extractedSubject = (json?.subject || '').trim();
            const intent = String(json?.intent || '').toLowerCase();
            if (extractedSubject && isLikelySubject(extractedSubject)) {
              setActiveSubject(extractedSubject);
            }
            // Use Specific mode for follow-up style intents
            if (!options?.overrideDepth && (intent === 'follow_up' || intent === 'compare' || intent === 'summarize')) {
              // tag for later depth selection
              (options as any) = { ...(options || {}), overrideDepth: 'specific' };
            }
          }
        }
      } catch {}
      const referencesActive = activeSubject
        ? userMessage.toLowerCase().includes(activeSubject.toLowerCase())
        : false;
      const summarySnippet = !looksLikeResearch && lastResearchSummaryRef.current
        ? `\n\n[Recent findings recap: ${lastResearchSummaryRef.current}]`
        : '';
      const enrichedMessage =
        activeSubject && !looksLikeResearch && !referencesActive
          ? `${userMessage}\n\n[Context: The company in focus is ${activeSubject}.]${summarySnippet}`
          : `${userMessage}${summarySnippet}`;

      history.push({ role: 'user', content: enrichedMessage });

      let { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      let authToken = session.access_token;

      // Feature flag for safe API migration
      // Set VITE_USE_VERCEL_API=true in .env to use Vercel API instead of Edge Functions
      // Default to Vercel API unless explicitly disabled
      const chatUrl = '/api/ai/chat';

      console.log('[DEBUG] Calling chat API:', { chatUrl, hasSession: !!session });
      // Instrumentation: request start
      const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { 
        window.dispatchEvent(new CustomEvent('llm:request', { detail: { page: 'research', url: chatUrl, ts: Date.now() } }));
        console.log('[LLM][research] request', { url: chatUrl });
      } catch {}
      // Build config to influence model depth based on user preference/clarifier
      const overrideDepth = options?.overrideDepth;
      // Auto-detect short follow-up questions and force 'specific' when an active subject exists
      const shortFollowUp = /^(who|what|when|where|which|how|do|does|did|is|are|was|were)\b/i.test(userMessage.trim()) && userMessage.trim().length <= 120 && Boolean(activeSubject);
      const inferredDepth: 'deep' | 'quick' | 'specific' | undefined = shortFollowUp ? 'specific' : undefined;
      const depth = overrideDepth || inferredDepth || preferredResearchType || 'deep';
      setLastRunMode((depth as any) || 'auto');
      const cfg: any = { ...(options?.config || {}) };
      if (depth === 'deep') cfg.model = 'gpt-5-mini';
      if (depth === 'quick') cfg.model = 'gpt-5-mini';
      if (depth === 'specific') cfg.model = 'gpt-5-mini';
      cfg.clarifiers_locked = clarifiersLocked;
      cfg.facet_budget = depth === 'quick' ? 3 : depth === 'deep' ? 8 : 6;
      // Fast mode hints to server for lower verbosity/reasoning and shorter summaries
      // No fast mode: always favor full context for research outputs

      // Setup abort controller for Stop action
      const controller = new AbortController();
      streamingAbortRef.current = controller;

      const defaultTemplateId = getDefaultTemplate().id;
      const includeTemplate = depth !== 'specific' && selectedTemplate && selectedTemplateId && selectedTemplateId !== defaultTemplateId;

      const requestPayload = JSON.stringify({
        messages: history,
        stream: true,
        chatId: chatId ?? currentChatId,
        config: {
          ...cfg,
          ...(includeTemplate ? {
            template: {
              id: selectedTemplateId,
              version: selectedTemplate.version,
              sections: (selectedTemplate.sections || []).map(s => ({ id: s.id, label: s.label, required: Boolean((s as any).required) })),
              inputs: templateInputs || {},
              guardrail_profile_id: selectedGuardrailProfile?.id,
              signal_set_id: selectedSignalSet?.id,
            }
          } : {})
        },
        research_type: depth,
        active_subject: activeSubject || null
      });

      const makeRequest = (token: string) => fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: requestPayload,
        signal: controller.signal,
      });

      let response = await makeRequest(authToken);

      if (response.status === 401) {
        try {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed?.session?.access_token) {
            session = refreshed.session;
            authToken = refreshed.session.access_token;
            response = await makeRequest(authToken);
          }
        } catch (refreshErr) {
          console.warn('Token refresh failed', refreshErr);
        }
      }
      console.log('[DEBUG] Response status:', response.status, response.statusText);
      if (!response.ok) {
        try {
          const errBody = await response.text();
          addToast({
            type: 'error',
            title: `Chat API error ${response.status}`,
            description: errBody?.slice(0, 300) || response.statusText,
          });
        } catch {}
        if (response.status === 402) {
          try {
            const body = await response.json();
            if (body?.needsApproval) {
              navigate('/pending-approval');
            }
            throw new Error(body?.error || `API error: ${response.status} ${response.statusText}`);
          } catch {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }
        }
        // Decide whether to allow a non-streaming fallback (disabled by default).
        const allowFallback = import.meta.env.VITE_ALLOW_STREAM_FALLBACK === 'true';
        if (!allowFallback) {
          // Signal tests that streaming failed and fallback was NOT allowed.
          try { window.dispatchEvent(new CustomEvent('streaming-failed-no-fallback')); } catch {}
          throw new Error(`Streaming failed and fallback disabled`);
        }

        // Fallback (DEV/diagnostic only): retry without streaming to capture error body clearly
        try {
          const retry = await fetch(chatUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ messages: history, stream: false, chat_id: chatId ?? currentChatId }),
          });
          const fallbackText = await retry.text();
          try { window.dispatchEvent(new CustomEvent('stream-fallback-used')); } catch {}
          addToast({
            type: retry.ok ? 'success' : 'error',
            title: retry.ok ? 'Fallback (non-stream) succeeded' : `Fallback failed ${retry.status}`,
            description: fallbackText?.slice(0, 300) || 'No body',
          });
          if (retry.ok) {
            // Return textual body to surface something to user while we fix streaming
            try {
              const parsed = JSON.parse(fallbackText);
              const output = parsed?.text || parsed?.raw?.output_text || '';
              return typeof output === 'string' && output.length > 0 ? output : (fallbackText || '');
            } catch {
              return fallbackText || '';
            }
          }
        } catch (fallbackErr) {
          console.error('non-stream fallback error', fallbackErr);
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let mainContent = '';
      let tldrBuffer = '';
      let buffer = '';
      let usedTokens: number | null = null;
      let firstDeltaAt: number | null = null;
      const markFirstDelta = () => {
        if (firstDeltaAt == null) {
          firstDeltaAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          setThinkingEvents(prev => prev.filter(e => e.type !== 'acknowledgment' && e.type !== 'context_preview'));
          try {
            window.dispatchEvent(new CustomEvent('llm:first-delta', { detail: { page: 'research', ttfbMs: firstDeltaAt - startedAt } }));
            console.log('[LLM][research] first-delta', { ttfbMs: firstDeltaAt - startedAt });
          } catch {}
        }
      };
      const composeOutput = () => {
        const trimmedTldr = tldrBuffer.trim();
        if (!mainContent && !trimmedTldr) return '';
        const lines = mainContent.split('\n');
        let ackLine = '';
        let remainder = mainContent;
        if (lines.length > 0) {
          const first = lines[0].trim();
          if (first && !first.startsWith('#')) {
            ackLine = lines[0];
            remainder = lines.slice(1).join('\n').trimStart();
          }
        }
        const parts: string[] = [];
        if (ackLine) parts.push(ackLine.trim());
        if (remainder) parts.push(remainder.trim());
        if (trimmedTldr) parts.push(trimmedTldr);
        return parts.join('\n\n').trim();
      };
      const updateStreaming = () => {
        const composed = composeOutput();
        setStreamingMessage(stripClarifierBlocks(composed));
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'meta') {
                  try {
                    console.log('[LLM][meta]', parsed);
                    window.dispatchEvent(new CustomEvent('llm:meta', { detail: parsed }));
                  } catch {}
                }
                // Handle acknowledgment (shown before research starts)
                else if (parsed.type === 'acknowledgment') {
                  setThinkingEvents(prev => [...prev, { id: `ack-${Date.now()}`, type: 'acknowledgment', content: parsed.content }]);
                }
                // Handle reasoning events - UPDATE existing reasoning indicator
                else if (parsed.type === 'reasoning') {
                  markFirstDelta();
                  setThinkingEvents(prev => {
                    const existing = prev.find(e => e.type === 'reasoning');
                    if (existing) {
                      return prev.map(e => e.type === 'reasoning' ? { ...e, content: (e.content || '') + parsed.content } : e);
                    }
                    return [...prev, { id: 'reasoning-main', type: 'reasoning', content: parsed.content }];
                  });
                }
                // Handle reasoning progress
                else if (parsed.type === 'reasoning_progress') {
                  markFirstDelta();
                  setThinkingEvents(prev => {
                    // Replace or add reasoning progress indicator
                    const filtered = prev.filter(e => e.type !== 'reasoning_progress');
                    return [...filtered, { id: `rp-${Date.now()}`, type: 'reasoning_progress', content: parsed.content }];
                  });
                }
                // Handle assumed subject event (structured)
                else if (parsed.type === 'assumed_subject') {
                  try {
                    const { name, industry, website } = parsed as any;
                    if (typeof name === 'string' && name.trim()) {
                      setLastAssumedSubject({ name, industry, website });
                    }
                  } catch {}
                }
                // Handle web search events - UPDATE existing search indicator
                else if (parsed.type === 'web_search') {
                  setThinkingEvents(prev => {
                    const same = prev.find(e => e.type === 'web_search' && e.query === parsed.query);
                    if (same) {
                      return prev.map(e => (e.type === 'web_search' && e.query === parsed.query)
                        ? { ...e, sources: parsed.sources }
                        : e
                      );
                    }
                    const id = `search-${Date.now()}`;
                    return [...prev, { id, type: 'web_search', query: parsed.query, sources: parsed.sources }];
                  });
                }
                // Handle content extraction events
                else if (parsed.type === 'content_extraction') {
                  setThinkingEvents(prev => [...prev, { id: `e-${Date.now()}`, type: 'content_extraction', url: parsed.url }]);
                }
                // Handle accounts added event
                else if (parsed.type === 'accounts_added') {
                  setThinkingEvents(prev => [...prev, { 
                    id: `a-${Date.now()}`, 
                    type: 'accounts_added', 
                    count: parsed.count,
                    companies: parsed.companies 
                  }]);
                  // Show success toast
                  addToast({
                    title: 'Accounts Added',
                    description: `Added ${parsed.count} ${parsed.count === 1 ? 'company' : 'companies'} to tracking`,
                    type: 'success',
                  });
                  // Trigger sidebar refresh by dispatching custom event
                  window.dispatchEvent(new CustomEvent('accounts-updated'));
                }
                else if (parsed.type === 'alias_clarification') {
                  const alias = typeof parsed.alias === 'string' ? parsed.alias.trim() : '';
                  if (!alias) continue;
                  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion : undefined;
                  const questionId = typeof parsed.question_id === 'string' ? parsed.question_id : undefined;
                  setAliasPrompts(prev => {
                    if (prev.some(item => item.alias.toLowerCase() === alias.toLowerCase())) return prev;
                    return [...prev, {
                      alias,
                      suggestion,
                      questionId,
                      stage: suggestion ? 'choice' : 'manual',
                      manualValue: suggestion || '',
                      submitting: false,
                    }];
                  });
                  addToast({
                    type: 'info',
                    title: `Clarify ${alias}?`,
                    description: suggestion
                      ? `Let me know if ${alias} should map to ${suggestion}.`
                      : `Tell me what ${alias} stands for so I can remember it.`,
                  });
                }
                else if (parsed.type === 'preference_saved') {
                  if (Array.isArray(parsed.preferences) && parsed.preferences.length) {
                    const labels = parsed.preferences
                      .map((pref: any) => (typeof pref?.label === 'string' && pref.label.trim())
                        ? pref.label.trim()
                        : typeof pref?.key === 'string'
                          ? pref.key.split('.').pop()?.replace(/_/g, ' ') ?? pref.key
                          : null)
                      .filter((label: string | null): label is string => Boolean(label));
                    if (labels.length) {
                      addToast({
                        type: 'success',
                        title: 'Preference saved',
                        description: `I’ll keep highlighting ${labels.join(', ')}.`,
                      });
                    }
                    void refreshResolvedPreferences();
                    invalidateUserProfileCache(user?.id);
                  }
                }
                else if (parsed.type === 'alias_learned') {
                  if (Array.isArray(parsed.aliases) && parsed.aliases.length) {
                    const summaries = parsed.aliases
                      .map((entry: any) => {
                        if (!entry?.alias || !entry?.canonical) return null;
                        return `${entry.alias} → ${entry.canonical}`;
                      })
                      .filter((item: string | null): item is string => Boolean(item));
                    if (summaries.length) {
                      addToast({
                        type: 'info',
                        title: summaries.length === 1 ? 'Alias remembered' : 'Aliases remembered',
                        description: summaries.join(', '),
                      });
                    }
                    invalidateUserProfileCache(user?.id);
                  }
                }
                // Handle output text deltas (supports both Edge Function and Vercel API formats)
                else if (parsed.type === 'response.output_text.delta' || parsed.type === 'content') {
                  // Edge Function uses parsed.delta, Vercel API uses parsed.content
                  const delta = parsed.delta || parsed.content;
                  if (delta) {
                    markFirstDelta();
                    mainContent += delta;
                    updateStreaming();
                  }
                } else if (parsed.type === 'tldr') {
                  if (typeof parsed.content === 'string') {
                    tldrBuffer += parsed.content;
                    updateStreaming();
                    setThinkingEvents(prev =>
                      prev.filter(e => !(e.type === 'reasoning_progress' && (e.content || '').toLowerCase().includes('summary')))
                    );
                  }
                } else if (parsed.type === 'tldr_status') {
                  setThinkingEvents(prev => [...prev.filter(e => e.type !== 'reasoning_progress'), {
                    id: `tldr-${Date.now()}`,
                    type: 'reasoning_progress',
                    content: parsed.content || 'Preparing high level summary…'
                  }]);
                } else if (parsed.type === 'tldr_error') {
                  addToast({
                    type: 'error',
                    title: 'High level summary unavailable',
                    description: parsed.message || 'Could not create summary.'
                  });
                } else if (parsed.type === 'tldr_done') {
                  setThinkingEvents(prev =>
                    prev.filter(e => !(e.type === 'reasoning_progress' && (e.content || '').toLowerCase().includes('summary')))
                  );
                } else if (parsed.type === 'response.completed' && parsed.response?.usage?.total_tokens) {
                  usedTokens = Number(parsed.response.usage.total_tokens) || usedTokens;
                } else if (parsed.type === 'response' && parsed.usage?.total_tokens) {
                  usedTokens = Number(parsed.usage.total_tokens) || usedTokens;
                }
              } catch {}
            }
          }
        }
      }
      if (usedTokens != null) {
        const credits = Math.ceil(usedTokens / 1000);
        setLastUsage({ tokens: usedTokens, credits });
        addToast({ type: 'info', title: `Turn used ${usedTokens.toLocaleString()} tokens (~${credits} credits)` });
        // Trigger credit display refresh
        window.dispatchEvent(new CustomEvent('credits-updated'));
      }
      // Update active subject from the user message or assistant output
      try {
        const m = userMessage.match(/\bresearch\s+([\w\s.&-]{2,})/i);
        if (m && m[1] && isLikelySubject(m[1])) {
          setActiveSubject(m[1].trim());
        } else if (lastAssistantMessage?.content || mainContent) {
          const text = (lastAssistantMessage?.content || mainContent || '').slice(0, 800);
          const patterns = [
            /researching\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /found about\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /analysis of\s+([A-Z][\w\s&.-]{2,}?)(?:[\s,:.-]|$)/i,
            /^#\s+([^\n]+)/m,
          ];
          for (const p of patterns) {
            const mm = text.match(p);
            if (mm && mm[1] && mm[1].trim().length >= 2 && isLikelySubject(mm[1])) { setActiveSubject(mm[1].trim()); break; }
          }
        }
      } catch {}
      try {
        const endedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        window.dispatchEvent(new CustomEvent('llm:complete', {
          detail: {
            page: 'research',
            totalMs: endedAt - startedAt,
            ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null,
            tokens: usedTokens,
          }
        }));
        console.log('[LLM][research] complete', { totalMs: endedAt - startedAt, ttfbMs: firstDeltaAt != null ? (firstDeltaAt - startedAt) : null, tokens: usedTokens });
      } catch {}
      return composeOutput();
    } catch (e: any) {
      // Swallow abort errors as user-initiated stops
      if (e?.name === 'AbortError') {
        console.log('[LLM] stream aborted by user');
        return (streamingMessage || '');
      }
      console.error('stream error', e);
      const errorMsg = e?.message || String(e);
      addToast({
        type: 'error',
        title: 'Research failed',
        description: `Error: ${errorMsg}`,
      });
      return `Sorry, I had trouble completing that request.\n\n**Error details:** ${errorMsg}`;
    }
  };

  const getUserInitial = () => (user?.email ? user.email[0].toUpperCase() : 'Y');

  const handleRetry = async () => {
    // Find the last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage || !currentChatId) return;

    // Remove the last assistant message
    if (lastAssistantIndex < 0) return;
    const filteredMessages = messages.filter((_, idx) => idx !== lastAssistantIndex);
    setMessages(filteredMessages);

    // Regenerate the response
    await handleSendMessageWithChat(currentChatId, lastUserMessage.content);
  };

  const handleModeSwitch = useCallback(async (mode: 'deep' | 'quick' | 'specific') => {
    if (streamingMessage || loading) return;
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage || !currentChatId) return;
    void persistPreference(mode);
    await handleSendMessageWithChat(currentChatId, lastUserMessage.content, mode, { force: true });
  }, [streamingMessage, loading, messages, currentChatId, handleSendMessageWithChat]);

  const ensureActiveChat = useCallback(async (): Promise<string | null> => {
    if (currentChatId) return currentChatId;
    return await createNewChat();
  }, [createNewChat, currentChatId]);

  // Next Actions helpers
  const handleStartNewCompany = useCallback(async () => {
    const newChatId = await createNewChat();
    if (!newChatId) return;
    setActiveSubject(null);
    setActionBarCompany(null);
    setInputValue('Research ');
    setFocusComposerTick(t => t + 1);
    lastResearchSummaryRef.current = '';
  }, [createNewChat]);

  const handleContinueCompany = useCallback(async () => {
    const subject = currentActionCompany;
    const chatId = await ensureActiveChat();
    if (!chatId) return;
    if (subject) {
      const refreshPrompt = `Refresh research on ${subject}. Focus purely on what changed since the last report.
Format exactly:
## What's New
- ...
## Opportunities
- ...
## Risks
- ...
Limit to 5 bullets total, cite sources inline, and end with one proactive next step.`;
      await handleSendMessageWithChat(chatId, refreshPrompt);
    } else {
      setInputValue('Research ');
      setFocusComposerTick(t => t + 1);
    }
  }, [currentActionCompany, ensureActiveChat, handleSendMessageWithChat]);

  const handleEmailDraftFromLast = useCallback(async (
    markdownOverride?: string,
    companyOverride?: string | null,
    overrides?: {
      recipientName?: string;
      recipientTitle?: string;
      useGeneric?: boolean;
      senderName?: string;
      senderTitle?: string;
      rememberSender?: boolean;
    }
  ): Promise<boolean> => {
    if (draftEmailPending) return false;
    let success = false;
    try {
      const researchMarkdown = markdownOverride ?? lastAssistantMessage?.content;
      if (!researchMarkdown) {
        addToast({ type: 'error', title: 'No content to draft', description: 'Run research before drafting an email.' });
        return false;
      }

      const trimmedSenderName = overrides?.senderName?.trim();
      const trimmedSenderTitle = overrides?.senderTitle?.trim();
      if (overrides?.rememberSender && (trimmedSenderName || trimmedSenderTitle)) {
        try {
          const metadata = {
            ...(userProfile?.metadata || {}),
            ...(trimmedSenderName ? { sender_name: trimmedSenderName } : {}),
            ...(trimmedSenderTitle ? { sender_title: trimmedSenderTitle } : {}),
          };
          const payload: any = { profile: { metadata } };
          if (trimmedSenderTitle) payload.profile.user_role = trimmedSenderTitle;
          const { data: { session } } = await supabase.auth.getSession();
          await fetch('/api/update-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify(payload)
          });
          invalidateUserProfileCache(user?.id);
        } catch (err) {
          console.warn('Failed to persist sender defaults', err);
        }
      }

      setDraftEmailPending(true);
      addToast({ type: 'info', title: 'Drafting email', description: 'Generating tailored outreach copy…' });
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token;
      const recipientName = overrides?.recipientName?.trim();
      const recipientTitle = overrides?.recipientTitle?.trim();
      const senderOverride = (trimmedSenderName || trimmedSenderTitle)
        ? {
            name: trimmedSenderName || undefined,
            title: trimmedSenderTitle || undefined,
            company: userProfile?.company_name || undefined,
          }
        : undefined;

      const resp = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: JSON.stringify({
          research_markdown: researchMarkdown,
          company: companyOverride || activeSubject || undefined,
          role: recipientTitle || undefined,
          recipient_name: recipientName || undefined,
          generic: Boolean(overrides?.useGeneric),
          sender_override: senderOverride,
        })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Draft failed');
      const email = typeof json?.email === 'string' ? json.email : '';
      if (email) {
        const formattedEmail = [
          '## Draft Email',
          '',
          '```text',
          email,
          '```',
        ].join('\n');

        if (navigator?.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(email);
            addToast({ type: 'success', title: 'Draft email copied' });
          } catch {
            addToast({ type: 'info', title: 'Clipboard unavailable', description: 'Showing the draft below.' });
          }
        } else {
          addToast({ type: 'success', title: 'Draft email ready', description: 'Showing the draft below.' });
        }

        let savedAssistant: Message | null = null;
        if (currentChatId) {
          try {
            const { data } = await supabase
              .from('messages')
              .insert({ chat_id: currentChatId, role: 'assistant', content: formattedEmail })
              .select()
              .single();
            if (data) {
              savedAssistant = data;
            }
          } catch (insertErr) {
            console.error('Failed to persist draft email message', insertErr);
          }
        }

        if (!savedAssistant) {
          savedAssistant = {
            id: `draft-email-${Date.now()}`,
            role: 'assistant',
            content: formattedEmail,
            created_at: new Date().toISOString(),
          } as Message;
        }

        setMessages(prev => [...prev, savedAssistant!]);

        try {
          const { data: userData } = await supabase.auth.getUser();
          const fullName = (userData?.user?.user_metadata?.full_name || userData?.user?.user_metadata?.name || '').trim();
          const role = userProfile?.user_role || '';
          if (!fullName || !role) {
            addToast({
              type: 'info',
              title: 'Save your sender details?',
              description: 'Add your name and title so future drafts auto-fill your signature.',
              actionText: 'Update',
              onAction: () => navigate('/profile-coach')
            });
          }
          try {
            const parsedSig = (() => {
              try {
                const lines = (email || '').split(/\r?\n/);
                const idx = lines.findIndex((line: string) => /^(best|regards|thanks|thank you|sincerely)[,]?$/i.test(line.trim()));
                if (idx >= 0) {
                  const block = lines.slice(idx).join('\n').trim();
                  return block.split('\n').slice(0, 6).join('\n');
                }
              } catch {}
              return '';
            })();
            setSigDefaults({
              name: fullName,
              title: role || 'Account Executive',
              company: userProfile?.company_name || '',
              signature: parsedSig
            });
            addToast({
              type: 'info',
              title: 'Use this signature by default?',
              description: 'Save your signature so future drafts match your style.',
              actionText: 'Save',
              onAction: () => setSigOpen(true)
            });
          } catch {}
        } catch {}
        success = true;
      } else {
        addToast({ type: 'error', title: 'No email generated', description: 'The drafting service returned an empty response.' });
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to draft email', description: e?.message || String(e) });
    } finally {
      setDraftEmailPending(false);
    }
    return success;
  }, [draftEmailPending, lastAssistantMessage, addToast, supabase, activeSubject, currentChatId, setMessages, userProfile, navigate, user?.id]);


  const handleNextAction = async (rawAction: string) => {
    if (!currentChatId) return;
    // Sanitize noisy invitations like "Want that slide? (Yes/No?)"
    let action = String(rawAction || '')
      .replace(/\bwant that slide\?\s*\(yes\/?no\?\)?/i, '')
      .replace(/\(\s*yes\s*\/?\s*no\s*\??\s*\)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[.?!]+\s*$/, '');
    const subjectHint = activeSubject ? ` for ${activeSubject}` : '';
    const prompt = `Help me with this next step: ${action}${subjectHint ? subjectHint : ''}`.trim();
    await handleSendMessageWithChat(currentChatId, prompt, 'specific');
  };

  type EnhancedAction = ResearchAction | 'verify_emails';
  const handleActionBarAction = useCallback(async (action: EnhancedAction) => {
    switch (action) {
      case 'new':
        addToast({ type: 'info', title: 'Starting new research', description: 'Opening a fresh thread…' });
        await handleStartNewCompany();
        return;
      case 'continue':
        if (currentActionCompany) {
          addToast({ type: 'info', title: `Refreshing ${currentActionCompany}`, description: 'Focusing on what changed…' });
        } else {
          addToast({ type: 'info', title: 'Refresh research', description: 'Send a company name to continue.' });
        }
        await handleContinueCompany();
        return;
      case 'follow_up': {
        addToast({ type: 'info', title: 'Ask a follow-up', description: 'Type your question and I’ll keep context from this report.' });
        setInputValue(currentActionCompany ? `What follow-up questions should I ask ${currentActionCompany}? ` : 'What follow-up question should I ask? ');
        setFocusComposerTick(t => t + 1);
        return;
      }
      case 'email': {
        if (!currentActionCompany) {
          addToast({ type: 'info', title: 'Draft email', description: 'Run research first so I can tailor outreach.' });
          return;
        }
        const latest = findLatestResearchAssistant();
        if (!latest) {
          addToast({ type: 'error', title: 'No research to reference', description: 'Run company research before drafting outreach.' });
          return;
        }
        const contacts = extractDecisionMakerContacts(
          latest.message.content || '',
          undefined,
          Array.isArray(userProfile?.target_titles) ? userProfile.target_titles : undefined
        );
        setEmailCandidates(contacts.map(contact => ({ name: contact.name, title: contact.title })));
        setEmailDialogLoading(false);
        setEmailDialogOpen(true);
        return;
      }
      case 'refine':
        addToast({ type: 'info', title: 'Refine scope', description: 'Adjust focus areas for the next run.' });
        setShowRefine(true);
        return;
      case 'verify_emails': {
        // Extract domain + contact names from latest assistant message
        const latest = findLatestResearchAssistant();
        const text = latest?.message.content || '';
        const domain = (() => {
          const m = text.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
          return m && m[1] ? m[1].toLowerCase() : null;
        })();
        const names = (() => {
          try {
            const lines = text.split(/\n+/);
            const arr: Array<{ name: string; title?: string }> = [];
            for (const ln of lines) {
              const t = ln.replace(/^[-*•]\s*/, '');
              const mm = t.match(/([A-Z][A-Za-z.'\-]+\s+[A-Z][A-Za-z.'\-]+)\s+\—\s+(.+)$/);
              if (mm) arr.push({ name: mm[1], title: mm[2] });
            }
            return arr.slice(0, 6);
          } catch { return []; }
        })();
        if (!domain) {
          addToast({ type: 'info', title: 'No website found', description: 'Include the domain in your prompt (e.g., “Research HubSpot (hubspot.com)”).' });
          return;
        }
        if (names.length === 0) {
          addToast({ type: 'info', title: 'No contacts found', description: 'Run Deep/Standard research to include leadership contacts.' });
          return;
        }
        setVerifyingEmails(true);
        try {
          const resp = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, names, limit: 6 }) });
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            addToast({ type: 'error', title: 'Verification failed', description: txt || resp.statusText });
            return;
          }
          const data = await resp.json();
          const count = Array.isArray(data?.contacts) ? data.contacts.filter((c: any) => c?.email).length : 0;
          addToast({ type: count > 0 ? 'success' : 'info', title: count > 0 ? `Found ${count} verified email${count === 1 ? '' : 's'}` : 'No verified emails found' });
        } catch (e: any) {
          addToast({ type: 'error', title: 'Verification error', description: e?.message || 'Please try again.' });
        } finally {
          setVerifyingEmails(false);
        }
        return;
      }
      default:
        return;
    }
  }, [handleStartNewCompany, handleContinueCompany, currentActionCompany, addToast, findLatestResearchAssistant, userProfile?.target_titles]);

  const DRAFT_EMAIL_ENABLED = !import.meta.env.PROD;
  const shortcutHandlers = useMemo<Record<string, () => void>>(() => {
    const handlers: Record<string, () => void> = {};
    if (!actionBarVisible || streamingMessage) {
      return handlers;
    }
    handlers.n = () => { void handleActionBarAction('new'); };
    handlers.f = () => { void handleActionBarAction('follow_up'); };
    handlers.c = () => { void handleActionBarAction('continue'); };
    if (DRAFT_EMAIL_ENABLED && canDraftEmail) handlers.e = () => { void handleActionBarAction('email'); };
    handlers.r = () => { void handleActionBarAction('refine'); };
    return handlers;
  }, [actionBarVisible, streamingMessage, handleActionBarAction, canDraftEmail]);

  useKeyboardShortcuts(shortcutHandlers);

  const handleEmailDialogSubmit = useCallback(async (options: {
    recipientName?: string;
    recipientTitle?: string;
    useGeneric?: boolean;
    senderName?: string;
    senderTitle?: string;
    rememberSender?: boolean;
  }) => {
    setEmailDialogLoading(true);
    try {
      const ok = await handleEmailDraftFromLast(undefined, currentActionCompany, options);
      if (ok) {
        setEmailDialogOpen(false);
      }
    } finally {
      setEmailDialogLoading(false);
    }
  }, [handleEmailDraftFromLast, currentActionCompany]);

  const canUndoSubject = () => {
    const at = lastSubjectRef.current.at; if (!at) return false; return (Date.now() - at) < 10000;
  };
  const handleSwitchSubject = async () => {
    const next = (switchInput || '').trim();
    if (!next) { setCrumbOpen(false); return; }
    if (saveOpen || saving) {
      const ok = window.confirm('You have unsaved changes. Switch subject anyway?');
      if (!ok) return;
    }
    lastSubjectRef.current = { prev: activeSubject, at: Date.now() };
    setActiveSubject(next);
    setCrumbOpen(false);
    setSwitchInput('');
    addToast({ type: 'info', title: `Context switched to ${next}`, description: 'Undo available for 10 seconds.' });
  };
  const handleUndoSubject = () => {
    if (!canUndoSubject()) return;
    const prev = lastSubjectRef.current.prev;
    setActiveSubject(prev);
    lastSubjectRef.current = { prev: null, at: null };
    addToast({ type: 'success', title: 'Context restored' });
  };

  // New: Stop streaming handler
  const handleStopStreaming = () => {
    try { streamingAbortRef.current?.abort(); } catch {}
    setThinkingEvents([]);
  };

  const handleAccountClick = (account: TrackedAccount) => {
    // Open a detailed signals drawer for the account
    setSignalsAccountId(account.id);
    setSignalsCompanyName(account.company_name);
    setSignalsDrawerOpen(true);
  };

  const handleResearchAccount = useCallback(async (account: TrackedAccount) => {
    const prompt = `Research ${account.company_name}`;
    try {
      const chatId = await ensureActiveChat();
      if (!chatId) return;
      setActiveSubject(account.company_name);
      addToast({ type: 'info', title: `Researching ${account.company_name}`, description: 'Kicking off a fresh brief using your saved profile.' });
      await handleSendMessageWithChat(chatId, prompt, 'deep', { force: true });
    } catch (error) {
      console.error('Failed to re-run research from tracked account', error);
      addToast({ type: 'error', title: 'Could not open research', description: 'Try again or run the command manually.' });
    }
  }, [ensureActiveChat, handleSendMessageWithChat, addToast]);

  const handleAddAccount = () => {
    // Open CSV upload dialog
    setCSVUploadOpen(true);
  };

  const handleCSVUploadSuccess = (addedCount: number) => {
    addToast({
      type: 'success',
      title: 'Accounts Added',
      description: `Successfully added ${addedCount} account${addedCount !== 1 ? 's' : ''} to tracking`
    });
    // Optionally refresh the account list widget
  };

  // Look for JSON code blocks with action: save_profile and persist via server
  const processSaveCommands = async (responseText: string) => {
    const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
    const matches = Array.from(responseText.matchAll(jsonBlockRegex));
    for (const match of matches) {
      try {
        const content = match[1].trim();
        const data = JSON.parse(content);
        if (data.action === 'save_profile') {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) continue;
          
          const updateProfileUrl = '/api/update-profile';
          
          const res = await fetch(updateProfileUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              profile: data.profile,
              custom_criteria: data.custom_criteria,
              signal_preferences: data.signal_preferences,
              disqualifying_criteria: data.disqualifying_criteria,
            }),
          });
          if (!res.ok) {
            addToast({ type: 'error', title: 'Profile save failed', description: 'Could not apply your preferences. Try again from Settings.' });
          } else {
            addToast({ type: 'success', title: 'Profile updated', description: 'Your preferences were saved.' });
          }
        }
      } catch {
        addToast({ type: 'error', title: 'Profile save failed', description: 'Invalid save instruction. Please try again.' });
      }
    }
  };

  const handleGoHome = () => {
    setCurrentChatId(null);
    setMessages([]);
    setStreamingMessage('');
    setThinkingEvents([]);
    assistantInsertedRef.current = false;
    navigate('/');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };

  return (
    <>
      <SaveSignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        defaultName={sigDefaults.name}
        defaultTitle={sigDefaults.title}
        defaultCompany={sigDefaults.company}
        defaultSignature={sigDefaults.signature}
      />
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onNewChat={handleNewChatClick}
        creatingNewChat={creatingNewChat}
        userName={getUserInitial()}
        chats={chats}
        currentChatId={currentChatId}
        onChatSelect={setCurrentChatId}
        onSettings={() => navigate('/settings')}
        onCompanyProfile={() => navigate('/profile-coach')}
        onResearchHistory={() => navigate('/research')}
        onAccountClick={handleAccountClick}
        onAddAccount={handleAddAccount}
        onResearchAccount={handleResearchAccount}
        onHome={handleGoHome}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => void handleNewChatClick()}
                disabled={creatingNewChat}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-60"
              >
                {creatingNewChat ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Creating...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">New session</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setBulkResearchOpen(true)}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Upload CSV to research multiple companies"
                aria-label="Upload CSV to research multiple companies"
              >
                Bulk Research
              </button>
            </div>
            <div className="flex items-center gap-3">
              {bulkProgress?.running && (
                <button
                  onClick={() => { try { bulkStatusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }}
                  className="hidden md:flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                  title="Bulk research in progress"
                >
                  <span className="inline-flex w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span>Bulk Research {bulkProgress.label}</span>
                </button>
              )}
              <div className="relative">
              <button
                onClick={() => setAgentMenuOpen(prev => !prev)}
                className="flex items-center gap-2 text-sm text-gray-700 px-3 py-1.5 bg-gray-50 rounded-lg hover:bg-gray-100"
                aria-haspopup="menu"
                aria-expanded={agentMenuOpen}
              >
                <span className="font-medium">Company Researcher</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {agentMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20" role="menu">
                  <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" role="menuitem" onClick={() => setAgentMenuOpen(false)}>
                    Company Researcher
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" role="menuitem" onClick={() => { setAgentMenuOpen(false); navigate('/profile-coach'); }}>
                    Profile Coach
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="chat-surface">
          <div className={`max-w-3xl mx-auto px-6 py-8 ${chatPaddingClass}`}>
            <div className="space-y-6">
              {/* Profile completeness banner */}
              <ProfileCompletenessBanner />
              
              {/* Proactive dashboard hero (always visible at top) */}
              <div className="space-y-6" data-testid="dashboard-greeting">
                  <div className="py-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {greeting ? `👋 Good ${greeting.time_of_day}, ${greeting.user_name}!` : '👋 Welcome back!'}
                    </h2>
                  </div>
                  {greetingOpeningLine && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 shadow-sm">
                      <div className="flex items-start gap-2 text-sm text-blue-900 leading-relaxed">
                        <span className="text-lg">💬</span>
                        <span>{greetingOpeningLine}</span>
                      </div>
                    </div>
                  )}
                  {greetingSpotlights.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {greetingSpotlights.slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.label}-${idx}`}
                          onClick={() => startSuggestion(item.prompt)}
                          className={`text-left rounded-xl border px-4 py-3 transition-all hover:shadow-md ${
                            item.tone === 'critical'
                              ? 'border-red-200 bg-red-50/70 hover:border-red-300'
                              : 'border-blue-100 bg-blue-50/60 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xl">{item.icon}</span>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                              <p className="text-xs text-gray-700 mt-1 leading-relaxed">{item.detail}</p>
                              <p className="text-xs text-blue-700 mt-2 font-medium">Tap to act →</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {userProfile && (
                    <div className="border border-blue-200 rounded-2xl p-4 bg-white shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="text-sm font-semibold text-blue-900 mb-1">Using your saved profile</div>
                          <p className="text-xs text-gray-600">
                            ICP focus: <span className="font-medium text-gray-900">{userProfile.icp_definition || userProfile.icp || 'Not specified yet'}</span>
                          </p>
                          {(customCriteria.length > 0 || signalPreferences.length > 0) && (
                            <p className="text-xs text-gray-600 mt-2">
                              I’ll emphasise your <span className="font-medium text-gray-800">critical criteria</span> and flag <span className="font-medium text-gray-800">priority signals</span> every time you run research.
                            </p>
                          )}
                        </div>
                        {customCriteria.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {customCriteria
                              .filter((c: any) => (c?.importance || '').toLowerCase() === 'critical')
                              .map((c: any) => (
                                <span key={c.id} className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                                  🔥 {c.name}
                                </span>
                              ))}
                            {customCriteria
                              .filter((c: any) => (c?.importance || '').toLowerCase() === 'important')
                              .map((c: any) => (
                                <span key={c.id} className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-full">
                                  ⭐ {c.name}
                                </span>
                              ))}
                          </div>
                        )}
                        {dashboardActions.length > 0 && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {dashboardActions.map((action) => (
                              <button
                                key={action.id}
                                onClick={() => {
                                  switch (action.kind) {
                                    case 'seed':
                                      setInputValue(action.value || '');
                                      setFocusComposerTick(t => t + 1);
                                      break;
                                    case 'bulk':
                                      setBulkResearchOpen(true);
                                      break;
                                    case 'prompt':
                                      if (action.value) startSuggestion(action.value);
                                      break;
                                    case 'track':
                                      handleAddAccount();
                                      break;
                                    case 'navigate':
                                      if (action.value) navigate(action.value);
                                      break;
                                    default:
                                      break;
                                  }
                                }}
                                className="w-full text-left border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all rounded-xl p-3 bg-blue-50/60"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-xl">{action.icon}</span>
                                  <div className="flex-1">
                                    <div className="text-sm font-semibold text-gray-900 mb-1">{action.title}</div>
                                    <p className="text-xs text-gray-600">{action.description}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {recentSignals.length > 0 && (
                    <div className="border border-gray-200 rounded-2xl p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-900">Top signals</div>
                        <button
                          className="text-xs text-blue-600 hover:text-blue-700"
                          onClick={() => navigate('/signals')}
                        >
                          View all
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {recentSignals.map(s => (
                          <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-semibold text-gray-900 truncate">{s.company_name}</div>
                            <div className="text-xs text-gray-600 truncate">{s.signal_type.replace(/_/g, ' ')} • {new Date(s.signal_date).toLocaleDateString()}</div>
                            <div className="text-sm text-gray-900 mt-1 line-clamp-2">{s.description}</div>
                            {s.impact && (
                              <div className="text-xs text-gray-600 mt-2 leading-relaxed">
                                <span className="font-semibold text-gray-800">Why it matters: </span>{s.impact}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <button className="text-xs text-blue-600 hover:text-blue-700" onClick={() => { setSignalsAccountId(s.account_id); setSignalsCompanyName(s.company_name); setSignalsDrawerOpen(true); }}>Review</button>
                              <button
                                className="text-xs text-gray-700 hover:text-gray-900"
                                onClick={() => { setInputValue(`Research ${s.company_name}`); setTimeout(() => void handleSendMessage(), 50); }}
                              >
                                Research
                              </button>
                              {s.recommended_action && (
                                <button
                                  className="text-xs text-blue-700 hover:text-blue-900"
                                  onClick={() => startSuggestion(s.recommended_action!)}
                                >
                                  Do it for me
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setInputValue('Research ');
                        setFocusComposerTick(t => t + 1);
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Research a company"
                    >
                      Research a company
                    </button>
                    <button
                      onClick={() => setBulkResearchOpen(true)}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Upload a list"
                    >
                      Upload a list
                    </button>
                    <button
                      onClick={() => startSuggestion('Find security and IT decision makers at my tracked accounts')}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Find contacts"
                    >
                      Find contacts
                    </button>
                    <button
                      onClick={() => {
                        const icp = userProfile?.icp_definition || userProfile?.icp || 'my ideal customer profile';
                        startSuggestion(`Find companies that match this ICP: ${icp}`);
                      }}
                      className="px-3 py-1.5 text-xs bg-gray-100 rounded-full hover:bg-gray-200 text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label="Suggestion: Find ICP matches"
                    >
                      Find ICP matches
                    </button>
                  </div>
              </div>
              
              {/* Bulk Research Status */}
              <div ref={bulkStatusRef} />
              <BulkResearchStatus />
              
          {resolvedPrefs && !resolvedLoading && preferenceBadges.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Using your saved preferences
              </span>
              {preferenceBadges.map((badge) => (
                <span key={badge} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                  {badge}
                </span>
              ))}
            </div>
          )}
          {resolvedLoading && (
            <div className="mb-4 text-xs text-gray-400">Loading your saved preferences…</div>
          )}
          {aliasPrompts.length > 0 && (
            <div className="mb-4 space-y-3" role="region" aria-label="Alias confirmations">
              {aliasPrompts.map(prompt => {
                const hasSuggestion = Boolean(prompt.suggestion);
                return (
                  <div
                    key={prompt.alias}
                    className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm text-amber-900">
                      I noticed you mentioned <span className="font-semibold">{prompt.alias}</span>.{' '}
                      {hasSuggestion
                        ? <>Does that refer to <span className="font-semibold">{prompt.suggestion}</span>?</>
                        : 'Tell me what it stands for so I can remember it.'}
                    </p>
                    {prompt.stage === 'choice' ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {hasSuggestion && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                            onClick={() => void confirmAliasPrompt(prompt.alias, prompt.suggestion || '', prompt.questionId)}
                            disabled={prompt.submitting}
                          >
                            Yes, keep {prompt.suggestion}
                          </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 border border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                          onClick={() => promptManualAlias(prompt.alias)}
                          disabled={prompt.submitting}
                        >
                          {hasSuggestion ? 'No, use something else' : 'Define it'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-transparent px-3 py-1.5 text-xs font-medium text-amber-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                          onClick={() => void skipAliasPrompt(prompt.alias, prompt.questionId)}
                          disabled={prompt.submitting}
                        >
                          Skip for now
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <label className="block text-xs font-semibold text-amber-800">
                          What should “{prompt.alias}” map to?
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={prompt.manualValue}
                            onChange={(e) => setAliasManualValue(prompt.alias, e.target.value)}
                            className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                            placeholder="e.g., Microsoft 365"
                            autoFocus
                            disabled={prompt.submitting}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60"
                              onClick={() => void confirmAliasPrompt(prompt.alias, prompt.manualValue, prompt.questionId)}
                              disabled={prompt.submitting || !prompt.manualValue.trim()}
                            >
                              Save alias
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                              onClick={() => void skipAliasPrompt(prompt.alias, prompt.questionId)}
                              disabled={prompt.submitting}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {messages.map((m, idx) => {
            const isLastAssistant = m.role === 'assistant' && idx === messages.length - 1 && !streamingMessage;
            const summarizeReady = (() => {
              const rid = getLatestResearchMessageId();
              return !!(rid && summaryCache[rid]);
                })();
                const thisIsDraft = /^##\s*Draft Email\b/i.test((m.content || '').trim());
                // Fallback: derive assumed label if server didn't emit it but the query was a bare name
                const assumedForUi = (() => {
                  if (lastAssumedSubject) return lastAssumedSubject;
                  const lastUser = [...messages].slice(0, idx + 1).reverse().find(mm => mm.role === 'user');
                  const q = lastUser?.content || '';
                  if (isBareNameQuery(q)) {
                    const name = extractCompanyNameFromQuery(q) || q.trim();
                    if (name) {
                      const inferred = inferIndustryFromMarkdown(m.content);
                      return { name, industry: inferred } as { name: string; industry?: string };
                    }
                  }
                  return undefined;
                })();

                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    userName={getUserInitial()}
                    showActions={isLastAssistant}
                    mode={isLastAssistant ? (lastRunMode || null) : null}
                    onModeChange={isLastAssistant ? handleModeSwitch : undefined}
                    collapseEnabled={isLastAssistant && lastRunMode === 'quick'}
                    collapseThresholdWords={150}
                    onTrackAccount={handleTrackAccount}
                    agentType="company_research"
                    summarizeReady={PREFS_SUMMARY_ENABLED && isLastAssistant && !thisIsDraft ? summarizeReady : false}
                    isSummarizing={PREFS_SUMMARY_ENABLED && isLastAssistant && !thisIsDraft ? summaryPending : false}
                    assumed={isLastAssistant ? (assumedForUi as any) : undefined}
                    onAssumedChange={isLastAssistant ? handleAssumedChangeRequest : undefined}
                    contextSummary={isLastAssistant ? appliedContext : null}
                    recentlySaved={isLastAssistant && recentlySavedMessageId ? recentlySavedMessageId === m.id : false}
                    onPromote={isLastAssistant && !thisIsDraft ? () => {
                      // Build draft using the latest research message (skip any later email drafts)
                      const research = (() => {
                        for (let j = messages.length - 1; j >= 0; j--) {
                          const mm = messages[j];
                          if (mm?.role !== 'assistant') continue;
                          const text = (mm.content || '').trim();
                          if (/^##\s*Draft Email\b/i.test(text)) continue;
                          const userMsg = [...messages].slice(0, j).reverse().find(msg => msg.role === 'user')?.content;
                          const sources = thinkingEvents
                            .filter(ev => ev.type === 'web_search' && ev.query && ev.sources)
                            .map(ev => ({ query: ev.query, sources: ev.sources })) as any[];
                          const draft = buildResearchDraft({
                            assistantMessage: mm.content,
                            userMessage: userMsg,
                            chatTitle: chats.find(c => c.id === currentChatId)?.title,
                            agentType: 'company_research',
                            sources,
                            activeSubject,
                            userProfile,
                          });
                          return draft;
                        }
                        return null;
                      })();

                      const normalizedDraft = (() => {
                        if (!research) return null;
                        const active = activeSubject?.trim();
                        if (!active) return research;
                        const current = (research.subject || '').trim();
                        if (current && current.toLowerCase() === active.toLowerCase()) {
                          return research;
                        }
                        return { ...research, subject: active };
                      })();

                      if (normalizedDraft) {
                        // Default to one-click save: persist immediately without modal
                        void handleSaveResearch(normalizedDraft);
                      } else {
                        addToast({ type: 'error', title: 'Nothing to save', description: 'No recent research found to save.' });
                      }
                    } : undefined}
                    onSummarize={PREFS_SUMMARY_ENABLED && isLastAssistant && !thisIsDraft ? async () => {
                      setPostSummarizeNudge(false);
                      try {
                        let targetMsg: Message | null = null;
                        for (let j = messages.length - 1; j >= 0; j--) {
                          const mm = messages[j];
                          if (mm?.role !== 'assistant') continue;
                          const text = (mm.content || '').trim();
                          if (/^##\s*Draft Email\b/i.test(text)) continue;
                          targetMsg = mm;
                          break;
                        }
                        const targetId = targetMsg?.id || m.id;
                        const cached = summaryCache[targetId];
                        if (cached) {
                          setActiveSummary({ data: cached, messageId: targetId });
                          setPostSummarizeNudge(true);
                          return;
                        }
                        setSummaryPending(true);
                        const summary = await fetchSummaryFromSource(targetMsg?.content || m.content);
                        setSummaryCache(prev => ({ ...prev, [targetId]: summary }));
                        setActiveSummary({ data: summary, messageId: targetId });
                        void sendPreferenceSignal('length', { kind: 'categorical', choice: 'brief' }, { weight: 1.5 });
                        setPostSummarizeNudge(true);
                      } catch (error: any) {
                        addToast({ type: 'error', title: 'Summarize failed', description: error?.message || 'Please try again.' });
                      } finally {
                        setSummaryPending(false);
                      }
                    } : undefined}
                    onNextAction={isLastAssistant ? handleNextAction : undefined}
                    disablePromote={saving}
                    onRetry={isLastAssistant ? handleRetry : undefined}
                    usage={isLastAssistant ? lastUsage || undefined : undefined}
                  />
                );
              })}

              {thinkingEvents.length > 0 && (() => {
                const latestPlan = [...thinkingEvents].reverse().find(ev => ev.type === 'reasoning_progress');
                const latestReasoning = [...thinkingEvents].reverse().find(ev => ev.type === 'reasoning');
                const reasoningLine = (() => {
                  if (!latestReasoning || typeof latestReasoning.content !== 'string') return '';
                  const lines = latestReasoning.content.split(/\n+/).map(line => line.trim()).filter(Boolean);
                  return lines.length ? lines[lines.length - 1] : latestReasoning.content.trim();
                })();

                const renderReasoningSummary = () => {
                  if (!reasoningLine) return null;
                  if (!showInlineReasoning) {
                    return (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
                        <div className="text-blue-900">Thinking hidden</div>
                        <div className="flex items-center gap-3">
                          <button className="text-blue-700 hover:text-blue-900" onClick={() => persistInlineReasoning(true)}>Show thinking</button>
                          <button className="text-blue-700 hover:text-blue-900" onClick={() => setReasoningOpen(true)}>View all</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
                      <div className="text-blue-900 truncate pr-2">
                        <span className="font-semibold">Thinking:</span> {reasoningLine}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => persistInlineReasoning(false)}
                          className="text-blue-700 hover:text-blue-900"
                          aria-label="Hide reasoning"
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasoningOpen(true)}
                          className="text-blue-700 hover:text-blue-900"
                          aria-label="View full reasoning stream"
                        >
                          View all
                        </button>
                      </div>
                    </div>
                  );
                };

                if (!latestPlan && !reasoningLine) return null;

                return (
                  <div className="space-y-2">
                    {latestPlan && (
                      <ThinkingIndicator
                        key={latestPlan.id}
                        type="reasoning_progress"
                        content={latestPlan.content}
                      />
                    )}
                    {renderReasoningSummary()}
                  </div>
                );
              })()}

              {PREFS_SUMMARY_ENABLED && activeSummary && (
                <div className="mt-4">
                  <SummaryCard
                    summary={activeSummary.data}
                    onClose={() => setActiveSummary(null)}
                  />
                </div>
              )}

              {/* Show a timer indicator in the chat while drafting an email */}
              {draftEmailPending && (
                <ThinkingIndicator
                  type="reasoning_progress"
                  content={
                    'Drafting personalized outreach…\nI\'ll paste the email here once it\'s ready.'
                  }
                />
              )}

              {streamingMessage && (
                  <MessageBubble
                    role="assistant"
                    content={streamingMessage}
                    userName={getUserInitial()}
                    showActions={false}
                    streaming
                    mode={lastRunMode || null}
                    onModeChange={handleModeSwitch}
                    assumed={(lastAssumedSubject ? {
                      ...lastAssumedSubject,
                      industry: lastAssumedSubject.industry || inferIndustryFromMarkdown(streamingMessage)
                    } : (inferIndustryFromMarkdown(streamingMessage) ? { name: activeSubject || 'This company', industry: inferIndustryFromMarkdown(streamingMessage) } as any : undefined))}
                    onAssumedChange={handleAssumedChangeRequest}
                    agentType="company_research"
                    contextSummary={appliedContext}
                  />
              )}

              {/* Next Actions bar after a completed assistant turn */}
              {actionBarVisible && !streamingMessage && lastAssistantMessage && (
                <section className="mt-6 mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Next actions</h3>
                    <div className="hidden sm:block text-xs text-gray-500">
                      Shortcuts:&nbsp;
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">N</kbd> new •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">F</kbd>{' '}
                      follow-up •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">C</kbd>{' '}
                      refresh{DRAFT_EMAIL_ENABLED ? (
                        <>
                          {' '}•{' '}
                          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">E</kbd>{' '}
                          email
                        </>
                      ) : null} •{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">R</kbd> refine
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-600 uppercase">Research depth</span>
                    {(['quick', 'deep', 'specific'] as const).map(option => (
                      <button
                        key={`mode-toggle-${option}`}
                        type="button"
                        disabled={!!streamingMessage}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${lastRunMode === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'} ${streamingMessage ? 'opacity-60 cursor-not-allowed' : ''}`}
                        onClick={() => { void handleModeSwitch(option); }}
                      >
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      onClick={() => { void handleActionBarAction('new'); }}
                    >
                      ➕ New research
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      onClick={() => { void handleActionBarAction('follow_up'); }}
                    >
                      🧠 Follow-up question
                    </button>
                    <button
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                        canRefreshResearch
                          ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400'
                          : 'bg-gray-300 text-gray-600 cursor-not-allowed focus:ring-gray-300'
                      }`}
                      onClick={() => { void handleActionBarAction('continue'); }}
                      disabled={!canRefreshResearch}
                      title="Refresh this report with a short 'what changed' update and one next step."
                    >
                      ↺ {refreshLabel}
                    </button>
                    {DRAFT_EMAIL_ENABLED && (!lastIsDraftEmail) && (
                      <button
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                          draftEmailPending
                            ? 'bg-rose-500 text-white focus:ring-rose-400 cursor-wait'
                            : canDraftEmail
                              ? 'bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-400'
                              : 'bg-gray-300 text-gray-600 cursor-not-allowed focus:ring-gray-300'
                        }`}
                        onClick={() => { void handleActionBarAction('email'); }}
                        disabled={!canDraftEmail || draftEmailPending}
                        aria-busy={draftEmailPending}
                      >
                        {draftEmailPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            ✉️ Draft email
                          </>
                        )}
                      </button>
                    )}
                    {(!lastIsDraftEmail) && (
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        onClick={() => { void handleActionBarAction('refine'); }}
                        title="Adjust focus areas (leadership, funding, tech stack, news, competitors, hiring) and timeframe, then re-run."
                      >
                        🎯 Refine focus
                      </button>
                    )}
                    {(!lastIsDraftEmail) && (
                      <button
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 transition-colors ${verifyingEmails ? 'bg-gray-300 text-gray-600 cursor-wait focus:ring-gray-300' : 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-400'}`}
                        onClick={() => { if (!verifyingEmails) void handleActionBarAction('verify_emails'); }}
                        disabled={verifyingEmails}
                        title="Verify and surface decision-maker emails"
                      >
                        {verifyingEmails ? 'Verifying…' : '🔒 Get verified emails'}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-gray-500 sm:hidden">
                    Shortcuts: N new • F follow-up • C refresh{DRAFT_EMAIL_ENABLED ? ' • E email' : ''} • R refine
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={clarifiersLocked}
                      onChange={(e) => setClarifiersLocked(e.target.checked)}
                    />
                    <span title="Prevents the agent from asking profile/setup follow-up questions in this chat.">
                      Skip preference follow-ups this chat
                    </span>
                  </label>
                </section>
              )}

              {/* Post-summarize nudge: offer to persist summary or brevity preference */}
              {postSummarizeNudge && (
                <div className="mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-xs text-blue-900">
                    Prefer me to keep outputs shorter or always include a quick summary next time?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) throw new Error('Not authenticated');
                          await fetch('/api/update-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({ prompt_config: { always_tldr: true } })
                          });
                          void sendPreferenceSignal('tldr_trigger', { tokens: 0, choice: 'always' }, { weight: 1.2 });
                          addToast({ type: 'success', title: 'Preference saved', description: 'I\'ll include a quick summary by default.' });
                        } catch (e: any) {
                          addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Unable to save preference' });
                        } finally {
                          setPostSummarizeNudge(false);
                        }
                      }}
                    >
                      Always include summary
                    </button>
                    <button
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) throw new Error('Not authenticated');
                          await fetch('/api/update-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({ prompt_config: { default_output_brevity: 'short' } })
                          });
                          void sendPreferenceSignal('length', { kind: 'categorical', choice: 'brief' }, { weight: 2 });
                          addToast({ type: 'success', title: 'Preference saved', description: 'I\'ll keep outputs shorter by default.' });
                        } catch (e: any) {
                          addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Unable to save preference' });
                        } finally {
                          setPostSummarizeNudge(false);
                        }
                      }}
                    >
                      Prefer shorter outputs
                    </button>
                    <button
                      className="px-2 py-1 text-xs text-blue-900 hover:underline"
                      onClick={() => setPostSummarizeNudge(false)}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              )}

              {/* Refine scope modal (simple) */}
              {showRefine && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
                  <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-4">
                    <div className="font-semibold text-gray-900 mb-2">Refine scope</div>
                    <div className="text-xs text-gray-600 mb-2">Pick focus facets and timeframe for the next run.</div>
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      {['leadership','funding','tech stack','news','competitors','hiring'].map(f => (
                        <label key={f} className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={refineFacets.includes(f)} onChange={(e) => setRefineFacets(prev => e.target.checked ? Array.from(new Set([...prev, f])) : prev.filter(x => x!==f))} />
                          <span className="capitalize">{f}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-gray-700">Timeframe</label>
                      <select className="mt-1 w-full border border-gray-300 rounded-lg text-sm p-2" value={refineTimeframe} onChange={e => setRefineTimeframe(e.target.value)}>
                        {['last 3 months','last 6 months','last 12 months'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button className="px-3 py-1.5 text-sm text-gray-700" onClick={() => setShowRefine(false)}>Cancel</button>
                      <button className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg" onClick={async () => {
                        setShowRefine(false);
                        const target = activeSubject ? `Research ${activeSubject}` : 'Continue research';
                        const facets = refineFacets.join(', ') || 'leadership, funding, tech stack, news, competitors, hiring';
                        const cmd = `${target}. Focus on ${facets} within ${refineTimeframe}. Use web_search for recency. Do not return placeholders or 'None found' — if data is thin, synthesize from available context and add investigative next steps with at least 3 sources. Keep sections and provide an Executive Summary upfront.`;
                        if (!currentChatId) {
                          const id = await createNewChat();
                          if (id) await handleSendMessageWithChat(id, cmd);
                        } else {
                          await handleSendMessageWithChat(currentChatId, cmd);
                        }
                      }}>Apply</button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      <div className="bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {/* Context crumb (above composer) */}
          <div className="mb-2 flex items-center justify-between gap-3" data-testid="context-crumb">
            <div className="text-xs text-gray-700 inline-flex items-center gap-2">
              <div className="relative inline-flex">
                {showContextTooltip && (
                  <div
                    ref={contextTooltipRef}
                    className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-lg"
                  >
                    Tip: Save contexts to jump between research threads.
                  </div>
                )}
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                  onClick={() => {
                    dismissContextTooltip();
                    setCrumbOpen(o => !o);
                  }}
                  aria-expanded={crumbOpen}
                >
                  Context: {formatDisplaySubject(activeSubject)} ▾
                </button>
              </div>
              {canUndoSubject() && (
                <button type="button" className="text-blue-700 hover:underline" onClick={handleUndoSubject}>Undo</button>
              )}
            </div>
            {/* Header metrics (right-aligned) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-blue-700 hover:underline"
                onClick={() => {
                  dismissContextTooltip();
                  showSetupSummary();
                }}
              >
                View my setup
              </button>
              <div className="text-xs text-gray-600 hidden sm:flex items-center gap-2" data-testid="header-metrics">
                {accountStats && (
                  <>
                    <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">📊 {accountStats.total} tracked</span>
                    <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded">🔥 {accountStats.hot} hot</span>
                    <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-0.5 rounded">⚡ {accountStats.with_signals} with signals</span>
                  </>
                )}
              </div>
            </div>

            {crumbOpen && (
              <div className="absolute z-30 mt-10 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg p-3" data-testid="context-crumb-open">
                <div className="text-xs text-gray-600 mb-2">Switch to new subject (company/person)</div>
                <input
                  value={switchInput}
                  onChange={(e) => setSwitchInput(e.target.value)}
                  placeholder="e.g., Clari or Andy Byrne"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  data-testid="context-crumb-input"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="px-2.5 py-1.5 text-xs text-gray-700" onClick={() => setCrumbOpen(false)}>Cancel</button>
                  <button className="px-2.5 py-1.5 text-xs text-white bg-blue-600 rounded" onClick={handleSwitchSubject}>Apply</button>
                  {activeSubject && (
                    <button className="px-2.5 py-1.5 text-xs text-gray-700" onClick={() => { lastSubjectRef.current = { prev: activeSubject, at: Date.now() }; setActiveSubject(null); setCrumbOpen(false); }}>Clear</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            disabled={loading}
            isStreaming={loading}
            onStop={handleStopStreaming}
            onAttach={() => setCSVUploadOpen(true)}
            // Use a single clear CTA above for bulk research; keep Settings action to open dialog if needed
            onSettings={() => setBulkResearchOpen(true)}
            selectedAgent="Company Researcher"
            focusSignal={focusComposerTick}
          />
          {/* Empty-state panel */}
          {messages.length === 0 && !streamingMessage && (
            <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-white" data-testid="empty-state-tasks">
              <div className="text-xs text-gray-600 mb-2">Start with:</div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={() => { setInputValue('Research '); setFocusComposerTick(t=>t+1); }}>Research a company</button>
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={() => setBulkResearchOpen(true)}>Upload list</button>
                <button className="px-2.5 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200" onClick={handleAddAccount}>Track account</button>
              </div>
            </div>
          )}
        </div>
      </div>
  </div>
  </div>
  {/* Command palette */}
  {paletteOpen && (
      <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center p-6" onClick={() => setPaletteOpen(false)}>
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl p-3" onClick={e => e.stopPropagation()}>
          <div className="text-sm font-semibold text-gray-900 mb-2">Quick actions</div>
          <div className="flex flex-col gap-2" data-testid="command-palette">
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); setInputValue('Research '); setFocusComposerTick(t=>t+1); }}>Research a company</button>
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); setBulkResearchOpen(true); }}>Upload list (Bulk research)</button>
            <button className="text-left px-3 py-2 rounded hover:bg-gray-50" onClick={() => { setPaletteOpen(false); handleAddAccount(); }}>Track account</button>
            <button
              className="text-left px-3 py-2 rounded text-gray-400 bg-gray-50 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Lead list generator (coming soon)
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">Press Esc to close</div>
        </div>
      </div>
    )}
    <SaveResearchDialog
      open={saveOpen}
      initialDraft={saveDraft}
      onClose={() => setSaveOpen(false)}
      onSave={handleSaveResearch}
      saving={saving}
      error={saveError}
      usage={lastUsage || undefined}
      activeSubject={activeSubject}
    />
    <CSVUploadDialog
      isOpen={csvUploadOpen}
      onClose={() => setCSVUploadOpen(false)}
      onSuccess={handleCSVUploadSuccess}
    />

    {/* Optimize ICP modal (for inline scorecard link) */}
    <OptimizeICPModal isOpen={optimizeOpen} onClose={() => setOptimizeOpen(false)} />

    <AssumedSubjectDialog
      open={assumedDialogOpen}
      initialName={assumedDialogName || lastAssumedSubject?.name || activeSubject || ''}
      loading={assumedSuggestionsLoading}
      suggestions={assumedSuggestions}
      onRefresh={(query) => { setAssumedDialogName(query); void loadAssumedSuggestions(query); }}
      onSelect={(name) => {
        const trimmed = name.trim();
        setAssumedDialogOpen(false);
        setAssumedDialogIndustry(null);
        if (trimmed) {
          startSuggestion(`Research ${trimmed}\n`);
        }
      }}
      onClose={() => { setAssumedDialogOpen(false); setAssumedDialogIndustry(null); }}
    />

    <DraftEmailDialog
      open={emailDialogOpen}
      loading={emailDialogLoading || draftEmailPending}
      company={currentActionCompany || activeSubject || undefined}
      candidates={emailCandidates}
      defaultRole={(Array.isArray(userProfile?.target_titles) && userProfile?.target_titles?.length ? userProfile.target_titles[0] : 'CISO')}
      initialSenderName={defaultSenderName}
      initialSenderTitle={defaultSenderTitle}
      onClose={() => { if (!draftEmailPending) { setEmailDialogOpen(false); setEmailDialogLoading(false); } }}
      onSubmit={(options) => { void handleEmailDialogSubmit(options); }}
    />

    {reasoningOpen && (
      <div
        className="fixed inset-0 z-40 bg-black/30 flex items-start justify-end"
        onClick={() => setReasoningOpen(false)}
      >
        <div
          className="w-full max-w-xl h-full bg-white border-l border-gray-200 shadow-2xl p-4 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Reasoning stream"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900">Reasoning Stream</div>
            <button
              className="text-xs text-gray-600 hover:text-gray-900"
              onClick={() => setReasoningOpen(false)}
              aria-label="Close reasoning stream"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {thinkingEvents.map(ev => (
              <ThinkingIndicator
                key={ev.id}
                type={ev.type}
                content={ev.content}
                query={ev.query}
                sources={ev.sources}
                url={(ev as any).url}
                count={(ev as any).count}
                companies={(ev as any).companies}
                company={(ev as any).company}
                icp={(ev as any).icp}
                critical={(ev as any).critical}
                important={(ev as any).important}
              />
            ))}
          </div>
        </div>
      </div>
    )}
    <AccountSignalsDrawer
      open={signalsDrawerOpen}
      accountId={signalsAccountId}
      companyName={signalsCompanyName}
      onClose={() => setSignalsDrawerOpen(false)}
      onResearch={(company) => { setSignalsDrawerOpen(false); setInputValue(`Research ${company}`); setTimeout(() => void handleSendMessage(), 50); }}
    />
    <BulkResearchDialog
      isOpen={bulkResearchOpen}
      onClose={() => setBulkResearchOpen(false)}
      onSuccess={(_jobId, count) => {
        addToast({
          type: 'success',
          title: 'Bulk research started',
          description: `Research queued for ${count} companies. Check progress below.`,
        });
      }}
    />
    </>
  );
}
