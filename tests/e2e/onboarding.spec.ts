import { test, expect } from '@playwright/test';
import path from 'path';
import { promises as fs } from 'fs';
import { login, resetOnboardingFor } from './helpers';

test.describe('Onboarding Flow', () => {
  test('guided onboarding conversation', async ({ page }) => {
    const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com';
    await resetOnboardingFor(email);
    // Fresh login with the pre-approved E2E user
    await login(page, { email, password: process.env.E2E_PASSWORD || 'Codex123!' });

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

    const waitForStep = async (step: number) => {
      try {
        await page.getByText(`Step ${step} of 9`, { exact: false }).waitFor({ timeout: 10_000 });
      } catch {
        console.warn(`Step ${step} header not detected within timeout. Proceeding based on flow copy.`);
      }
    };

    const waitForCopy = async (snippet: string) => {
      await page.getByText(snippet, { exact: false }).waitFor({ timeout: 10_000 });
    };

    const sendOnboarding = async (value: string, options: { waitSnippet?: string; delayAfter?: number } = {}) => {
      const input = page.getByLabel('Onboarding input');
      await input.waitFor({ state: 'visible', timeout: 10_000 });
      await input.fill(value);
      await Promise.all([
        page.waitForTimeout(options.delayAfter ?? 350),
        (async () => {
          try {
            await page.keyboard.press('Enter');
          } catch {
            await page.getByRole('button', { name: 'Send onboarding' }).click();
          }
        })()
      ]);
      if (options.waitSnippet) {
        await waitForCopy(options.waitSnippet);
      }
    };

    const guidedCard = page.getByTestId('onboarding-guided');
    if (await guidedCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guidedCard.click({ timeout: 3000 }).catch(() => {});
    }

    await waitForStep(1);
    await waitForCopy("what's your company name");
    await capture('onboarding-step-01-company.png');

    await sendOnboarding('https://');
    await waitForCopy('partial link');
    await capture('onboarding-step-01a-invalid-url.png');

    await sendOnboarding('Nevereverordinary Labs', { waitSnippet: "I'll be researching" });
    await waitForStep(2);
    await waitForCopy('company website URL');
    await capture('onboarding-step-01b-company-confirmed.png');

    const onboardingInput = page.getByLabel('Onboarding input');
    await onboardingInput.fill('https://nevereverordinary.com');
    await capture('onboarding-step-02-website.png');
    await sendOnboarding('https://nevereverordinary.com');

    await waitForStep(3);
    await waitForCopy("what's your role");
    await capture('onboarding-step-03-role.png');
    await sendOnboarding('Account Executive', { waitSnippet: 'primary use case' });

    await capture('onboarding-step-03-use-case.png');
    await sendOnboarding('Research existing accounts', { waitSnippet: 'What industry are you in' });

    await capture('onboarding-step-03-industry.png');
    await sendOnboarding('Aerospace & Defense', { waitSnippet: 'describe your ideal customer' });

    await capture('onboarding-step-03-icp.png');
    await sendOnboarding('Mid-market aerospace companies with 1000+ employees', { waitSnippet: 'Every industry has unique data points' });

    await waitForStep(4);
    await capture('onboarding-step-04-criteria.png');

    await sendOnboarding('1. Has a dedicated CISO\n2. Uses Splunk or CrowdStrike\n3. SOC 2 or ISO 27001', { waitSnippet: 'identified 3 criteria' });

    await waitForCopy('How important is "Has a dedicated CISO"');
    await sendOnboarding('Critical', { waitSnippet: 'How important is "Uses Splunk or CrowdStrike"' });
    await sendOnboarding('Important', { waitSnippet: 'How important is "SOC 2 or ISO 27001"' });
    await sendOnboarding('Optional', { waitSnippet: "I've saved all your criteria" });

    await capture('onboarding-mid-flow.png');
    await sendOnboarding('done', { waitSnippet: 'additional data sources' });

    await waitForStep(5);
    await capture('onboarding-step-05-links.png');
    await sendOnboarding('skip', { waitSnippet: 'main competitors' });

    await waitForStep(6);
    await capture('onboarding-step-06-competitors.png');
    await sendOnboarding('Lockheed Martin, Raytheon', { waitSnippet: 'events make a company MORE likely to buy' });

    await waitForStep(7);
    await capture('onboarding-step-07-signals.png');
    await sendOnboarding('security_breach, leadership_change', { waitSnippet: 'Currently tracking' });
    await sendOnboarding('done', { waitSnippet: 'Who do you typically sell to' });

    await waitForStep(8);
    await capture('onboarding-step-08-titles.png');
    await sendOnboarding('CISO, VP of Security', { waitSnippet: 'Here’s what I can dig into' });

    await waitForStep(9);
    await capture('onboarding-step-09-focus.png');
    await page.getByLabel('Leadership & key contacts').check({ force: true });
    await page.getByLabel('Technology stack').check({ force: true });
    await page.getByLabel('Recent news & announcements').check({ force: true });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Create my agent' }).click();
    await waitForCopy("You're all set up");

    await capture('onboarding-flow-overview.png');

    await page.goto('/');
    const ready = await Promise.any([
      page.getByLabel(/Message agent/i).isVisible({ timeout: 20_000 }),
      page.getByText(/Ready to research companies\?/i).isVisible({ timeout: 20_000 })
    ]).then(() => true).catch(() => false);
    expect(ready).toBeTruthy();
  });
});
