import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabaseEnvPath = path.join(__dirname, '../supabase/.env.local');

if (fs.existsSync(supabaseEnvPath)) {
  const envContents = fs.readFileSync(supabaseEnvPath, 'utf8');
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required to seed data.');
  process.exit(1);
}

if (!anonKey) {
  console.error('SUPABASE_ANON_KEY is required to verify seeded data.');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const userClient = createClient(supabaseUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USER_EMAIL = 'cliff.sales@windsurf.test';
const TEST_USER_PASSWORD = 'Agentic#2025';

async function ensureTestUser() {
  const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ email: TEST_USER_EMAIL });
  if (listError) {
    throw listError;
  }

  const existing = listData?.users?.find((user) => user.email?.toLowerCase() === TEST_USER_EMAIL.toLowerCase());
  if (existing) {
    return existing;
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: 'Cliff Sales',
      role: 'Account Executive',
      company: 'Windsurf AI',
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

async function seedCompanyProfile(userId) {
  const profile = {
    user_id: userId,
    company_name: 'Windsurf AI',
    company_url: 'https://windsurf.ai',
    user_role: 'Account Executive',
    use_case: 'Find expansion opportunities',
    industry: 'Cybersecurity',
    icp_definition: 'Mid-market technology companies with 200-2000 employees and active security initiatives',
    linkedin_url: 'https://www.linkedin.com/company/windsurf-ai',
    youtube_channel: 'https://www.youtube.com/@windsurf-ai',
    competitors: ['DriftWave', 'SailPoint Security', 'Nimbus Shield'],
    research_focus: ['leadership', 'funding', 'tech_stack'],
    onboarding_complete: true,
    onboarding_step: 9,
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminClient
    .from('company_profiles')
    .upsert(profile, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

async function seedCustomCriteria(userId) {
  await adminClient.from('user_custom_criteria').delete().eq('user_id', userId);

  const criteria = [
    {
      user_id: userId,
      field_name: 'Security Team Size',
      field_type: 'number',
      importance: 'critical',
      hints: ['Prioritize >5 dedicated security staff'],
      display_order: 1,
    },
    {
      user_id: userId,
      field_name: 'Primary Security Stack',
      field_type: 'text',
      importance: 'important',
      hints: ['Look for SIEM, SOAR, endpoint tools'],
      display_order: 2,
    },
    {
      user_id: userId,
      field_name: 'Compliance Requirements',
      field_type: 'list',
      importance: 'optional',
      hints: ['Note regulated industries and frameworks'],
      display_order: 3,
    },
  ];

  const { error } = await adminClient.from('user_custom_criteria').insert(criteria);
  if (error) {
    throw error;
  }
}

async function seedSignalPreferences(userId) {
  await adminClient.from('user_signal_preferences').delete().eq('user_id', userId);

  const prefs = [
    {
      user_id: userId,
      signal_type: 'security_breach',
      importance: 'critical',
      lookback_days: 60,
      config: { notify: true },
    },
    {
      user_id: userId,
      signal_type: 'funding_round',
      importance: 'important',
      lookback_days: 120,
      config: { min_amount: '20000000' },
    },
    {
      user_id: userId,
      signal_type: 'leadership_change',
      importance: 'important',
      lookback_days: 90,
      config: { titles: ['CISO', 'VP Security'] },
    },
  ];

  const { error } = await adminClient.from('user_signal_preferences').insert(prefs);
  if (error) {
    throw error;
  }
}

async function seedTrackedAccounts(userId) {
  const accounts = [
    {
      user_id: userId,
      company_name: 'SentinelWave',
      company_url: 'https://sentinelwave.com',
      industry: 'Fintech Security',
      employee_count: 450,
      last_researched_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      monitoring_enabled: true,
      icp_fit_score: 82,
      notes: 'High priority after SOC2 expansion',
    },
    {
      user_id: userId,
      company_name: 'Orion Analytics',
      company_url: 'https://orionanalytics.ai',
      industry: 'AI Analytics',
      employee_count: 620,
      last_researched_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      monitoring_enabled: true,
      icp_fit_score: 74,
      notes: 'Warm relationship via partner channel',
    },
    {
      user_id: userId,
      company_name: 'Northwind Maritime',
      company_url: 'https://northwindmaritime.com',
      industry: 'Maritime Logistics',
      employee_count: 1100,
      last_researched_at: null,
      monitoring_enabled: true,
      icp_fit_score: 68,
      notes: 'Newly sourced from conference',
    },
  ];

  const { error } = await adminClient
    .from('tracked_accounts')
    .upsert(accounts, { onConflict: 'user_id,company_name' });
  if (error) {
    throw error;
  }

  const { data, error: fetchError } = await adminClient
    .from('tracked_accounts')
    .select('id, company_name')
    .eq('user_id', userId);

  if (fetchError) {
    throw fetchError;
  }

  const idMap = new Map();
  for (const account of data || []) {
    idMap.set(account.company_name, account.id);
  }

  return idMap;
}

async function seedAccountSignals(userId, accountIds) {
  await adminClient.from('account_signals').delete().eq('user_id', userId);

  const today = new Date();
  const daysAgo = (n) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const signals = [
    {
      account_id: accountIds.get('SentinelWave'),
      user_id: userId,
      signal_type: 'security_breach',
      severity: 'critical',
      description: 'Reported credential stuffing incident impacting 12k users',
      signal_date: daysAgo(4),
      source_url: 'https://news.securitywire.com/sentinelwave-incident',
      importance: 'critical',
      score: 45,
      metadata: { confidence: 'high' },
    },
    {
      account_id: accountIds.get('SentinelWave'),
      user_id: userId,
      signal_type: 'funding_round',
      severity: 'high',
      description: 'Announced $40M Series C led by Vertex Capital',
      signal_date: daysAgo(12),
      source_url: 'https://techfinance.io/sentinelwave-series-c',
      importance: 'important',
      score: 30,
      metadata: { confidence: 'medium' },
    },
    {
      account_id: accountIds.get('Orion Analytics'),
      user_id: userId,
      signal_type: 'leadership_change',
      severity: 'high',
      description: 'Hired new VP of Security from Palo Alto Networks',
      signal_date: daysAgo(9),
      source_url: 'https://www.linkedin.com/posts/orion-analytics-new-vp',
      importance: 'important',
      score: 28,
      metadata: { confidence: 'high' },
    },
    {
      account_id: accountIds.get('Orion Analytics'),
      user_id: userId,
      signal_type: 'security_breach',
      severity: 'medium',
      description: 'Third-party vendor experienced API token leak',
      signal_date: daysAgo(27),
      source_url: 'https://cyberwatch.ai/orion-third-party-leak',
      importance: 'important',
      score: 18,
      metadata: { confidence: 'medium' },
    },
    {
      account_id: accountIds.get('Northwind Maritime'),
      user_id: userId,
      signal_type: 'hiring_surge',
      severity: 'medium',
      description: 'Posted 15 new cybersecurity openings across fleet operations',
      signal_date: daysAgo(6),
      source_url: 'https://jobs.northwindmaritime.com/security-openings',
      importance: 'nice_to_have',
      score: 12,
      metadata: { confidence: 'low' },
    },
  ].filter((signal) => signal.account_id);

  if (signals.length === 0) {
    console.warn('No account IDs resolved; skipping signal seed.');
    return;
  }

  const { error } = await adminClient.from('account_signals').insert(signals);
  if (error) {
    throw error;
  }
}

async function verifyDashboardData() {
  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (signInError) {
    throw signInError;
  }

  const accessToken = signInData.session?.access_token;
  if (!accessToken) {
    throw new Error('Failed to obtain access token for verification.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/dashboard-greeting`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dashboard greeting request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  console.log('\nDashboard greeting sample data:\n');
  console.log(JSON.stringify(json, null, 2));
}

(async () => {
  try {
    console.log('🔄 Seeding sample data for dashboard experience...');
    const user = await ensureTestUser();
    await seedCompanyProfile(user.id);
    await seedCustomCriteria(user.id);
    await seedSignalPreferences(user.id);
    const accountIds = await seedTrackedAccounts(user.id);
    await seedAccountSignals(user.id, accountIds);
    console.log('✅ Seed data inserted successfully.');

    console.log('🔍 Verifying populated dashboard response...');
    await verifyDashboardData();
    console.log('\n✅ Dashboard greeting endpoint returned populated data.');
  } catch (error) {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  } finally {
    adminClient.auth.signOut();
    userClient.auth.signOut();
  }
})();
