import { createClient } from '@supabase/supabase-js';
import { assertEmailAllowed } from '../_lib/access.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const SUPABASE_URL = process.env.SUPABASE_URL as string;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Authentication failed' });
    try { assertEmailAllowed(user.email); } catch (e: any) { return res.status(e.statusCode || 403).json({ error: e.message }); }

    // Load profile + counts
    const [profileResult, criteriaCountResult, signalPrefsCountResult, accountsResult] = await Promise.all([
      supabase.from('company_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_custom_criteria').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('user_signal_preferences').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('tracked_accounts')
        .select(`*, recent_signals:account_signals!account_signals_account_id_fkey(id, signal_type, severity, description, signal_date, source_url, score, viewed)`) 
        .eq('user_id', user.id)
        .gte('account_signals.signal_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('priority', { ascending: false })
    ]);

    const profile = profileResult.data;
    const criteriaCount = criteriaCountResult.count || 0;
    const signalPrefsCount = signalPrefsCountResult.count || 0;
    const accounts = accountsResult.data || [];

    // Stats
    const accountStats = {
      total: accounts.length,
      hot: accounts.filter((a: any) => a.priority === 'hot').length,
      warm: accounts.filter((a: any) => a.priority === 'warm').length,
      stale: accounts.filter((a: any) => {
        const d = a.last_researched_at ? new Date(a.last_researched_at).getTime() : 0;
        if (!d) return true;
        const days = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
        return days > 14;
      }).length,
      with_signals: 0,
    };

    // Signals
    const allSignals: any[] = [];
    for (const a of accounts) {
      const rs = Array.isArray((a as any).recent_signals) ? (a as any).recent_signals : [];
      const unviewed = rs.filter((s: any) => !s.viewed).map((s: any) => ({
        id: s.id,
        company_name: a.company_name,
        company_id: a.id,
        signal_type: s.signal_type,
        severity: s.severity,
        description: s.description,
        signal_date: s.signal_date,
        days_ago: Math.floor((Date.now() - new Date(s.signal_date).getTime()) / (1000 * 60 * 60 * 24)),
        source_url: s.source_url,
        score: s.score,
      }));
      if (unviewed.length) accountStats.with_signals++;
      allSignals.push(...unviewed);
    }

    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    allSignals.sort((a, b) => (severityOrder[a.severity] - severityOrder[b.severity]) || (a.days_ago - b.days_ago));
    const topSignals = allSignals.slice(0, 5);

    // Suggestions
    const suggestions: string[] = [];
    if (topSignals.length) {
      suggestions.push('Which of my accounts had changes this week?');
      suggestions.push(`Research ${topSignals[0].company_name} and show me what changed`);
    }
    if (accountStats.stale > 0) suggestions.push("Which accounts haven't been updated in 2+ weeks?");
    if (accountStats.total >= 5) suggestions.push('Research my top 5 accounts and summarize findings');
    if (suggestions.length < 3) {
      if (accountStats.total > 0) suggestions.push('Tell me about my account portfolio');
      suggestions.push('What can you help me with?');
    }

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const firstName = user.user_metadata?.name?.split(' ')[0] || (user.email?.split('@')[0] ?? 'there');

    let profileHealth = 0;
    if (profile?.user_role) profileHealth += 10;
    if (profile?.industry) profileHealth += 10;
    if (profile?.icp_definition) profileHealth += 10;
    if (criteriaCount > 0) profileHealth += 30;
    if (signalPrefsCount > 0) profileHealth += 30;
    if (accountStats.total > 0) profileHealth += 10;

    const body = {
      greeting: { time_of_day: timeOfDay, user_name: firstName },
      signals: topSignals,
      account_stats: accountStats,
      suggestions: suggestions.slice(0, 3),
      user_context: {
        first_name: firstName,
        role: profile?.user_role,
        industry: profile?.industry,
        accounts_configured: accountStats.total > 0,
        signals_configured: signalPrefsCount > 0,
        custom_criteria_configured: criteriaCount > 0,
        profile_health: profileHealth,
      },
    };

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(body);
  } catch (error: any) {
    console.error('dashboard/greeting error', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
