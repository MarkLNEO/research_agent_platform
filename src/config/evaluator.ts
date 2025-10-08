export interface QualityHeuristic {
  id: string;
  label: string;
  description: string;
}

export interface GoldenTask {
  id: string;
  template_id: string;
  label: string;
  fixture: Record<string, unknown>;
  assertions: string[];
}

export interface QualityEvaluator {
  heuristics: QualityHeuristic[];
  golden_tasks: GoldenTask[];
  budgets: {
    max_latency_ms: number;
    max_tokens: number;
  };
}

export const QUALITY_EVALUATOR: QualityEvaluator = {
  heuristics: [
    {
      id: 'no_placeholder_text',
      label: 'No placeholder text',
      description: 'Outputs should never include TODOs, lorem ipsum, or unresolved placeholders.'
    },
    {
      id: 'markdown_sections',
      label: 'Structured markdown',
      description: 'Section headings follow the template schema and render in downstream surfaces.'
    },
    {
      id: 'executive_tone',
      label: 'Executive-ready tone',
      description: 'Briefs stay concise, cite sources, and provide next-step guidance.'
    },
    {
      id: 'no_pii_leakage',
      label: 'No PII leakage',
      description: 'Sensitive data is redacted per guardrail configuration.'
    },
    {
      id: 'medical_citation_check',
      label: 'Medical citations',
      description: 'Healthcare outputs cite clinical or regulatory sources, not marketing fluff.'
    }
  ],
  golden_tasks: [
    {
      id: 'exec_brief_golden_acme',
      template_id: 'exec_brief_v1',
      label: 'Acme Corp Executive Brief',
      fixture: {
        company: 'acme.com',
        focus: ['leadership', 'news', 'positioning']
      },
      assertions: [
        'sources>=5',
        'contains_section:leadership',
        'contains_section:recent_news',
        'confidence_label_present'
      ]
    },
    {
      id: 'security_due_diligence_golden',
      template_id: 'security_due_diligence_v1',
      label: 'Security diligence sample',
      fixture: {
        company: 'contoso-security.com',
        scope: ['incidents', 'governance', 'compliance'],
        lookback_days: 365
      },
      assertions: [
        'risk_rating_present',
        'mitigation_steps>=3',
        'sources>=6'
      ]
    },
    {
      id: 'clinical_sponsor_scan_golden',
      template_id: 'clinical_sponsor_scan_v1',
      label: 'Clinical sponsor golden task',
      fixture: {
        sponsor: 'fabrikam biotech',
        trial_focus: ['oncology'],
        outputs: ['pdf', 'slide']
      },
      assertions: [
        'pipeline_table>=3',
        'signals>=3',
        'citations_all_sections'
      ]
    }
  ],
  budgets: {
    max_latency_ms: 180000,
    max_tokens: 20000
  }
};

export function getHeuristicsByIds(ids: string[]): QualityHeuristic[] {
  return QUALITY_EVALUATOR.heuristics.filter(heuristic => ids.includes(heuristic.id));
}
