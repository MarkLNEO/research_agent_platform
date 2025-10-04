import { supabase } from '../lib/supabase';

export interface TrackedAccount {
  id: string;
  user_id: string;
  company_name: string;
  company_url?: string;
  industry?: string;
  employee_count?: number;
  added_at: string;
  last_researched_at?: string;
  monitoring_enabled: boolean;
  latest_research_id?: string;
  icp_fit_score?: number;
  signal_score: number;
  priority: 'hot' | 'warm' | 'standard';
  last_contacted_at?: string;
  notes?: string;
  updated_at: string;
}

export interface AccountSignal {
  id: string;
  account_id: string;
  signal_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  signal_date: string;
  source_url?: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  score: number;
  viewed: boolean;
  viewed_at?: string;
  dismissed: boolean;
  dismissed_at?: string;
  detected_at: string;
}

export interface AccountStats {
  total: number;
  hot: number;
  warm: number;
  standard: number;
  with_signals: number;
  stale: number;
}

export interface DashboardGreeting {
  greeting: {
    time_of_day: string;
    user_name: string;
  };
  signals: Array<{
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
  }>;
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

/**
 * Fetch dashboard greeting with signals and account stats
 */
export async function fetchDashboardGreeting(): Promise<DashboardGreeting> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-greeting`,
    {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch dashboard data');
  }

  return await response.json();
}

/**
 * Add a single tracked account
 */
export async function addTrackedAccount(
  companyName: string,
  companyUrl?: string,
  industry?: string,
  employeeCount?: number
): Promise<TrackedAccount> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-accounts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'add',
        company_name: companyName,
        company_url: companyUrl,
        industry,
        employee_count: employeeCount,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add account');
  }

  const result = await response.json();
  return result.account;
}

/**
 * Add multiple accounts (bulk upload)
 */
export async function bulkAddAccounts(
  accounts: Array<{
    company_name: string;
    company_url?: string;
    industry?: string;
    employee_count?: number;
  }>
): Promise<{
  added: TrackedAccount[];
  skipped: string[];
  errors: string[];
  summary: {
    added: number;
    skipped: number;
    errors: number;
  };
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-accounts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'bulk_add',
        accounts,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add accounts');
  }

  return await response.json();
}

/**
 * List tracked accounts with optional filter
 */
export async function listTrackedAccounts(
  filter?: 'all' | 'hot' | 'warm' | 'stale'
): Promise<{
  accounts: TrackedAccount[];
  stats: AccountStats;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-accounts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'list',
        filter,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list accounts');
  }

  return await response.json();
}

/**
 * Update tracked account
 */
export async function updateTrackedAccount(
  accountId: string,
  updates: {
    notes?: string;
    last_contacted_at?: string;
    monitoring_enabled?: boolean;
  }
): Promise<TrackedAccount> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-accounts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update',
        account_id: accountId,
        updates,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update account');
  }

  const result = await response.json();
  return result.account;
}

/**
 * Delete tracked account
 */
export async function deleteTrackedAccount(accountId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-accounts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        account_id: accountId,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete account');
  }
}

/**
 * Mark signal as viewed
 */
export async function markSignalViewed(signalId: string): Promise<void> {
  const { error } = await supabase
    .from('account_signals')
    .update({ viewed: true, viewed_at: new Date().toISOString() })
    .eq('id', signalId);

  if (error) throw error;
}

/**
 * Dismiss signal
 */
export async function dismissSignal(signalId: string): Promise<void> {
  const { error } = await supabase
    .from('account_signals')
    .update({ dismissed: true, dismissed_at: new Date().toISOString() })
    .eq('id', signalId);

  if (error) throw error;
}

/**
 * Parse CSV file for bulk account upload
 */
export function parseAccountsCSV(csvText: string): Array<{
  company_name: string;
  company_url?: string;
  industry?: string;
  employee_count?: number;
}> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header row and at least one data row');
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const companyNameIdx = header.findIndex(h => h.includes('company') || h.includes('name'));
  const companyUrlIdx = header.findIndex(h => h.includes('url') || h.includes('website'));
  const industryIdx = header.findIndex(h => h.includes('industry'));
  const employeeCountIdx = header.findIndex(h => h.includes('employee') || h.includes('size'));

  if (companyNameIdx === -1) {
    throw new Error('CSV must have a "company name" or "name" column');
  }

  // Parse data rows
  const accounts = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length === 0 || !values[companyNameIdx]) continue;

    accounts.push({
      company_name: values[companyNameIdx],
      company_url: companyUrlIdx !== -1 ? values[companyUrlIdx] : undefined,
      industry: industryIdx !== -1 ? values[industryIdx] : undefined,
      employee_count: employeeCountIdx !== -1 ? parseInt(values[employeeCountIdx]) : undefined,
    });
  }

  return accounts;
}
