import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { assertEmailAllowed } from '../_lib/access.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const term = (req.method === 'GET' ? req.query.term : req.body?.term) as string | undefined;
  if (!term || term.trim().length < 2) return res.status(400).json({ error: 'term is required' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) return res.status(500).json({ error: 'Server not configured' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Authentication failed' });
    try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });

    const instructions = [
      'Resolve a possibly ambiguous company term. Use web_search to identify likely entities.',
      'Return ONLY compact JSON: {"items":[{"name":"","website":"","industry":"","confidence":0-1}], "query":""}.',
      'Include up to 5 items. Prefer globally prominent entities and deduplicate similar names.',
      'No commentary, no code fences.'
    ].join('\n');

    const stream = await openai.responses.stream({
      model: 'gpt-5-mini',
      instructions,
      input: `term: ${term}`,
      tools: [{ type: 'web_search' }],
      text: { format: { type: 'text' }, verbosity: 'low' },
      store: false,
      metadata: { route: 'companies/resolve', user_id: user.id }
    });

    let buf = '';
    for await (const ch of stream as any) {
      if (ch.type === 'response.output_text.delta' && ch.delta) buf += ch.delta;
    }
    try { await stream.finalResponse(); } catch {}

    let items: any[] = [];
    try {
      const s = buf.indexOf('{');
      const e = buf.lastIndexOf('}');
      if (s >= 0 && e > s) {
        const parsed = JSON.parse(buf.slice(s, e + 1));
        if (Array.isArray(parsed?.items)) items = parsed.items;
      }
    } catch {}
    items = (items || []).slice(0, 5).filter((i: any) => i?.name).map((i: any) => ({
      name: String(i.name),
      industry: i.industry || null,
      website: i.website || null,
      confidence: typeof i.confidence === 'number' ? i.confidence : null,
    }));
    return res.status(200).json({ items, term });
  } catch (err: any) {
    console.error('companies/resolve error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}

