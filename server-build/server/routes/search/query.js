import { createClient } from '@supabase/supabase-js';
export const config = { runtime: 'nodejs' };
export default async function queryEmbeddings(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY)
        return res.status(500).json({ error: 'Server not configured' });
    const authHeader = (req.headers['authorization'] || req.headers['Authorization']);
    if (!authHeader)
        return res.status(401).json({ error: 'Missing Authorization header' });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await anon.auth.getUser();
    if (!auth?.user)
        return res.status(401).json({ error: 'Invalid token' });
    const userId = auth.user.id;
    const { embedding, object_type = null, top_k = 8 } = (req.body || {});
    if (!Array.isArray(embedding) || embedding.length === 0) {
        return res.status(400).json({ error: 'embedding (number[]) is required' });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
        return res.status(400).json({ error: 'embedding must be a 1536-length number[]' });
    }
    // Probe existence of function/tables for clearer 503s
    try {
        const { error: probe } = await admin.rpc('match_embeddings', {
            p_user: userId,
            p_query: embedding.slice(0, 10).concat(Array(1526).fill(0)),
            p_object_type: object_type,
            p_top_k: 1,
        });
        if (probe && /function .*match_embeddings.* does not exist/i.test(String(probe.message))) {
            return res.status(503).json({ error: 'match_embeddings RPC missing. Apply vector brain migration.' });
        }
    }
    catch (ignore) { }
    try {
        const { data, error } = await admin.rpc('match_embeddings', {
            p_user: userId,
            p_query: embedding,
            p_object_type: object_type,
            p_top_k: Math.max(1, Math.min(50, Number(top_k) || 8)),
        });
        if (error)
            return res.status(500).json({ error: error.message || 'Query failed' });
        return res.status(200).json({ results: data || [] });
    }
    catch (e) {
        console.error('[search.query] failed', e);
        return res.status(500).json({ error: e?.message || 'Internal error' });
    }
}
