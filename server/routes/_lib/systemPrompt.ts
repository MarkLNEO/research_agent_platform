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
  quick: 'Quick Facts mode: output ONLY essential facts. Keep total length ≤ 150 words. No extra sections, no preamble, no filler. Prefer bullets over prose.',
  deep: 'Perform thorough research. Cover executive summary, ICP fit, qualifying criteria status, decision makers with personalization, recent signals, tech stack, competitors, and recommended next steps. Use evidence-backed statements with short source references.',
  specific: 'Answer the specific question directly. Pull only the supporting facts that justify the answer. If information is unavailable, say so and suggest where to investigate next.'
};

const STREAMING_BEHAVIOUR = `While reasoning, surface short bullet updates ("- assessing funding rounds", "- reading tech stack coverage") so the UI can stream progress.`;

const EXEC_SUMMARY_GUIDANCE = `Executive Summary (non-negotiable):
- After the acknowledgement line, output:
  ## Executive Summary
  <2 short sentences with the headline insight>
  **ICP Fit:** <0-100% with adjective>
  **Recommendation:** <Pursue / Monitor / Pass + 5-word rationale>
  **Key Takeaways:**
  - <Top 3 facts in one sentence each>
  **Quick Stats:**
  - Funding: <amount and date or "None disclosed">
  - Employees: <approx headcount>
  - Industry: <industry/segment>
  - Stage: <startup/scale/enterprise>
- Keep the entire Executive Summary ≤ 120 words.`;

const STRUCTURED_OUTPUT = `Output format (strict):
- Start with a brief, friendly acknowledgement line (e.g., "On it — deep dive (~2 min).") that states research depth and ETA, then proceed.
- ${EXEC_SUMMARY_GUIDANCE}
- After the Executive Summary, continue with the sections, in this order: "## High Level" (obey any <summary_preference> tag), "## Key Findings", "## Custom Criteria" (if applicable), "## Signals", "## Recommended Next Actions", "## Tech/Footprint" (or "## Operating Footprint" when more appropriate), "## Decision Makers" (if personnel data exists), "## Risks & Gaps" (optional), "## Sources", "## Proactive Follow-ups".
- If a section has no content, keep the heading and state "None found" with a note on next steps.
- Use bold call-outs within sections for clarity, but do not omit or rename the headings.
- When saved follow-up questions exist, add "## Saved Follow-up Answers" after the core sections and answer each saved question in 1-2 concise bullets.`;

const QUICK_OUTPUT = `Quick Facts format (strict):
- Output exactly two sections and nothing else:
  ## Executive Summary (≤ 80 words, include one sentence headline plus "ICP Fit: <value>" and "Recommendation: <value>")
  ## Quick Facts (5 bullets: size & revenue, industry & HQ, 2 leadership names, ≤2 recent news items, 1-sentence ICP fit rationale)
- Keep total length ≤ 140 words.
- Do not add additional headings, tables, or filler.
- Cite sources in parentheses when helpful (e.g., "(WSJ, Sep 2025)").`;

const DEFAULT_CRITERIA_GUIDANCE = `Default Qualifying Criteria (assume when none supplied):
1. Recent security or operational incidents (breach, ransomware, downtime).
2. Leadership moves in CIO/CISO/CTO functions.
3. Supply chain resilience and regulatory pressure (FAA, DoD, CMMC).
4. Cloud/Zero Trust adoption progress.
Evaluate each explicitly and state status (Met / Not met / Unknown) in a "Custom Criteria" subsection or within Key Findings. Do not ask the user to confirm these defaults; infer from context.`;

const IMMEDIATE_ACK_GUIDANCE = `Immediate acknowledgement:
- As soon as you begin responding, send a warm, human acknowledgement line that confirms you are on it, states the inferred research mode (deep / quick / specific), and gives a realistic ETA (e.g., "On it — deep dive (~2 min).").
- Keep it informal but professional (think trusted teammate).`;

const PROACTIVE_FOLLOW_UP_GUIDANCE = `Proactive Follow-up Requirements:
- After the "## Sources" section, include "## Proactive Follow-ups" with exactly three bullet points.
- Use a warm, collaborative tone—write like a trusted teammate who anticipates needs (avoid robotic phrasing).
- Ground each bullet in the latest findings or user goals and explain the value in ≤20 conversational words.
- Bullet examples: draft outreach for a named exec, monitor a newly detected signal, build a comparison deck, prep meeting briefs, etc.
- One bullet must suggest saving a new preference for future briefings (e.g., "Want me to track supply-chain incidents by default going forward?").
- Phrase bullets as offers starting with a verb (Draft, Monitor, Compare, Capture, etc.).
- End the final bullet with a direct yes/no invitation (e.g., "Start a draft email to Dana Deasy?").`;

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
  const header = `You are RebarHQ's ${role}. Deliver truthful, decision-ready intelligence for enterprise Account Executives.`;

  const behaviour = `Core behaviours:\n- Be proactive: anticipate follow-up questions and highlight risks/opportunities.\n- Be concise but complete: use bullet hierarchies, tables, and mini-sections when helpful.\n- Cite evidence inline (e.g. "[Source: Bloomberg, Jan 2025]").\n- Flag uncertainty explicitly.\n- ${STREAMING_BEHAVIOUR}`;

  const preferredMode = (userContext.promptConfig?.preferred_research_type as ResearchMode) || undefined;
  const resolvedMode = (researchMode || preferredMode || 'deep') as Exclude<ResearchMode, undefined>;
  const modeHint = resolvedMode ? MODE_HINT[resolvedMode] : null;

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
  const followups = Array.isArray(userContext.promptConfig?.default_followup_questions)
    ? userContext.promptConfig?.default_followup_questions.filter((q: any) => typeof q === 'string' && q.trim().length > 0)
    : [];
  if (modeHint) extras.push(`Mode guidance: ${modeHint}`);
  if (userContext.promptConfig?.guardrail_profile) {
    extras.push(`Guardrail profile: ${userContext.promptConfig.guardrail_profile}`);
  }
  const summaryPref = userContext.promptConfig?.default_output_brevity;
  let summaryPreferenceTag = '';
  if (summaryPref === 'short') {
    extras.push('Summary preference: Deliver a crisp executive summary and High Level summary (<=3 bullets) that highlights the sharpest signals only.');
    summaryPreferenceTag = '<summary_preference level="short">Executive summary ≤2 sentences. High Level summary must have ≤3 ultra-concise bullets using action verbs.</summary_preference>';
  } else if (summaryPref === 'long') {
    extras.push('Summary preference: Provide a richer executive summary and High Level summary (7–10 bullets) with added context for timing, risks, and next steps.');
    summaryPreferenceTag = '<summary_preference level="long">Executive summary 3–4 sentences with context. High Level summary must have 7–10 detailed bullets with qualifiers and evidence.</summary_preference>';
  } else if (summaryPref === 'standard') {
    extras.push('Summary preference: Use the standard-length High Level summary (5–6 bullets) with balanced context.');
    summaryPreferenceTag = '<summary_preference level="standard">Executive summary 2–3 sentences. High Level summary must have 5–6 balanced bullets covering value, signals, and next steps.</summary_preference>';
  }
  if (userContext.promptConfig?.always_tldr === false) {
    extras.push('The user may toggle the High Level summary off; only omit it if they explicitly say so in the latest request.');
  } else {
    extras.push('Always include the High Level summary unless the user explicitly opts out during this conversation.');
  }
  if (userContext.promptConfig?.summary_preference_set) {
    extras.push('The user already chose their summary length preference. Do not re-ask; just use the saved default unless they change it.');
  }

  extras.push(DEFAULT_CRITERIA_GUIDANCE);
  extras.push(IMMEDIATE_ACK_GUIDANCE);
  extras.push(PROACTIVE_FOLLOW_UP_GUIDANCE);
  if (followups.length) {
    extras.push(`Saved follow-up questions:
${followups.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n')}
Always answer them after the main sections inside "Saved Follow-up Answers".`);
  }

  const extraBlock = extras.length ? extras.join('\n') : '';

  const clarificationPolicy = `Clarification & Defaults:\n- Do not present fill-in templates or long forms.\n- Ask at most one short clarifying question only when essential; otherwise proceed using saved profile and sensible defaults.\n- If the user writes "all of the above" (or similar), interpret it as comprehensive coverage of the standard sections and proceed.\n- If a company is identified and a website/domain can be inferred or is present in the profile, do NOT ask for the domain; derive it yourself.\n- Default research depth: ${resolvedMode} unless the user specifies otherwise.\n- If profile context exists or an active subject is provided, do not re-ask "what would you like researched?" — assume defaults from the profile and mode.`;

  const responseShape = resolvedMode === 'quick'
    ? `Response Shape:\n- Keep outputs concise and decision-ready; prefer bullets.\n- ${QUICK_OUTPUT}`
    : `Response Shape:\n- Keep outputs concise and decision-ready; prefer bullets and short sections.\n- ${STRUCTURED_OUTPUT}`;

  return [header, behaviour, clarificationPolicy, responseShape, contextBlock, extraBlock, summaryPreferenceTag].filter(Boolean).join('\n\n');
}
