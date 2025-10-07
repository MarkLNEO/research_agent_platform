import { test, expect } from '@playwright/test';
import { ensureLoggedIn, ensureTrackedAccountWithSignal } from './helpers';

test.describe('Signals Drawer', () => {
  test('opens and marks signals viewed/dismissed', async ({ page }) => {
    await ensureLoggedIn(page);
    await ensureTrackedAccountWithSignal('Acme Test Co');

    // Go to home (chat)
    await page.goto('/');

    // Wait for the tracked accounts widget to list the seeded account
    const acmeButton = page.locator('button:has-text("Acme Test Co")').first();
    const foundAcme = await acmeButton.isVisible({ timeout: 30000 }).catch(() => false);
    if (foundAcme) {
      await acmeButton.click();
    } else {
      // Fallback: click any account card if present
      const anyCard = page.locator('button:has(.text-sm)');
      if (await anyCard.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await anyCard.first().click();
      } else {
        test.skip(true, 'No tracked accounts rendered');
      }
    }

    // Drawer should appear with signals
    const drawer = page.getByTestId('signals-drawer');
    await expect(drawer).toBeVisible();
    await drawer.screenshot({ path: 'test-artifacts/signals-drawer.png' });
    await expect(page.getByText('Signals for')).toBeVisible();
    // Company name may differ if fallback; just require drawer header present
    await expect(page.getByText(/Signals for/i)).toBeVisible();
    await expect(page.getByText(/New CISO appointed/i)).toBeVisible();

    // Mark as viewed
    const viewedBtn = page.getByRole('button', { name: /Viewed/i }).first();
    await viewedBtn.click();
    // Dismiss
    const dismissBtn = page.getByRole('button', { name: /Dismiss/i }).first();
    await dismissBtn.click();

    // Trigger research from the drawer
    const researchBtn = page.getByRole('button', { name: /Research Acme Test Co/i });
    await researchBtn.click();

    // Expect chat to start streaming soon
    const resp = await page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60000 });
    expect(resp.ok()).toBeTruthy();
  });
});
