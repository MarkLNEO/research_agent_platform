import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResolvedPreferences, type PreferenceRow } from '../../lib/preferences/store.js';

const samplePromptConfig = {
  preferred_research_type: 'quick',
  default_output_brevity: 'short',
  default_tone: 'warm',
  always_tldr: true,
};

test('buildResolvedPreferences applies prompt config defaults', () => {
  const resolved = buildResolvedPreferences(samplePromptConfig, []);
  assert.equal(resolved.coverage.mode, 'quick');
  assert.equal(resolved.coverage.depth, 'shallow');
  assert.equal(resolved.summary.brevity, 'short');
  assert.equal(resolved.tone, 'warm');
});

test('buildResolvedPreferences nests focus preferences', () => {
  const rows: PreferenceRow[] = [
    {
      id: 'pref-1',
      user_id: 'user',
      key: 'focus.eco',
      value: { on: true, weight: 0.9 },
      source: 'followup',
      confidence: 0.9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const resolved = buildResolvedPreferences(samplePromptConfig, rows);
  assert.ok(resolved.focus.eco);
  assert.equal(resolved.focus.eco.on, true);
  assert.equal(resolved.focus.eco.weight, 0.9);
});

test('buildResolvedPreferences overwrites when preference keys exist', () => {
  const rows: PreferenceRow[] = [
    {
      id: 'pref-2',
      user_id: 'user',
      key: 'summary.brevity',
      value: 'long',
      source: 'followup',
      confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const resolved = buildResolvedPreferences(samplePromptConfig, rows);
  assert.equal(resolved.summary.brevity, 'long');
});

test('follow-up preference overrides setup entry with higher confidence', () => {
  const now = new Date();
  const rows: PreferenceRow[] = [
    {
      id: 'pref-setup',
      user_id: 'user',
      key: 'focus.eco',
      value: { on: true, weight: 0.6 },
      source: 'setup',
      confidence: 0.7,
      created_at: new Date(now.getTime() - 60000).toISOString(),
      updated_at: new Date(now.getTime() - 60000).toISOString(),
    },
    {
      id: 'pref-followup',
      user_id: 'user',
      key: 'focus.eco',
      value: { on: false },
      source: 'followup',
      confidence: 0.95,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  const resolved = buildResolvedPreferences(samplePromptConfig, rows);
  assert.equal(resolved.focus.eco?.on, false);
});
