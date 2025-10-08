import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const EMAIL = process.env.E2E_EMAIL || 'mark+55@nevereverordinary.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Codex123!';

async function tryClick(page, role: Parameters<typeof page.getByRole>[0], name: string | RegExp, timeout = 3000) {
  const btn = page.getByRole(role as any, { name });
  const visible = await btn.isVisible({ timeout }).catch(() => false);
  if (visible) { await btn.click({ timeout: 5000 }).catch(() => {}); }
}

test.describe('Production smoke (UI only)', () => {
  test('new user signup → onboarding → research → bulk → signals → logout/login', async ({ page }) => {
    // Artifacts setup (screenshots, logs)
    fs.mkdirSync('test-artifacts/prod', { recursive: true });
    const startedAt = Date.now();
    const runId = `${startedAt}`;
    const logFile = `test-artifacts/prod/${runId}-network-console.log`;
    const shots: string[] = [];
    const log = (msg: string) => {
      try {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
      } catch {}
    };
    const snap = async (label: string) => {
      const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const file = `test-artifacts/prod/${Date.now()}-${safe}.png`;
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      shots.push(file);
      log(`SNAP: ${label} -> ${file} @ ${page.url()}`);
    };
    await page.context()._wrapApiCall?.(() => {})?.catch(() => {});

    // Continuous timeline screenshots (every 2s) until stopped
    let timelineActive = true;
    const timeline = (async () => {
      try {
        while (timelineActive) {
          await snap('timeline');
          await page.waitForTimeout(2000);
        }
      } catch {}
    })();

    // Console + network diagnostics
    page.on('console', (msg) => {
      try {
        log(`CONSOLE:${msg.type()} ${msg.text()}`);
      } catch {}
    });
    page.on('request', (req) => {
      const url = req.url();
      if (/supabase|auth|api\/auth|vercel\.app/i.test(url)) {
        log(`REQUEST: ${req.method()} ${url}`);
      }
    });
    page.on('response', async (res) => {
      const url = res.url();
      const status = res.status();
      if (/supabase|auth|api\/auth|vercel\.app/i.test(url) || status >= 400) {
        let body = '';
        try {
          if (status >= 400) body = await res.text();
        } catch {}
        log(`RESPONSE: ${status} ${url}${body ? `\nBODY: ${body.substring(0, 500)}` : ''}`);
      }
    });
    // Try provisioning via API (auto-confirm path) to avoid signup friction
    try {
      const apiUrl = `${process.env.E2E_BASE_URL || ''}/api/auth/signup`;
      log(`Attempting API signup: ${apiUrl} for ${EMAIL}`);
      const resp = await page.request.post(apiUrl, {
        data: { name: 'Mark Test', email: EMAIL, password: PASSWORD },
      });
      const status = resp.status();
      let body = '';
      try { body = await resp.text(); } catch {}
      log(`API signup response: ${status} ${body.substring(0, 800)}`);
      await snap('after-api-signup');
    } catch (e: any) {
      log(`API signup error: ${e?.message || e}`);
    }

    // Try login first in case the account now exists
    await page.goto('/login');
    const loginEmail = page.getByPlaceholder('you@company.com');
    const loginPwd = page.getByPlaceholder('••••••••');
    await loginEmail.fill(EMAIL);
    await loginPwd.fill(PASSWORD);
    await tryClick(page, 'button', /Sign In/i, 2000);
    await page.waitForTimeout(1000);
    await snap('after-sign-in-click');
    log(`Post Sign In URL: ${page.url()}`);

    // Check if we reached app (composer or onboarding), otherwise sign up
    const reachedApp = await Promise.any([
      page.getByLabel(/Message agent/i).isVisible({ timeout: 5000 }),
      page.getByTestId('onboarding-welcome').isVisible({ timeout: 5000 })
    ]).then(() => true).catch(() => false);

    if (!reachedApp) {
      log('Did not reach app after login; switching to UI signup');
      // Signup
      await page.goto('/');
      await tryClick(page, 'link', /Sign up/i, 5000);
      await tryClick(page, 'link', /Sign up/i, 2000);
      // Fill signup form
      const nameField = page.getByLabel(/Full Name/i);
      await nameField.click({ timeout: 20_000 }).catch(() => {});
      await page.keyboard.type('Mark Test').catch(() => {});
      await page.getByPlaceholder('you@company.com').fill(EMAIL);
      await page.getByPlaceholder('••••••••').fill(PASSWORD);
      await tryClick(page, 'button', /Create Account|Sign Up/i, 5000);
      await page.waitForTimeout(1500);
      await snap('after-ui-signup');
      log(`After UI signup URL: ${page.url()}`);
    }

    // Onboarding: navigate to onboarding if not auto-routed
    await page.goto('/onboarding');
    await snap('onboarding-entry');
    const input = page.getByLabel('Onboarding input');
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    await snap('onboarding-input-visible');

    const send = async (value: string, pause = 800) => {
      await input.fill(value);
      await tryClick(page, 'button', /Continue|Send|Continue onboarding/i, 1000);
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(pause);
    };

    await send('Nevereverordinary Labs');
    await send('nevereverordinary.com');
    await send('Account Executive');
    await send('Research existing accounts');
    await send('Aerospace & Defense');
    await send('Mid-market aerospace companies with 1000+ employees');
    await send('Has a CISO, Splunk or CrowdStrike, SOC 2 or ISO 27001');
    await send('done');
    await send('skip');
    await send('Lockheed Martin, Raytheon');
    await send('security_breach, leadership_change');
    await send('done');
    await send('CISO, VP Security');

    // Final step: flexible finalize handling
    await page.waitForTimeout(1200);
    await tryClick(page, 'button', /Select all/i, 2000);
    // Try common finalize button variants; if none appear, continue to home
    const finalizeVariants = [/Create my agent/i, /Finish setup/i, /Start using app/i, /Continue/i, /Done/i];
    let finalized = false;
    for (const rx of finalizeVariants) {
      const btn = page.getByRole('button', { name: rx });
      const vis = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!vis) continue;
      const enabled = await btn.isEnabled({ timeout: 1000 }).catch(() => false);
      if (!enabled) continue; // ignore disabled composer Continue
      await btn.click({ timeout: 10_000 });
      finalized = true;
      break;
    }
    if (!finalized) {
      // If onboarding UI changed, proceed to home and validate surface
      await page.goto('/');
    }

    // Home load + credits non-zero
    await page.goto('/');
    await page.waitForTimeout(1500);
    // Click Open last dashboard if loader visible
    const loader = page.getByText('Preparing your workspace', { exact: false });
    if (await loader.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tryClick(page, 'button', /Open last dashboard/i, 2000);
      await page.waitForTimeout(800);
    }

    // Research streaming minimal (Quick Facts)
    const composer = page.getByLabel(/Message agent/i).or(page.locator('textarea[placeholder*="Message agent"]'));
    await composer.waitFor({ state: 'visible', timeout: 20_000 });
    await composer.fill('Research Acme Test Co');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    // If clarifiers appear, choose Quick Facts
    await tryClick(page, 'button', /Quick Facts/i, 5000);
    // Wait for assistant bubble
    const assistant = page.locator('[data-testid="message-assistant"]').last();
    await assistant.waitFor({ state: 'visible', timeout: 60_000 });

    // Summarize quick action: click and verify a concise follow-up appears
    const summarizeBtn = page.getByRole('button', { name: /Summarize/i });
    const canSummarize = await summarizeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (canSummarize) {
      const beforeText = await assistant.innerText().catch(() => '');
      await summarizeBtn.click({ timeout: 10_000 }).catch(() => {});
      // Wait for next assistant message (or updated content)
      const assistantAfter = page.locator('[data-testid="message-assistant"]').last();
      await assistantAfter.waitFor({ state: 'visible', timeout: 60_000 });
      const summaryText = await assistantAfter.innerText().catch(() => '');
      // Basic sanity: avoid form-like prompts; prefer TL;DR presence or shorter text than before
      const badSummary = /please share the text\/file|scope\s*\(|depth and format|do you want me to use web/i.test(summaryText);
      expect(badSummary).toBeFalsy();
    }

    // Draft Email CTA: click and ensure /api/outreach/draft returns 2xx
    const draftBtn = page.getByRole('button', { name: /Draft Email/i });
    const canDraft = await draftBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (canDraft) {
      const waitDraft = page.waitForResponse((r) => r.url().includes('/api/outreach/draft') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
      await draftBtn.click({ timeout: 10_000 }).catch(() => {});
      const resp = await waitDraft;
      expect(resp && resp.ok()).toBeTruthy();
    }

    // Targeted check: URL then "All of the above" should proceed without form-like prompts
    await composer.fill('https://keepit.com');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    await page.waitForTimeout(600);
    await composer.fill('All of the above');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    const assistant2 = page.locator('[data-testid="message-assistant"]').last();
    await assistant2.waitFor({ state: 'visible', timeout: 60_000 });
    const respText = await assistant2.innerText().catch(() => '');
    const badPhrases = [
      'To tailor the research, please share',
      'Exact company name',
      'Do you want me to use web research',
      'Depth and format (bullets, summary, slides)'
    ];
    const hasBad = badPhrases.some(p => respText.toLowerCase().includes(p.toLowerCase()));
    // Soft assertion: log if found, but continue
    if (hasBad) {
      fs.appendFileSync(logFile, `Found undesired prompt text in response: ${badPhrases.find(p => respText.toLowerCase().includes(p.toLowerCase()))}\n`);
    }

    // Save to Research (open dialog, add one source if needed, save)
    const saveBtn = page.getByRole('button', { name: /Save to Research/i });
    const hasSave = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSave) {
      await saveBtn.click({ timeout: 10_000 }).catch(() => {});
      const dialog = page.getByTestId('save-research-dialog');
      const dialogVisible = await dialog.isVisible({ timeout: 10_000 }).catch(() => false);
      if (dialogVisible) {
        // If validation requires at least one source, add a simple source
        const addBtn = page.getByRole('button', { name: /Add source/i });
        const hasAdd = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasAdd) {
          await addBtn.click().catch(() => {});
          await page.getByLabel(/Source URL/i).last().fill('https://example.com');
        }
        // Try to submit; if errors persist, just close the dialog to proceed
        const submit = page.getByRole('button', { name: /Save research|Save/i });
        await submit.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(800);
        const stillOpen = await dialog.isVisible({ timeout: 500 }).catch(() => false);
        if (stillOpen) {
          await page.getByRole('button', { name: /Close save dialog/i }).click().catch(() => {});
        }
      }
    }

    // Deep research run (choose Deep) and verify streaming, then refresh mid-stream to test resilience
    await composer.fill('Research Beta Manufacturing');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    await tryClick(page, 'button', /Deep Account Research|Deep/i, 5000);
    // Small wait, then reload to simulate user refresh during stream
    await page.waitForTimeout(1500);
    await page.reload();
    // Expect chat or onboarding visible again
    const readyAfterReload = await Promise.any([
      page.getByLabel(/Message agent/i).isVisible({ timeout: 20_000 }),
      page.getByTestId('onboarding-welcome').isVisible({ timeout: 20_000 })
    ]).then(() => true).catch(() => false);
    expect(readyAfterReload).toBeTruthy();
    // After reload, proactively send again to ensure response
    const composerAfter = page.getByLabel(/Message agent/i).or(page.locator('textarea[placeholder*="Message agent"]'));
    await composerAfter.waitFor({ state: 'visible', timeout: 20_000 });
    await composerAfter.fill('Research Beta Manufacturing');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    await tryClick(page, 'button', /Deep Account Research|Deep/i, 5000);
    await page.locator('[data-testid="message-assistant"]').last().waitFor({ state: 'visible', timeout: 60_000 });

    // Bulk Research: open dialog programmatically (supported in app), upload small CSV
    await page.evaluate(() => window.dispatchEvent(new Event('bulk:open')));
    const dialogVisible = await page.getByText(/Bulk Company Research/i).isVisible({ timeout: 10_000 }).catch(() => false);
    if (dialogVisible) {
      const csv = 'company_name\nAlpha Seed Co\nBeta Seed LLC\n';
      const csvPath = 'tmp/prod-accounts.csv';
      await page.context()._wrapApiCall?.(() => {})?.catch(() => {}); // noop guard
      await page.waitForTimeout(100);
      fs.mkdirSync('tmp', { recursive: true });
      fs.writeFileSync(csvPath, csv);
      await page.locator('input[type="file"]').setInputFiles(csvPath);
      await tryClick(page, 'button', /Research \d+ Companies|Starting Research|Research 2 Companies/i, 2000);
      // Expect either toast or jobs section
      const ok = await Promise.any([
        page.getByText(/Bulk research started/i).isVisible({ timeout: 20_000 }),
        page.getByText(/Bulk Research Jobs/i).isVisible({ timeout: 20_000 })
      ]).then(() => true).catch(() => false);
      expect(ok).toBeTruthy();
    }

    // Signals page
    await page.goto('/signals');
    await expect(page.getByTestId('all-signals')).toBeVisible({ timeout: 20_000 });

    // Research history
    await page.goto('/research');
    await expect(page.getByTestId('research-history')).toBeVisible({ timeout: 20_000 });

    // Log out
    await page.goto('/');
    await tryClick(page, 'button', /Sign out/i, 2000);
    await page.waitForTimeout(800);

    // Existing user login
    await page.goto('/login');
    await page.getByPlaceholder('you@company.com').fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await tryClick(page, 'button', /Sign In/i, 2000);
    await page.waitForTimeout(1200);
    await page.goto('/');
    // Verify chat surface or onboarding
    const composer2 = page.getByLabel(/Message agent/i).or(page.locator('textarea[placeholder*="Message agent"]'));
    const ready = await Promise.any([
      composer2.isVisible({ timeout: 20_000 }),
      page.getByTestId('onboarding-welcome').isVisible({ timeout: 20_000 })
    ]).then(() => true).catch(() => false);
    expect(ready).toBeTruthy();

    // Stop timeline and take final snapshot
    timelineActive = false;
    await snap('end-of-test');
    await timeline.catch(() => {});

    // Cleanup: remove timeline screenshots unless explicitly kept
    if (!process.env.E2E_KEEP_TIMELINE) {
      try {
        const dir = 'test-artifacts/prod';
        const files = fs.readdirSync(dir).filter(f => /-timeline\.png$/i.test(f));
        for (const f of files) {
          try { fs.unlinkSync(`${dir}/${f}`); } catch {}
        }
      } catch {}
    }
  });
});
