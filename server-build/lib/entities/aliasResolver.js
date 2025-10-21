import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let cachedClient = null;
let loadPromise = null;
let cacheLoadedAt = 0;
let aliasMap = new Map();
let canonicalMap = new Map();
let aliasTablesUnavailable = false;
const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes
const USER_CACHE_TTL_MS = 2 * 60 * 1000; // per-user alias cache
function requireClient() {
    if (cachedClient)
        return cachedClient;
    if (!SUPABASE_URL || !SERVICE_KEY) {
        throw new Error('[aliasResolver] SUPABASE_SERVICE_ROLE_KEY missing; entity alias resolution unavailable.');
    }
    cachedClient = createClient(SUPABASE_URL, SERVICE_KEY);
    return cachedClient;
}
function resolveClient(client) {
    return client || requireClient();
}
function normalise(term) {
    return term.trim().toLowerCase();
}
function ensureArrayAliases(aliases) {
    if (!Array.isArray(aliases))
        return [];
    return aliases.filter(a => typeof a === 'string' && a.trim().length > 0);
}
function isMissingTableError(error, table) {
    if (!error)
        return false;
    if (error.code === 'PGRST205')
        return true;
    if (typeof error.message === 'string' && error.message.includes(`'${table}'`))
        return true;
    return false;
}
const userAliasCache = new Map();
function populateCache(rows) {
    aliasMap = new Map();
    canonicalMap = new Map();
    for (const row of rows) {
        if (!row || typeof row.canonical !== 'string')
            continue;
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
async function loadCache(client) {
    if (loadPromise)
        return loadPromise;
    loadPromise = (async () => {
        if (aliasTablesUnavailable) {
            populateCache([]);
            return;
        }
        const supabase = resolveClient(client);
        const { data, error } = await supabase
            .from('entity_aliases')
            .select('*');
        loadPromise = null;
        if (error) {
            if (isMissingTableError(error, 'entity_aliases')) {
                if (!aliasTablesUnavailable) {
                    console.warn('[aliasResolver] entity_aliases table unavailable; disabling alias resolution.');
                }
                aliasTablesUnavailable = true;
                populateCache([]);
                return;
            }
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
function jaroDistance(a, b) {
    const s1 = a;
    const s2 = b;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 && len2 === 0)
        return 1;
    if (len1 === 0 || len2 === 0)
        return 0;
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    let matches = 0;
    for (let i = 0; i < len1; i += 1) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, len2);
        for (let j = start; j < end; j += 1) {
            if (s2Matches[j])
                continue;
            if (s1[i] !== s2[j])
                continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches += 1;
            break;
        }
    }
    if (matches === 0)
        return 0;
    let t = 0;
    let k = 0;
    for (let i = 0; i < len1; i += 1) {
        if (!s1Matches[i])
            continue;
        while (!s2Matches[k])
            k += 1;
        if (s1[i] !== s2[k])
            t += 1;
        k += 1;
    }
    const transpositions = t / 2;
    return ((matches / len1 +
        matches / len2 +
        (matches - transpositions) / matches) / 3);
}
function jaroWinkler(a, b) {
    const distance = jaroDistance(a, b);
    const prefixScale = 0.1;
    const maxPrefix = 4;
    let prefix = 0;
    for (let i = 0; i < Math.min(maxPrefix, a.length, b.length); i += 1) {
        if (a[i] === b[i])
            prefix += 1;
        else
            break;
    }
    return distance + prefix * prefixScale * (1 - distance);
}
async function ensureCacheFresh(client) {
    const expired = Date.now() - cacheLoadedAt > CACHE_TTL_MS;
    if (aliasMap.size === 0 || expired) {
        await loadCache(client);
    }
}
export async function resolveEntity(term, client) {
    if (!term || typeof term !== 'string' || !term.trim())
        return null;
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
            metadata: (direct.metadata ?? null),
            source: direct.source ?? null,
        };
    }
    // Fuzzy search
    let best = null;
    const checkCandidate = (candidate, row) => {
        if (!candidate)
            return;
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
    if (!best)
        return null;
    return {
        canonical: best.row.canonical,
        type: best.row.type,
        confidence: Number(best.score.toFixed(3)),
        matched: term,
        aliases: ensureArrayAliases(best.row.aliases),
        metadata: (best.row.metadata ?? null),
        source: best.row.source ?? null,
    };
}
async function ensureUserAliasCache(userId, client) {
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
    const supabase = resolveClient(client);
    const { data, error } = await supabase
        .from('user_entity_aliases')
        .select('*')
        .eq('user_id', userId);
    if (error) {
        if (isMissingTableError(error, 'user_entity_aliases')) {
            console.warn('[aliasResolver] user_entity_aliases table unavailable; skipping per-user alias cache.');
            const entry = {
                aliasMap: new Map(),
                canonicalMap: new Map(),
                loadedAt: Date.now(),
            };
            userAliasCache.set(userId, entry);
            return entry;
        }
        console.error('[aliasResolver] Failed to load user alias cache', error);
        return {
            aliasMap: new Map(),
            canonicalMap: new Map(),
            loadedAt: Date.now(),
        };
    }
    const aliasMap = new Map();
    const canonicalMap = new Map();
    for (const row of data || []) {
        const aliasKey = normalise(row.alias_normalized || row.alias);
        aliasMap.set(aliasKey, row);
        canonicalMap.set(normalise(row.canonical), row);
    }
    const entry = { aliasMap, canonicalMap, loadedAt: Date.now() };
    userAliasCache.set(userId, entry);
    return entry;
}
export async function getUserAliasMaps(userId, client) {
    const { aliasMap, canonicalMap } = await ensureUserAliasCache(userId, client);
    return { aliasMap, canonicalMap };
}
export async function learnUserAlias(userId, canonical, alias, options = {}) {
    if (!userId || !canonical || !alias)
        return;
    const supabase = resolveClient(options.client);
    const trimmedCanonical = canonical.trim();
    const trimmedAlias = alias.trim();
    if (!trimmedCanonical || !trimmedAlias)
        return;
    const normalizedAlias = normalise(trimmedAlias);
    const { data: existing, error: fetchError } = await supabase
        .from('user_entity_aliases')
        .select('id, type, metadata, source')
        .eq('user_id', userId)
        .eq('alias_normalized', normalizedAlias)
        .maybeSingle();
    if (fetchError) {
        if (isMissingTableError(fetchError, 'user_entity_aliases')) {
            console.warn('[aliasResolver] user_entity_aliases table unavailable; skipping alias learn.');
            return;
        }
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
            if (isMissingTableError(updateError, 'user_entity_aliases')) {
                console.warn('[aliasResolver] user_entity_aliases table unavailable during update; skipping alias learn.');
                return;
            }
            console.error('[aliasResolver] Failed to update user alias', updateError);
            throw updateError;
        }
    }
    else {
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
            if (isMissingTableError(insertError, 'user_entity_aliases')) {
                console.warn('[aliasResolver] user_entity_aliases table unavailable during insert; skipping alias learn.');
                return;
            }
            console.error('[aliasResolver] Failed to insert user alias', insertError);
            throw insertError;
        }
    }
    invalidateUserAliasCache(userId);
}
export function invalidateUserAliasCache(userId) {
    if (typeof userId === 'string' && userId.length > 0) {
        userAliasCache.delete(userId);
    }
    else {
        userAliasCache.clear();
    }
}
export async function learnAlias(canonical, alias, options = {}) {
    if (!canonical || !alias)
        return;
    const supabase = resolveClient(options.client);
    const trimmedCanonical = canonical.trim();
    const trimmedAlias = alias.trim();
    if (!trimmedCanonical || !trimmedAlias)
        return;
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
    }
    else {
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
