import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) return res.status(500).json({ error: 'Missing environment variables' });

    const { text } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });
    const instructions = `Extract a SIGNAL PREFERENCE from the natural language. Return strict JSON:
{
  "signal_type": "security_breach|leadership_change|funding_round|hiring_surge|product_launch|custom_keyword",
  "importance": "critical|important|nice_to_have",
  "lookback_days": number (7..365),
  "config": { "industryFilter"?: string, "keywords"?: string[] }
}
If custom, set signal_type to "custom_keyword" and include keywords.`;

    const prompt = `TEXT:\n${text}\n\nJSON ONLY`;
    const stream = await openai.responses.stream({
      model: 'gpt-5-mini',
      instructions,
      input: prompt,
      text: { format: { type: 'text' }, verbosity: 'low' },
      store: false,
    });

    let jsonText = '';
    for await (const event of stream as any) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        jsonText += event.delta;
      }
    }

    const final: any = await stream.finalResponse();
    if (!jsonText) {
      try {
        jsonText = final?.output_text
          || (Array.isArray(final?.output)
            ? final.output
                .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
                .filter((c: any) => typeof c?.text === 'string')
                .map((c: any) => c.text)
                .join('')
            : '')
          || String(final?.content || '');
      } catch {
        jsonText = '';
      }
    }

    let extracted: any = {};
    try { extracted = JSON.parse(jsonText || '{}'); } catch {}

    // Do not auto-save here; let client confirm. Just return the extraction.
    return res.status(200).json({ preference: extracted });
  } catch (error: any) {
    console.error('signals/extract error', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
