import { createClient } from '@supabase/supabase-js';
import { ensureTable } from '../db/ensureTables.js';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let cachedServiceClient = null;
function requireServiceClient() {
    if (cachedServiceClient)
        return cachedServiceClient;
    if (!SUPABASE_URL || !SERVICE_KEY) {
        throw new Error('[preferences] SUPABASE_SERVICE_ROLE_KEY missing; preference store unavailable.');
    }
    cachedServiceClient = createClient(SUPABASE_URL, SERVICE_KEY);
    return cachedServiceClient;
}
function clampConfidence(value) {
    if (typeof value !== 'number' || Number.isNaN(value))
        return 0.8;
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return Number(value.toFixed(3));
}
function normalizeKey(key) {
    return key.trim().toLowerCase();
}
function toIsoTimestamp() {
    return new Date().toISOString();
}
function resolveClient(client) {
    if (client)
        return client;
    return requireServiceClient();
}
export async function upsertPreferences(userId, preferences, client) {
    if (!userId || !Array.isArray(preferences) || preferences.length === 0)
        return [];
    await ensureTable('user_preferences');
    const supabase = resolveClient(client);
    const sanitized = preferences
        .filter(pref => pref && typeof pref.key === 'string' && pref.key.trim().length > 0)
        .map(pref => ({
        ...pref,
        key: normalizeKey(pref.key),
        confidence: clampConfidence(pref.confidence),
        source: (pref.source || 'followup'),
    }));
    if (!sanitized.length)
        return [];
    const keys = sanitized.map(pref => pref.key);
    const { data: existingRows, error: fetchError } = await supabase
        .from('user_preferences')
        .select('id, key, confidence')
        .eq('user_id', userId)
        .in('key', keys);
    if (fetchError) {
        console.error('[preferences] Failed to load existing preferences', fetchError);
        throw fetchError;
    }
    const existingByKey = new Map();
    for (const row of existingRows || []) {
        if (row && typeof row.key === 'string') {
            existingByKey.set(normalizeKey(row.key), row);
        }
    }
    const rowsToUpsert = sanitized.filter(pref => {
        const current = existingByKey.get(pref.key);
        if (!current)
            return true;
        const currentConfidence = clampConfidence(current.confidence);
        const incoming = clampConfidence(pref.confidence);
        return incoming >= currentConfidence;
    }).map(pref => ({
        user_id: userId,
        key: pref.key,
        value: pref.value,
        confidence: clampConfidence(pref.confidence),
        source: pref.source || 'followup',
        updated_at: toIsoTimestamp()
    }));
    if (!rowsToUpsert.length)
        return [];
    const { error: upsertError } = await supabase
        .from('user_preferences')
        .upsert(rowsToUpsert, { onConflict: 'user_id,key' });
    if (upsertError) {
        console.error('[preferences] Failed to upsert preferences', upsertError);
        throw upsertError;
    }
    return rowsToUpsert.map(row => row.key);
}
function applyNestedPreference(resolved, key, value) {
    const segments = key.split('.').map(segment => segment.trim()).filter(Boolean);
    if (segments.length === 0)
        return;
    let cursor = resolved;
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        if (isLast) {
            cursor[segment] = value;
            return;
        }
        if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
            cursor[segment] = {};
        }
        cursor = cursor[segment];
    }
}
function createBaseResolved(promptConfig) {
    const resolved = {
        focus: {},
        coverage: {},
        industry: {},
        summary: {},
    };
    if (promptConfig) {
        const mode = promptConfig.preferred_research_type;
        if (mode) {
            resolved.coverage.mode = mode;
            if (!resolved.coverage.depth) {
                resolved.coverage.depth =
                    mode === 'deep' ? 'deep' :
                        mode === 'quick' ? 'shallow' :
                            'standard';
            }
        }
        const brevity = promptConfig.default_output_brevity;
        if (brevity) {
            resolved.summary.brevity = brevity;
        }
        if (promptConfig.default_tone) {
            resolved.tone = promptConfig.default_tone;
        }
    }
    if (!resolved.summary.brevity)
        resolved.summary.brevity = 'standard';
    if (!resolved.coverage.depth)
        resolved.coverage.depth = 'deep';
    if (!resolved.tone)
        resolved.tone = 'balanced';
    return resolved;
}
export function buildResolvedPreferences(promptConfig, preferenceRows) {
    const resolved = createBaseResolved(promptConfig);
    if (!Array.isArray(preferenceRows) || preferenceRows.length === 0) {
        return resolved;
    }
    // Ensure deterministic ordering by confidence then recency.
    const sorted = [...preferenceRows].sort((a, b) => {
        const confDiff = clampConfidence(a.confidence) - clampConfidence(b.confidence);
        if (confDiff !== 0)
            return confDiff;
        const aTime = a.updated_at || '';
        const bTime = b.updated_at || '';
        return aTime.localeCompare(bTime);
    });
    for (const pref of sorted) {
        if (!pref || typeof pref.key !== 'string')
            continue;
        applyNestedPreference(resolved, normalizeKey(pref.key), pref.value);
    }
    return resolved;
}
export async function getResolvedPreferences(userId, client) {
    if (!userId) {
        throw new Error('[preferences] userId is required');
    }
    await ensureTable('user_preferences');
    const supabase = resolveClient(client);
    const [{ data: preferenceRows, error: prefError }, { data: promptConfig, error: configError }] = await Promise.all([
        supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false }),
        supabase
            .from('user_prompt_config')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle(),
    ]);
    if (prefError) {
        console.error('[preferences] Failed to load user preferences', prefError);
        throw prefError;
    }
    if (configError) {
        console.error('[preferences] Failed to load prompt config', configError);
        throw configError;
    }
    const resolved = buildResolvedPreferences(promptConfig, preferenceRows || []);
    return {
        resolved,
        preferences: preferenceRows || [],
        promptConfig: promptConfig || null,
    };
}
