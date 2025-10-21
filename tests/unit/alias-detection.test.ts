import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAliasAffirmations, extractAliasCandidates } from '../../src/utils/aliasDetection.js';

test('extractAliasCandidates captures mixed-case tokens with digits', () => {
  const tokens = extractAliasCandidates('Need info on M365 security posture vs Microsoft 365');
  assert.ok(tokens.includes('M365'));
});

test('detectAliasAffirmations maps alias to canonical name', () => {
  const matches = detectAliasAffirmations('Yes, m365 is Microsoft 365.');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].alias, 'm365');
  assert.equal(matches[0].canonical, 'Microsoft 365');
});

test('detectAliasAffirmations handles reversed statements', () => {
  const matches = detectAliasAffirmations('Microsoft 365 equals M365 in our docs.');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].canonical, 'Microsoft 365');
  assert.equal(matches[0].alias, 'M365');
});
