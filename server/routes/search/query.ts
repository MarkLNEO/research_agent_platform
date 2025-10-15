import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function queryEmbeddings(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string | undefined;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await anon.auth.getUser();
  if (!auth?.user) return res.status(401).json({ error: 'Invalid token' });
  const userId = auth.user.id;

  const { embedding, object_type = null, top_k = 8 } = (req.body || {}) as any;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return res.status(400).json({ error: 'embedding (number[]) is required' });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Use SQL function if present; otherwise fall back to inline query via RPC
  try {
    const { data, error } = await admin.rpc('match_embeddings', {
      p_user: userId,
      p_query: embedding,
      p_object_type: object_type,
      p_top_k: Math.max(1, Math.min(50, Number(top_k) || 8)),
    });
    if (error) return res.status(500).json({ error: error.message || 'Query failed' });
    return res.status(200).json({ results: data || [] });
  } catch (e: any) {
    console.error('[search.query] failed', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

