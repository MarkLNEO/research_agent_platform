import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  USE_CASE_TEMPLATES,
  buildDefaultTemplateInputs,
  getDefaultTemplate,
  getUseCaseTemplateById,
  type UseCaseTemplate
} from '../config/researchTemplates';
import { supabase } from '../lib/supabase';
import { GUARDRAIL_PROFILES, getGuardrailProfileById, type GuardrailProfile } from '../config/guardrails';
import { SIGNAL_SETS, getSignalSetById, type SignalSet } from '../config/signalEngine';
import { PLAYBOOKS, type Playbook } from '../config/playbooks';
import { buildCapabilityPlan, CAPABILITY_DEFINITIONS, type CapabilityPlan } from '../config/capabilityPlanner';
import { QUALITY_EVALUATOR, getHeuristicsByIds } from '../config/evaluator';

export interface QualityChecklistItem {
  id: string;
  label: string;
  description?: string;
}

export interface ResearchEngineContextValue {
  templates: UseCaseTemplate[];
  selectedTemplate?: UseCaseTemplate;
  selectedTemplateId: string | null;
  selectTemplate: (id: string) => void;
  templateInputs: Record<string, unknown>;
  updateTemplateInput: (key: string, value: unknown) => void;
  replaceTemplateInputs: (inputs: Record<string, unknown>) => void;
  guardrailProfiles: GuardrailProfile[];
  selectedGuardrailProfile?: GuardrailProfile;
  selectGuardrailProfile: (id: string) => void;
  signalSets: SignalSet[];
  selectedSignalSet?: SignalSet;
  selectSignalSet: (id: string) => void;
  capabilityPlan: CapabilityPlan;
  playbooks: Playbook[];
  selectedPlaybook?: Playbook;
  selectPlaybook: (id: string | null) => void;
  qualityChecklist: QualityChecklistItem[];
}

const ResearchEngineContext = createContext<ResearchEngineContextValue | undefined>(undefined);

function deriveQualityChecklist(template: UseCaseTemplate | undefined): QualityChecklistItem[] {
  if (!template) return [];
  const heuristics = template.quality_bar.heuristics || [];
  const matchedHeuristics = getHeuristicsByIds(heuristics);

  const heuristicItems: QualityChecklistItem[] = matchedHeuristics.map(heuristic => ({
    id: heuristic.id,
    label: heuristic.label,
    description: heuristic.description
  }));

  const requirementItems: QualityChecklistItem[] = template.quality_bar.must_include.map((requirement, index) => ({
    id: `requirement-${index}`,
    label: requirement,
    description: undefined
  }));

  return [...requirementItems, ...heuristicItems];
}

function deriveDefaultGuardrailId(template?: UseCaseTemplate): string {
  if (template?.guardrails_profile) {
    return template.guardrails_profile;
  }
  return GUARDRAIL_PROFILES[0]?.id ?? 'secure';
}

function deriveDefaultSignalSetId(template?: UseCaseTemplate): string {
  if (template?.default_signal_set) {
    return template.default_signal_set;
  }
  return SIGNAL_SETS[0]?.id ?? 'default_signals_v1';
}

export function ResearchEngineProvider({ children }: { children: ReactNode }) {
  const [remoteTemplates, setRemoteTemplates] = useState<UseCaseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => getDefaultTemplate().id);
  const [templateInputs, setTemplateInputs] = useState<Record<string, unknown>>(() =>
    buildDefaultTemplateInputs(getDefaultTemplate())
  );
  const [selectedGuardrailId, setSelectedGuardrailId] = useState<string>(() =>
    deriveDefaultGuardrailId(getDefaultTemplate())
  );
  const [selectedSignalSetId, setSelectedSignalSetId] = useState<string>(() =>
    deriveDefaultSignalSetId(getDefaultTemplate())
  );
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);

  const catalog = useMemo<UseCaseTemplate[]>(() => {
    // Merge remote templates (user/system) with built-ins; ID wins from remote
    const byId: Record<string, UseCaseTemplate> = {};
    for (const t of USE_CASE_TEMPLATES) byId[t.id] = t;
    for (const r of remoteTemplates) byId[r.id] = r;
    return Object.values(byId);
  }, [remoteTemplates]);

  const getById = useCallback((id: string) => catalog.find(t => t.id === id), [catalog]);

  const selectedTemplate = useMemo(
    () => getById(selectedTemplateId) ?? getDefaultTemplate(),
    [selectedTemplateId, getById]
  );

  const selectedGuardrailProfile = useMemo(
    () => getGuardrailProfileById(selectedGuardrailId),
    [selectedGuardrailId]
  );

  const selectedSignalSet = useMemo(
    () => getSignalSetById(selectedSignalSetId),
    [selectedSignalSetId]
  );

  const capabilityPlan = useMemo(() => {
    const allowedCapabilities = selectedTemplate?.tools_policy.allowed ?? [];
    const preferAirgapped = selectedGuardrailProfile?.policy.source_allowlist?.includes('sam_gov') &&
      selectedGuardrailProfile?.policy.source_allowlist?.length === 1;
    return buildCapabilityPlan(allowedCapabilities, { preferAirgapped });
  }, [selectedTemplate, selectedGuardrailProfile]);

  const qualityChecklist = useMemo(
    () => deriveQualityChecklist(selectedTemplate),
    [selectedTemplate]
  );

  const selectTemplate = useCallback((id: string) => {
    const template = getUseCaseTemplateById(id);
    if (!template) return;
    setSelectedTemplateId(id);
    setTemplateInputs(buildDefaultTemplateInputs(template));
    setSelectedGuardrailId(deriveDefaultGuardrailId(template));
    setSelectedSignalSetId(deriveDefaultSignalSetId(template));
    setSelectedPlaybookId(null);
  }, []);

  const updateTemplateInput = useCallback((key: string, value: unknown) => {
    setTemplateInputs(prev => ({
      ...prev,
      [key]: value
    }));
    setSelectedPlaybookId(null);
  }, []);

  const replaceTemplateInputs = useCallback((inputs: Record<string, unknown>) => {
    setTemplateInputs(inputs);
    setSelectedPlaybookId(null);
  }, []);

  const selectGuardrailProfile = useCallback((id: string) => {
    setSelectedGuardrailId(id);
    setSelectedPlaybookId(null);
  }, []);

  const selectSignalSet = useCallback((id: string) => {
    setSelectedSignalSetId(id);
    setSelectedPlaybookId(null);
  }, []);

  const selectPlaybook = useCallback((id: string | null) => {
    setSelectedPlaybookId(id);
    if (!id) return;

    const playbook = PLAYBOOKS.find(p => p.id === id);
    if (!playbook) return;

    const template = getUseCaseTemplateById(playbook.template_id);
    if (!template) return;

    setSelectedTemplateId(template.id);
    setTemplateInputs({
      ...buildDefaultTemplateInputs(template),
      ...playbook.inputs
    });
    setSelectedGuardrailId(playbook.guardrail_profile_id);
    setSelectedSignalSetId(playbook.signal_set_id);
  }, []);

  const value: ResearchEngineContextValue = {
    templates: catalog,
    selectedTemplate,
    selectedTemplateId,
    selectTemplate,
    templateInputs,
    updateTemplateInput,
    replaceTemplateInputs,
    guardrailProfiles: GUARDRAIL_PROFILES,
    selectedGuardrailProfile,
    selectGuardrailProfile,
    signalSets: SIGNAL_SETS,
    selectedSignalSet,
    selectSignalSet,
    capabilityPlan,
    playbooks: PLAYBOOKS,
    selectedPlaybook: PLAYBOOKS.find(p => p.id === selectedPlaybookId),
    selectPlaybook,
    qualityChecklist
  };

  return <ResearchEngineContext.Provider value={value}>{children}</ResearchEngineContext.Provider>;
}

export function useResearchEngine() {
  const context = useContext(ResearchEngineContext);
  if (!context) {
    throw new Error('useResearchEngine must be used within a ResearchEngineProvider');
  }
  return context;
}

export const CAPABILITY_REGISTRY = CAPABILITY_DEFINITIONS;
export const QUALITY_REGISTRY = QUALITY_EVALUATOR;
  // Load remote templates from Supabase (use_case_templates)
  const loadRemoteTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('use_case_templates')
        .select('id, version, label, category, json_spec, is_system')
        .order('label', { ascending: true });
      if (error) throw error;
      const normalized: UseCaseTemplate[] = (data || []).map((row: any) => {
        const spec = row.json_spec || {};
        return {
          id: row.id,
          version: row.version,
          label: row.label,
          category: row.category as any,
          description: spec.description ?? '',
          inputs: spec.inputs ?? {},
          quality_bar: spec.quality_bar ?? { must_include: [], heuristics: [] },
          tools_policy: spec.tools_policy ?? { allowed: [] },
          default_signal_set: spec.default_signal_set ?? 'default_signals_v1',
          guardrails_profile: spec.guardrails_profile ?? 'secure',
          sections: spec.sections ?? [],
          export: spec.export ?? [],
        } as UseCaseTemplate;
      });
      setRemoteTemplates(normalized);
    } catch (e) {
      // Non-fatal in client; fall back to built-ins
      console.warn('[templates] failed to load remote templates', e);
      setRemoteTemplates([]);
    }
  }, []);

  // Load once on mount
  useEffect(() => { void loadRemoteTemplates(); }, [loadRemoteTemplates]);
