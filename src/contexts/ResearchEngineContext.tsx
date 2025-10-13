import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  USE_CASE_TEMPLATES,
  buildDefaultTemplateInputs,
  getDefaultTemplate,
  getUseCaseTemplateById,
  type UseCaseTemplate
} from '../config/researchTemplates';
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

  const selectedTemplate = useMemo(
    () => getUseCaseTemplateById(selectedTemplateId) ?? getDefaultTemplate(),
    [selectedTemplateId]
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
    templates: USE_CASE_TEMPLATES,
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
  // Note: remote template loading is disabled for stability; using built-ins only.
