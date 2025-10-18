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

    if (!domain) {
      return res.status(200).json({ contacts: [], message: 'No domain provided' });
    }

    if (!HUNTER_API_KEY) {
      return res.status(200).json({ contacts: [], message: 'No provider key configured' });
    }

    const out: Array<{ name: string; title?: string; email?: string; confidence?: number; linkedin_url?: string | null }> = [];

    // Try direct name-based enrichment first (email-finder)
    for (const n of names) {
      const parts = String(n.name || '').trim().split(/\s+/);
      if (parts.length < 2) continue;
      const [first_name, ...rest] = parts;
      const last_name = rest.pop();
      if (!first_name || !last_name) continue;
      try {
        const url = new URL('https://api.hunter.io/v2/email-finder');
        url.searchParams.set('domain', domain);
        url.searchParams.set('first_name', first_name);
        url.searchParams.set('last_name', last_name);
        url.searchParams.set('api_key', HUNTER_API_KEY);
        const r = await fetch(url.toString());
        if (!r.ok) throw new Error(`hunter finder ${r.status}`);
        const j: any = await r.json();
        const email = j?.data?.email || null;
        const confidence = j?.data?.score || null;
        out.push({ name: n.name, title: n.title, email: email || undefined, confidence: confidence || undefined, linkedin_url: null });
      } catch {
        out.push({ name: n.name, title: n.title, linkedin_url: null });
      }
    }

    return res.status(200).json({ contacts: out });
  } catch (e: any) {
    console.error('contacts error', e);
    return res.status(500).json({ code: 'internal_error', message: e?.message || 'Internal error' });
  }
}

