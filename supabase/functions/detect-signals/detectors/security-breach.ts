import type { SignalPreference, DetectorContext, DetectorResult, SignalDetector } from '../types.ts';
import { normalizeSignalType, runPromptDetector } from './shared.ts';

function filterPreferences(preferences: SignalPreference[]): SignalPreference[] {
  return preferences.filter((pref) => {
    const normalized = normalizeSignalType(pref.signal_type);
    return normalized.includes('breach') || normalized.includes('security');
  });
}

async function run(context: DetectorContext): Promise<DetectorResult> {
  const filtered = filterPreferences(context.preferences);
  if (filtered.length === 0) {
    return { detector: 'security_breach', status: 'noop', signals: [] };
  }

  return runPromptDetector(
    { ...context, preferences: filtered },
    {
      detector: 'security_breach',
      defaultSignalType: 'security_breach',
      description: 'security breaches, incidents, and compromises',
      queryHints: [
        '"data breach" OR ransomware OR "security incident"',
        'credential stuffing or unauthorized access',
        'breach disclosure, notification, or regulatory filings',
      ],
      instruction:
        'Focus on confirmed incidents. Ignore vague mentions or generic cybersecurity tips. Return only events impacting the company directly.',
      formatExample:
        '[{"signal_type":"security_breach","description":"Detected ransomware attack impacting production systems","signal_date":"2025-09-12","source_url":"https://news.example.com/ransomware","confidence":"high"}]',
    },
  );
}

const securityBreachDetector: SignalDetector = {
  id: 'security_breach',
  filterPreferences,
  run,
};

export default securityBreachDetector;
