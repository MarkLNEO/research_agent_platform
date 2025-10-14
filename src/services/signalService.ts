import { supabase } from '../lib/supabase';

export interface UserSignalPreference {
  id?: string;
  signal_type: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  lookback_days: number;
  config: Record<string, any>;
}

export const BUILT_IN_SIGNALS: Array<{
  id: string;
  label: string;
  description: string;
  defaultImportance: 'critical' | 'important' | 'nice_to_have';
  defaultLookback: number;
}> = [
  {
    id: 'security_breach',
    label: 'Security Breach',
    description: 'Known incidents, ransomware, or public disclosures impacting security posture.',
    defaultImportance: 'critical',
    defaultLookback: 90,
  },
  {
    id: 'leadership_change',
    label: 'Leadership Change',
    description: 'Executive hires, departures, or board appointments relevant to your ICP.',
    defaultImportance: 'important',
    defaultLookback: 120,
  },
  {
    id: 'funding_round',
    label: 'Funding Round',
    description: 'Seed through late-stage fundraising events signalling new budget or initiatives.',
    defaultImportance: 'important',
    defaultLookback: 180,
  },
  {
    id: 'hiring_surge',
    label: 'Hiring Surge',
    description: 'Rapid hiring across target functions or geographies indicating expansion.',
    defaultImportance: 'nice_to_have',
    defaultLookback: 60,
  },
];

export async function listSignalPreferences(): Promise<UserSignalPreference[]> {
  const { data, error } = await supabase
    .from('user_signal_preferences')
    .select('*')
    .returns<UserSignalPreference[]>()
    .order('signal_type', { ascending: true });

  if (error) throw error;
  return (data ?? []) as UserSignalPreference[];
}

export async function upsertSignalPreference(pref: UserSignalPreference): Promise<void> {
  const { error } = await supabase
    .from('user_signal_preferences')
    .upsert({
      id: pref.id,
      signal_type: pref.signal_type,
      importance: pref.importance,
      lookback_days: pref.lookback_days,
      config: pref.config,
    });
  if (error) throw error;
}

export async function deleteSignalPreference(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_signal_preferences')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export interface AccountSignalSummary {
  id: string;
  account_id: string;
  company_name: string;
  signal_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  signal_date: string;
  source_url?: string;
  score: number;
  detected_at?: string;
  impact?: string;
  recommended_action?: string;
}

export async function listRecentSignals(limit = 10): Promise<AccountSignalSummary[]> {
  const { data, error } = await supabase
    .from('account_signals')
    .select(
      `id, account_id, signal_type, severity, description, signal_date, source_url, score, metadata, detected_at,
       tracked_accounts:tracked_accounts!account_signals_account_id_fkey ( company_name )`
    )
    .order('signal_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    account_id: row.account_id,
    company_name: row.tracked_accounts?.company_name || 'Unknown Account',
    signal_type: row.signal_type,
    severity: row.severity,
    description: row.description,
    signal_date: row.signal_date,
    source_url: row.source_url,
    score: row.score,
    detected_at: row.detected_at,
    impact: row.metadata?.impact,
    recommended_action: row.metadata?.recommended_action,
  }));
}
