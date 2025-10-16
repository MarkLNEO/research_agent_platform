import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Missing environment variables' });

    const { research_markdown, company, role = 'CISO' } = req.body || {};
    if (!research_markdown) return res.status(400).json({ error: 'research_markdown is required' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = String(req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch lightweight profile context for sender details
    const { data: profile } = await supabase
      .from('company_profiles')
      .select('company_name, user_role, metadata')
      .eq('user_id', user.id)
      .maybeSingle();

    // Derive sender details (best-effort)
    const um = (user.user_metadata || {}) as any;
    const senderName = (
      (profile as any)?.metadata?.sender_name ||
      um.full_name || um.name || [um.first_name, um.last_name].filter(Boolean).join(' ') ||
      String(user.email || '').split('@')[0] || ''
    ).trim();
    const senderTitle = (profile?.user_role || um.title || 'Account Executive').trim();
    const senderCompany = (profile?.company_name || um.company || '').trim();
    const signatureOverride = profile?.metadata && typeof (profile as any).metadata?.email_signature === 'string'
      ? String((profile as any).metadata.email_signature)
      : null;

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });

    // Attempt deterministic extraction of CISO name from the research markdown
    const extractCisoName = (md: string): string | null => {
      try {
        const text = String(md || '');
        if (!text) return null;
        // Limit to Decision Makers/Key Contacts section if present
        const sectionMatch = text.match(/##\s*(Decision\s*Makers|Key\s*Contacts)[\s\S]*?(?=\n##\s+|$)/i);
        const scope = sectionMatch ? sectionMatch[0] : text;
        const cleaned = scope
          .replace(/\*\*|__|\*|_/g, '')
          .replace(/\r/g, '');

        const patterns: RegExp[] = [
          // Bullet or dash format: - Name — CISO
          /^[\t >\-•]*([A-Z][A-Za-z' .-]{1,60})\s*[—\-–]\s*(?:Global\s+)?(?:Chief\s+Information\s+Security\s+Officer|CISO)\b/im,
          // Name (CISO)
          /(^|\n)\s*([A-Z][A-Za-z' .-]{1,60})\s*\((?:Chief\s+Information\s+Security\s+Officer|CISO)\)/i,
          // Table format: | Name | CISO |
          /\|\s*([A-Z][A-Za-z' .-]{1,60})\s*\|\s*[^|]*\b(CISO|Chief\s+Information\s+Security\s+Officer)\b[^|]*\|/i,
          // Comma format: Name, CISO
          /(^|\n)\s*([A-Z][A-Za-z' .-]{1,60})\s*,\s*(?:Chief\s+Information\s+Security\s+Officer|CISO)\b/i
        ];

        for (const re of patterns) {
          const m = re.exec(cleaned);
          if (m) {
            const name = (m[1] || m[2] || '').trim();
            if (name && /[A-Za-z]/.test(name)) return name;
          }
        }
        return null;
      } catch {
        return null;
      }
    };
    const cisoFullName = research_markdown ? extractCisoName(research_markdown) : null;
    const cisoFirstName = cisoFullName ? cisoFullName.split(/\s+/)[0] : null;
    const instructions = `Write a concise, personalized outreach email for a sales AE.
Use the research markdown to extract 1–2 specific hooks. Keep to ~140–180 words.
Structure: subject line, greeting, 2 short paragraphs, 1 CTA, sign-off.
Tone: helpful, confident, specific. Avoid fluff.

Recipient name: If the research clearly identifies the ${role} by name (e.g., under Decision Makers), greet them by first name. If RECIPIENT_NAME_HINT is provided, use it. If you aren't confident in the name, keep a bracket placeholder (e.g., "Hi [${role} Name],"). Avoid generic "Hi ${role}," if the name is unknown.
Signature: Prefer the provided sender name/title/company. If a custom signature template is provided, use it verbatim for the signature block. If any sender fields are missing, include bracket placeholders such as [Your Name], [Your Company], [Your Title].`;

    const input = `COMPANY: ${company || 'Target Account'}\nTARGET ROLE: ${role}\nRECIPIENT_NAME_HINT: ${cisoFirstName || ''}\nSENDER_NAME: ${senderName || ''}\nSENDER_TITLE: ${senderTitle || ''}\nSENDER_COMPANY: ${senderCompany || ''}\nSIGNATURE_TEMPLATE: ${signatureOverride || ''}\n\nRESEARCH:\n---\n${research_markdown}\n---`;
    const stream = await openai.responses.stream({
      model: 'gpt-5-mini',
      instructions,
      input,
      text: { format: { type: 'text' }, verbosity: 'low' },
      store: false,
    });

    let email = '';
    for await (const event of stream as any) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        email += event.delta;
      }
    }

    const final: any = await stream.finalResponse();
    if (!email) {
      try {
        email = final?.output_text
          || (Array.isArray(final?.output)
            ? final.output
                .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
                .filter((c: any) => typeof c?.text === 'string')
                .map((c: any) => c.text)
                .join('')
            : '')
          || String(final?.content || '');
      } catch {
        email = '';
      }
    }

    // Post-process: if we have a CISO name, replace common placeholders
    try {
      if (cisoFirstName && typeof email === 'string' && email) {
        const replacements = [
          /\[CISO Name\]/gi,
          /\[Security Leader Name\]/gi,
          /\[Recipient Name\]/gi,
          /\[${role}\s*Name\]/gi
        ];
        for (const re of replacements) {
          email = email.replace(re, cisoFirstName);
        }
      }
    } catch {}

    return res.status(200).json({ email });
  } catch (error: any) {
    console.error('outreach/draft error', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
