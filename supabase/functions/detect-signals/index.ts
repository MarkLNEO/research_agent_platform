import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { DetectorResult, SignalPreference, SignalDetector } from "./types.ts";
import securityBreachDetector from "./detectors/security-breach.ts";
import leadershipChangeDetector from "./detectors/leadership-change.ts";
import fundingRoundDetector from "./detectors/funding-round.ts";
import hiringSurgeDetector from "./detectors/hiring-surge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DETECTORS: SignalDetector[] = [
  securityBreachDetector,
  leadershipChangeDetector,
  fundingRoundDetector,
  hiringSurgeDetector,
];

async function runDetectorsForAccount(
  supabase: ReturnType<typeof createClient>,
  account: { id: string; user_id: string; company_name: string; company_url?: string },
  preferences: SignalPreference[],
  openaiKey: string,
) {
  const allSignals: any[] = [];
  const activityLogs: any[] = [];

  for (const detector of DETECTORS) {
    const prefSubset = detector.filterPreferences(preferences);
    if (prefSubset.length === 0) {
      activityLogs.push({
        detector: detector.id,
        status: 'noop',
        details: { reason: 'no_preferences' },
        detected_signals: 0,
      });
      continue;
    }

    let result: DetectorResult;
    try {
      result = await detector.run({
        account,
        preferences: prefSubset,
        openaiKey,
      });
    } catch (error) {
      activityLogs.push({
        detector: detector.id,
        status: 'error',
        details: { message: String(error) },
        detected_signals: 0,
      });
      continue;
    }

    activityLogs.push({
      detector: detector.id,
      status: result.status,
      details: result.error ? { error: result.error } : {},
      detected_signals: result.signals.length,
    });

    if (result.status === 'success' && result.signals.length > 0) {
      for (const signal of result.signals) {
        const preference = prefSubset.find((pref) => pref.signal_type === signal.signal_type) ?? prefSubset[0];
        allSignals.push({
          account_id: account.id,
          user_id: account.user_id,
          signal_type: signal.signal_type,
          severity: signal.severity,
          description: signal.description,
          signal_date: signal.signal_date,
          source_url: signal.source_url,
          importance: preference.importance,
          score: signal.score,
          detection_source: detector.id,
          raw_payload: signal.raw_payload ?? {},
          metadata: {
            confidence: signal.confidence,
            detected_at: new Date().toISOString(),
            detector: detector.id,
          },
        });
      }
    }
  }

  if (activityLogs.length > 0) {
    const logRows = activityLogs.map((log) => ({
      user_id: account.user_id,
      account_id: account.id,
      signal_type: log.detector,
      detector: log.detector,
      status: log.status,
      details: log.details,
      detected_signals: log.detected_signals,
    }));
    const { error: logError } = await supabase.from('signal_activity_log').insert(logRows);
    if (logError) {
      console.error('Failed to insert signal_activity_log rows:', logError);
    }
  }

  if (allSignals.length > 0) {
    const { error: insertError } = await supabase.from('account_signals').insert(allSignals);
    if (insertError) {
      console.error('Failed to insert account_signals rows:', insertError);
    }
  }

  return allSignals.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .gt('credits_remaining', 0);

    if (usersError) throw usersError;

    let totalSignals = 0;
    let totalAccounts = 0;

    for (const user of users ?? []) {
      const { data: signalPrefs, error: prefError } = await supabase
        .from('user_signal_preferences')
        .select('*')
        .eq('user_id', user.id);

      if (prefError) {
        console.error('Failed to load preferences for user', user.id, prefError);
        continue;
      }
      if (!signalPrefs || signalPrefs.length === 0) continue;

      const { data: accounts, error: accountError } = await supabase
        .from('tracked_accounts')
        .select('id, user_id, company_name, company_url')
        .eq('user_id', user.id)
        .eq('monitoring_enabled', true);

      if (accountError) {
        console.error('Failed to load accounts for user', user.id, accountError);
        continue;
      }
      if (!accounts || accounts.length === 0) continue;

      for (const account of accounts) {
        try {
          const inserted = await runDetectorsForAccount(supabase, account, signalPrefs, openaiKey);
          totalSignals += inserted;
          totalAccounts++;
        } catch (error) {
          console.error('Detector error for account', account.id, error);
        }
      }
    }

    const summary = {
      success: true,
      users_processed: users?.length ?? 0,
      accounts_processed: totalAccounts,
      signals_detected: totalSignals,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error in detect-signals function:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error?.message || error) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
