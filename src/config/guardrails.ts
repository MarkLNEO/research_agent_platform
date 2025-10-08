export interface GuardrailProfile {
  id: string;
  label: string;
  description: string;
  policy: {
    source_allowlist?: string[];
    source_blocklist?: string[];
    max_tokens_per_task: number;
    parallelism: number;
    require_confirm_discovered_sources?: boolean;
    redaction?: {
      pii: 'on' | 'off';
      secrets: 'on' | 'off';
    };
    audit: {
      log_level: 'summary' | 'detailed';
      retain_days?: number;
    };
    cost_controls?: {
      max_credits_per_run: number;
      alert_threshold: number;
    };
  };
  recommended_for: string[];
  guarantees: string[];
}

export const GUARDRAIL_PROFILES: GuardrailProfile[] = [
  {
    id: 'secure',
    label: 'Secure Mode',
    description:
      'Default posture with strict source allowlists, aggressive redaction, and conservative cost ceilings—ideal for regulated teams.',
    policy: {
      source_allowlist: ['newsapi', 'official_sites', 'linkedin', 'sam_gov'],
      max_tokens_per_task: 12000,
      parallelism: 4,
      require_confirm_discovered_sources: true,
      redaction: {
        pii: 'on',
        secrets: 'on'
      },
      audit: {
        log_level: 'detailed',
        retain_days: 90
      },
      cost_controls: {
        max_credits_per_run: 45,
        alert_threshold: 0.8
      }
    },
    recommended_for: ['Security teams', 'Public sector', 'Healthcare'],
    guarantees: ['Citations for every fact', 'No unvetted sources', 'Audit trail retained 90 days']
  },
  {
    id: 'power',
    label: 'Power Mode',
    description:
      'Expanded surface area with higher parallelism and flexible sources—best when speed matters and the operator is a trusted analyst.',
    policy: {
      source_allowlist: ['newsapi', 'official_sites', 'linkedin', 'developer_blogs', 'industry_forums'],
      source_blocklist: ['reddit', 'low_trust_scrapers'],
      max_tokens_per_task: 20000,
      parallelism: 8,
      require_confirm_discovered_sources: false,
      redaction: {
        pii: 'on',
        secrets: 'off'
      },
      audit: {
        log_level: 'summary',
        retain_days: 30
      },
      cost_controls: {
        max_credits_per_run: 85,
        alert_threshold: 0.9
      }
    },
    recommended_for: ['Executive briefs', 'Competitive response teams'],
    guarantees: ['Citations on final output', 'Signal detector logs kept', 'Cost telemetry shown post-run']
  }
];

export function getGuardrailProfileById(id: string): GuardrailProfile | undefined {
  return GUARDRAIL_PROFILES.find(profile => profile.id === id);
}
