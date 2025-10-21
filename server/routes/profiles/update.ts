import { createClient } from '@supabase/supabase-js';
import { applySaveProfilePayloads } from '../_lib/profileSave.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
    const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY) as string;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
    const user = authData.user;

    const updateData = req.body || {};
    const payload = {
      action: 'save_profile' as const,
      profile: updateData.profile ?? null,
      custom_criteria: updateData.custom_criteria ?? null,
      signal_preferences: updateData.signal_preferences ?? null,
      disqualifying_criteria: updateData.disqualifying_criteria ?? null,
      prompt_config: updateData.prompt_config ?? null,
    };

    const result = await applySaveProfilePayloads(supabase, user.id, [payload]);

    return res.json({
      success: true,
      data: {
        profile: result.profile,
        custom_criteria: result.customCriteria,
        signal_preferences: result.signalPreferences,
        disqualifying_criteria: result.disqualifyingCriteria,
        prompt_config: result.promptConfig,
        summary: result.summary,
      },
    });
  } catch (error) {
    console.error('Error in update-profile:', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
