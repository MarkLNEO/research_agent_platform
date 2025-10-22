import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let cachedClient = null;
function resolveClient(client) {
    if (client)
        return client;
    if (!SUPABASE_URL || !SERVICE_KEY) {
        throw new Error('[openQuestions] SUPABASE_SERVICE_ROLE_KEY missing; follow-up store unavailable.');
    }
    if (!cachedClient) {
        cachedClient = createClient(SUPABASE_URL, SERVICE_KEY);
    }
    return cachedClient;
}
export async function listOpenQuestions(userId, options = {}, client) {
    if (!userId)
        return [];
    const supabase = resolveClient(client);
    const limit = Math.max(1, options.limit ?? 10);
    const { data, error } = await supabase
        .from('open_questions')
        .select('*')
        .eq('user_id', userId)
        .is('resolved_at', null)
        .order('asked_at', { ascending: true })
        .limit(limit);
    if (error) {
        console.error('[openQuestions] Failed to list unresolved questions', error);
        throw error;
    }
    return data || [];
}
export async function addOpenQuestion(userId, input, client) {
    if (!userId || !input?.question?.trim())
        return null;
    const supabase = resolveClient(client);
    const payload = {
        user_id: userId,
        question: input.question.trim(),
        context: input.context ?? null,
        asked_at: input.askedAt || new Date().toISOString(),
    };
    const { data, error } = await supabase
        .from('open_questions')
        .insert(payload)
        .select()
        .single();
    if (error) {
        console.error('[openQuestions] Failed to insert open question', error);
        throw error;
    }
    return data;
}
export async function resolveOpenQuestion(id, input = {}, client) {
    if (!id)
        return null;
    const supabase = resolveClient(client);
    const payload = {
        resolved_at: new Date().toISOString(),
    };
    if (typeof input.resolution === 'string') {
        payload.resolution = input.resolution;
    }
    if (input.context !== undefined) {
        payload.context = input.context;
    }
    const { data, error } = await supabase
        .from('open_questions')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        console.error('[openQuestions] Failed to resolve question', error);
        throw error;
    }
    return data;
}
