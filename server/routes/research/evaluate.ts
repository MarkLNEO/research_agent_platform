import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { assertEmailAllowed } from '../_lib/access.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables' });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }

    const { research_id, markdown } = req.body || {};
    if (!research_id && !markdown) return res.status(400).json({ error: 'research_id or markdown is required' });

    let content = markdown as string;
    if (!content && research_id) {
      const { data } = await supabase
        .from('research_outputs')
        .select('markdown_report')
        .eq('id', research_id)
        .eq('user_id', user.id)
        .maybeSingle();
      content = data?.markdown_report || '';
    }
    if (!content) return res.status(400).json({ error: 'No content to evaluate' });

    const { data: criteria } = await supabase
      .from('user_custom_criteria')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order');

    const list = (criteria || []).map((c) => ({
      id: c.id,
      name: c.field_name,
      type: c.field_type,
      importance: c.importance,
      hints: c.hints || [],
    }));

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const instructions = `You are a precise evaluator. Given the user's research markdown and their custom qualifying criteria, evaluate each criterion and return strict JSON.
Return an array of objects with keys: id, name, status (met|not_met|unknown), value, confidence (low|medium|high), explanation, source (URL if available).
Use only information from the research content; if missing, set status=unknown. Infer values conservatively and include a short explanation.`;

    const prompt = [
      `CUSTOM CRITERIA:`,
      JSON.stringify(list, null, 2),
      `\nRESEARCH CONTENT (Markdown):\n---\n${content}\n---`,
      `\nRespond with JSON array only.`
    ].join('\n');

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

    if (!jsonText) {
      const final: any = await stream.finalResponse();
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
    } else {
      await stream.finalResponse();
    }

    let assessment: any[] = [];
    try {
      assessment = JSON.parse(jsonText || '[]');
      if (!Array.isArray(assessment)) assessment = [];
    } catch {
      assessment = [];
    }

    if (research_id && assessment.length) {
      await supabase
        .from('research_outputs')
        .update({ custom_criteria_assessment: assessment })
        .eq('id', research_id)
        .eq('user_id', user.id);
    }

    return res.status(200).json({ assessment });
  } catch (error: any) {
    console.error('evaluate error', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
