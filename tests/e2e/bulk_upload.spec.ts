import { test, expect } from '@playwright/test';
import { ensureLoggedIn, seedBulkResearchJob, adminClient, clearBulkJobsForUser } from './helpers';
import fs from 'fs';
import path from 'path';

test.describe('Bulk Research', () => {
  test('seeded job appears and updates to completed', async ({ page }) => {
    await ensureLoggedIn(page);

    // Ensure a clean slate
    await clearBulkJobsForUser();

    // Seed a job
    const { jobId } = await seedBulkResearchJob({ companies: ['Alpha Seed Co', 'Beta Seed LLC'], researchType: 'quick', status: 'pending' });

    await page.goto('/');
    await expect(page.getByTestId('chat-surface')).toBeVisible({ timeout: 30000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bulk-research:job-started', { detail: { jobId: 'seed' } })));

    await expect(page.getByText(/Bulk Research Jobs/i)).toBeVisible({ timeout: 20000 });
    const jobCard = page.locator('div', { hasText: 'Quick Research' }).filter({ hasText: '• 2 companies' }).first();
    await expect(jobCard).toBeVisible({ timeout: 20000 });

    // Move job to completed state and verify UI update
    const admin = await adminClient();
    await admin
      .from('bulk_research_jobs')
      .update({ status: 'completed', completed_count: 2, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), results: [
        { company: 'Alpha Seed Co', status: 'completed', completed_at: new Date().toISOString() },
        { company: 'Beta Seed LLC', status: 'completed', completed_at: new Date().toISOString() },
      ] })
      .eq('id', jobId);

    await page.evaluate(() => window.dispatchEvent(new Event('bulk-research:job-started')));
    await expect(jobCard.getByRole('button', { name: /Download/i })).toBeVisible({ timeout: 20000 });
  });
});
