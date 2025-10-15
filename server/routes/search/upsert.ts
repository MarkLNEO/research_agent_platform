import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function upsertEmbedding(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string | undefined;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await anon.auth.getUser();
  if (!auth?.user) return res.status(401).json({ error: 'Invalid token' });
  const userId = auth.user.id;

  const {
    object_type,
    object_key,
    chunk_id = 0,
    content,
    metadata = {},
    embedding,
  } = (req.body || {}) as any;

  if (!object_type || !object_key || !content) {
    return res.status(400).json({ error: 'object_type, object_key, and content are required' });
  }
  if (!Array.isArray(embedding) || embedding.length === 0) {
    // To keep within current OpenAI Responses-only usage, we accept caller-provided embeddings for now
    return res.status(400).json({ error: 'embedding (number[]) is required for now' });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const payload: any = {
    user_id: userId,
    object_type: String(object_type),
    object_key: String(object_key),
    chunk_id: Number(chunk_id) || 0,
    content: String(content),
    metadata,
    embedding,
  };

  const { error } = await admin.from('embeddings').upsert(payload, { onConflict: 'user_id,object_type,object_key,chunk_id' });
  if (error) return res.status(500).json({ error: error.message || 'Upsert failed' });
  return res.status(200).json({ ok: true });
}

