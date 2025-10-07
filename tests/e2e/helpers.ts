import 'dotenv/config';
import { expect, Page } from '@playwright/test';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service) throw new Error('Missing SUPABASE envs for tests');
  return createClient(url, service);
}

async function getTestUserId(email: string) {
  const admin = await getAdmin();
  const list = await admin.auth.admin.listUsers();
  const user = list.data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Test user not found: ${email}`);
  return user.id;
}

async function clearRubricData(userId: string) {
  const admin = await getAdmin();

  const { data: chatRows } = await admin
    .from('chats')
    .select('id')
    .eq('user_id', userId)
    .ilike('title', 'Rubric - %');

  if (chatRows && chatRows.length > 0) {
    const chatIds = chatRows.map((row) => row.id);
    await admin.from('messages').delete().in('chat_id', chatIds);
    await admin.from('chats').delete().in('id', chatIds);
  }

  await admin
    .from('account_signals')
    .delete()
    .eq('user_id', userId)
    .contains('metadata', { rubricSeed: true });

  await admin
    .from('tracked_accounts')
    .delete()
    .eq('user_id', userId)
    .contains('metadata', { rubricSeed: true });

  await admin
    .from('research_outputs')
    .delete()
    .eq('user_id', userId)
    .in('subject', [
      'Boeing Strategic Research',
    ]);
}

function nowMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function resetOnboardingFor(email: string) {
  const admin = await getAdmin();
  const userId = await getTestUserId(email);
  // Ensure app-level user row is approved and has credits
  await admin.from('users').upsert({
    id: userId,
    credits_remaining: 1000,
    credits_total_used: 0,
    approval_status: 'approved'
  }, { onConflict: 'id' });
  // Remove profile + related onboarding tables so flow restarts
  await admin.from('company_profiles').delete().eq('user_id', userId);
  await admin.from('user_custom_criteria').delete().eq('user_id', userId);
  await admin.from('user_signal_preferences').delete().eq('user_id', userId);
  await admin.from('company_profiles').upsert({
    user_id: userId,
    onboarding_step: 1,
    onboarding_complete: false,
    competitors: [],
    target_titles: [],
  }, { onConflict: 'user_id' });
}

export async function login(page: Page, {
  email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com',
  password = process.env.E2E_PASSWORD || 'Codex123!',
} = {}) {
  const isSignedIn = async (timeout = 500) => {
    if (await page.getByLabel(/Message agent/i).isVisible({ timeout }).catch(() => false)) return true
    if (await page.getByTestId('onboarding-welcome').isVisible({ timeout }).catch(() => false)) return true
    if (await page.getByLabel('Onboarding input').isVisible({ timeout }).catch(() => false)) return true
    return false
  }

  await page.goto('/login');

  for (let attempt = 0; attempt < 15; attempt++) {
    if (await isSignedIn()) break

    const loginVisible = await page.getByRole('heading', { name: 'Sign In' }).isVisible({ timeout: 500 }).catch(() => false)
    if (loginVisible) {
      const emailField = page.getByPlaceholder('you@company.com')
      const passwordField = page.getByPlaceholder('••••••••')
      try { await emailField.fill(email, { timeout: 1000 }); } catch {}
      try { await passwordField.fill(password, { timeout: 1000 }); } catch {}
      try {
        await page.keyboard.press('Enter');
      } catch {
        await page.getByRole('button', { name: /Sign In/i }).click().catch(() => {});
      }
      await page.waitForTimeout(750)
      continue
    }

    // No form yet; wait briefly before next iteration
    await page.waitForTimeout(500)
  }

  expect(await isSignedIn(10_000)).toBeTruthy()
}

export async function ensureLoggedIn(page: Page) {
  await page.goto('/');
  if (await page.getByRole('heading', { name: 'Sign In' }).isVisible({ timeout: 1000 }).catch(() => false)) {
    await login(page);
  }
  // Do not bypass onboarding — we want to grade this flow.
  await page.goto('/');
}

export async function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service) throw new Error('Missing SUPABASE envs for admin');
  return createAdminClient(url, service);
}

export async function ensureTrackedAccountWithSignal(companyName = 'Acme Test Co'): Promise<{ accountId: string }> {
  const admin = await adminClient();
  // Get current test user
  const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com';
  const userId = await getTestUserId(email);

  // Ensure tracked account exists
  const { data: existing } = await admin.from('tracked_accounts').select('id').eq('user_id', userId).eq('company_name', companyName).maybeSingle();
  let accountId = existing?.id;
  if (!accountId) {
    const { data, error } = await admin.from('tracked_accounts').insert({ user_id: userId, company_name: companyName, monitoring_enabled: true, priority: 'warm', signal_score: 0 }).select('id').single();
    if (error) throw error;
    accountId = data.id;
  }

  // Insert a test signal if none exists
  const { count } = await admin.from('account_signals').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('account_id', accountId);
  if (!count || count === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: insertErr } = await admin.from('account_signals').insert({
      user_id: userId,
      account_id: accountId,
      signal_type: 'leadership_change',
      severity: 'high',
      description: 'New CISO appointed',
      signal_date: today,
      source_url: 'https://example.com/press',
      score: 75,
      importance: 'important',
      viewed: false,
      dismissed: false,
      detection_source: 'test_seed',
      metadata: { seeded: true },
    });
    if (insertErr) throw insertErr;
  }

  return { accountId: accountId! };
}

export async function ensureCredits(page: Page) {
  const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com';
  const admin = await getAdmin();
  const userId = await getTestUserId(email);
  await admin.from('users').upsert({ id: userId, credits_remaining: 1000, credits_total_used: 0, approval_status: 'approved' }, { onConflict: 'id' });
  // trigger a refresh in UI
  await page.reload();
}

export interface RubricFixtureHandles {
  deepResearchChatId: string;
  quickResearchChatId: string;
  specificQuestionChatId: string;
  meetingPrepChatId: string;
  hotAccountId: string;
  emptyAccountId: string;
  researchOutputId: string;
}

export async function seedRubricFixtures(email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com'): Promise<RubricFixtureHandles> {
  const admin = await getAdmin();
  const userId = await getTestUserId(email);

  await clearRubricData(userId);

  const deepResearch = {
    subject: 'Boeing Strategic Research',
    research_type: 'company',
    icp_fit_score: 92,
    signal_score: 78,
    composite_score: 85,
    priority_level: 'hot' as const,
    executive_summary: 'Boeing faces acute supply-chain and security pressure, making this a high-priority outreach window.',
    company_data: {
      industry: 'Aerospace & Defense',
      size: '170,000 employees',
      location: 'Arlington, VA',
      founded: '1916',
      website: 'https://www.boeing.com'
    },
    leadership_team: [
      { name: 'James Chen', title: 'Chief Information Security Officer', linkedin: 'https://linkedin.com/in/james-chen-ciso' },
      { name: 'Priya Desai', title: 'VP Infrastructure Security', linkedin: 'https://linkedin.com/in/priya-desai' }
    ],
    buying_signals: [
      { type: 'Manufacturing disruption', description: 'Cyber incident halted Everett line for 36 hours', date: '2024-10-03', score: 32 },
      { type: 'Leadership change', description: 'New CISO hired from Lockheed Martin', date: '2024-09-28', score: 28 },
      { type: 'Competitor breach', description: 'Lockheed ransomware attack raised board scrutiny', date: '2024-09-25', score: 18 }
    ],
    custom_criteria_assessment: [
      { name: 'Recent security incidents', value: 'Yes – manufacturing disruption Oct 3', confidence: 'high' },
      { name: 'Security stack', value: 'Cisco, Palo Alto, Splunk; no SOAR detected', confidence: 'medium' },
      { name: 'Has dedicated CISO', value: 'James Chen (2 months)', confidence: 'high' },
      { name: 'Compliance frameworks', value: 'ISO 27001, NIST 800-171 baseline', confidence: 'medium' }
    ],
    personalization_points: [
      { point: 'James Chen previously led Lockheed response team; mention recent competitor breach', source: 'LinkedIn profile' },
      { point: 'Board memo flagged supplier resilience as Q4 priority', source: 'SEC 8-K filing Sept 2024' }
    ],
    recommended_actions: {
      timing: 'Engage within the next 10 days while remediation budget is active',
      messaging: 'Lead with operational resilience and supply-chain hardening outcome metrics',
      targets: 'James Chen (CISO), Priya Desai (VP Infrastructure Security)'
    },
    confidence_level: 'high' as const,
    markdown_report: '# Boeing Research\nDetailed sections rendered in UI.'
  };

  const { data: deepInsert, error: deepError } = await admin
    .from('research_outputs')
    .insert({
      user_id: userId,
      chat_id: null,
      research_type: deepResearch.research_type,
      subject: deepResearch.subject,
      data: {},
      sources: [
        { title: 'WSJ: Boeing outage', url: 'https://example.com/wsj-boeing-outage' },
        { title: 'LinkedIn profile', url: 'https://linkedin.com/in/james-chen-ciso' }
      ],
      tokens_used: 3200,
      icp_fit_score: deepResearch.icp_fit_score,
      signal_score: deepResearch.signal_score,
      composite_score: deepResearch.composite_score,
      priority_level: deepResearch.priority_level,
      executive_summary: deepResearch.executive_summary,
      company_data: deepResearch.company_data,
      leadership_team: deepResearch.leadership_team,
      buying_signals: deepResearch.buying_signals,
      custom_criteria_assessment: deepResearch.custom_criteria_assessment,
      personalization_points: deepResearch.personalization_points,
      recommended_actions: deepResearch.recommended_actions,
      confidence_level: deepResearch.confidence_level,
      markdown_report: deepResearch.markdown_report
    })
    .select('id')
    .single();

  if (deepError) throw deepError;
  const researchOutputId = deepInsert!.id as string;

  const now = new Date();
  const iso = now.toISOString();

  const insertedAccounts = await admin
    .from('tracked_accounts')
    .insert([
      {
        user_id: userId,
        company_name: 'Boeing',
        company_url: 'https://www.boeing.com',
        industry: 'Aerospace & Defense',
        employee_count: 170000,
        monitoring_enabled: true,
        last_researched_at: nowMinus(5).toISOString(),
        latest_research_id: researchOutputId,
        icp_fit_score: 92,
        signal_score: 78,
        priority: 'hot',
        notes: 'Primary target account for Q4',
        metadata: { rubricSeed: true }
      },
      {
        user_id: userId,
        company_name: 'Lockheed Martin',
        company_url: 'https://lockheedmartin.com',
        industry: 'Aerospace & Defense',
        employee_count: 114000,
        monitoring_enabled: true,
        last_researched_at: nowMinus(16).toISOString(),
        icp_fit_score: 84,
        signal_score: 55,
        priority: 'warm',
        metadata: { rubricSeed: true }
      },
      {
        user_id: userId,
        company_name: 'Northwind Logistics',
        industry: 'Supply Chain',
        employee_count: 4200,
        monitoring_enabled: true,
        last_researched_at: nowMinus(32).toISOString(),
        icp_fit_score: 68,
        signal_score: 12,
        priority: 'standard',
        metadata: { rubricSeed: true }
      }
    ])
    .select('id, company_name');

  if (insertedAccounts.error) throw insertedAccounts.error;
  const accountMap = Object.fromEntries(insertedAccounts.data!.map((row) => [row.company_name, row.id]));

  const hotAccountId = accountMap['Boeing'];
  const warmAccountId = accountMap['Lockheed Martin'];
  const emptyAccountId = accountMap['Northwind Logistics'];

  await admin.from('account_signals').insert([
    {
      account_id: hotAccountId,
      user_id: userId,
      signal_type: 'manufacturing_disruption',
      severity: 'critical',
      description: 'Cyber incident halted Everett production line (36h outage)',
      signal_date: nowMinus(2).toISOString().slice(0, 10),
      source_url: 'https://example.com/boeing-incident',
      importance: 'critical',
      score: 85,
      viewed: false,
      dismissed: false,
      metadata: { rubricSeed: true }
    },
    {
      account_id: hotAccountId,
      user_id: userId,
      signal_type: 'leadership_change',
      severity: 'high',
      description: 'New CISO James Chen joined from Lockheed Martin',
      signal_date: nowMinus(5).toISOString().slice(0, 10),
      source_url: 'https://example.com/james-chen',
      importance: 'important',
      score: 62,
      viewed: false,
      dismissed: false,
      metadata: { rubricSeed: true }
    },
    {
      account_id: warmAccountId,
      user_id: userId,
      signal_type: 'funding_round',
      severity: 'medium',
      description: 'Series C expansion focusing on supply chain automation',
      signal_date: nowMinus(9).toISOString().slice(0, 10),
      source_url: 'https://example.com/lockheed-funding',
      importance: 'important',
      score: 44,
      viewed: false,
      dismissed: false,
      metadata: { rubricSeed: true }
    }
  ]);

  const chatPayload = [
    {
      title: 'Rubric - Deep Research',
      summary: 'Deep account research for Boeing',
      content: `# Boeing Deep Account Research\n\n## Executive Summary\n- Boeing faces urgent security + supply chain pressure after a manufacturing outage.\n- Leadership changes and board scrutiny increase openness to resilience tooling.\n\n## Buying Signals\n1. Manufacturing disruption (Oct 3, 2024) halted Everett line for 36 hours.\n2. New CISO James Chen joining from Lockheed to tighten resilience.\n3. Competitor Lockheed breach triggered board benchmark.\n\n## Custom Criteria Assessment\n- Recent security incidents: ✅ Cyber incident confirmed Oct 3.\n- Security stack: Cisco, Palo Alto, Splunk; gap in SOAR automation.\n- Has dedicated CISO: ✅ James Chen (tenure 2 months).\n- Compliance frameworks: ISO 27001, NIST 800-171.\n\n## Decision Makers\n- James Chen — CISO (ex-Lockheed).\n- Priya Desai — VP Infrastructure Security.\n\n## Company Overview\n- HQ: Arlington, VA • 170K employees • $77B revenue.\n- Focus: Commercial aviation, defense, space.\n\n## Sources\n- Wall Street Journal (Oct 3, 2024)\n- Boeing 8-K filing (Sept 2024)\n- LinkedIn profiles`,
    },
    {
      title: 'Rubric - Quick Facts',
      summary: 'Quick snapshot for Lockheed Martin',
      content: `# Quick Facts: Lockheed Martin\n\n## Snapshot\n- Industry: Aerospace & Defense\n- Size: 114,000 employees\n- Revenue: ~$67B\n- HQ: Bethesda, MD\n\n## Leadership\n- CEO: Jim Taiclet\n- CISO: Nina Alvarez\n\n## Recent News\n- Sept 25: Reported ransomware attempt contained.\n- Oct 1: Announced new AI-enabled satellite program.\n\n## Fit Check\n- ICP Fit: 84/100\n- Timing: Medium priority (security focus rising).`,
    },
    {
      title: 'Rubric - Specific Question',
      summary: 'Security stack answer for Boeing',
      content: `# Boeing Security Stack Overview\n\n## Short Answer\nBoeing relies on Cisco (network), Palo Alto (perimeter), Splunk (SIEM), and CrowdStrike Falcon (EDR) across core facilities. No centralized SOAR platform detected.\n\n## Evidence\n- CrowdStrike job requisitions for Falcon automations (Sept 2024).\n- Splunk dashboards referenced in Boeing security engineering blog (Aug 2024).\n- Cisco ThousandEyes expansion press release (July 2024).\n\n## Next Step\nRecommend proposing orchestration layer to unify alert triage and supplier signal ingestion.`,
    },
    {
      title: 'Rubric - Meeting Prep',
      summary: 'Discovery call prep for Boeing CISO',
      content: `# Meeting Prep: Boeing Discovery Call (Oct 12)\n\n<div data-section="meeting-prep-summary">\n<h2>TL;DR</h2>\n<ul>\n  <li>Lead with resilience outcomes tied to the Oct 3 outage.</li>\n  <li>James Chen wants supplier telemetry, faster triage, and board-ready metrics.</li>\n  <li>Frame SOAR pilot as six-week proof with measurable MTTR impact.</li>\n</ul>\n</div>\n\n<div data-section="meeting-prep-talking-points">\n<h2>Key Talking Points</h2>\n<ol>\n  <li>Reference the 36-hour Everett disruption and quantify impact.</li>\n  <li>Contrast with Lockheed ransomware incident to show urgency.</li>\n  <li>Position orchestration gap and outline pilot blueprint.</li>\n</ol>\n</div>\n\n<div data-section="meeting-prep-decision-makers">\n<h2>Decision Makers</h2>\n<ul>\n  <li><strong>James Chen (CISO)</strong> — final authority, expects dashboard-level metrics.</li>\n  <li><strong>Priya Desai (VP Infrastructure Security)</strong> — technical champion, owns runbooks.</li>\n  <li><strong>Alan Foster (Director Procurement IT)</strong> — streamlines onboarding and compliance.</li>\n</ul>\n</div>\n\n<div data-section="meeting-prep-actions">\n<h2>Recommended Actions</h2>\n<ol>\n  <li>Open with outage recap and resilience KPI.</li>\n  <li>Share two-slide SOAR pilot plan with success metrics.</li>\n  <li>Book technical deep dive with Priya within 5 days.</li>\n  <li>Offer tailored board briefing template post-call.</li>\n</ol>\n</div>`,
    }
  ];

  const chatHandles: Record<string, string> = {};

  for (const payload of chatPayload) {
    const { data: chatRow, error: chatError } = await admin
      .from('chats')
      .insert({
        user_id: userId,
        title: payload.title,
        created_at: iso,
        updated_at: iso,
        starred: false
      })
      .select('id')
      .single();
    if (chatError) throw chatError;
    chatHandles[payload.title] = chatRow!.id as string;

    const userMsgTime = new Date(now.getTime() - 1000).toISOString();
    const assistantMsgTime = new Date(now.getTime() - 500).toISOString();

    await admin.from('messages').insert([
      {
        chat_id: chatRow!.id,
        role: 'user',
        content: payload.summary,
        created_at: userMsgTime,
        tokens_used: 0,
        metadata: { rubricSeed: true }
      },
      {
        chat_id: chatRow!.id,
        role: 'assistant',
        content: payload.content,
        created_at: assistantMsgTime,
        tokens_used: 1600,
        metadata: { rubricSeed: true }
      }
    ]);
  }

  await admin.from('tracked_accounts').update({ latest_research_id: researchOutputId }).eq('id', hotAccountId);

  return {
    deepResearchChatId: chatHandles['Rubric - Deep Research'],
    quickResearchChatId: chatHandles['Rubric - Quick Facts'],
    specificQuestionChatId: chatHandles['Rubric - Specific Question'],
    meetingPrepChatId: chatHandles['Rubric - Meeting Prep'],
    hotAccountId,
    emptyAccountId,
    researchOutputId
  };
}

export async function markAllSignalsHandled(email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com') {
  const admin = await getAdmin();
  const userId = await getTestUserId(email);
  await admin
    .from('account_signals')
    .update({ viewed: true, dismissed: true, viewed_at: new Date().toISOString(), dismissed_at: new Date().toISOString() })
    .eq('user_id', userId);
}
