import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn('[memory] SUPABASE_SERVICE_ROLE_KEY missing – preference memory disabled.');
}

const serviceClient = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

export const DEFAULT_MEMORY_MAX_BYTES = 1800;

type KnowledgeRow = { title?: string | null; content?: string | null };
type ImplicitRow = { key: string; value_json: any };

type ObservedSignal =
  | { kind?: 'scalar'; value: number; confidence?: number }
  | { kind?: 'categorical'; choice: string; confidence?: number }
  | { kind?: 'map'; map: Record<string, number>; confidence?: number }
  | Record<string, any>;

function getServiceClient() {
  if (!serviceClient) {
    throw new Error('Service Supabase client unavailable (missing SUPABASE_SERVICE_ROLE_KEY).');
  }
  return serviceClient;
}

function formatImplicitValue(key: string, valueJson: any): string | null {
  if (!valueJson || typeof valueJson !== 'object') return null;
  const conf = typeof valueJson.confidence === 'number' ? valueJson.confidence : valueJson.conf;
  if (typeof conf === 'number' && conf < 0.6) return null;

  if (typeof valueJson.value === 'number') {
    return `${key}: ${valueJson.value.toFixed(2)}${conf ? ` (conf ${conf.toFixed(2)})` : ''}`;
  }
  if (typeof valueJson.choice === 'string') {
    return `${key}: ${valueJson.choice}${conf ? ` (conf ${conf.toFixed(2)})` : ''}`;
  }
  if (Array.isArray(valueJson.order)) {
    return `${key}: [${valueJson.order.slice(0, 6).join(', ')}]`;
  }
  if (valueJson.map && typeof valueJson.map === 'object') {
    const entries = Object.entries(valueJson.map)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([k, v]) => `${k}:${Number(v).toFixed(2)}`);
    return `${key}: {${entries.join(', ')}}`;
  }

  return `${key}: ${JSON.stringify(valueJson).slice(0, 120)}`;
}

export function buildMemoryBlockFromData(
  agent: string,
  knowledgeRows: KnowledgeRow[] = [],
  implicitRows: ImplicitRow[] = [],
  maxBytes = DEFAULT_MEMORY_MAX_BYTES
): string {
  const confirmed = knowledgeRows
    .map(entry => {
      const text = (entry.content || entry.title || '').trim();
      return text ? `- ${text}` : null;
    })
    .filter(Boolean)
    .slice(0, 8) as string[];

  const tendencies = implicitRows
    .map(row => formatImplicitValue(row.key, row.value_json))
    .filter(Boolean)
    .slice(0, 12) as string[];

  if (confirmed.length === 0 && tendencies.length === 0) return '';

  let block = `<<memory v=1 agent=${agent}>`;
  const ensureFits = (candidate: string) => Buffer.byteLength(candidate, 'utf8') <= maxBytes;

  const appendLine = (line: string) => {
    const prefix = block.endsWith('\n') || line === '' ? '' : '\n';
    const candidate = line === '' ? `${block}\n` : `${block}${prefix}${line}`;
    if (ensureFits(`${candidate}\n</memory>`)) {
      block = candidate;
      return true;
    }
    return false;
  };

  if (confirmed.length > 0) {
    appendLine('# confirmed knowledge');
    for (const line of confirmed) {
      if (!appendLine(line)) break;
    }
  }

  if (tendencies.length > 0) {
    if (confirmed.length > 0) appendLine('');
    appendLine('# implicit tendencies');
    for (const line of tendencies) {
      if (!appendLine(line)) break;
    }
  }

  const bareHeader = `<<memory v=1 agent=${agent}>`;
  if (block.trim() === bareHeader) return '';

  if (!block.endsWith('\n')) {
    const candidate = `${block}\n`;
    if (ensureFits(`${candidate}</memory>`)) {
      block = candidate;
    }
  }

  let finalBlock = `${block}</memory>`;
  if (!ensureFits(finalBlock)) {
    const trimmed = block.slice(0, Math.max(0, block.lastIndexOf('\n', block.length - 2) + 1));
    finalBlock = `${trimmed}</memory>`;
    if (!ensureFits(finalBlock)) {
      console.warn('[memory] block exceeded budget even after trimming, returning empty', {
        bytes: Buffer.byteLength(finalBlock, 'utf8'),
      });
      return '';
    }
  }

  return finalBlock;
}

export async function buildMemoryBlock(userId: string, agent = 'company_research'): Promise<string> {
  if (!serviceClient) return '';
  try {
    const [{ data: knowledge }, { data: implicit }] = await Promise.all([
      serviceClient
        .from('knowledge_entries')
        .select('title, content')
        .eq('user_id', userId)
        .eq('agent', agent)
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .limit(8),
      serviceClient
        .from('implicit_preferences')
        .select('key, value_json')
        .eq('user_id', userId)
        .eq('agent', agent)
        .order('updated_at', { ascending: false })
        .limit(24),
    ]);

    return buildMemoryBlockFromData(agent, knowledge || [], implicit || [], DEFAULT_MEMORY_MAX_BYTES);
  } catch (error) {
    console.error('[memory] buildMemoryBlock failed', error);
    return '';
  }
}

async function upsertImplicitPreference(
  userId: string,
  agent: string,
  key: string,
  observed: ObservedSignal,
  weight = 1
) {
  const client = getServiceClient();
  const { data: existing } = await client
    .from('implicit_preferences')
    .select('value_json')
    .eq('user_id', userId)
    .eq('agent', agent)
    .eq('key', key)
    .maybeSingle();

  const prev = existing?.value_json || {};
  const kind =
    observed?.kind ||
    prev.kind ||
    (typeof (observed as any)?.value === 'number'
      ? 'scalar'
      : (observed as any)?.choice
      ? 'categorical'
      : (observed as any)?.map
      ? 'map'
      : 'generic');

  const updated: any = { ...prev, kind };
  const step = Number(weight) > 0 ? Number(weight) : 1;

  if (kind === 'scalar' && typeof (observed as any).value === 'number') {
    const prevValue = typeof prev.value === 'number' ? prev.value : (observed as any).value;
    const prevCount = Number(prev.count) || 0;
    const total = prevCount + step;
    const newValue = (prevValue * prevCount + (observed as any).value * step) / total;
    updated.value = newValue;
    updated.count = total;
    const prevConf = Number(prev.confidence) || 0.5;
    updated.confidence = Math.min(1, prevConf + 0.05 * step);
  } else if (kind === 'categorical' && typeof (observed as any).choice === 'string') {
    const prevChoice = prev.choice || (observed as any).choice;
    if (prevChoice === (observed as any).choice) {
      const prevConf = Number(prev.confidence) || 0.5;
      updated.confidence = Math.min(1, prevConf + 0.07 * step);
    } else {
      updated.confidence = 0.4;
    }
    updated.choice = (observed as any).choice;
  } else if ((observed as any).map && typeof (observed as any).map === 'object') {
    updated.map = { ...(prev.map || {}) };
    Object.entries((observed as any).map).forEach(([k, v]) => {
      const prevVal = Number(updated.map[k] || 0);
      updated.map[k] = prevVal * 0.9 + Number(v);
    });
    updated.confidence = Math.min(1, Number(prev.confidence) || 0.6);
  } else {
    Object.assign(updated, observed);
    if (typeof updated.confidence !== 'number') {
      updated.confidence = 0.6;
    }
  }

  updated.updated_at = new Date().toISOString();

  await client
    .from('implicit_preferences')
    .upsert({ user_id: userId, agent, key, value_json: updated, updated_at: new Date().toISOString() });

  return updated;
}

export async function recordPreferenceSignal(
  userId: string,
  agent: string,
  key: string,
  observed: ObservedSignal,
  weight = 1
) {
  if (!serviceClient) return null;
  const client = getServiceClient();
  const payload = {
    user_id: userId,
    agent,
    key,
    observed_json: observed,
    weight,
  };
  await client.from('preference_events').insert(payload);
  return upsertImplicitPreference(userId, agent, key, observed, weight);
}
