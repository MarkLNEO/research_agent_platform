import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
export const config = { runtime: 'nodejs' };
export default async function handler(req, res) {
    if (req.method === 'OPTIONS')
        return res.status(200).end();
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'Method not allowed' });
    try {
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_KEY)
            return res.status(500).json({ error: 'Missing environment variables' });
        const { research_markdown, company, role = 'CISO' } = req.body || {};
        if (!research_markdown)
            return res.status(400).json({ error: 'research_markdown is required' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = String(req.headers.authorization || '').replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });
        const instructions = `Write a concise, personalized outreach email for a sales AE.
Use the research markdown to extract 1–2 specific hooks. Keep to 120–180 words.
Structure: subject line, greeting, 2 short paragraphs, 1 CTA, sign-off.
Tone: helpful, confident, specific. Avoid fluff.`;
        const input = `COMPANY: ${company || 'Target Account'}\nTARGET ROLE: ${role}\n\nRESEARCH:\n---\n${research_markdown}\n---`;
        const stream = await openai.responses.stream({
            model: 'gpt-5-mini',
            instructions,
            input,
            text: { format: { type: 'text' }, verbosity: 'low' },
            store: false,
        });
        let email = '';
        for await (const event of stream) {
            if (event.type === 'response.output_text.delta' && event.delta) {
                email += event.delta;
            }
        }
        const final = await stream.finalResponse();
        if (!email) {
            try {
                email = final?.output_text
                    || (Array.isArray(final?.output)
                        ? final.output
                            .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
                            .filter((c) => typeof c?.text === 'string')
                            .map((c) => c.text)
                            .join('')
                        : '')
                    || String(final?.content || '');
            }
            catch {
                email = '';
            }
        }
        return res.status(200).json({ email });
    }
    catch (error) {
        console.error('outreach/draft error', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
