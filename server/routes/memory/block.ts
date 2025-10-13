import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
import { buildMemoryBlock } from '../_lib/memory.js';

export const config = { runtime: 'nodejs' };

const DEFAULT_AGENT = 'company_research';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server configuration incomplete' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Authentication failed' });
    try {
      assertEmailAllowed(user.email);
    } catch (err: any) {
      return res.status(err.statusCode || 403).json({ error: err.message });
    }

    const url = new URL(req.url || '', 'http://localhost');
    const agentParam = url.searchParams.get('agent') || '';
    const agent = agentParam.trim() || DEFAULT_AGENT;

    const block = await buildMemoryBlock(user.id, agent);
    const bytes = Buffer.byteLength(block || '', 'utf8');

    return res.status(200).json({
      ok: true,
      agent,
      has_block: Boolean(block),
      bytes,
      block,
    });
  } catch (error: any) {
    console.error('/api/memory/block error', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
