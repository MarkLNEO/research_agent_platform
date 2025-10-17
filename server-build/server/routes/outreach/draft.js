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
        const { research_markdown, company, role = 'CISO', recipient_name, recipient_title, generic = false, sender_override } = req.body || {};
        if (!research_markdown)
            return res.status(400).json({ error: 'research_markdown is required' });
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const token = String(req.headers.authorization || '').replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        // Fetch lightweight profile context for sender details
        const { data: profile } = await supabase
            .from('company_profiles')
            .select('company_name, user_role, metadata, target_titles')
            .eq('user_id', user.id)
            .maybeSingle();
        // Derive sender details (best-effort)
        const um = (user.user_metadata || {});
        const senderNameDefault = (profile?.metadata?.sender_name ||
            um.full_name || um.name || [um.first_name, um.last_name].filter(Boolean).join(' ') ||
            String(user.email || '').split('@')[0] || '').trim();
        const senderTitleDefault = (profile?.user_role || um.title || 'Account Executive').trim();
        const senderCompanyDefault = (profile?.company_name || um.company || '').trim();
        const signatureOverride = profile?.metadata && typeof profile.metadata?.email_signature === 'string'
            ? String(profile.metadata.email_signature)
            : null;
        const senderOverrideObject = sender_override && typeof sender_override === 'object' ? sender_override : null;
        const senderName = (senderOverrideObject?.name || senderNameDefault).trim();
        const senderTitle = (senderOverrideObject?.title || senderTitleDefault).trim();
        const senderCompany = (senderOverrideObject?.company || senderCompanyDefault).trim();
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY, project: process.env.OPENAI_PROJECT });
        // Resolve target role from user preferences (fallback to request or CISO)
        const profileTitles = Array.isArray(profile?.target_titles) ? profile.target_titles.filter((t) => typeof t === 'string' && t.trim()) : [];
        const providedRole = typeof recipient_title === 'string' ? recipient_title : '';
        const targetRole = providedRole || (typeof role === 'string' && role ? role : '') || (profileTitles[0] || 'CISO');
        // Attempt deterministic extraction of CISO name from the research markdown
        const buildRoleRegex = (roleLabel) => {
            const r = (roleLabel || '').trim();
            if (!r)
                return /(CISO|Chief\s+Information\s+Security\s+Officer)/i;
            const known = {
                'CISO': '(?:CISO|Chief\\s+Information\\s+Security\\s+Officer)',
                'CTO': '(?:CTO|Chief\\s+Technology\\s+Officer)',
                'CIO': '(?:CIO|Chief\\s+Information\\s+Officer)',
                'CEO': '(?:CEO|Chief\\s+Executive\\s+Officer)',
                'CFO': '(?:CFO|Chief\\s+Financial\\s+Officer)'
            };
            const key = r.toUpperCase();
            const pattern = known[key] || r.replace(/[-/\\^$*+?.()|[\]{}]/g, match => `\\${match}`);
            return new RegExp(pattern, 'i');
        };
        const extractContactNameByRole = (md, roleLabel) => {
            try {
                const text = String(md || '');
                if (!text)
                    return null;
                // Limit to Decision Makers/Key Contacts section if present
                const sectionMatch = text.match(/##\s*(Decision\s*Makers|Key\s*Contacts)[\s\S]*?(?=\n##\s+|$)/i);
                const scope = sectionMatch ? sectionMatch[0] : text;
                const cleaned = scope
                    .replace(/\*\*|__|\*|_/g, '')
                    .replace(/\r/g, '');
                const roleRe = buildRoleRegex(roleLabel);
                const patterns = [
                    // Bullet or dash format: - Name — CISO
                    new RegExp(String.raw `^[\t >\-•]*([A-Z][A-Za-z' .-]{1,60})\s*[—\-–]\s*(?:Global\s+)?${roleRe.source}\b`, 'im'),
                    // Name (CISO)
                    new RegExp(String.raw `(^|\n)\s*([A-Z][A-Za-z' .-]{1,60})\s*\(\s*${roleRe.source}\s*\)`, 'i'),
                    // Table format: | Name | CISO |
                    new RegExp(String.raw `\|\s*([A-Z][A-Za-z' .-]{1,60})\s*\|\s*[^|]*\b${roleRe.source}\b[^|]*\|`, 'i'),
                    // Comma format: Name, CISO
                    new RegExp(String.raw `(^|\n)\s*([A-Z][A-Za-z' .-]{1,60})\s*,\s*${roleRe.source}\b`, 'i')
                ];
                for (const re of patterns) {
                    const m = re.exec(cleaned);
                    if (m) {
                        const name = (m[1] || m[2] || '').trim();
                        if (name && /[A-Za-z]/.test(name))
                            return name;
                    }
                }
                return null;
            }
            catch {
                return null;
            }
        };
        const providedRecipient = typeof recipient_name === 'string' ? recipient_name.trim() : '';
        const recipientFullName = providedRecipient || (generic ? null : (research_markdown ? extractContactNameByRole(research_markdown, targetRole) : null));
        const recipientFirstName = recipientFullName ? recipientFullName.split(/\s+/)[0] : null;
        const instructions = `Write a concise, personalized outreach email for a sales AE.
Use the research markdown to extract 1–2 specific hooks. Keep to ~140–180 words.
Structure: subject line, greeting, 2 short paragraphs, 1 CTA, sign-off.
Tone: helpful, confident, specific. Avoid fluff.

Recipient name: If the research clearly identifies the ${targetRole} by name (e.g., under Decision Makers), greet them by first name. If RECIPIENT_NAME_HINT is provided, use it. If you aren't confident in the name, keep a bracket placeholder (e.g., "Hi [${targetRole} Name],"). Avoid generic "Hi ${targetRole}," if the name is unknown.
Generic outreach: If GENERIC_OUTREACH is yes, do not reference a specific person and use a team-level greeting instead (e.g., "Hi security team").
Signature: Prefer the provided sender name/title/company. If a custom signature template is provided, use it verbatim for the signature block. If any sender fields are missing, include bracket placeholders such as [Your Name], [Your Company], [Your Title].`;
        const input = `COMPANY: ${company || 'Target Account'}\nTARGET ROLE: ${targetRole}\nRECIPIENT_NAME_HINT: ${recipientFirstName || ''}\nGENERIC_OUTREACH: ${generic ? 'yes' : 'no'}\nSENDER_NAME: ${senderName || ''}\nSENDER_TITLE: ${senderTitle || ''}\nSENDER_COMPANY: ${senderCompany || ''}\nSIGNATURE_TEMPLATE: ${signatureOverride || ''}\n\nRESEARCH:\n---\n${research_markdown}\n---`;
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
        // Post-process: if we have a CISO name, replace common placeholders
        try {
            if (recipientFirstName && typeof email === 'string' && email && !generic) {
                const replacements = [
                    /\[CISO Name\]/gi,
                    /\[Security Leader Name\]/gi,
                    /\[Recipient Name\]/gi,
                    new RegExp(String.raw `\[${targetRole}\s*Name\]`, 'gi')
                ];
                for (const re of replacements) {
                    email = email.replace(re, recipientFirstName);
                }
            }
        }
        catch { }
        return res.status(200).json({ email });
    }
    catch (error) {
        console.error('outreach/draft error', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
}
