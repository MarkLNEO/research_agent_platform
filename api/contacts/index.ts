import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' } as const;

type ContactRequest = {
  domain?: string;
  company?: string;
  names?: Array<{ name: string; title?: string }>;
  limit?: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed', message: 'Method not allowed' });

  try {
    const body = (req.body || {}) as ContactRequest;
    const domain = (body.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const names = Array.isArray(body.names) ? body.names.slice(0, body.limit || 8) : [];
    const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
    const VERIFY_URL = process.env.VERIFY_EMAIL_URL || 'https://rapid-email-verifier.fly.dev/api/validate';
    const ENABLE_VERIFY = (process.env.ENABLE_EMAIL_VERIFIER || 'true').toLowerCase() !== 'false';

    if (!domain) {
      return res.status(200).json({ contacts: [], message: 'No domain provided' });
    }

    const out: Array<{ name: string; title?: string; email?: string; confidence?: number; linkedin_url?: string | null; verification?: { status?: string; valid?: boolean } }> = [];

    async function verifyEmail(email: string): Promise<{ valid: boolean; status: string }> {
      if (!ENABLE_VERIFY || !email) return { valid: false, status: 'skipped' };
      try {
        const url = new URL(VERIFY_URL);
        url.searchParams.set('email', email);
        const r = await fetch(url.toString(), { method: 'GET' });
        const j: any = await r.json().catch(() => ({}));
        const status = String(j?.status || j?.result || j?.message || (j?.valid ? 'valid' : 'unknown'));
        const score = Number(j?.score || j?.confidence || (status === 'valid' ? 100 : 0));
        const valid = Boolean(j?.valid === true || /^(valid|deliverable|ok)$/i.test(status) || score >= 100);
        return { valid, status };
      } catch {
        return { valid: false, status: 'error' };
      }
    }

    function buildPatterns(fullName: string, domainOnly: string): string[] {
      const raw = String(fullName || '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return [];
      const first = parts[0].toLowerCase().replace(/[^a-z]/g, '');
      const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
      const f = first[0] || '';
      const l = last[0] || '';
      const d = domainOnly.toLowerCase();
      const candidates = [
        `${first}.${last}@${d}`,
        `${f}${last}@${d}`,
        `${first}${l}@${d}`,
        `${first}_${last}@${d}`,
        `${first}-${last}@${d}`,
        `${first}@${d}`,
        `${last}@${d}`,
        `${f}.${last}@${d}`,
      ];
      // de-dup
      return Array.from(new Set(candidates));
    }

    // Enrichment strategy per contact: optional provider + pattern verification fallback
    for (const n of names) {
      const parts = String(n.name || '').trim().split(/\s+/);
      if (parts.length < 2) { out.push({ name: n.name, title: n.title, linkedin_url: null }); continue; }
      const [first_name, ...rest] = parts;
      const last_name = rest.pop();
      if (!first_name || !last_name) { out.push({ name: n.name, title: n.title, linkedin_url: null }); continue; }

      let resolved = false;
      // 1) Try provider if configured
      if (HUNTER_API_KEY) {
        try {
          const url = new URL('https://api.hunter.io/v2/email-finder');
          url.searchParams.set('domain', domain);
          url.searchParams.set('first_name', first_name);
          url.searchParams.set('last_name', last_name);
          url.searchParams.set('api_key', HUNTER_API_KEY);
          const r = await fetch(url.toString());
          if (r.ok) {
            const j: any = await r.json();
            const email = j?.data?.email || null;
            const confidence = j?.data?.score || null;
            if (email) {
              const verification = await verifyEmail(email);
              if (verification.valid) {
                out.push({ name: n.name, title: n.title, email, confidence: confidence || 100, linkedin_url: null, verification });
                resolved = true;
              }
            }
          }
        } catch {
          // provider error: fall through to patterns
        }
      }

      if (!resolved) {
        // 2) Pattern candidates validated by verifier
        const patterns = buildPatterns(n.name, domain);
        let found = false;
        for (const p of patterns) {
          const v = await verifyEmail(p);
          if (v.valid) {
            out.push({ name: n.name, title: n.title, email: p, confidence: 100, linkedin_url: null, verification: v });
            found = true;
            break;
          }
        }
        if (!found) out.push({ name: n.name, title: n.title, linkedin_url: null });
      }
    }

    return res.status(200).json({ contacts: out });
  } catch (e: any) {
    console.error('contacts error', e);
    return res.status(500).json({ code: 'internal_error', message: e?.message || 'Internal error' });
  }
}
