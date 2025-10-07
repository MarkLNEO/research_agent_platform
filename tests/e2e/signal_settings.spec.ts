import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('signal settings screenshot', async ({ page }) => {
  await login(page);
  await page.goto('/settings/signals');
  const container = page.getByTestId('signal-settings');
  await container.waitFor({ state: 'visible', timeout: 15000 });
  await container.screenshot({ path: 'test-artifacts/signal-settings.png' });
});
