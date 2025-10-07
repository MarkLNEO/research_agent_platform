import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { test, Page, Locator } from '@playwright/test';
import {
  login,
  resetOnboardingFor,
  seedRubricFixtures,
  markAllSignalsHandled,
} from './helpers';

const RUBRIC_DIR = path.join('test-artifacts', 'rubric');
const SMOKE = process.env.RUBRIC_SMOKE === '1';
const defaultSmokeList = 'onboarding-step-01-company,dashboard-signals-focused,research-exec-summary,signal-detail,meeting-prep-summary';
const SMOKE_CAPTURE_IDS = new Set(
  (process.env.RUBRIC_SMOKE_IDS || defaultSmokeList)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

function shouldCapture(id: string) {
  if (!SMOKE) return true;
  return SMOKE_CAPTURE_IDS.has(id);
}

function logSkip(id: string) {
  if (SMOKE && !shouldCapture(id) && process.env.RUBRIC_SMOKE_VERBOSE === '1') {
    console.log(`[rubric:smoke] skipped screenshot ${id}`);
  }
}

async function cleanRubricDir() {
  await fs.promises.rm(RUBRIC_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(RUBRIC_DIR, { recursive: true });
}

function screenshotPath(id: string) {
  return path.join(RUBRIC_DIR, `${id}.png`);
}

async function captureFullPage(page: Page, id: string) {
  if (!shouldCapture(id)) {
    logSkip(id);
    return;
  }
  const file = screenshotPath(id);
  await page.screenshot({ path: file, fullPage: true });
}

async function captureElement(locator: Locator, id: string) {
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  await locator.scrollIntoViewIfNeeded();
  if (!shouldCapture(id)) {
    logSkip(id);
    return;
  }
  const file = screenshotPath(id);
  await locator.screenshot({ path: file });
}

async function focusOnOnboarding(page: Page) {
  await page.goto('/onboarding');
  await page.getByTestId('onboarding-welcome').waitFor({ state: 'visible', timeout: 20_000 });
}

async function submitOnboardingValue(page: Page, value: string, screenshotId?: string, timeout = 12_000) {
  const input = page.getByLabel('Onboarding input');
  await input.waitFor({ state: 'visible', timeout });
  await input.fill(value);
  if (screenshotId) {
    await captureFullPage(page, screenshotId);
  }
  try {
    await page.keyboard.press('Enter');
  } catch {
    await page.getByRole('button', { name: 'Send onboarding' }).click().catch(() => {});
  }
  await page.waitForTimeout(600);
}

async function captureOnboardingFlow(page: Page, email: string) {
  await resetOnboardingFor(email);
  await login(page, { email });
  await focusOnOnboarding(page);

  await captureFullPage(page, 'onboarding-step-01-company');
  await submitOnboardingValue(page, 'https://example.com', 'onboarding-step-01a-invalid-url');
  await submitOnboardingValue(page, 'Nevereverordinary Labs', 'onboarding-step-01b-company-confirmed');
  await submitOnboardingValue(page, 'nevereverordinary.com', 'onboarding-step-02-website');
  await submitOnboardingValue(page, 'Account Executive', 'onboarding-step-03-role');
  await submitOnboardingValue(page, 'Research existing accounts', 'onboarding-step-03-use-case');
  await submitOnboardingValue(page, 'Aerospace & Defense', 'onboarding-step-03-industry');
  await submitOnboardingValue(page, 'Mid-market aerospace companies with 1000+ employees', 'onboarding-step-03-icp');
  await submitOnboardingValue(page, '1. Has a CISO\n2. Uses Splunk or CrowdStrike\n3. SOC 2 or ISO 27001', 'onboarding-step-04-criteria');
  await captureFullPage(page, 'onboarding-mid-flow');
  await submitOnboardingValue(page, 'skip', 'onboarding-step-05-links');
  await submitOnboardingValue(page, 'Lockheed Martin, Raytheon', 'onboarding-step-06-competitors');
  await submitOnboardingValue(page, 'security_breach, leadership_change', 'onboarding-step-07-signals');
  await submitOnboardingValue(page, 'CISO, CTO, VP Security', 'onboarding-step-08-titles');
  await submitOnboardingValue(page, 'all', 'onboarding-step-09-focus');
  await captureFullPage(page, 'onboarding-flow-overview');

  await page.goto('/');
  await page.waitForTimeout(1_000);
  await captureFullPage(page, 'onboarding-complete');
}

async function captureConfiguration(page: Page) {
  await page.goto('/settings/signals');
  const pane = page.getByTestId('signal-settings');
  await captureElement(pane, 'configuration-data-points');
  await captureFullPage(page, 'signal-settings');
}

async function captureDashboardGreeting(page: Page, id: string) {
  await page.goto('/');
  const greeting = page.getByTestId('dashboard-greeting');
  await greeting.waitFor({ state: 'visible', timeout: 20_000 });
  await captureElement(greeting, id);
}

async function openChatByTitle(page: Page, title: string) {
  const sidebar = page.getByTestId('sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 15_000 });
  const chatButton = sidebar.locator(`button:has-text("${title}")`).first();
  await chatButton.scrollIntoViewIfNeeded().catch(() => {});
  if (!(await chatButton.isVisible({ timeout: 5_000 }).catch(() => false))) {
    throw new Error(`Chat titled "${title}" not found`);
  }
  await chatButton.click();
  await page.waitForTimeout(500);
}

async function captureLastAssistantMessage(page: Page, chatTitle: string, screenshotId: string) {
  await page.goto('/');
  await openChatByTitle(page, chatTitle);
  const messages = page.locator('[data-testid="message-assistant"]');
  await messages.last().waitFor({ state: 'visible', timeout: 15_000 });
  await captureElement(messages.last(), screenshotId);
}

async function captureMeetingPrepSections(page: Page, chatTitle: string) {
  await page.goto('/');
  await openChatByTitle(page, chatTitle);
  const sections = {
    'meeting-prep-summary': page.locator('[data-section="meeting-prep-summary"]'),
    'meeting-prep-decision-makers': page.locator('[data-section="meeting-prep-decision-makers"]'),
    'meeting-prep-actions': page.locator('[data-section="meeting-prep-actions"]'),
  } as const;

  for (const [id, locator] of Object.entries(sections)) {
    await captureElement(locator, id);
  }
}

async function captureResearchSections(page: Page) {
  await page.goto('/research');
  const history = page.getByTestId('research-history');
  await history.waitFor({ state: 'visible', timeout: 20_000 });

  const card = page.locator('[data-testid="research-history-card"][data-subject="Boeing Strategic Research"]');
  await card.first().waitFor({ state: 'visible', timeout: 15_000 });
  await captureElement(card.first(), 'account-detail-research-history');
  await card.first().click();

  const sections = {
    'research-exec-summary': page.getByTestId('research-section-executive-summary'),
    'research-signals-section': page.getByTestId('research-section-buying-signals'),
    'research-custom-criteria': page.getByTestId('research-section-custom-criteria'),
    'research-decision-makers': page.getByTestId('research-section-decision-makers'),
    'research-company-overview': page.getByTestId('research-section-company-overview'),
    'research-sources': page.getByTestId('research-section-sources'),
  } as const;

  for (const [id, locator] of Object.entries(sections)) {
    await captureElement(locator, id);
  }

  await captureFullPage(page, 'final-overview-collage');
}

async function captureSignalsAssets(page: Page) {
  await page.goto('/signals');
  const feed = page.getByTestId('all-signals');
  await captureElement(feed, 'signals-feed');

  await page.goto('/');
  const reviewButton = page.getByRole('button', { name: /Review/i }).first();
  const reviewVisible = await reviewButton.isVisible({ timeout: 10_000 }).catch(() => false);
  if (reviewVisible) {
    await reviewButton.scrollIntoViewIfNeeded();
    await reviewButton.click({ force: true });
  } else {
    const hotAccount = page.locator('[data-testid="account-list-item"][data-priority="hot"]').first();
    const hasHot = (await hotAccount.count()) > 0;
    const target = hasHot ? hotAccount : page.locator('[data-testid="account-list-item"]').first();
    await target.waitFor({ state: 'visible', timeout: 15_000 });
    await target.click({ force: true });
  }

  const drawer = page.getByTestId('signals-drawer');
  const drawerVisible = await drawer.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(async () => {
    await page.keyboard.press('Escape').catch(() => {});
    if (await reviewButton.isVisible().catch(() => false)) {
      await reviewButton.click({ force: true });
    } else {
      const anyAccount = page.locator('[data-testid="account-list-item"]').first();
      await anyAccount.click({ force: true }).catch(() => {});
    }
    return drawer.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  });
  if (drawerVisible) {
    await captureElement(drawer, 'signal-detail');
    await page.getByLabel('Close').click({ force: true }).catch(() => {});
  }
}

async function captureAccountAssets(page: Page) {
  await page.goto('/');
  const widget = page.getByTestId('account-list-widget');
  await captureElement(widget, 'account-dashboard');

  const hotCard = page.locator('[data-testid="account-list-item"][data-priority="hot"]').first();
  await captureElement(hotCard, 'account-card-hot');

  const emptyCard = page.locator('[data-testid="account-list-item"][data-priority="standard"]').first();
  await captureElement(emptyCard, 'account-card-empty');
}

async function captureNavigationAssets(page: Page) {
  await page.goto('/');
  const sidebar = page.getByTestId('sidebar');
  await captureElement(sidebar, 'navigation-sidebar');

  await page.getByTestId('sidebar-toggle').click();
  const collapsed = page.locator('[data-testid="sidebar"][data-state="collapsed"]');
  await captureElement(collapsed, 'navigation-compact');

  // Re-expand for subsequent captures
  await page.getByTestId('sidebar-toggle').click();
}

async function captureGlobalSearch(page: Page) {
  await page.goto('/research');
  const searchInput = page.getByTestId('research-history-search');
  await captureElement(searchInput, 'global-search');
}

async function captureHelpBanner(page: Page) {
  await page.goto('/');
  const banner = page.getByTestId('profile-completeness-banner');
  if (await banner.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await captureElement(banner, 'help-support');
  } else {
    await captureFullPage(page, 'help-support');
  }
}

async function captureQuickModes(page: Page) {
  await captureLastAssistantMessage(page, 'Rubric - Quick Facts', 'quick-research-summary');
  await captureLastAssistantMessage(page, 'Rubric - Specific Question', 'specific-question-response');
}

test.describe.serial('Rubric artifact capture', () => {
  const email = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com';

  test.beforeAll(async () => {
    await cleanRubricDir();
  });

  test('generate rubric screenshots', async ({ page }) => {
    await captureOnboardingFlow(page, email);
    await captureConfiguration(page);
    await captureDashboardGreeting(page, 'dashboard-initial-greeting');

    await seedRubricFixtures(email);
    await captureDashboardGreeting(page, 'dashboard-signals-focused');

    await captureResearchSections(page);
    await captureQuickModes(page);
    await captureMeetingPrepSections(page, 'Rubric - Meeting Prep');
    await captureSignalsAssets(page);
    await captureAccountAssets(page);
    await captureNavigationAssets(page);
    await captureGlobalSearch(page);
    await captureHelpBanner(page);

    await markAllSignalsHandled(email);
    await captureDashboardGreeting(page, 'dashboard-no-signals');
  });
});
