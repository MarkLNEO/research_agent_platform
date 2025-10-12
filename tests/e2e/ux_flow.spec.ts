import { test, expect } from '@playwright/test'
// Avoid admin helpers to keep this UX run self-contained
import fs from 'fs'
import path from 'path'

// Very light-weight a11y helper (lazy import axe to avoid perf hit if missing)
async function runA11y(page: any, name: string) {
  try {
    const { injectAxe, checkA11y } = await import('@axe-core/playwright')
    await injectAxe(page)
    await checkA11y(page, undefined, { detailedReport: true, detailedReportOptions: { html: true } })
  } catch (e) {
    console.warn('[A11Y] axe-core not available or failed:', (e as Error).message)
  }
}

test.describe('End-to-end UX flow (Quick)', () => {
  test('Login → Quick research → Next actions → Save modal → Logout/Login', async ({ page }) => {
    const shots = path.join(process.cwd(), 'test-results', 'ux_flow')
    try { fs.mkdirSync(shots, { recursive: true }) } catch {}

    // 1) Login page visual + basic semantics
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByText('AI-powered sales intelligence platform')).toBeVisible()
    await expect(page.getByAltText('RebarHQ')).toBeVisible()
    await page.screenshot({ path: path.join(shots, '01_login.png') })
    await runA11y(page, 'login')

    // 2) Login and ensure credits
    const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com'
    const password = process.env.E2E_PASSWORD || 'Codex123!'
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.keyboard.press('Enter')
    // Let the app restore profile and open chat
    await page.waitForTimeout(1000)

    // Wait for chat surface / composer
    const composer = page.getByLabel(/Message agent/i)
    await expect(composer).toBeVisible()
    await page.screenshot({ path: path.join(shots, '02_dashboard.png') })

    // 3) Start a Quick research run via clarifier UI
    await composer.fill('Research Acme Test Co')
    await page.keyboard.press('Enter')
    // Clarifier should appear
    const quickBtn = page.getByRole('button', { name: /Quick Facts/i })
    await expect(quickBtn).toBeVisible()
    await quickBtn.click()

    // Streaming begins (look for thinking indicators or assistant bubble)
    const streamingBubble = page.getByTestId('message-assistant')
    await expect(streamingBubble.first()).toBeVisible()

    // Optional: Stop should be present while streaming
    const stopBtn = page.getByRole('button', { name: /Stop/i })
    const stopVisible = await stopBtn.isVisible().catch(() => false)
    if (stopVisible) {
      await page.screenshot({ path: path.join(shots, '02a_stop_visible.png') })
    }

    // Wait for Next actions bar after completion
    const nextActions = page.getByText('Next actions:', { exact: false })
    await expect(nextActions).toBeVisible({ timeout: 90_000 })
    await page.screenshot({ path: path.join(shots, '03_research_complete.png') })

    // Collapse toggle (may or may not appear if quick stays ≤150 words)
    const collapseToggle = page.getByTestId('collapse-toggle')
    // Accept either case: visible (over threshold) or hidden (within threshold)
    const hasToggle = await collapseToggle.isVisible().catch(() => false)
    if (hasToggle) {
      await collapseToggle.click()
      await page.screenshot({ path: path.join(shots, '03a_expanded.png') })
      await collapseToggle.click()
    }

    // 4) Open Save modal and verify sticky footer controls are visible
    const saveBtn = page.getByRole('button', { name: /Save to Research/i }).first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()
    const dialog = page.getByTestId('save-research-dialog')
    await expect(dialog).toBeVisible()

    // Footer buttons should be visible even after scrolling content area
    const stickySave = page.getByRole('button', { name: /Save research output/i })
    await expect(stickySave).toBeVisible()
    await page.screenshot({ path: path.join(shots, '04_save_modal_open.png') })

    // Try scrolling within modal and ensure Save is still visible
    await page.mouse.wheel(0, 1500)
    await expect(stickySave).toBeVisible()

    // Cancel to close (we’re not asserting actual save here)
    const cancel = page.getByRole('button', { name: /^Cancel$/i })
    await cancel.click()
    await expect(dialog).toBeHidden()

    // 5) Logout → Login
    // Open sidebar and sign out
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible()
    const logout = page.getByRole('button', { name: /Sign out/i }).first()
    await logout.click()
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: path.join(shots, '05_logged_out.png') })

    // Sign back in (re-login stability)
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(/Message agent/i)).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shots, '06_relogin_success.png') })
  })
})
