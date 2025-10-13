import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
import { recordPreferenceSignal } from '../_lib/memory.js';

export const config = { runtime: 'nodejs' };

const DEFAULT_AGENT = 'company_research';

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

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const agent = typeof body.agent === 'string' && body.agent.trim() ? body.agent.trim() : DEFAULT_AGENT;
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const observed = body.observed;
    const weight = typeof body.weight === 'number' ? body.weight : undefined;

    if (!key) return res.status(400).json({ error: 'Preference key is required' });
    if (!observed || typeof observed !== 'object') {
      return res.status(400).json({ error: 'Observed payload must be an object' });
    }

    const updated = await recordPreferenceSignal(
      user.id,
      agent,
      key,
      observed,
      weight
    );

    return res.status(200).json({
      ok: true,
      key,
      agent,
      value: updated,
    });
  } catch (error: any) {
    console.error('/api/agent/signal error', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
