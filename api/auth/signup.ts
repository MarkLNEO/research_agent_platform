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

    // Look up by exact email reliably
    const adminAuth: any = (admin as any).auth.admin;
    let existingUser: any = undefined;
    if (typeof adminAuth.getUserByEmail === 'function') {
      const { data: byEmail } = await adminAuth.getUserByEmail(email);
      existingUser = byEmail?.user;
    } else {
      // Fallback for older SDKs: scan up to 1000 users on first page
      const { data: list } = await adminAuth.listUsers({ page: 1, perPage: 1000 });
      existingUser = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    }
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
      // Ensure existing user is confirmed and set password
      const confirmed = Boolean((existingUser as any)?.email_confirmed_at);
      const payload: any = { email_confirm: true };
      if (password) payload.password = password;
      if (!confirmed || password) {
        const { error: updErr } = await admin.auth.admin.updateUserById(existingUser.id, payload);
        if (updErr) return res.status(500).json({ error: String(updErr.message || updErr) });
      }
    }

    return res.status(200).json({ ok: true, created: !userExists });
  } catch (error: any) {
    console.error('auth/signup error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
