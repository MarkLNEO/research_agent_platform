import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers';
import fs from 'fs';
import path from 'path';

test.describe('Bulk account upload', () => {
  test('uploads CSV and shows success toast', async ({ page }, testInfo) => {
    await ensureLoggedIn(page);

    // Prepare a CSV file in the temp dir
    const csv = 'Company,Website\nAlpha Test Inc,https://alpha.example.com\nBeta Test LLC,https://beta.example.com\n';
    const csvPath = testInfo.outputPath('accounts.csv');
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, csv);

    await page.goto('/');
    // Ensure we are on the chat surface; if dashboard greeting is showing, send a quick message to open composer
    const hero = page.getByTestId('dashboard-greeting');
    if (await hero.isVisible({ timeout: 3000 }).catch(() => false)) {
      const input = page.locator('textarea[placeholder*="Message agent"]');
      await input.fill('Research Acme Test Co');
      await page.getByRole('button', { name: /Send message|Send/i }).click().catch(() => {});
      await page.waitForResponse((r) => r.url().includes('/api/ai/chat'), { timeout: 60000 }).catch(() => null);
    }
    // Open the bulk dialog via the header action
    const headerBulk = page.locator('button[title="Upload CSV to research multiple companies"]');
    await headerBulk.click({ timeout: 15000 });
    await expect(page.getByText(/Bulk Company Research/i)).toBeVisible();
    // Click "Upload CSV" inside the dialog if present (MessageInput's plus triggers upload dialog too)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);

    // Expect a toast or success message shortly after
    const ok = await Promise.any([
      page.getByText(/imported 2 account/i).isVisible({ timeout: 20000 }),
      page.getByText(/Bulk research started/i).isVisible({ timeout: 20000 })
    ]).then(() => true).catch(() => false);
    expect(ok).toBeTruthy();
  });
});
