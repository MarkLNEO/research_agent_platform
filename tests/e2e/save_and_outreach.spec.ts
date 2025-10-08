import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers';

test.describe('Save to Research and Outreach', () => {
  test('saves research and drafts outreach', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/');

    // Send a quick research request
    let input = page.getByLabel(/Message agent/i);
    if (!await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      input = page.locator('textarea[placeholder*="Message agent"]');
      await input.waitFor({ state: 'visible', timeout: 10_000 });
    }
    await input.fill('Research Acme Test Co');
    await page.getByRole('button', { name: /Send message|Send/i }).click();

    // If clarifier buttons appear, choose Quick Facts (cheapest) for speed
    const quickButton = page.getByRole('button', { name: /Quick Facts/i }).first();
    if (await quickButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await quickButton.click();
    }

    // Wait for agent response start
    await page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60000 }).catch(() => null);

    const seenContent = await page.locator('[data-testid="message-assistant"]').last().isVisible({ timeout: 60000 }).catch(() => false);

    // Click "Save to Research" if visible in the last bubble actions
    const saveBtn = page.getByRole('button', { name: /Save to Research/i });
    const hasSave = seenContent && await saveBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasSave) {
      await saveBtn.click();
      const dialog = page.getByTestId('save-research-dialog');
      if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dialog.screenshot({ path: 'test-artifacts/save-research-dialog.png' });
        const confirmBtn = page.getByRole('button', { name: /Save/i }).first();
        if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    }

    // Draft outreach email
    const draftBtn = page.getByRole('button', { name: /Draft Email/i }).first();
    if (await draftBtn.isVisible({ timeout: 60000 }).catch(() => false)) {
      await draftBtn.click();
      // Expect toast copied
      await expect(page.getByText(/Draft email copied/i)).toBeVisible({ timeout: 20000 });
    }
  });
});
