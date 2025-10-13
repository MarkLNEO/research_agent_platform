import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

const DEFAULT_DECAY = 0.03;
const MIN_CONF_FOR_SUGGESTION = 0.8;

type ValueJson = Record<string, any>;

type SuggestionPayload = {
  title: string;
  content: string;
  reason: string;
};

function applyDecay(value: ValueJson): ValueJson {
  const next: ValueJson = { ...value };
  if (typeof next.confidence === 'number') {
    next.confidence = Math.max(0, Number((next.confidence - DEFAULT_DECAY).toFixed(4)));
  }
  if (typeof next.count === 'number') {
    next.count = Math.max(0, Number((next.count * 0.97).toFixed(3)));
  }
  if (next.map && typeof next.map === 'object') {
    const updatedMap: Record<string, number> = {};
    for (const [key, raw] of Object.entries(next.map)) {
      const decayed = Number(raw) * 0.9;
      if (Math.abs(decayed) >= 0.05) {
        updatedMap[key] = Number(decayed.toFixed(3));
      }
    }
    next.map = updatedMap;
  }
  if (Array.isArray(next.order)) {
    next.order = next.order.slice(0, 6);
  }
  return next;
}

function formatConfidence(value: ValueJson): number {
  if (typeof value.confidence === 'number') return value.confidence;
  if (typeof value.conf === 'number') return value.conf;
  return 0;
}

function inferLengthChoice(value: ValueJson): string | null {
  if (typeof value.choice === 'string') return value.choice;
  if (typeof value.value === 'number') {
    if (value.value <= 0.34) return 'brief';
    if (value.value >= 0.66) return 'long';
    return 'standard';
  }
  if (typeof value.scale01 === 'number') {
    if (value.scale01 <= 0.34) return 'brief';
    if (value.scale01 >= 0.66) return 'long';
    return 'standard';
  }
  return null;
}

function buildSuggestion(key: string, value: ValueJson): SuggestionPayload | null {
  const confidence = formatConfidence(value);
  const count = typeof value.count === 'number' ? value.count : undefined;
  const reason = `confidence ${confidence.toFixed(2)}${count ? ` from ~${Math.round(count)} signals` : ''}`;

  switch (key) {
    case 'length': {
      const choice = inferLengthChoice(value);
      if (!choice) return null;
      if (choice === 'brief') {
        return {
          title: 'Keep research briefs concise',
          content: 'Default to brief, high-signal research summaries unless the user asks otherwise.',
          reason,
        };
      }
      if (choice === 'long') {
        return {
          title: 'Allow longer research writeups',
          content: 'Default to longer, more detailed research outputs for this account.',
          reason,
        };
      }
      return {
        title: 'Stick with standard-length responses',
        content: 'Default to the standard research length for this agent unless overridden.',
        reason,
      };
    }
    case 'tone': {
      const scalar: number | undefined =
        typeof value.value === 'number'
          ? value.value
          : typeof value.scale01 === 'number'
          ? value.scale01
          : undefined;
      if (scalar === undefined) return null;
      if (scalar >= 0.6) {
        return {
          title: 'Prefer a direct tone',
          content: 'Use a direct, punchy tone in research summaries and recommended actions.',
          reason,
        };
      }
      if (scalar <= 0.4) {
        return {
          title: 'Keep tone warm and relational',
          content: 'Use a warm, relationship-forward tone in research summaries.',
          reason,
        };
      }
      return {
        title: 'Use a balanced tone',
        content: 'Maintain a balanced tone between directness and warmth in research outputs.',
        reason,
      };
    }
    case 'evidence_density': {
      const scalar: number | undefined =
        typeof value.value === 'number'
          ? value.value
          : typeof value.scale01 === 'number'
          ? value.scale01
          : undefined;
      if (scalar === undefined) return null;
      if (scalar >= 0.6) {
        return {
          title: 'Lead with stats-heavy insights',
          content: 'Emphasize metrics, stats, and benchmarks in the research output.',
          reason,
        };
      }
      if (scalar <= 0.4) {
        return {
          title: 'Reduce stat density',
          content: 'Keep the research narrative-focused and avoid overloading with statistics.',
          reason,
        };
      }
      return {
        title: 'Moderate evidence density',
        content: 'Balance qualitative insights with quantitative evidence in research outputs.',
        reason,
      };
    }
    case 'structure': {
      if (Array.isArray(value.order) && value.order.length) {
        const orderPreview = value.order.slice(0, 4).join(' → ');
        return {
          title: 'Lock preferred section order',
          content: `Present research sections in this order by default: ${orderPreview}.`,
          reason,
        };
      }
      if (typeof value.promote === 'string') {
        return {
          title: `Highlight ${value.promote} early`,
          content: `Promote the "${value.promote}" section near the top of research outputs.`,
          reason,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server configuration incomplete' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token || token !== SERVICE_KEY) {
      return res.status(401).json({ error: 'Service authorization required' });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: implicitRows, error: implicitError } = await supabase
      .from('implicit_preferences')
      .select('user_id, agent, key, value_json');

    if (implicitError) {
      console.error('[memory.rollup] failed to load implicit preferences', implicitError);
      return res.status(500).json({ error: 'Unable to load implicit preferences' });
    }

    if (!implicitRows || implicitRows.length === 0) {
      return res.status(200).json({ ok: true, updated: 0, suggestions_created: 0 });
    }

    const pairMap = new Map<string, { userId: string; agent: string }>();
    for (const row of implicitRows) {
      const key = `${row.user_id}::${row.agent}`;
      if (!pairMap.has(key)) pairMap.set(key, { userId: row.user_id, agent: row.agent });
    }

    const knowledgeCache = new Map<
      string,
      { knowledge: Array<{ title: string; content: string }>; suggestions: Array<{ title: string }> }
    >();

    await Promise.all(
      Array.from(pairMap.values()).map(async ({ userId, agent }) => {
        const [{ data: knowledge }, { data: suggestions }] = await Promise.all([
          supabase
            .from('knowledge_entries')
            .select('title, content')
            .eq('user_id', userId)
            .eq('agent', agent)
            .eq('enabled', true),
          supabase.from('knowledge_suggestions').select('title').eq('user_id', userId).eq('agent', agent),
        ]);
        knowledgeCache.set(`${userId}::${agent}`, {
          knowledge: knowledge || [],
          suggestions: suggestions || [],
        });
      })
    );

    const updates: Array<{ user_id: string; agent: string; key: string; value_json: ValueJson; updated_at: string }> = [];
    const suggestionsToInsert: Array<{ user_id: string; agent: string; title: string; content: string; reason: string }> =
      [];
    const nowIso = new Date().toISOString();

    for (const row of implicitRows) {
      const updatedValue = applyDecay(row.value_json || {});
      updates.push({
        user_id: row.user_id,
        agent: row.agent,
        key: row.key,
        value_json: updatedValue,
        updated_at: nowIso,
      });

      const confidence = formatConfidence(updatedValue);
      if (confidence < MIN_CONF_FOR_SUGGESTION) continue;

      const suggestion = buildSuggestion(row.key, updatedValue);
      if (!suggestion) continue;

      const cacheKey = `${row.user_id}::${row.agent}`;
      const cacheEntry = knowledgeCache.get(cacheKey);
      if (!cacheEntry) continue;

      const alreadyExplicit = cacheEntry.knowledge.some(entry =>
        entry.content.trim().toLowerCase().includes(suggestion.content.trim().toLowerCase())
      );
      if (alreadyExplicit) continue;

      const alreadyPending = cacheEntry.suggestions.some(entry => entry.title === suggestion.title);
      if (alreadyPending) continue;

      suggestionsToInsert.push({
        user_id: row.user_id,
        agent: row.agent,
        title: suggestion.title,
        content: suggestion.content,
        reason: suggestion.reason,
      });
      cacheEntry.suggestions.push({ title: suggestion.title });
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase.from('implicit_preferences').upsert(updates);
      if (updateError) {
        console.error('[memory.rollup] failed to upsert implicit preferences', updateError);
        return res.status(500).json({ error: 'Failed to persist preference updates' });
      }
    }

    if (suggestionsToInsert.length > 0) {
      const { error: suggestionError } = await supabase.from('knowledge_suggestions').insert(suggestionsToInsert);
      if (suggestionError) {
        console.error('[memory.rollup] failed to insert suggestions', suggestionError);
        return res.status(500).json({ error: 'Failed to insert knowledge suggestions' });
      }
    }

    return res.status(200).json({
      ok: true,
      updated: updates.length,
      suggestions_created: suggestionsToInsert.length,
    });
  } catch (error: any) {
    console.error('/api/memory/rollup error', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
