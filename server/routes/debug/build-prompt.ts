import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';
import { buildSystemPrompt, type AgentType } from '../_lib/systemPrompt.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Normal path: use user bearer token
    const authHeader = req.headers.authorization;
    let user: any = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data, error: authError } = await supabase.auth.getUser(token);
      if (authError || !data?.user) return res.status(401).json({ error: 'Authentication failed' });
      user = data.user;
      try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }
    } else if (process.env.NODE_ENV !== 'production') {
      // Test path: allow specifying user by email or fallback to first user
      const { data: userList } = await supabase.auth.admin.listUsers();
      const adminUsers = (userList?.users ?? []) as any[];
      let match = null as any;
      if (req.body?.test_user_email) {
        const target = String(req.body.test_user_email).toLowerCase();
        match = adminUsers.find(u => (u?.email || '').toLowerCase() === target) || null;
      }
      user = match || adminUsers[0] || null;
      if (!user) return res.status(400).json({ error: 'No users found for test mode' });
    } else {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const agentType = ((req.body && req.body.agentType) || 'company_research') as AgentType;
    const researchType = (req.body && req.body.research_type) as ('quick'|'deep'|'specific'|undefined);

    const [profileResult, criteriaResult, signalsResult, disqualifiersResult, promptCfgResult, reportPrefsResult] = await Promise.all([
      supabase.from('company_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_custom_criteria').select('*').eq('user_id', user.id).order('display_order'),
      supabase.from('user_signal_preferences').select('*').eq('user_id', user.id),
      supabase.from('user_disqualifying_criteria').select('*').eq('user_id', user.id),
      supabase.from('user_prompt_config').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_report_preferences').select('*').eq('user_id', user.id).eq('is_active', true),
    ]);

    const userContext = {
      profile: profileResult.data,
      customCriteria: criteriaResult.data || [],
      signals: signalsResult.data || [],
      disqualifiers: disqualifiersResult.data || [],
      promptConfig: promptCfgResult.data || null,
      reportPreferences: reportPrefsResult.data || [],
    };

    let prompt = buildSystemPrompt(userContext as any, agentType, researchType);
    const guard = (promptCfgResult.data as any)?.guardrail_profile;
    if (guard) prompt += `\n\n<guardrails>Use guardrail profile: ${guard}. Respect source allowlists and safety constraints.</guardrails>`;

    return res.status(200).json({ prompt_head: prompt.slice(0, 1200) });
  } catch (error: any) {
    console.error('debug/build-prompt error', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
