import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureLoggedIn } from './helpers';

test.describe('Visual + Accessibility', () => {
  test('homepage visual and a11y check', async ({ page }) => {
    await ensureLoggedIn(page);

    // Capture a full-page screenshot as an artifact
    await page.screenshot({ path: 'test-artifacts/home.png', fullPage: true });

    // Run axe accessibility analysis
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast']) // Allow brand palette during iteration
      .analyze();
    // Only fail on serious/critical to keep CI actionable
    const severe = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
  });
});
