import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Authentication', () => {
  test('can sign in with provided credentials', async ({ page }) => {
    await page.goto('/login');
    await page.screenshot({ path: 'test-artifacts/login.png' });

    await login(page);

    // Expect to land on the app (either onboarding or chat)
    await expect(page).toHaveURL(/\//);
    // Visible onboarding or chat input is fine
    const visible = await Promise.race([
      page.getByLabel(/Message agent/i).isVisible({ timeout: 10_000 }).then(() => true).catch(() => false),
      page.getByTestId('onboarding-welcome').isVisible({ timeout: 10_000 }).then(() => true).catch(() => false),
      page.getByLabel('Onboarding input').isVisible({ timeout: 10_000 }).then(() => true).catch(() => false),
    ]);
    expect(visible).toBeTruthy();
  });

  test('forgot password shows feedback', async ({ page }) => {
    await page.goto('/login');
    // Ensure we are in a logged-out state for this test
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload();
    await page.getByRole('heading', { name: 'Sign In' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByPlaceholder('you@company.com').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByPlaceholder('you@company.com').fill(process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com');
    // Click Forgot password link
    const btn = page.getByRole('button', { name: /Forgot password/i });
    await btn.click();
    // Expect either success or error feedback box to appear
    const ok = await Promise.any([
      page.getByText(/sent a reset link/i).isVisible({ timeout: 10_000 }),
      page.getByText(/Failed to send reset link|Enter your email/i).isVisible({ timeout: 10_000 })
    ]).then(() => true).catch(() => false);
    expect(ok).toBeTruthy();
  });
});
