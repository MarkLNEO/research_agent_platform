import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('dashboard greeting screenshot', async ({ page }) => {
  await login(page);
  await page.goto('/');
  const hero = page.getByTestId('dashboard-greeting');
  await hero.waitFor({ state: 'visible', timeout: 15000 });
  await hero.screenshot({ path: 'test-artifacts/dashboard-greeting.png' });
});
