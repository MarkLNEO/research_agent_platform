import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('research history screenshot', async ({ page }) => {
  await login(page);
  await page.goto('/research');
  const panel = page.getByTestId('research-history');
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  await panel.screenshot({ path: 'test-artifacts/research-history.png' });
});
