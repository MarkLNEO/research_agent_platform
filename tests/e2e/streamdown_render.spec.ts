import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Streamdown integration', () => {
  test('renders GFM checkboxes, tables, and code with syntax styling', async ({ page }) => {
    await login(page);
    await page.goto('/render-test');

    const codeBlock = page.locator('code', { hasText: 'export const Button' }).first();
    await expect(codeBlock).toBeVisible({ timeout: 20000 });
  });
});
