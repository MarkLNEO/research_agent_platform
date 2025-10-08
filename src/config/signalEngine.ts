export type SignalDetectorType =
  | 'keyword_news'
  | 'news_regex'
  | 'job_post_title'
  | 'tech_detect'
  | 'regulatory_filing'
  | 'contract_award';

export interface SignalDetector {
  id: string;
  label: string;
  type: SignalDetectorType;
  description: string;
  weight: number;
  window_days: number;
  threshold?: number;
  keywords?: string[];
  pattern?: string;
  tech?: string[];
}

export interface SignalScoringProfile {
  combine: 'weighted_sum' | 'max' | 'averaged';
  thresholds: {
    hot: number;
    warm: number;
  };
}

export interface SignalSet {
  id: string;
  label: string;
  description: string;
  detectors: SignalDetector[];
  scoring: SignalScoringProfile;
  default_for?: string[];
}

export const SIGNAL_SETS: SignalSet[] = [
  {
    id: 'default_signals_v1',
    label: 'Growth & Intent Signals',
    description:
      'General-purpose detector set tuned for SaaS growth indicators like AI adoption, security incidents, and governance hires.',
    detectors: [
      {
        id: 'ai_adoption',
        label: 'AI Adoption',
        type: 'keyword_news',
        keywords: ['LLM', 'Copilot', 'genAI', 'AI assistant'],
        weight: 0.9,
        window_days: 365,
        description: 'News about AI product launches or initiatives signals innovation priority.'
      },
      {
        id: 'security_incident',
        label: 'Security Incident',
        type: 'news_regex',
        pattern: '(breach|incident|CVE-)',
        weight: 1.0,
        window_days: 180,
        description: 'Breach or CVE disclosures drive urgency for security tooling.',
        threshold: 0.5
      },
      {
        id: 'governance_hire',
        label: 'Governance Hire',
        type: 'job_post_title',
        keywords: ['Data Governance', 'DPO', 'Security Engineer', 'Head of Compliance'],
        weight: 0.7,
        window_days: 120,
        description: 'Hiring signals around governance roles indicate maturing programs.'
      },
      {
        id: 'tool_footprint',
        label: 'Tool Footprint',
        type: 'tech_detect',
        tech: ['Okta', 'Zscaler', 'Snowflake', 'ServiceNow'],
        weight: 0.4,
        window_days: 400,
        description: 'Existing tooling hints at integration opportunities or gaps.'
      }
    ],
    scoring: {
      combine: 'weighted_sum',
      thresholds: {
        hot: 0.8,
        warm: 0.5
      }
    },
    default_for: ['exec_brief_v1']
  },
  {
    id: 'security_signals_v1',
    label: 'Security Risk Signals',
    description: 'Purpose-built detectors for security diligence and vendor risk reviews.',
    detectors: [
      {
        id: 'public_breach',
        label: 'Public Breach Disclosure',
        type: 'news_regex',
        pattern: '(data breach|ransomware|security incident)',
        weight: 1,
        window_days: 730,
        description: 'Captures press disclosures of breaches or ransomware events.',
        threshold: 0.4
      },
      {
        id: 'governance_role',
        label: 'Governance Leadership',
        type: 'job_post_title',
        keywords: ['CISO', 'Security Director', 'Risk Manager'],
        weight: 0.6,
        window_days: 180,
        description: 'Hiring for senior security roles indicates investment in governance.'
      },
      {
        id: 'security_cert',
        label: 'Security Certification',
        type: 'keyword_news',
        keywords: ['SOC 2', 'ISO 27001', 'FedRAMP', 'HITRUST'],
        weight: 0.8,
        window_days: 365,
        description: 'Announcements of compliance certifications boost confidence.'
      }
    ],
    scoring: {
      combine: 'weighted_sum',
      thresholds: {
        hot: 0.75,
        warm: 0.45
      }
    },
    default_for: ['security_due_diligence_v1']
  },
  {
    id: 'healthcare_signals_v1',
    label: 'Healthcare Momentum Signals',
    description: 'Detectors aligned to life sciences and clinical trial sponsors.',
    detectors: [
      {
        id: 'trial_phase_progress',
        label: 'Trial Phase Progress',
        type: 'keyword_news',
        keywords: ['Phase I', 'Phase II', 'Phase III', 'FDA Fast Track'],
        weight: 0.85,
        window_days: 540,
        description: 'Progression through clinical phases signals investment and urgency.'
      },
      {
        id: 'regulatory_update',
        label: 'Regulatory Update',
        type: 'regulatory_filing',
        weight: 0.7,
        window_days: 720,
        description: 'Regulatory filings, 510(k) approvals, or trial registrations.'
      },
      {
        id: 'partnership_news',
        label: 'Strategic Partnership',
        type: 'keyword_news',
        keywords: ['collaboration', 'licensing deal', 'co-development'],
        weight: 0.6,
        window_days: 365,
        description: 'Partnership announcements highlight ecosystem moves.'
      }
    ],
    scoring: {
      combine: 'weighted_sum',
      thresholds: {
        hot: 0.7,
        warm: 0.45
      }
    },
    default_for: ['clinical_sponsor_scan_v1']
  },
  {
    id: 'public_sector_signals_v1',
    label: 'Public Sector Signals',
    description: 'Detectors tuned to federal procurement and compliance activity.',
    detectors: [
      {
        id: 'new_contract_award',
        label: 'New Contract Award',
        type: 'contract_award',
        weight: 1,
        window_days: 365,
        description: 'New FPDS or SAM.gov award filings.'
      },
      {
        id: 'bid_protest',
        label: 'Bid Protest',
        type: 'news_regex',
        pattern: '(GAO protest|bid protest|suspension)',
        weight: 0.9,
        window_days: 365,
        description: 'Signals active disputes or compliance concerns.'
      },
      {
        id: 'agency_hire',
        label: 'Agency-Facing Hire',
        type: 'job_post_title',
        keywords: ['Federal Account Executive', 'Public Sector Director'],
        weight: 0.5,
        window_days: 180,
        description: 'Hiring for federal roles indicates go-to-market momentum.'
      }
    ],
    scoring: {
      combine: 'weighted_sum',
      thresholds: {
        hot: 0.7,
        warm: 0.4
      }
    },
    default_for: ['gov_vendor_snapshot_v1']
  }
];

export function getSignalSetById(id: string): SignalSet | undefined {
  return SIGNAL_SETS.find(set => set.id === id);
}
