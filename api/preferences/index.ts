import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildResolvedPreferences,
  upsertPreferences,
  type PreferenceUpsert,
  type PreferenceRow,
} from '../../lib/preferences/store.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Authentication failed' });

    if (req.method === 'GET') {
      const [{ data: rows, error: prefError }, { data: promptConfig, error: configError }] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('user_prompt_config')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (prefError) throw prefError;
      if (configError) throw configError;

      const resolved = buildResolvedPreferences(promptConfig, rows as PreferenceRow[] || []);
      return res.status(200).json({
        preferences: rows || [],
        promptConfig: promptConfig || null,
        resolved,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const preferences = Array.isArray(body.preferences) ? (body.preferences as PreferenceUpsert[]) : null;
      if (!preferences || preferences.length === 0) {
        return res.status(400).json({ error: 'preferences array is required' });
      }

      await upsertPreferences(user.id, preferences, supabase);

      const [{ data: rows, error: prefError }, { data: promptConfig, error: configError }] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('user_prompt_config')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (prefError) throw prefError;
      if (configError) throw configError;

      const resolved = buildResolvedPreferences(promptConfig, rows as PreferenceRow[] || []);
      return res.status(200).json({
        preferences: rows || [],
        resolved,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[preferences] api error', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
