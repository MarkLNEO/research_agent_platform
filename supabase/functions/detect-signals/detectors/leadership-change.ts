import type { SignalPreference, DetectorContext, DetectorResult, SignalDetector } from '../types.ts';
import { normalizeSignalType, runPromptDetector } from './shared.ts';

function filterPreferences(preferences: SignalPreference[]): SignalPreference[] {
  return preferences.filter((pref) => {
    const normalized = normalizeSignalType(pref.signal_type);
    return (
      normalized.includes('leadership') ||
      normalized.includes('executive') ||
      normalized.includes('c_suite') ||
      normalized.includes('cso') ||
      normalized.includes('ciso') ||
      normalized.includes('cfo') ||
      normalized.includes('cto') ||
      normalized.includes('ceo')
    );
  });
}

async function run(context: DetectorContext): Promise<DetectorResult> {
  const filtered = filterPreferences(context.preferences);
  if (filtered.length === 0) {
    return { detector: 'leadership_change', status: 'noop', signals: [] };
  }

  return runPromptDetector(
    { ...context, preferences: filtered },
    {
      detector: 'leadership_change',
      defaultSignalType: 'leadership_change',
      description: 'executive leadership changes (C-level, VP, Board)',
      queryHints: [
        '"new CEO" OR "new CTO" OR "Appointed"',
        'executive hire OR leadership announcement',
        'board appointment OR chief security officer',
      ],
      instruction:
        'Only return confirmed leadership transitions at VP level or above. Include reason if noted (e.g., replacement, expansion).',
      formatExample:
        '[{"signal_type":"leadership_change","description":"Appointed Jane Doe as new Chief Information Security Officer","signal_date":"2025-09-18","source_url":"https://newsroom.example.com/jane-doe","confidence":"high"}]',
    },
  );
}

const leadershipChangeDetector: SignalDetector = {
  id: 'leadership_change',
  filterPreferences,
  run,
};

export default leadershipChangeDetector;
