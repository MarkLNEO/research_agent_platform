-- Seed system use-case templates for Quick and Deep research if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM use_case_templates WHERE id = 'deep_research_v1') THEN
    INSERT INTO use_case_templates (id, version, label, category, json_spec, is_system)
    VALUES (
      'deep_research_v1',
      '1.0.0',
      'Deep Company Research',
      'prospecting',
      jsonb_build_object(
        'description', 'Full research with executive summary, key findings, custom criteria, signals, tech footprint, decision makers, risks, sources, and follow-ups.',
        'inputs', jsonb_build_object(
          'company', jsonb_build_object('key','company','label','Company','type','company_identifier','required',true)
        ),
        'sections', jsonb_build_array(
          jsonb_build_object('id','executive_summary','label','Executive Summary','required',true),
          jsonb_build_object('id','high_level','label','High Level','required',true),
          jsonb_build_object('id','key_findings','label','Key Findings'),
          jsonb_build_object('id','custom_criteria','label','Custom Criteria'),
          jsonb_build_object('id','signals','label','Buying Signals','source','signal_engine'),
          jsonb_build_object('id','recommended_actions','label','Recommended Next Actions'),
          jsonb_build_object('id','tech_footprint','label','Tech/Footprint'),
          jsonb_build_object('id','decision_makers','label','Decision Makers'),
          jsonb_build_object('id','risks_gaps','label','Risks & Gaps'),
          jsonb_build_object('id','sources','label','Sources'),
          jsonb_build_object('id','followups','label','Proactive Follow-ups')
        ),
        'tools_policy', jsonb_build_object('allowed', jsonb_build_array('web_search'), 'max_parallel', 8),
        'guardrails_profile', 'secure',
        'quality_bar', jsonb_build_object('must_include', jsonb_build_array('sources>=5'), 'time_budget_sec', 180, 'tokens_budget', 12000),
        'export', jsonb_build_array('pdf','json'),
        'default_signal_set', 'default_signals_v1'
      ),
      TRUE
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM use_case_templates WHERE id = 'quick_facts_v1') THEN
    INSERT INTO use_case_templates (id, version, label, category, json_spec, is_system)
    VALUES (
      'quick_facts_v1',
      '1.0.0',
      'Quick Facts',
      'brief',
      jsonb_build_object(
        'description', 'Ultra-fast snapshot: executive summary plus 5-bullet quick facts.',
        'inputs', jsonb_build_object(
          'company', jsonb_build_object('key','company','label','Company','type','company_identifier','required',true)
        ),
        'sections', jsonb_build_array(
          jsonb_build_object('id','executive_summary','label','Executive Summary','required',true),
          jsonb_build_object('id','quick_facts','label','Quick Facts','required',true)
        ),
        'tools_policy', jsonb_build_object('allowed', jsonb_build_array('web_search'), 'max_parallel', 4),
        'guardrails_profile', 'secure',
        'quality_bar', jsonb_build_object('must_include', jsonb_build_array(), 'time_budget_sec', 45, 'tokens_budget', 2000),
        'export', jsonb_build_array('json'),
        'default_signal_set', 'default_signals_v1'
      ),
      TRUE
    );
  END IF;
END $$;

