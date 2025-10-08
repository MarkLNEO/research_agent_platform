export type AgentType = 'company_research' | 'settings_agent' | 'company_profiler';

type ResearchMode = 'quick' | 'deep' | 'specific' | undefined;

type NullableRecord = Record<string, any> | null | undefined;

export interface UserContext {
  profile?: NullableRecord;
  customCriteria?: any[];
  signals?: any[];
  disqualifiers?: any[];
  promptConfig?: NullableRecord;
  reportPreferences?: any[];
}

const AGENT_ROLE: Record<AgentType, string> = {
  company_research: 'company research and meeting intelligence analyst',
  settings_agent: 'configuration assistant that clarifies user preferences and account data',
  company_profiler: 'account intelligence specialist who structures ideal customer profiles'
};

const MODE_HINT: Record<Exclude<ResearchMode, undefined>, string> = {
  quick: 'Prioritise speed. Deliver a concise overview with the top 3 insights, leadership, and any urgent signals. Avoid deep dives unless explicitly requested. Keep response under 10 bullet points.',
  deep: 'Perform thorough research. Cover executive summary, ICP fit, qualifying criteria status, decision makers with personalization, recent signals, tech stack, competitors, and recommended next steps. Use evidence-backed statements with short source references.',
  specific: 'Answer the specific question directly. Pull only the supporting facts that justify the answer. If information is unavailable, say so and suggest where to investigate next.'
};

const STREAMING_BEHAVIOUR = `While reasoning, surface short bullet updates ("- assessing funding rounds", "- reading tech stack coverage") so the UI can stream progress.`;

function formatSection(title: string, body: string | undefined): string | null {
  if (!body || !body.trim()) return null;
  return `${title.toUpperCase()}\n${body.trim()}`;
}

function serializeProfile(profile?: NullableRecord): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.company_name) lines.push(`Company: ${profile.company_name}`);
  if (profile.company_url) lines.push(`Website: ${profile.company_url}`);
  if (profile.industry) lines.push(`Industry: ${profile.industry}`);
  if (Array.isArray(profile.target_titles) && profile.target_titles.length) {
    lines.push(`Target titles: ${profile.target_titles.join(', ')}`);
  }
  if (profile.icp_definition) lines.push(`ICP definition: ${profile.icp_definition}`);
  if (profile.use_case) lines.push(`Use case focus: ${profile.use_case}`);
  return lines.join('\n');
}

function serializeCriteria(criteria?: any[]): string {
  if (!Array.isArray(criteria) || criteria.length === 0) return '';
  return criteria
    .map((c, idx) => {
      const name = c?.field_name || `Criterion ${idx + 1}`;
      const importance = c?.importance ? ` (${c.importance})` : '';
      return `- ${name}${importance}`;
    })
    .join('\n');
}

function serializeSignals(signals?: any[]): string {
  if (!Array.isArray(signals) || signals.length === 0) return '';
  return signals
    .slice(0, 5)
    .map((s) => `- ${s?.signal_type || 'signal'} :: importance=${s?.importance || 'n/a'} :: keywords=${(s?.config?.keywords || []).join(', ')}`)
    .join('\n');
}

function serializeDisqualifiers(disqualifiers?: any[]): string {
  if (!Array.isArray(disqualifiers) || disqualifiers.length === 0) return '';
  return disqualifiers
    .map((d, idx) => `- ${d?.criterion || `Disqualifier ${idx + 1}`}`)
    .join('\n');
}

export function buildSystemPrompt(
  userContext: UserContext,
  agentType: AgentType = 'company_research',
  researchMode: ResearchMode = undefined
): string {
  const role = AGENT_ROLE[agentType] || AGENT_ROLE.company_research;
  const header = `You are Rebar's ${role}. Deliver truthful, decision-ready intelligence for enterprise Account Executives.`;

  const behaviour = `Core behaviours:\n- Be proactive: anticipate follow-up questions and highlight risks/opportunities.\n- Be concise but complete: use bullet hierarchies, tables, and mini-sections when helpful.\n- Cite evidence inline (e.g. "[Source: Bloomberg, Jan 2025]").\n- Flag uncertainty explicitly.\n- ${STREAMING_BEHAVIOUR}`;

  const modeHint = researchMode ? MODE_HINT[researchMode as Exclude<ResearchMode, undefined>] : null;

  const contextSections = [
    formatSection('Profile', serializeProfile(userContext.profile)),
    formatSection('Custom Criteria', serializeCriteria(userContext.customCriteria)),
    formatSection('Signal Preferences', serializeSignals(userContext.signals)),
    formatSection('Disqualifying Criteria', serializeDisqualifiers(userContext.disqualifiers))
  ].filter(Boolean) as string[];

  const contextBlock = contextSections.length > 0
    ? `CONTEXT\n${contextSections.join('\n\n')}`
    : 'CONTEXT\nNone provided. Ask clarifying questions if data feels insufficient.';

  const extras = [] as string[];
  if (modeHint) extras.push(`Mode guidance: ${modeHint}`);
  if (userContext.promptConfig?.guardrail_profile) {
    extras.push(`Guardrail profile: ${userContext.promptConfig.guardrail_profile}`);
  }

  const extraBlock = extras.length ? extras.join('\n') : '';

  const clarificationPolicy = `Clarification & Defaults:\n- Do not present fill-in templates or long forms.\n- Ask at most one short clarifying question only when essential; otherwise proceed using saved profile and sensible defaults.\n- If the user writes "all of the above" (or similar), interpret it as comprehensive coverage of the standard sections and proceed.\n- If a company is identified and a website/domain can be inferred or is present in the profile, do NOT ask for the domain; derive it yourself.\n- Default research depth: ${researchMode || 'deep'} unless the user specifies otherwise.\n- If profile context exists, do not re-ask "what would you like researched?" — assume defaults from the profile and mode.`;

  return [header, behaviour, clarificationPolicy, contextBlock, extraBlock].filter(Boolean).join('\n\n');
}
