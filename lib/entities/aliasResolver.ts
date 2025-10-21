import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.js';
import { ensureTable } from '../db/ensureTables.js';

type ServiceClient = SupabaseClient<Database>;
type AliasRow = Database['public']['Tables']['entity_aliases']['Row'];
type UserAliasRow = Database['public']['Tables']['user_entity_aliases']['Row'];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cachedClient: ServiceClient | null = null;
let loadPromise: Promise<void> | null = null;
let cacheLoadedAt = 0;
let aliasMap = new Map<string, AliasRow>();
let canonicalMap = new Map<string, AliasRow>();

const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes
const USER_CACHE_TTL_MS = 2 * 60 * 1000; // per-user alias cache

function requireClient(): ServiceClient {
  if (cachedClient) return cachedClient;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('[aliasResolver] SUPABASE_SERVICE_ROLE_KEY missing; entity alias resolution unavailable.');
  }
  cachedClient = createClient<Database>(SUPABASE_URL, SERVICE_KEY);
  return cachedClient;
}

function resolveClient(client?: SupabaseClient<Database>): SupabaseClient<Database> {
  return client || requireClient();
}

function normalise(term: string): string {
  return term.trim().toLowerCase();
}

function ensureArrayAliases(aliases: string[] | null | undefined): string[] {
  if (!Array.isArray(aliases)) return [];
  return aliases.filter(a => typeof a === 'string' && a.trim().length > 0);
}

type UserAliasCacheEntry = {
  aliasMap: Map<string, UserAliasRow>;
  canonicalMap: Map<string, UserAliasRow>;
  loadedAt: number;
};

const userAliasCache = new Map<string, UserAliasCacheEntry>();

function populateCache(rows: AliasRow[]) {
  aliasMap = new Map();
  canonicalMap = new Map();

  for (const row of rows) {
    if (!row || typeof row.canonical !== 'string') continue;
    const canonicalKey = normalise(row.canonical);
    canonicalMap.set(canonicalKey, row);
    const aliases = ensureArrayAliases(row.aliases);
    for (const alias of aliases) {
      aliasMap.set(normalise(alias), row);
    }
    // Include canonical itself for direct match
    aliasMap.set(canonicalKey, row);
  }
  cacheLoadedAt = Date.now();
}

async function loadCache(client?: SupabaseClient<Database>): Promise<void> {
  if (loadPromise) return loadPromise;
  await ensureTable('entity_aliases');
  await ensureTable('user_entity_aliases');
  loadPromise = (async () => {
    const supabase = resolveClient(client);
    const { data, error } = await supabase
      .from('entity_aliases')
      .select('*');
    loadPromise = null;
    if (error) {
      console.error('[aliasResolver] Failed to load alias cache', error);
      throw error;
    }
    populateCache(data || []);
  })();
  return loadPromise;
}

export function invalidateAliasCache() {
  cacheLoadedAt = 0;
}

function jaroDistance(a: string, b: string): number {
  const s1 = a;
  const s2 = b;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j += 1) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i += 1) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k += 1;
    if (s1[i] !== s2[k]) t += 1;
    k += 1;
  }

  const transpositions = t / 2;
  return (
    (matches / len1 +
      matches / len2 +
      (matches - transpositions) / matches) / 3
  );
}

function jaroWinkler(a: string, b: string): number {
  const distance = jaroDistance(a, b);
  const prefixScale = 0.1;
  const maxPrefix = 4;
  let prefix = 0;
  for (let i = 0; i < Math.min(maxPrefix, a.length, b.length); i += 1) {
    if (a[i] === b[i]) prefix += 1;
    else break;
  }
  return distance + prefix * prefixScale * (1 - distance);
}

export interface ResolvedEntity {
  canonical: string;
  type: string;
  confidence: number;
  matched: string;
  aliases: string[];
  metadata: Json | null;
  source: string | null;
}

async function ensureCacheFresh(client?: SupabaseClient<Database>) {
  const expired = Date.now() - cacheLoadedAt > CACHE_TTL_MS;
  if (aliasMap.size === 0 || expired) {
    await loadCache(client);
  }
}

export async function resolveEntity(
  term: string,
  client?: SupabaseClient<Database>
): Promise<ResolvedEntity | null> {
  if (!term || typeof term !== 'string' || !term.trim()) return null;
  await ensureCacheFresh(client);

  const normalized = normalise(term);
  const direct = aliasMap.get(normalized);
  if (direct) {
    return {
      canonical: direct.canonical,
      type: direct.type,
      confidence: 1,
      matched: term,
      aliases: ensureArrayAliases(direct.aliases),
      metadata: (direct.metadata ?? null) as Json | null,
      source: direct.source ?? null,
    };
  }

  // Fuzzy search
  let best: { row: AliasRow; score: number; matched: string } | null = null;
  const checkCandidate = (candidate: string, row: AliasRow) => {
    if (!candidate) return;
    const score = jaroWinkler(candidate, normalized);
    if (score >= 0.9 && (!best || score > best.score)) {
      best = { row, score, matched: candidate };
    }
  };

  for (const [alias, row] of aliasMap.entries()) {
    checkCandidate(alias, row);
  }
  if (!best) {
    for (const [canonical, row] of canonicalMap.entries()) {
      checkCandidate(canonical, row);
    }
  }
  if (!best) return null;

  return {
    canonical: best.row.canonical,
    type: best.row.type,
    confidence: Number(best.score.toFixed(3)),
    matched: term,
    aliases: ensureArrayAliases(best.row.aliases),
    metadata: (best.row.metadata ?? null) as Json | null,
    source: best.row.source ?? null,
  };
}

async function ensureUserAliasCache(
  userId: string,
  client?: SupabaseClient<Database>
): Promise<UserAliasCacheEntry> {
  if (!userId) {
    return {
      aliasMap: new Map(),
      canonicalMap: new Map(),
      loadedAt: Date.now(),
    };
  }
  const cached = userAliasCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < USER_CACHE_TTL_MS) {
    return cached;
  }
  await ensureTable('entity_aliases');
  await ensureTable('user_entity_aliases');
  const supabase = resolveClient(client);
  const { data, error } = await supabase
    .from('user_entity_aliases')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    console.error('[aliasResolver] Failed to load user alias cache', error);
    throw error;
  }
  const aliasMap = new Map<string, UserAliasRow>();
  const canonicalMap = new Map<string, UserAliasRow>();
  for (const row of data || []) {
    const aliasKey = normalise(row.alias_normalized || row.alias);
    aliasMap.set(aliasKey, row);
    canonicalMap.set(normalise(row.canonical), row);
  }
  const entry: UserAliasCacheEntry = { aliasMap, canonicalMap, loadedAt: Date.now() };
  userAliasCache.set(userId, entry);
  return entry;
}

export async function getUserAliasMaps(
  userId: string,
  client?: SupabaseClient<Database>
): Promise<{ aliasMap: Map<string, UserAliasRow>; canonicalMap: Map<string, UserAliasRow> }> {
  const { aliasMap, canonicalMap } = await ensureUserAliasCache(userId, client);
  return { aliasMap, canonicalMap };
}

export interface LearnUserAliasOptions extends LearnAliasOptions {
  client?: SupabaseClient<Database>;
}

export async function learnUserAlias(
  userId: string,
  canonical: string,
  alias: string,
  options: LearnUserAliasOptions = {}
): Promise<void> {
  if (!userId || !canonical || !alias) return;
  await ensureTable('entity_aliases');
  await ensureTable('user_entity_aliases');
  const supabase = resolveClient(options.client);
  const trimmedCanonical = canonical.trim();
  const trimmedAlias = alias.trim();
  if (!trimmedCanonical || !trimmedAlias) return;
  const normalizedAlias = normalise(trimmedAlias);

  const { data: existing, error: fetchError } = await supabase
    .from('user_entity_aliases')
    .select('id, type, metadata, source')
    .eq('user_id', userId)
    .eq('alias_normalized', normalizedAlias)
    .maybeSingle();

  if (fetchError) {
    console.error('[aliasResolver] Failed to load user alias before learning', fetchError);
    throw fetchError;
  }

  const now = new Date().toISOString();
  if (existing) {
    const { error: updateError } = await supabase
      .from('user_entity_aliases')
      .update({
        canonical: trimmedCanonical,
        type: options.type || existing.type || 'unknown',
        metadata: options.metadata ?? existing.metadata ?? null,
        source: options.source || existing.source || 'followup',
        updated_at: now,
      })
      .eq('id', existing.id);
    if (updateError) {
      console.error('[aliasResolver] Failed to update user alias', updateError);
      throw updateError;
    }
  } else {
    const { error: insertError } = await supabase
      .from('user_entity_aliases')
      .insert({
        user_id: userId,
        alias: trimmedAlias,
        canonical: trimmedCanonical,
        type: options.type || 'unknown',
        metadata: options.metadata ?? null,
        source: options.source || 'followup',
      });
    if (insertError) {
      console.error('[aliasResolver] Failed to insert user alias', insertError);
      throw insertError;
    }
  }
  invalidateUserAliasCache(userId);
}

export function invalidateUserAliasCache(userId?: string) {
  if (typeof userId === 'string' && userId.length > 0) {
    userAliasCache.delete(userId);
  } else {
    userAliasCache.clear();
  }
}

export interface LearnAliasOptions {
  type?: string;
  metadata?: Json;
  source?: string;
  client?: SupabaseClient<Database>;
}

export async function learnAlias(
  canonical: string,
  alias: string,
  options: LearnAliasOptions = {}
): Promise<void> {
  if (!canonical || !alias) return;
  await ensureTable('entity_aliases');
  const supabase = resolveClient(options.client);
  const trimmedCanonical = canonical.trim();
  const trimmedAlias = alias.trim();
  if (!trimmedCanonical || !trimmedAlias) return;

  const { data: existing, error: fetchError } = await supabase
    .from('entity_aliases')
    .select('*')
    .eq('canonical', trimmedCanonical)
    .maybeSingle();

  if (fetchError) {
    console.error('[aliasResolver] Failed to load canonical for learning alias', fetchError);
    throw fetchError;
  }

  const now = new Date().toISOString();
  if (existing) {
    const existingAliases = ensureArrayAliases(existing.aliases);
    const exists = existingAliases.some(a => normalise(a) === normalise(trimmedAlias));
    if (!exists) {
      const updatedAliases = [...existingAliases, trimmedAlias];
      const { error: updateError } = await supabase
        .from('entity_aliases')
        .update({
          aliases: updatedAliases,
          metadata: options.metadata ?? existing.metadata ?? null,
          source: options.source || existing.source || 'followup',
          updated_at: now,
        })
        .eq('id', existing.id);
      if (updateError) {
        console.error('[aliasResolver] Failed to append alias', updateError);
        throw updateError;
      }
    }
  } else {
    const { error: insertError } = await supabase
      .from('entity_aliases')
      .insert({
        canonical: trimmedCanonical,
        aliases: [trimmedAlias],
        type: options.type || 'unknown',
        metadata: options.metadata ?? null,
        source: options.source || 'followup',
        created_at: now,
        updated_at: now,
      });
    if (insertError) {
      console.error('[aliasResolver] Failed to insert new alias entry', insertError);
      throw insertError;
    }
  }

  invalidateAliasCache();
}
