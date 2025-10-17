import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { assertEmailAllowed } from '../_lib/access.js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    const term = (req.method === 'GET' ? req.query.term : req.body?.term);
    if (!term || term.trim().length < 2)
        return res.status(400).json({ code: 'bad_request', message: 'term is required', error: 'term is required' });
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return res.status(401).json({ code: 'unauthorized', message: 'Authorization header required', error: 'Authorization header required' });
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY)
            return res.status(500).json({ code: 'server_config_error', message: 'Server not configured', error: 'Server not configured' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ code: 'unauthorized', message: 'Authentication failed', error: 'Authentication failed' });
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ code: 'access_denied', message: e.message, error: e.message });
        }
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
        for await (const ch of stream) {
            if (ch.type === 'response.output_text.delta' && ch.delta)
                buf += ch.delta;
        }
        try {
            await stream.finalResponse();
        }
        catch { }
        let items = [];
        try {
            const s = buf.indexOf('{');
            const e = buf.lastIndexOf('}');
            if (s >= 0 && e > s) {
                const parsed = JSON.parse(buf.slice(s, e + 1));
                if (Array.isArray(parsed?.items))
                    items = parsed.items;
            }
        }
        catch { }
        items = (items || []).slice(0, 5).filter((i) => i?.name).map((i) => ({
            name: String(i.name),
            industry: i.industry || null,
            website: i.website || null,
            confidence: typeof i.confidence === 'number' ? i.confidence : null,
        }));
        return res.status(200).json({ items, term });
    }
    catch (err) {
        console.error('companies/resolve error', err);
        return res.status(500).json({ code: 'internal_error', message: err?.message || 'Internal error', error: err?.message || 'Internal error' });
    }
}
