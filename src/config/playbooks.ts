export interface Playbook {
  id: string;
  label: string;
  description: string;
  template_id: string;
  guardrail_profile_id: string;
  signal_set_id: string;
  inputs: Record<string, unknown>;
  exports?: Array<'pdf' | 'json' | 'crm_card' | 'slide'>;
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'cliff_exec_brief',
    label: 'Exec Brief (Leadership + News + Positioning)',
    description: 'Cliff’s default playbook for pre-meeting briefs with secure guardrails.',
    template_id: 'exec_brief_v1',
    guardrail_profile_id: 'secure',
    signal_set_id: 'default_signals_v1',
    inputs: {
      focus: ['leadership', 'news', 'positioning']
    },
    exports: ['pdf', 'crm_card']
  },
  {
    id: 'security_power_mode',
    label: 'Security Diligence (Power Mode)',
    description: 'Faster posture for urgent security due diligence requests with richer data sources.',
    template_id: 'security_due_diligence_v1',
    guardrail_profile_id: 'power',
    signal_set_id: 'security_signals_v1',
    inputs: {
      scope: ['incidents', 'governance', 'compliance', 'infrastructure'],
      lookback_days: 365
    },
    exports: ['pdf', 'json']
  },
  {
    id: 'healthcare_brief',
    label: 'Clinical Sponsor Scan (Slides)',
    description: 'Ready-to-send sponsor snapshot focused on oncology trials with slide output.',
    template_id: 'clinical_sponsor_scan_v1',
    guardrail_profile_id: 'power',
    signal_set_id: 'healthcare_signals_v1',
    inputs: {
      trial_focus: ['oncology']
    },
    exports: ['pdf', 'slide']
  }
];
