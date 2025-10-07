import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('all signals page screenshot', async ({ page }) => {
  await login(page);
  await page.goto('/signals');
  const panel = page.getByTestId('all-signals');
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  await panel.screenshot({ path: 'test-artifacts/all-signals.png' });
});

