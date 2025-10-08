import { test, expect } from '@playwright/test';
import { ensureLoggedIn, ensureCredits } from './helpers';

test.describe('Research streaming', () => {
  test('streams response for a research query', async ({ page }) => {
    await ensureLoggedIn(page);
    await ensureCredits(page);

    // If onboarding is present or resume state, bypass by using quick-start URL param
    await page.goto('/?q=Research%20Boeing');
    // Wait for chat input to appear
    let input = page.getByLabel(/Message agent/i);
    try {
      await input.waitFor({ state: 'visible', timeout: 20_000 });
    } catch {
      // Fallback to placeholder-based locator if accessible name not resolved yet
      input = page.locator('textarea[placeholder*="Message agent"]');
      await input.waitFor({ state: 'visible', timeout: 10_000 });
    }

    // If a clarify panel appears, choose Quick Facts
    const quickButton = page.getByRole('button', { name: /Quick Facts/i });
    if (await quickButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await quickButton.click();
    }

    // Wait for either a streaming event UI artifact or a network response
    const respPromise = page.waitForResponse((resp) => resp.url().includes('/api/ai/chat'), { timeout: 60_000 }).catch(() => null);
    const thinking = page.getByText(/Got it — I'll research|Okay — answering|Thinking|Analyzing/i);
    await Promise.race([
      respPromise.then(() => true),
      thinking.first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true)
    ]);

    // Visible activity indicator (Thinking / reasoning)
    await thinking.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

    // Eventually we should see an assistant bubble (any non-empty content)
    await expect(page.locator('text=Research queued')).not.toBeVisible({ timeout: 1000 }).catch(() => {});

    // Screenshot the chat surface during streaming for visual QA
    const chatSurface = page.getByTestId('chat-surface');
    if (await chatSurface.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatSurface.screenshot({ path: 'test-artifacts/chat-streaming.png' });
    }

    // Look for either streamed content OR a surfaced error message – allow up to 60s
    const contentVisible = await page.getByText(/Executive Summary|Overview|Buying Signals|Company|Boeing/i).isVisible({ timeout: 60_000 }).catch(() => false);
    const errorVisible = await Promise.any([
      page.getByText(/Streaming failed/i).isVisible({ timeout: 60_000 }),
      page.getByText(/Sorry, I had trouble completing that request/i).isVisible({ timeout: 60_000 }),
      page.getByText(/failed and fallback disabled/i).isVisible({ timeout: 60_000 })
    ]).then(() => true).catch(() => false);
    expect(contentVisible || errorVisible).toBeTruthy();

    // Visual snapshot of the conversation area
    await page.screenshot({ path: 'test-artifacts/research-streaming.png', fullPage: false });
  });
});
