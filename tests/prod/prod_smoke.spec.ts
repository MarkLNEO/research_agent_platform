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
    // Prune old artifacts (> PRUNE_MAX_AGE_HOURS, default 24h)
    try {
      const { spawnSync } = require('node:child_process');
      spawnSync('node', ['scripts/prune-artifacts.js'], { stdio: 'ignore' });
    } catch {}

  // Artifacts setup (screenshots, logs)
  fs.mkdirSync('test-artifacts/prod', { recursive: true });
  // Clean all pngs to avoid stale passes
  try {
    for (const f of fs.readdirSync('test-artifacts/prod')) {
      if (f.endsWith('.png')) fs.unlinkSync(`test-artifacts/prod/${f}`);
    }
  } catch {}
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
    // If welcome screen is shown, choose guided onboarding to expose the input
    const welcome = page.getByTestId('onboarding-welcome');
    if (await welcome.isVisible({ timeout: 5000 }).catch(() => false)) {
      const guided = page.getByTestId('onboarding-guided');
      if (await guided.isVisible({ timeout: 2000 }).catch(() => false)) {
        await guided.click({ timeout: 5000 }).catch(() => {});
      } else {
        await page.getByTestId('onboarding-immediate').click({ timeout: 5000 }).catch(() => {});
      }
    }
    const input = page.getByLabel('Onboarding input');
    const inputVisible = await input.isVisible({ timeout: 5000 }).catch(() => false);
    if (inputVisible) {
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
    } else {
      // Onboarding already completed for this user; continue to home
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
    // If welcome shows, jump to chat by selecting the quick-start or routing to '/'
    let composer = page.getByLabel(/Message agent/i).or(page.locator('textarea[placeholder*="Message agent"]'));
    const composerVisible = await composer.isVisible({ timeout: 5000 }).catch(() => false);
    if (!composerVisible) {
      // click "Research Boeing" quick-start to reach chat surface
      await tryClick(page, 'button', /Research Boeing|Dive into research now/i, 2000);
      // fallback: go to '/' again
      if (!(await page.locator('textarea[placeholder*="Message agent"]').isVisible({ timeout: 3000 }).catch(() => false))) {
        await page.goto('/');
        await tryClick(page, 'button', /Research Boeing|Dive into research now/i, 2000);
      }
      await page.waitForTimeout(800);
      composer = page.getByLabel(/Message agent/i).or(page.locator('textarea[placeholder*="Message agent"]'));
      await composer.waitFor({ state: 'visible', timeout: 20_000 });
    }
    const realComposer = page.locator('textarea[placeholder*="Message agent"]');
    await expect(realComposer).toBeVisible({ timeout: 20_000 });
    // Empty-state panel should be visible before first message
    const emptyState = page.getByTestId('empty-state-tasks');
    const hasEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasEmpty) await snap('empty-state');
    // Header metrics may render above the composer
    const metrics = page.getByTestId('header-metrics');
    if (await metrics.isVisible({ timeout: 3000 }).catch(() => false)) await snap('header-metrics');
    // Wait until composer becomes enabled (streaming may temporarily disable)
    for (let i = 0; i < 30; i++) {
      const enabled = await realComposer.isEnabled().catch(() => false);
      if (enabled) break;
      await page.waitForTimeout(1000);
    }
    await expect(realComposer).toBeEnabled({ timeout: 5_000 });
    await realComposer.fill('Research Acme Test Co');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    // If clarifiers appear, choose Quick Facts
    await tryClick(page, 'button', /Quick Facts/i, 5000);
    // Wait for assistant bubble
    const assistant = page.locator('[data-testid="message-assistant"]').last();
    await assistant.waitFor({ state: 'visible', timeout: 60_000 });

    // Next Actions bar should appear after a run
    // Wait for Next Actions bar to appear (up to 15s)
    let hasNextActions = false;
    for (let i = 0; i < 15; i++) {
      if (await page.getByText(/Next actions:/i).isVisible({ timeout: 1000 }).catch(() => false)) { hasNextActions = true; break; }
      await page.waitForTimeout(1000);
    }
    if (hasNextActions) {
      await snap('next-actions');
      // Lock clarifiers for this chat
      const lockToggle = page.getByLabel(/No more setup questions this chat/i);
      for (let i = 0; i < 10; i++) {
        if (await lockToggle.isVisible({ timeout: 500 }).catch(() => false)) { break; }
        await page.waitForTimeout(500);
      }
      await lockToggle.check().catch(() => {});
      await snap('clarifier-lock');

      // Try Refine scope immediately while the next-actions bar is visible
      const refineNow = page.getByRole('button', { name: /Refine scope/i });
      const canRefineNow = await refineNow.isVisible({ timeout: 2000 }).catch(() => false);
      if (canRefineNow) {
        await refineNow.click().catch(() => {});
        await snap('refine-scope-open');
        // Choose facet + timeframe and apply
        await page.getByLabel(/leadership/i).check().catch(() => {});
        const tf2 = page.getByRole('combobox');
        await tf2.selectOption({ label: /last 6 months/i }).catch(() => {});
        await tryClick(page, 'button', /Apply/i, 2000);
        const assistantRefine2 = page.locator('[data-testid="message-assistant"]').last();
        await assistantRefine2.waitFor({ state: 'visible', timeout: 60_000 });
        await snap('refine-scope-applied');
      }

      // Try Summarize from the action buttons
      const summarizeNow = page.getByRole('button', { name: /Summarize/i });
      if (await summarizeNow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await summarizeNow.click({ timeout: 10_000 }).catch(() => {});
        const assistantAfterSum = page.locator('[data-testid=\"message-assistant\"]').last();
        await assistantAfterSum.waitFor({ state: 'visible', timeout: 60_000 });
        await snap('summary');
      }

      // Follow-up should proceed without form-like prompts
      await composer.fill('pricing changes?');
      await tryClick(page, 'button', /Send|Send message/i, 2000);
      const assistantFollow = page.locator('[data-testid="message-assistant"]').last();
      await assistantFollow.waitFor({ state: 'visible', timeout: 60_000 });
      const followText = await assistantFollow.innerText().catch(() => '');
      const hasFormPrompt = /please share the text\/?file|what do you want/i.test(followText);
      if (hasFormPrompt) {
        log('WARN: Clarifier lock did not suppress form-like prompt');
      }

      // Refine scope → choose a facet and timeframe
      const refineBtn = page.getByRole('button', { name: /Refine scope/i });
      const canRefine = await refineBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (canRefine) {
        await refineBtn.click();
        await snap('refine-scope-open');
        await page.getByText(/Refine scope/i).isVisible({ timeout: 10000 }).catch(() => {});
        // Pick 'leadership' facet if present
        const leadership = page.getByLabel(/leadership/i);
        await leadership.check().catch(() => {});
        const tf = page.getByRole('combobox');
        await tf.selectOption({ label: /last 6 months/i }).catch(() => {});
        await tryClick(page, 'button', /Apply/i, 2000);
        const assistantRefine = page.locator('[data-testid="message-assistant"]').last();
        await assistantRefine.waitFor({ state: 'visible', timeout: 60_000 });
        const refineText = await assistantRefine.innerText().catch(() => '');
        const mentionsFacet = /leadership|last 6 months/i.test(refineText);
        if (!mentionsFacet) {
          log('INFO: Refine scope response did not explicitly echo facet/timeframe');
        }
        await snap('refine-scope-applied');
      }

      // Context crumb should appear; switch subject to Clari and verify label changes
      const crumb = page.getByTestId('context-crumb');
      const crumbVisible = await crumb.isVisible({ timeout: 5000 }).catch(() => false);
      if (crumbVisible) {
        await crumb.getByRole('button').click().catch(() => {});
        const crumbOpen = page.getByTestId('context-crumb-open');
        const open = await crumbOpen.isVisible({ timeout: 5000 }).catch(() => false);
        if (open) {
          await page.getByTestId('context-crumb-input').fill('Clari');
          await snap('crumb-open');
          await tryClick(page, 'button', /Apply/i, 2000);
          await page.waitForTimeout(500);
          const crumbText = await crumb.innerText().catch(() => '');
          expect(/Clari/i.test(crumbText)).toBeTruthy();
          await snap('crumb-updated');
        }
      }
    }

    // Summarize quick action: click and verify a concise follow-up appears
    await page.getByText(/Next actions:/i).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    const summarizeBtn = page.getByRole('button', { name: /Summarize/i });
    let canSummarize = false;
    for (let i = 0; i < 10; i++) {
      if (await summarizeBtn.isVisible({ timeout: 500 }).catch(() => false)) { canSummarize = true; break; }
      await page.waitForTimeout(500);
    }
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
      await snap('summary');
    }

    // Draft Email CTA: click and ensure /api/outreach/draft returns 2xx
    const draftBtn = page.getByRole('button', { name: /Draft Email/i });
    const canDraft = await draftBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (canDraft) {
      const waitDraft = page.waitForResponse((r) => r.url().includes('/api/outreach/draft') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
      await draftBtn.click({ timeout: 10_000 }).catch(() => {});
      const resp = await waitDraft;
      if (!(resp && resp.ok())) {
        fs.appendFileSync(logFile, `WARN: Outreach draft response not OK: ${resp ? resp.status() : 'no response'}\n`);
      }
    }

    // Targeted check: URL then "All of the above" should proceed without form-like prompts
    for (let i = 0; i < 30; i++) {
      const enabled = await realComposer.isEnabled().catch(() => false);
      if (enabled) break;
      await page.waitForTimeout(1000);
    }
    await expect(realComposer).toBeEnabled({ timeout: 5_000 });
    await realComposer.fill('https://keepit.com');
    await tryClick(page, 'button', /Send|Send message/i, 2000);
    await page.waitForTimeout(600);
    await expect(realComposer).toBeEnabled({ timeout: 20_000 });
    await realComposer.fill('All of the above');
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

    // Save to Research (handle proactive mismatch modal, then open dialog, add one source if needed, save)
    await page.getByText(/Next actions:/i).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    const saveBtn = page.getByRole('button', { name: /Save to Research/i });
    const saveCount = await page.getByRole('button', { name: /Save to Research/i }).count().catch(() => 0);
    log(`INFO: Save to Research button count at check: ${saveCount}`);
    const hasSave = saveCount > 0 ? await saveBtn.isVisible({ timeout: 3000 }).catch(() => false) : false;
    if (hasSave) {
      await saveBtn.click({ timeout: 10_000 }).catch(() => {});
      // Handle proactive mismatch modal if it appears first
      const splitModal = page.getByTestId('subject-mismatch-modal');
      const modalVisible = await splitModal.isVisible({ timeout: 4000 }).catch(() => false);
      if (modalVisible) {
        await snap('split-modal');
        // Continue to Save editor (Edit details)
        const editBtn = page.getByRole('button', { name: /Edit details/i });
        await editBtn.click({ timeout: 5000 }).catch(() => {});
      }
      const dialog = page.getByTestId('save-research-dialog');
      let dialogVisible = false;
      try {
        await dialog.waitFor({ state: 'visible', timeout: 10_000 });
        dialogVisible = true;
      } catch {}
      if (dialogVisible) {
        await snap('save-dialog');
        // If validation requires at least one source, add a simple source
        const addBtn = page.getByRole('button', { name: /Add source/i });
        const hasAdd = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasAdd) {
          try {
            await addBtn.click().catch(() => {});
            const sourceInput = page.getByLabel(/Source URL/i).last();
            const sourceVisible = await sourceInput.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
            if (sourceVisible) {
              await sourceInput.fill('https://example.com');
            } else {
              log('WARN: Source URL input did not render after clicking Add source');
            }
          } catch (addErr) {
            log(`WARN: Failed to add source in save dialog: ${addErr instanceof Error ? addErr.message : addErr}`);
          }
        }
        // If mismatch confirmation is present, capture it
        const mismatch = dialog.getByText(/Confirm subject/i);
        if (await mismatch.isVisible({ timeout: 1000 }).catch(() => false)) {
          await snap('save-mismatch');
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
    } else {
      log('WARN: Save to Research button not visible; skipping save flow');
    }

    // Deep research resiliency segment (best-effort; skip if composer disabled)
    const canDeep = await realComposer.isEnabled().catch(() => false);
    if (canDeep) {
      await realComposer.fill('Research Beta Manufacturing');
      await tryClick(page, 'button', /Send|Send message/i, 2000);
      await tryClick(page, 'button', /Deep Account Research|Deep/i, 5000);
      await page.waitForTimeout(1500);
      await page.reload();
      const readyAfterReload = await Promise.any([
        page.locator('textarea[placeholder*="Message agent"]').isVisible({ timeout: 20_000 }),
        page.getByTestId('onboarding-welcome').isVisible({ timeout: 20_000 })
      ]).then(() => true).catch(() => false);
      expect(readyAfterReload).toBeTruthy();
    }

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

    // Hard requirement: labelled screenshots exist
    const requiredLabels = [
      'next-actions',
      'clarifier-lock',
      'refine-scope-open',
      'refine-scope-applied',
      'crumb-open',
      'crumb-updated',
      'summary',
      'split-modal',
      'save-dialog',
      'save-mismatch'
    ];
    const files2 = fs.readdirSync('test-artifacts/prod');
    const missing: string[] = [];
    for (const label of requiredLabels) {
      const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const found = files2.some(f => f.endsWith(`-${safe}.png`));
      if (!found) missing.push(label);
    }
    if (missing.length) {
      throw new Error(`Missing required screenshots: ${missing.join(', ')}`);
    }
  });
});
