import type { SignalPreference, DetectorContext, DetectorResult, SignalDetector } from '../types.ts';
import { normalizeSignalType, runPromptDetector } from './shared.ts';

function filterPreferences(preferences: SignalPreference[]): SignalPreference[] {
  return preferences.filter((pref) => {
    const normalized = normalizeSignalType(pref.signal_type);
    return normalized.includes('hiring') || normalized.includes('recruit');
  });
}

async function run(context: DetectorContext): Promise<DetectorResult> {
  const filtered = filterPreferences(context.preferences);
  if (filtered.length === 0) {
    return { detector: 'hiring_surge', status: 'noop', signals: [] };
  }

  return runPromptDetector(
    { ...context, preferences: filtered },
    {
      detector: 'hiring_surge',
      defaultSignalType: 'hiring_surge',
      description: 'hiring surges or notable recruiting activity related to security or target functions',
      queryHints: [
        '"hiring" OR "job openings" OR "now hiring" + company name',
        'careers page updates or LinkedIn job listings',
        'large-scale recruitment drives or talent expansion',
      ],
      instruction:
        'Summaries should mention the number or type of roles if available. Ignore single job postings unless signalling significant change.',
      formatExample:
        '[{"signal_type":"hiring_surge","description":"Posted 18 new cybersecurity roles across engineering and operations","signal_date":"2025-09-24","source_url":"https://jobs.example.com/security-openings","confidence":"medium"}]',
    },
  );
}

const hiringSurgeDetector: SignalDetector = {
  id: 'hiring_surge',
  filterPreferences,
  run,
};

export default hiringSurgeDetector;
