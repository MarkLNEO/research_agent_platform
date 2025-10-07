import { test, expect } from '@playwright/test';
import { ensureLoggedIn, adminClient } from './helpers';

test.describe('Prompt building', () => {
  test('deep research builds optimized agent prompt with overlays', async ({ page }) => {
    await ensureLoggedIn(page);
    // Trigger a deep research and verify prompt via usage_logs
    await page.goto('/');
    let input = page.getByLabel(/Message agent/i);
    if (!await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      input = page.locator('textarea[placeholder*="Message agent"]');
      await input.waitFor({ state: 'visible', timeout: 15000 });
    }
    await input.fill('Research Intel');
    const send = page.getByRole('button', { name: /Send message|Send/i });
    await send.click().catch(() => {});
    const deepPreference = page.getByRole('button', { name: /Deep Account Research/i });
    if (await deepPreference.isVisible({ timeout: 6000 }).catch(() => false)) {
      try {
        await deepPreference.click({ timeout: 2000 });
      } catch {
        const handle = await deepPreference.elementHandle();
        if (handle) {
          await handle.evaluate((node: HTMLElement) => node.click());
        }
      }
    }
    await page.waitForRequest((req) => req.url().includes('/api/ai/chat') && req.method() === 'POST', { timeout: 60000 });

    const admin = await adminClient();
    const { data: users } = await admin.auth.admin.listUsers();
    const me = users.users.find(u => (u.email || '').toLowerCase() === (process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com').toLowerCase()) || users.users[0];
    const { data: logs } = await admin
      .from('usage_logs')
      .select('id, created_at, metadata')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(3);
    expect(logs && logs.length > 0).toBeTruthy();
    const meta = (logs![0] as any).metadata || {};
    const head = String(meta.prompt_head || '').toLowerCase();
    expect(head.includes('you are an elite b2b research intelligence agent')).toBeTruthy();
    expect(head.includes('your final answer must be markdown')).toBeTruthy();
    expect(head.includes('<tool_preambles>')).toBeTruthy();
  });
});
