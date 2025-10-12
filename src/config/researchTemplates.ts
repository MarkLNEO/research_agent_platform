import { FileText, Shield, Stethoscope, Building2 } from 'lucide-react';

export type TemplateInputType =
  | 'company_identifier'
  | 'string'
  | 'string[]'
  | 'enum'
  | 'enum[]'
  | 'boolean'
  | 'number'
  | 'date_range';

export interface TemplateInputSpec {
  key: string;
  label: string;
  type: TemplateInputType;
  required?: boolean;
  description?: string;
  values?: string[];
  default?: string | string[] | number | boolean | { start: string; end: string };
  placeholder?: string;
}

export interface TemplateSectionSpec {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  when?: string;
  source?: 'signal_engine' | 'planner' | 'llm';
  schema?: Record<string, unknown>;
}

export interface ToolPolicySpec {
  allowed: string[];
  fallbacks?: Record<string, string[]>;
  max_parallel?: number;
  planner_preferences?: {
    prefer?: 'reliability' | 'cost' | 'latency';
    fallback?: 'reliability' | 'cost' | 'latency';
  };
}

export interface QualityBarSpec {
  must_include: string[];
  time_budget_sec: number;
  tokens_budget?: number;
  heuristics?: string[];
  deterministic?: {
    temperature: number;
    seed: number;
  };
}

export interface UseCaseTemplate {
  id: string;
  version: string;
  label: string;
  category: 'brief' | 'prospecting' | 'due_diligence' | 'market' | 'competitive';
  description: string;
  inputs: Record<string, TemplateInputSpec>;
  sections: TemplateSectionSpec[];
  tools_policy: ToolPolicySpec;
  guardrails_profile: string;
  quality_bar: QualityBarSpec;
  export: Array<'pdf' | 'json' | 'crm_card' | 'slide'>;
  default_signal_set: string;
  icon?: typeof FileText;
  tags?: string[];
  success_criteria?: string[];
}

export const USE_CASE_TEMPLATES: UseCaseTemplate[] = [
  {
    id: 'exec_brief_v1',
    version: '1.1.0',
    label: 'Executive Brief',
    category: 'brief',
    description:
      'A 2-page executive-ready brief focused on leadership, positioning, news, and actionable signals for upcoming meetings.',
    inputs: {
      company: {
        key: 'company',
        label: 'Company',
        type: 'company_identifier',
        required: true,
        description: 'Company name, domain, or ticker symbol.'
      },
      focus: {
        key: 'focus',
        label: 'Areas of emphasis',
        type: 'enum[]',
        values: ['leadership', 'news', 'positioning', 'hiring', 'tech'],
        default: ['leadership', 'news', 'positioning'],
        description: 'Choose the sections that matter most for this brief.'
      },
      compare_to: {
        key: 'compare_to',
        label: 'Comparative peers',
        type: 'string[]',
        description: 'Optional list of peer companies for comparative insights.'
      }
    },
    sections: [
      { id: 'tldr', label: 'High Level', required: true, description: 'High-level executive summary with three punchy bullets.' },
      {
        id: 'leadership',
        label: 'Leadership',
        when: "focus.includes('leadership')",
        description: 'Leadership roster and talking points.',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              linkedin: { type: 'string', format: 'uri' },
              notes: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      },
      {
        id: 'recent_news',
        label: 'Recent News',
        when: "focus.includes('news')",
        description: 'Recent events with why-it-matters commentary.',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              date: { type: 'string', format: 'date' },
              url: { type: 'string', format: 'uri' },
              why_it_matters: { type: 'string' }
            }
          }
        }
      },
      {
        id: 'positioning',
        label: 'Positioning',
        when: "focus.includes('positioning')",
        description: 'Messaging, differentiation, and current initiatives.'
      },
      {
        id: 'signals',
        label: 'Buying Signals',
        source: 'signal_engine',
        description: 'Signals surfaced via the active detector set.'
      },
      {
        id: 'meta',
        label: 'Meta',
        description: 'Citations, tokens used, guardrail posture.',
        source: 'planner'
      }
    ],
    tools_policy: {
      allowed: ['web_search', 'news_search', 'linkedin_people', 'tech_stack_lookup', 'financials_fetch'],
      fallbacks: {
        linkedin_people: ["web_fetch + page_parser('leadership')"],
        financials_fetch: ['web_search']
      },
      max_parallel: 8,
      planner_preferences: {
        prefer: 'reliability',
        fallback: 'cost'
      }
    },
    guardrails_profile: 'secure',
    quality_bar: {
      must_include: ['sources>=5', 'confidence_labels', 'how_to_use'],
      time_budget_sec: 180,
      tokens_budget: 12000,
      heuristics: ['no_placeholder_text', 'markdown_sections', 'executive_tone'],
      deterministic: {
        temperature: 0.2,
        seed: 37
      }
    },
    export: ['pdf', 'json', 'crm_card'],
    default_signal_set: 'default_signals_v1',
    icon: FileText,
    tags: ['executive', 'b2b', 'sales'],
    success_criteria: [
      'Every section adheres to schema',
      'At least 5 cited sources',
      'Signals scored hot/warm/standard'
    ]
  },
  {
    id: 'security_due_diligence_v1',
    version: '1.0.0',
    label: 'Security Due Diligence',
    category: 'due_diligence',
    description:
      'Assess vendor security posture with emphasis on incidents, governance, and compliance readiness—built for Cliff’s security reviews.',
    inputs: {
      company: {
        key: 'company',
        label: 'Vendor',
        type: 'company_identifier',
        required: true,
        description: 'Company name or domain to review.'
      },
      scope: {
        key: 'scope',
        label: 'Focus scope',
        type: 'enum[]',
        values: ['incidents', 'governance', 'compliance', 'infrastructure', 'third_parties'],
        default: ['incidents', 'governance', 'compliance'],
        description: 'Pick the lenses that matter for this due diligence cycle.'
      },
      lookback_days: {
        key: 'lookback_days',
        label: 'Lookback window (days)',
        type: 'number',
        default: 365,
        description: 'Time horizon for news and disclosures.'
      }
    },
    sections: [
      { id: 'summary', label: 'Summary', required: true, description: 'Overall risk verdict and key findings.' },
      {
        id: 'security_incidents',
        label: 'Security Incidents',
        when: "scope.includes('incidents')",
        description: 'Incident history with timeline and remediation notes.',
        source: 'signal_engine'
      },
      {
        id: 'governance',
        label: 'Governance & Controls',
        when: "scope.includes('governance')",
        description: 'Policies, leadership roles, and risk ownership.'
      },
      {
        id: 'compliance',
        label: 'Compliance & Certifications',
        when: "scope.includes('compliance')",
        description: 'Certifications, audits, and regulatory posture.'
      },
      {
        id: 'architecture',
        label: 'Infrastructure Footprint',
        when: "scope.includes('infrastructure')",
        description: 'Cloud footprint, key vendors, and architectural notes.'
      },
      {
        id: 'third_parties',
        label: 'Critical Third Parties',
        when: "scope.includes('third_parties')",
        description: 'Dependencies that influence risk exposure.'
      },
      {
        id: 'recommendations',
        label: 'Recommended Actions',
        description: 'Next steps, questions, and mitigation suggestions.'
      }
    ],
    tools_policy: {
      allowed: ['web_search', 'breach_monitor', 'compliance_registry', 'tech_stack_lookup', 'news_search'],
      fallbacks: {
        breach_monitor: ['security_news_api', 'web_search']
      },
      max_parallel: 6,
      planner_preferences: {
        prefer: 'reliability',
        fallback: 'latency'
      }
    },
    guardrails_profile: 'secure',
    quality_bar: {
      must_include: ['sources>=6', 'risk_rating', 'mitigation_plan'],
      time_budget_sec: 240,
      tokens_budget: 15000,
      heuristics: ['no_pii_leakage', 'separate_incident_summary'],
      deterministic: {
        temperature: 0.1,
        seed: 11
      }
    },
    export: ['pdf', 'json'],
    default_signal_set: 'security_signals_v1',
    icon: Shield,
    tags: ['security', 'compliance'],
    success_criteria: [
      'Incidents verified with citations',
      'Risk score computed and explained',
      'Actionable mitigation steps provided'
    ]
  },
  {
    id: 'clinical_sponsor_scan_v1',
    version: '0.9.0',
    label: 'Clinical Trial Sponsor Scan',
    category: 'market',
    description:
      'Healthcare-ready brief focused on clinical trial sponsors, pipeline momentum, and partnership opportunities.',
    inputs: {
      sponsor: {
        key: 'sponsor',
        label: 'Sponsor',
        type: 'company_identifier',
        required: true,
        description: 'Sponsor organization or trial name.'
      },
      trial_focus: {
        key: 'trial_focus',
        label: 'Trial focus areas',
        type: 'enum[]',
        values: ['oncology', 'cardiology', 'neurology', 'rare_disease', 'metabolic'],
        default: ['oncology'],
        description: 'Therapeutic focus to emphasize.'
      },
      outputs: {
        key: 'outputs',
        label: 'Output modes',
        type: 'enum[]',
        values: ['pdf', 'json', 'slide'],
        default: ['pdf', 'slide'],
        description: 'Export surfaces to generate.'
      }
    },
    sections: [
      { id: 'snapshot', label: 'Sponsor Snapshot', required: true, description: 'Key metrics, headquarters, and funding.' },
      {
        id: 'pipeline',
        label: 'Pipeline Momentum',
        description: 'Recent trials, stage progression, and highlights.'
      },
      {
        id: 'partnerships',
        label: 'Partnership Landscape',
        description: 'Strategic partners, CROs, and alliances.'
      },
      {
        id: 'signals',
        label: 'Signals',
        source: 'signal_engine',
        description: 'Sponsor intent and market signals.'
      },
      {
        id: 'compare',
        label: 'Comparator Snapshot',
        description: 'Quick comparison against peer sponsors.',
        when: 'true'
      },
      {
        id: 'meta',
        label: 'Meta',
        source: 'planner',
        description: 'Sources, cost, and run metadata.'
      }
    ],
    tools_policy: {
      allowed: ['clinical_trials_registry', 'news_search', 'web_search', 'linkedin_people', 'financials_fetch'],
      fallbacks: {
        clinical_trials_registry: ['web_search']
      },
      max_parallel: 5,
      planner_preferences: {
        prefer: 'latency',
        fallback: 'cost'
      }
    },
    guardrails_profile: 'power',
    quality_bar: {
      must_include: ['sources>=4', 'pipeline_timeline', 'partnership_summary'],
      time_budget_sec: 180,
      tokens_budget: 10000,
      heuristics: ['medical_citation_check', 'no_patient_pii'],
      deterministic: {
        temperature: 0.25,
        seed: 72
      }
    },
    export: ['pdf', 'json', 'slide'],
    default_signal_set: 'healthcare_signals_v1',
    icon: Stethoscope,
    tags: ['healthcare', 'life sciences'],
    success_criteria: [
      'Pipeline table populated with >=3 entries',
      'Signals scored with rationale',
      'Peer comparison names at least two sponsors'
    ]
  },
  {
    id: 'gov_vendor_snapshot_v1',
    version: '0.8.0',
    label: 'Public Sector Vendor Snapshot',
    category: 'competitive',
    description:
      'Designed for public sector pursuits—captures contract awards, agency relationships, and compliance flags.',
    inputs: {
      vendor: {
        key: 'vendor',
        label: 'Vendor',
        type: 'company_identifier',
        required: true,
        description: 'Company or supplier serving public sector.'
      },
      agencies: {
        key: 'agencies',
        label: 'Target Agencies',
        type: 'string[]',
        description: 'Specific agencies to emphasize (e.g. DoD, GSA).'
      },
      time_horizon: {
        key: 'time_horizon',
        label: 'Contract lookback (years)',
        type: 'number',
        default: 3,
        description: 'Historic window for contract awards.'
      }
    },
    sections: [
      { id: 'overview', label: 'Vendor Overview', required: true },
      {
        id: 'contract_awards',
        label: 'Contract Awards',
        description: 'Recent government awards with contract value and agency.'
      },
      {
        id: 'agency_relationships',
        label: 'Agency Relationships',
        description: 'Key contacts and historical partnerships.'
      },
      {
        id: 'compliance_flags',
        label: 'Compliance Flags',
        source: 'signal_engine',
        description: 'Detections of suspensions, protests, or audit findings.'
      },
      {
        id: 'competitive_position',
        label: 'Competitive Position',
        description: 'Comparative view across incumbents and challengers.'
      }
    ],
    tools_policy: {
      allowed: ['sam_gov', 'fpds_contracts', 'news_search', 'web_search', 'linkedin_people'],
      fallbacks: {
        sam_gov: ['web_fetch + page_parser("sam_gov")']
      },
      max_parallel: 4,
      planner_preferences: {
        prefer: 'reliability',
        fallback: 'cost'
      }
    },
    guardrails_profile: 'secure',
    quality_bar: {
      must_include: ['sources>=5', 'contract_values', 'agency_contacts'],
      time_budget_sec: 210,
      tokens_budget: 14000,
      heuristics: ['no_export_controlled_data', 'up_to_date_awards'],
      deterministic: {
        temperature: 0.2,
        seed: 5
      }
    },
    export: ['pdf', 'json', 'crm_card'],
    default_signal_set: 'public_sector_signals_v1',
    icon: Building2,
    tags: ['public sector', 'government'],
    success_criteria: [
      'Award table with amount + agency',
      'Compliance section cites authoritative sources',
      'Competitive view names at least two rivals'
    ]
  }
];

export function listUseCaseTemplates(
  category?: UseCaseTemplate['category'] | 'all'
): UseCaseTemplate[] {
  if (!category || category === 'all') {
    return USE_CASE_TEMPLATES;
  }
  return USE_CASE_TEMPLATES.filter(template => template.category === category);
}

export function getUseCaseTemplateById(id: string): UseCaseTemplate | undefined {
  return USE_CASE_TEMPLATES.find(template => template.id === id);
}

export function getDefaultTemplate(): UseCaseTemplate {
  return USE_CASE_TEMPLATES[0];
}

export function buildDefaultTemplateInputs(template: UseCaseTemplate): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const input of Object.values(template.inputs)) {
    if (input.default !== undefined) {
      defaults[input.key] = input.default;
    } else if (input.type === 'enum[]' || input.type === 'string[]') {
      defaults[input.key] = [];
    } else if (input.type === 'boolean') {
      defaults[input.key] = false;
    } else if (input.type === 'number') {
      defaults[input.key] = 0;
    } else {
      defaults[input.key] = '';
    }
  }
  return defaults;
}
