import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../../server-build/server/routes/_lib/access.js';

export const config = { runtime: 'nodejs' } as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { name, email, password } = (req.body || {}) as { name?: string; email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    try { assertEmailAllowed(email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message || 'Unauthorized' }); }

    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // If user already exists, do not error — let client attempt sign in.
    const { data: existing } = await admin.auth.admin.listUsers({ email });
    const existingUser = existing?.users?.[0];
    const userExists = Boolean(existingUser);
    if (!userExists) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        user_metadata: { name },
        email_confirm: true,
      });
      if (createErr) return res.status(500).json({ error: String(createErr.message || createErr) });
    } else {
      // Ensure existing user is confirmed
      const confirmed = Boolean((existingUser as any)?.email_confirmed_at);
      if (!confirmed || password) {
        const { error: updErr } = await admin.auth.admin.updateUserById(existingUser.id, { email_confirm: true, password });
        if (updErr) return res.status(500).json({ error: String(updErr.message || updErr) });
      }
    }

    return res.status(200).json({ ok: true, created: !userExists });
  } catch (error: any) {
    console.error('auth/signup error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
