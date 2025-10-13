import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryBlockFromData, DEFAULT_MEMORY_MAX_BYTES } from '../../server/routes/_lib/memory.ts';

test('buildMemoryBlockFromData returns empty string when no inputs', () => {
  const block = buildMemoryBlockFromData('company_research', [], []);
  assert.equal(block, '', 'Expected no memory block when inputs are empty');
});

test('buildMemoryBlockFromData includes confirmed and implicit sections within size budget', () => {
  const knowledge = Array.from({ length: 3 }).map((_, idx) => ({
    title: `Rule ${idx + 1}`,
    content: `Always prioritize signal ${idx + 1}`,
  }));

  const implicit = [
    { key: 'tone', value_json: { value: 0.82, confidence: 0.7 } },
    { key: 'length', value_json: { choice: 'brief', confidence: 0.9 } },
    {
      key: 'topics',
      value_json: {
        map: { pricing_pressure: 0.9, security: 0.8, toolchain: 0.6 },
        confidence: 0.91,
      },
    },
  ];

  const block = buildMemoryBlockFromData('company_research', knowledge, implicit);

  assert.ok(block.startsWith('<<memory v=1 agent=company_research>'), 'Block should start with memory header');
  assert.ok(block.includes('# confirmed knowledge'), 'Should list confirmed knowledge heading');
  assert.ok(block.includes('# implicit tendencies'), 'Should list implicit tendencies heading');
  assert.ok(block.includes('tone:'), 'Should include formatted tone tendency');
  assert.ok(block.includes('Always prioritize signal 1'), 'Should include first knowledge line');
  assert.ok(block.endsWith('</memory>'), 'Block should close with memory tag');
  assert.ok(Buffer.byteLength(block, 'utf8') <= DEFAULT_MEMORY_MAX_BYTES, 'Block must respect byte budget');
});

test('buildMemoryBlockFromData trims entries to respect byte ceiling', () => {
  const longLine = 'Data'.repeat(120);
  const knowledge = Array.from({ length: 10 }).map(() => ({ content: longLine }));
  const implicit = Array.from({ length: 20 }).map((_, idx) => ({
    key: `topic_${idx}`,
    value_json: { map: { [`signal_${idx}`]: 0.9 }, confidence: 0.95 },
  }));

  const block = buildMemoryBlockFromData('company_research', knowledge, implicit);
  const bytes = Buffer.byteLength(block, 'utf8');

  assert.ok(bytes <= DEFAULT_MEMORY_MAX_BYTES, `Block should be capped at ${DEFAULT_MEMORY_MAX_BYTES} bytes, got ${bytes}`);
  assert.ok(block === '' || block.endsWith('</memory>'), 'Block should either be empty or end with closing tag');
});
