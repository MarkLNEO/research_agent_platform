import type { SignalPreference, DetectorContext, DetectorResult, SignalDetector } from '../types.ts';
import { normalizeSignalType, runPromptDetector } from './shared.ts';

function filterPreferences(preferences: SignalPreference[]): SignalPreference[] {
  return preferences.filter((pref) => {
    const normalized = normalizeSignalType(pref.signal_type);
    return normalized.includes('funding') || normalized.includes('investment');
  });
}

async function run(context: DetectorContext): Promise<DetectorResult> {
  if (context.preferences.length === 0) {
    return { detector: 'funding_round', status: 'noop', signals: [] };
  }

  return runPromptDetector(
    context,
    {
      detector: 'funding_round',
      defaultSignalType: 'funding_round',
      description: 'funding rounds, equity investments, or major capital raises',
      queryHints: [
        '"raised" OR "Series" OR "seed round" OR "funding round"',
        'venture capital investment or growth equity',
        'press releases from investors or financial publications',
      ],
      instruction:
        'Include the round type and amount when possible. Only include confirmed funding events tied directly to the company.',
      formatExample:
        '[{"signal_type":"funding_round","description":"Closed $25M Series B led by Insight Partners","signal_date":"2025-08-30","source_url":"https://techfinance.example.com/acme-series-b","confidence":"high"}]',
    },
  );
}

const fundingRoundDetector: SignalDetector = {
  id: 'funding_round',
  filterPreferences,
  run,
};

export default fundingRoundDetector;
