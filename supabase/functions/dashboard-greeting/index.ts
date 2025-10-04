import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Signal {
  id: string;
  company_name: string;
  company_id: string;
  signal_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  signal_date: string;
  days_ago: number;
  source_url?: string;
  score: number;
}

interface AccountStats {
  total: number;
  hot: number;
  warm: number;
  stale: number;
  with_signals: number;
}

interface DashboardData {
  greeting: {
    time_of_day: string;
    user_name: string;
  };
  signals: Signal[];
  account_stats: AccountStats;
  suggestions: string[];
  user_context: {
    first_name: string;
    role?: string;
    industry?: string;
    accounts_configured: boolean;
    signals_configured: boolean;
    custom_criteria_configured: boolean;
    profile_health: number;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Authentication failed");

    // Get user profile
    const { data: profile } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get custom criteria count
    const { count: criteriaCount } = await supabase
      .from('user_custom_criteria')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get signal preferences count
    const { count: signalPrefsCount } = await supabase
      .from('user_signal_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get tracked accounts with signals
    const { data: accounts } = await supabase
      .from('tracked_accounts')
      .select(`
        *,
        recent_signals:account_signals!account_signals_account_id_fkey(
          id,
          signal_type,
          severity,
          description,
          signal_date,
          source_url,
          score,
          viewed
        )
      `)
      .eq('user_id', user.id)
      .gte('account_signals.signal_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('priority', { ascending: false });

    // Calculate account statistics
    const accountStats: AccountStats = {
      total: accounts?.length || 0,
      hot: accounts?.filter(a => a.priority === 'hot').length || 0,
      warm: accounts?.filter(a => a.priority === 'warm').length || 0,
      stale: accounts?.filter(a => {
        if (!a.last_researched_at) return true;
        const daysSince = Math.floor((Date.now() - new Date(a.last_researched_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince > 14;
      }).length || 0,
      with_signals: 0,
    };

    // Extract all signals from accounts
    const allSignals: Signal[] = [];
    for (const account of accounts || []) {
      if (account.recent_signals && Array.isArray(account.recent_signals)) {
        const accountSignals = account.recent_signals
          .filter((s: any) => !s.viewed)
          .map((s: any) => ({
            id: s.id,
            company_name: account.company_name,
            company_id: account.id,
            signal_type: s.signal_type,
            severity: s.severity,
            description: s.description,
            signal_date: s.signal_date,
            days_ago: Math.floor((Date.now() - new Date(s.signal_date).getTime()) / (1000 * 60 * 60 * 24)),
            source_url: s.source_url,
            score: s.score,
          }));
        allSignals.push(...accountSignals);
        
        if (accountSignals.length > 0) {
          accountStats.with_signals++;
        }
      }
    }

    // Sort signals by severity and recency
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    allSignals.sort((a, b) => {
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return a.days_ago - b.days_ago;
    });

    // Take top 5 most important signals
    const topSignals = allSignals.slice(0, 5);

    // Generate smart suggestions based on context
    const suggestions: string[] = [];
    
    if (topSignals.length > 0) {
      suggestions.push(`Which of my accounts had changes this week?`);
      suggestions.push(`Research ${topSignals[0].company_name} and show me what changed`);
    }
    
    if (accountStats.stale > 0) {
      suggestions.push(`Which accounts haven't been updated in 2+ weeks?`);
    }
    
    if (accountStats.total >= 5) {
      suggestions.push(`Research my top 5 accounts and summarize findings`);
    } else if (accountStats.total === 0) {
      suggestions.push(`Research Boeing`);
      suggestions.push(`Find companies like Stripe`);
    }
    
    if (profile?.industry && accountStats.total > 0) {
      suggestions.push(`Show me all accounts with security incidents`);
    }

    // Default suggestions
    if (suggestions.length < 3) {
      if (accountStats.total > 0) {
        suggestions.push(`Tell me about my account portfolio`);
      }
      suggestions.push(`What can you help me with?`);
    }

    // Determine time of day
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

    // Extract first name from email or name
    let firstName = 'there';
    if (user.user_metadata?.name) {
      firstName = user.user_metadata.name.split(' ')[0];
    } else if (user.email) {
      firstName = user.email.split('@')[0];
    }

    // Calculate profile health
    let profileHealth = 0;
    if (profile?.user_role) profileHealth += 10;
    if (profile?.industry) profileHealth += 10;
    if (profile?.icp_definition) profileHealth += 10;
    if ((criteriaCount || 0) > 0) profileHealth += 30;
    if ((signalPrefsCount || 0) > 0) profileHealth += 30;
    if (accountStats.total > 0) profileHealth += 10;

    const dashboardData: DashboardData = {
      greeting: {
        time_of_day: timeOfDay,
        user_name: firstName,
      },
      signals: topSignals,
      account_stats: accountStats,
      suggestions: suggestions.slice(0, 3),
      user_context: {
        first_name: firstName,
        role: profile?.user_role,
        industry: profile?.industry,
        accounts_configured: accountStats.total > 0,
        signals_configured: (signalPrefsCount || 0) > 0,
        custom_criteria_configured: (criteriaCount || 0) > 0,
        profile_health: profileHealth,
      },
    };

    return new Response(
      JSON.stringify(dashboardData),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in dashboard-greeting function:", error);
    return new Response(
      JSON.stringify({
        error: String(error?.message || error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
