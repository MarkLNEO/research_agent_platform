import type { UseCaseTemplate } from '../config/researchTemplates';
import type { GuardrailProfile } from '../config/guardrails';
import type { SignalSet } from '../config/signalEngine';
import type { CapabilityPlan } from '../config/capabilityPlanner';
import type { QualityChecklistItem } from '../contexts/ResearchEngineContext';

interface BuildTemplateKickoffParams {
  template: UseCaseTemplate;
  inputs: Record<string, unknown>;
  guardrail: GuardrailProfile;
  signalSet: SignalSet;
  capabilityPlan: CapabilityPlan;
  qualityChecklist: QualityChecklistItem[];
}

function formatInputs(template: UseCaseTemplate, inputs: Record<string, unknown>): string {
  return Object.values(template.inputs)
    .map(input => {
      const value = inputs[input.key];
      if (Array.isArray(value)) {
        return `- **${input.label}:** ${(value as unknown[]).join(', ') || 'Not provided'}`;
      }
      if (value === undefined || value === null || value === '') {
        return `- **${input.label}:** Not provided`;
      }
      return `- **${input.label}:** ${value}`;
    })
    .join('\n');
}

function formatSections(template: UseCaseTemplate): string {
  return template.sections
    .map(section => {
      const label = section.label ?? section.id;
      const condition = section.when ? ` _(when ${section.when})_` : '';
      return `- ${label}${condition}`;
    })
    .join('\n');
}

function formatGuardrail(guardrail: GuardrailProfile): string {
  const costCap = guardrail.policy.cost_controls
    ? `${guardrail.policy.cost_controls.max_credits_per_run} credits`
    : 'n/a';

  return [
    `- **Mode:** ${guardrail.label}`,
    `- **Source allowlist:** ${(guardrail.policy.source_allowlist || []).join(', ') || 'None'}`,
    `- **Parallelism:** ${guardrail.policy.parallelism}`,
    `- **Token ceiling:** ${guardrail.policy.max_tokens_per_task.toLocaleString()}`,
    `- **Cost cap:** ${costCap}`,
    `- **Redaction:** PII ${guardrail.policy.redaction?.pii ?? 'off'} / Secrets ${guardrail.policy.redaction?.secrets ?? 'off'}`
  ].join('\n');
}

function formatSignals(signalSet: SignalSet): string {
  const detectors = signalSet.detectors
    .map(detector => `- ${detector.label} _(weight ${(detector.weight * 100).toFixed(0)}%)_`)
    .join('\n');

  return `${signalSet.description}\n\n${detectors}`;
}

function formatPlan(plan: CapabilityPlan): string {
  if (plan.items.length === 0) {
    return '- No capabilities planned (check template policy).';
  }

  const items = plan.items
    .map(item => {
      const fallbacks = item.fallbacks.length > 0 ? ` (fallbacks: ${item.fallbacks.map(f => f.label).join(', ')})` : '';
      return `- **${item.capability.label}:** ${item.preferred.label}${fallbacks}`;
    })
    .join('\n');

  const notes = plan.notes.length > 0 ? `\n\n_Notable:_ ${plan.notes.join(' ')}` : '';

  return `${items}${notes}`;
}

function formatQualityChecklist(checklist: QualityChecklistItem[]): string {
  if (checklist.length === 0) {
    return '- Follow core template contract.';
  }
  return checklist
    .map(item => `- ${item.label}${item.description ? ` — ${item.description}` : ''}`)
    .join('\n');
}

export function buildTemplateKickoffMarkdown(params: BuildTemplateKickoffParams): string {
  const { template, inputs, guardrail, signalSet, capabilityPlan, qualityChecklist } = params;

  return [
    `# ${template.label} plan`,
    '',
    template.description,
    '',
    '## Inputs',
    formatInputs(template, inputs),
    '',
    '## Sections',
    formatSections(template),
    '',
    '## Guardrail posture',
    formatGuardrail(guardrail),
    '',
    '## Signal detectors',
    formatSignals(signalSet),
    '',
    '## Capability plan',
    formatPlan(capabilityPlan),
    '',
    '## Quality bar',
    formatQualityChecklist(qualityChecklist),
    '',
    `Exports: ${template.export.join(', ')}`
  ].join('\n');
}
