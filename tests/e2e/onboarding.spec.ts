import { test, expect } from '@playwright/test';
import path from 'path';
import { promises as fs } from 'fs';
import { login, resetOnboardingFor, completeOnboardingFor } from './helpers';

test.describe('Onboarding Flow', () => {
  test('guided onboarding conversation', async ({ page }) => {
    const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com';
    await resetOnboardingFor(email);
    // Fresh login with the pre-approved E2E user
    await login(page, { email, password: process.env.E2E_PASSWORD || 'Codex123!', completeOnboarding: false });

    // Force onboarding route and keep trying until welcome card is visible
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto('/onboarding');
      const ok = await page.getByTestId('onboarding-welcome').isVisible({ timeout: 5000 }).catch(() => false);
      if (ok) break;
      await page.waitForTimeout(1000);
      if (attempt === 2) throw new Error('Onboarding welcome card did not appear');
    }

    const screenshotDir = path.join(process.cwd(), 'test-artifacts', 'rubric');
    await fs.mkdir(screenshotDir, { recursive: true });

    const capture = async (name: string) => {
      const filePath = path.join(screenshotDir, name);
      await page.waitForTimeout(250);
      await page.screenshot({ path: filePath, fullPage: true });
    };

    const sendOnboarding = async (value: string, pause = 800) => {
      const input = page.getByLabel('Onboarding input');
      await input.waitFor({ state: 'visible', timeout: 10_000 });
      await input.fill(value);
      await page.getByRole('button', { name: /Continue/i }).first().click({ timeout: 10_000 }).catch(async () => {
        await page.keyboard.press('Enter').catch(() => {});
      });
      await page.waitForTimeout(pause);
    };

    const guidedCard = page.getByTestId('onboarding-guided');
    if (await guidedCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guidedCard.click({ timeout: 3000 }).catch(() => {});
    }

    await capture('onboarding-step-01-company.png');
    await sendOnboarding('https://');
    await capture('onboarding-step-01a-invalid-url.png');

    await sendOnboarding('Nevereverordinary Labs');
    await capture('onboarding-step-01b-company-confirmed.png');

    const onboardingInput = page.getByLabel('Onboarding input');
    await onboardingInput.fill('https://nevereverordinary.com');
    await capture('onboarding-step-02-website.png');
    await sendOnboarding('https://nevereverordinary.com');

    await capture('onboarding-step-03-role.png');
    await sendOnboarding('Account Executive');

    await capture('onboarding-step-03-use-case.png');
    await sendOnboarding('Research existing accounts');

    await capture('onboarding-step-03-industry.png');
    await sendOnboarding('Aerospace & Defense');

    await capture('onboarding-step-03-icp.png');
    await sendOnboarding('Mid-market aerospace companies with 1000+ employees', 1200);

    await capture('onboarding-step-04-criteria.png');
    await sendOnboarding('1. Has a dedicated CISO\n2. Uses Splunk or CrowdStrike\n3. SOC 2 or ISO 27001', 1200);
    await capture('onboarding-mid-flow.png');
    await sendOnboarding('Critical');
    await sendOnboarding('Important');
    await sendOnboarding('Optional');
    await sendOnboarding('done', 1200);

    await capture('onboarding-step-05-links.png');
    await sendOnboarding('skip');

    await capture('onboarding-step-06-competitors.png');
    await sendOnboarding('Lockheed Martin, Raytheon', 1200);

    await capture('onboarding-step-07-signals.png');
    await sendOnboarding('security_breach, leadership_change');
    await sendOnboarding('done');

    await capture('onboarding-step-08-titles.png');
    await sendOnboarding('CISO, VP of Security', 1200);

    await capture('onboarding-step-09-focus.png');
    // Final step shows explicit controls; use buttons rather than typing
    const selectAllBtn = page.getByRole('button', { name: /Select all/i });
    if (await selectAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await selectAllBtn.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    const finalize = page.getByRole('button', { name: 'Create my agent' });
    await finalize.waitFor({ state: 'visible', timeout: 30_000 });
    await expect(finalize).toBeEnabled({ timeout: 30_000 });
    await finalize.click({ timeout: 10_000 });
    await page.waitForTimeout(2000);

    await capture('onboarding-flow-overview.png');

    await page.goto('/');
    const ready = await Promise.any([
      page.getByLabel(/Message agent/i).isVisible({ timeout: 20_000 }),
      page.getByText(/Ready to research companies\?/i).isVisible({ timeout: 20_000 })
    ]).then(() => true).catch(() => false);
    expect(ready).toBeTruthy();

    const creditsIndicator = page.getByText(/credits/i).first();
    await expect(creditsIndicator).not.toContainText(/0 credits/i, { timeout: 5_000 });

    const profileCta = page.getByRole('button', { name: 'Complete your profile →' });
    if (await profileCta.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await profileCta.click();
      await expect(page).toHaveURL(/\/profile-coach/, { timeout: 10_000 });
      await page.goto('/');
    }
    await completeOnboardingFor(email);
  });
});
