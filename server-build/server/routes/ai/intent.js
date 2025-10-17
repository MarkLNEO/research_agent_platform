import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { assertEmailAllowed } from '../_lib/access.js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return res.status(401).json({ error: 'Authorization header required' });
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY)
            return res.status(500).json({ error: 'Server not configured' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user)
            return res.status(401).json({ error: 'Authentication failed' });
        try {
            assertEmailAllowed(user.email);
        }
        catch (e) {
            return res.status(e.statusCode || 403).json({ error: e.message });
        }
        const { text, active_subject } = req.body || {};
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'text is required' });
        }
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });
        const instructions = [
            'You classify short user queries for a sales research assistant.',
            'Return ONLY compact JSON: {"intent":"research|follow_up|compare|summarize|outreach|other","subject":"<company?>","confidence_intent":0-1,"confidence_subject":0-1}.',
            'If a company is not clearly specified, subject should be "".',
            'If an active subject is provided, prefer it when the query is a short WH question (<=120 chars).',
            'No commentary, no code fences.'
        ].join('\n');
        const input = `query: ${text}\nactive_subject: ${active_subject || ''}`;
        const stream = await openai.responses.stream({
            model: 'gpt-5-mini',
            instructions,
            input,
            text: { format: { type: 'text' }, verbosity: 'low' },
            store: false,
            metadata: { agent: 'classifier', route: 'ai/intent', user_id: user.id }
        });
        let buf = '';
        for await (const chunk of stream) {
            if (chunk.type === 'response.output_text.delta' && chunk.delta)
                buf += chunk.delta;
        }
        try {
            await stream.finalResponse();
        }
        catch { }
        let parsed = null;
        try {
            const s = buf.indexOf('{');
            const e = buf.lastIndexOf('}');
            if (s >= 0 && e > s)
                parsed = JSON.parse(buf.slice(s, e + 1));
        }
        catch { }
        if (!parsed)
            parsed = { intent: 'other', subject: '', confidence_intent: 0.2, confidence_subject: 0 };
        return res.status(200).json(parsed);
    }
    catch (err) {
        console.error('ai/intent error', err);
        return res.status(500).json({ error: err?.message || 'Internal error' });
    }
}
