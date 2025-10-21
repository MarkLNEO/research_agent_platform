const AGENT_ROLE = {
    company_research: 'company research and meeting intelligence analyst',
    settings_agent: 'configuration assistant that clarifies user preferences and account data',
    company_profiler: 'account intelligence specialist who structures ideal customer profiles'
};
const MODE_HINT = {
    quick: 'Quick Facts mode: output ONLY essential facts. Keep total length ≤ 150 words. No extra sections, no preamble, no filler. Prefer bullets over prose.',
    deep: 'Deep Research mode: move beyond raw bullets. Synthesize implications through the user\'s ICP and saved criteria. Prioritize insight density over list length; include brief mini‑paragraphs where synthesis is required, and keep evidence inline.',
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
// Deep-only enhanced structure: adds Why Now and Deal Strategy sections, and encourages synthesis over bullet dumps
const DEEP_OUTPUT = `Deep Research format:
- Start with a brief, friendly acknowledgement line (e.g., "On it — deep dive (~2 min).") that states research depth and ETA, then proceed.
- ${EXEC_SUMMARY_GUIDANCE}
- After the Executive Summary, build the brief around the sections that best serve the user. Recommended flow:
  • "## Why Now" — synthesize timing and urgency through the user's ICP and preferred signals.
  • "## Deal Strategy" — 3–5 moves with who to contact and why (tie to saved target_titles when available).
  • "## Key Findings" — the sharpest 5–7 insights (avoid repeating Why Now verbatim).
  • "## Custom Criteria" — if applicable, call status (Met / Not met / Unknown) with rationale.
  • "## Signals" and "## Tech/Footprint" / "## Operating Footprint" — highlight the most relevant developments.
  • "## Decision Makers" — personalize why each contact matters.
  • "## Risks & Gaps", "## Sources", "## Proactive Follow-ups".
- It's OK to merge, omit, or rename sections when data is thin or a different framing better serves the brief. Add new headings when they create clearer storytelling.
- Keep every section insight-led with inline citations. Replace boilerplate with analysis tailored to the user's goals.`;
const QUICK_OUTPUT = `Quick Facts format (strict):
- Output exactly two sections and nothing else:
  ## Executive Summary (≤ 80 words, include one sentence headline plus "ICP Fit: <value>" and "Recommendation: <value>")
  ## Quick Facts (5 bullets: size & revenue, industry & HQ, 2 leadership names, ≤2 recent news items, 1-sentence ICP fit rationale)
- Keep total length ≤ 140 words.
- Do not add additional headings, tables, or filler.
- Cite sources in parentheses when helpful (e.g., "(WSJ, Sep 2025)").`;
const SPECIFIC_OUTPUT = `Specific follow-up format:
- Start with the acknowledgement line, then deliver a direct answer (paragraph or short bullet stack) in ≤ 120 words.
- Surface 3–5 supporting facts with inline citations. Use lightweight headings or bold labels only when they aid clarity—no need to reuse the full research section list.
- Offer up to two tailored next-step suggestions (e.g., "Next Moves" with 1–2 bullets) tied to the question.
- Close with a friendly yes/no question offering to remember this focus for future briefs (e.g., "Want me to keep spotlighting leadership moves next time?").`;
const DEFAULT_CRITERIA_GUIDANCE = `Default Qualifying Criteria (assume when none supplied):
1. Recent security or operational incidents (breach, ransomware, downtime).
2. Leadership moves in CIO/CISO/CTO functions.
3. Supply chain resilience and regulatory pressure (FAA, DoD, CMMC).
4. Cloud/Zero Trust adoption progress.
Evaluate each explicitly and state status (Met / Not met / Unknown) in a "Custom Criteria" subsection or within Key Findings. Do not ask the user to confirm these defaults; infer from context.`;
const buildImmediateAckGuidance = (mode) => {
    const descriptor = mode === 'quick'
        ? 'quick scan (~30 sec)'
        : mode === 'specific'
            ? 'specific insight (~20 sec)'
            : 'deep dive (~2 min)';
    return `Immediate acknowledgement:
- As soon as you begin responding, send a warm, human acknowledgement line that confirms you are on it, states the inferred research mode (${descriptor}), and gives a realistic ETA.
- Keep it informal but professional (think trusted teammate).`;
};
const PROACTIVE_FOLLOW_UP_GUIDANCE = `Proactive Follow-up Requirements:
- After the "## Sources" section, include "## Proactive Follow-ups" with exactly three bullet points.
- Use a warm, collaborative tone—write like a trusted teammate who anticipates needs (avoid robotic phrasing).
- Ground each bullet in the latest findings or user goals and explain the value in ≤20 conversational words.
- Bullet examples: draft outreach for a named exec, monitor a newly detected signal, build a comparison deck, prep meeting briefs, etc.
- One bullet must suggest saving a new preference for future briefings (e.g., "Want me to track supply-chain incidents by default going forward?").
- Phrase bullets as offers starting with a verb (Draft, Monitor, Compare, Capture, etc.).
- End the final bullet with a direct yes/no invitation (e.g., "Start a draft email to Dana Deasy?").`;
const SPECIFIC_FOLLOW_UP_GUIDANCE = `Follow-up wrap-up (specific mode):
- Keep the entire response focused on the user’s question—skip the large research template unless it meaningfully adds value.
- Suggest no more than two concrete next steps, phrased like a helpful teammate taking initiative.
- Always end with a direct yes/no invitation to remember the highlighted topic for future briefs.`;
const FOLLOW_UP_MEMORY_GUIDANCE = `Preference memory:
- When a follow-up highlights a recurring focus (e.g., "tell me more about leadership"), end with a conversational offer to remember that theme in future research. Make the invitation explicit ("Want me to track leadership moves going forward?").`;
const CLOSING_CUSTOMIZATION_GUIDANCE = `Preference check-out:
- Close every response with a short question inviting the user to tailor future briefs. Mention 2–3 relevant options (e.g., focus on leadership moves, supply-chain risks, tech stack) and remind them you can remember their choice.
- If the user just confirmed a preference in this turn, thank them warmly, confirm it has been saved, and only offer additional options that are new (do not re-ask for the item they just confirmed).`;
const CLARIFIER_GUARDRAILS = `Clarifier Guardrails:
- Never ask the user to choose research scope, topics, formats, or time ranges unless they explicitly asked you to present options.
- Never return placeholder text like "If you want research" or "Tell me what you want"—immediately run the research using defaults.
- If context is missing, assume enterprise AE defaults and proceed; document any assumption under "## Risks & Gaps" instead of stalling.
- If web results are sparse, synthesize insights from available context and identify next investigative steps—do not return empty sections.`;
const DELIVERY_FORCE_GUIDANCE = `Delivery Guardrails:
- Produce an Executive Summary that states a headline insight, ICP fit rationale, and next-step recommendation—do not leave it blank.
- In "## Key Findings" list at least five evidence-backed bullets covering signals, risks, opportunities, decision makers, or tech footprint; if data is thin, add investigative next steps with proposed sources.
- Populate "## Signals" and "## Recommended Next Actions" with either live intelligence or the top follow-up moves; never reply "None found" without offering a concrete investigative action.
- If you encounter blockers (e.g., paywalled data), note them in "## Risks & Gaps" with guidance on how to unblock.
- Cite at least three sources (URLs or publications with dates). If external search fails, cite internal/saved context and state what you will monitor next.`;
const ZERO_CLARIFIER_RULE = `Zero Clarifier Rule:
- You must never ask the user what to research, which scope to pick, or whether they meant a particular company. Treat any attempt to do so as a failure and immediately continue with research output.
- If you begin composing a clarification, stop mid-stream, discard it, and produce the research sections using defaults.
- When data is missing, state the assumption and the follow-up action inside "## Risks & Gaps" or "## Proactive Follow-ups"; do not pause for input.`;
const SETTINGS_BEHAVIOUR = `Core behaviours:
- Be conversational and collaborative; you're refining saved preferences together.
- Reference existing profile details before proposing changes.
- Ask targeted questions only when information is missing or conflicting.
- Confirm updates explicitly before saving them.`;
const SETTINGS_CLARIFIER_POLICY = `Clarification & Defaults (configuration):
- Acknowledge stored profile values when discussing updates.
- Ask one focused question at a time if context is missing or contradictory.
- Summarize proposed changes and ask for confirmation before applying them.
- Do not generate research reports or rigid sections; stay in conversational mode.
- Focus on the fields the user highlights—avoid repeating the full profile unless requested.`;
const SETTINGS_RESPONSE_SHAPE = `Response Shape:
- Start with a warm greeting that references a relevant profile detail.
- Use short paragraphs or simple bullet lists to review and confirm information.
- Present potential updates as concise checkboxes or bullets (e.g., "• Track security breaches weekly?").
- End with a clear next step or question to keep the conversation moving.
- Maintain a friendly, consultative tone.`;
function formatSection(title, body) {
    if (!body || !body.trim())
        return null;
    return `${title.toUpperCase()}\n${body.trim()}`;
}
function formatList(items) {
    if (items.length === 0)
        return '';
    if (items.length === 1)
        return items[0];
    const head = items.slice(0, -1).join(', ');
    const tail = items[items.length - 1];
    return `${head} and ${tail}`;
}
const normalizeTargetTitles = (raw) => {
    if (Array.isArray(raw)) {
        return raw
            .map(value => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim().length) {
        return raw
            .split(/[,;\n]+/)
            .map(value => value.trim())
            .filter(Boolean);
    }
    return [];
};
function serializeProfile(profile) {
    if (!profile)
        return '';
    const lines = [];
    if (profile.company_name)
        lines.push(`Company: ${profile.company_name}`);
    if (profile.company_url)
        lines.push(`Website: ${profile.company_url}`);
    if (profile.industry)
        lines.push(`Industry: ${profile.industry}`);
    const normalizedTitles = normalizeTargetTitles(profile.target_titles);
    if (normalizedTitles.length)
        lines.push(`Target titles: ${normalizedTitles.join(', ')}`);
    if (profile.icp_definition)
        lines.push(`ICP definition: ${profile.icp_definition}`);
    if (profile.use_case)
        lines.push(`Use case focus: ${profile.use_case}`);
    return lines.join('\n');
}
function serializeCriteria(criteria) {
    if (!Array.isArray(criteria) || criteria.length === 0)
        return '';
    return criteria
        .map((c, idx) => {
        const name = c?.field_name || c?.name || `Criterion ${idx + 1}`;
        const importance = c?.importance ? ` (${c.importance})` : '';
        return `- ${name}${importance}`;
    })
        .join('\n');
}
function serializeSignals(signals) {
    if (!Array.isArray(signals) || signals.length === 0)
        return '';
    return signals
        .slice(0, 5)
        .map((s) => `- ${s?.signal_type || 'signal'} :: importance=${s?.importance || 'n/a'} :: keywords=${(s?.config?.keywords || []).join(', ')}`)
        .join('\n');
}
function serializeDisqualifiers(disqualifiers) {
    if (!Array.isArray(disqualifiers) || disqualifiers.length === 0)
        return '';
    return disqualifiers
        .map((d, idx) => `- ${d?.criterion || `Disqualifier ${idx + 1}`}`)
        .join('\n');
}
function serializeResolvedPrefs(resolved) {
    if (!resolved)
        return '';
    const lines = [];
    if (resolved.coverage?.mode || resolved.coverage?.depth) {
        const depth = resolved.coverage?.depth ? `depth=${resolved.coverage.depth}` : '';
        const mode = resolved.coverage?.mode ? `mode=${resolved.coverage.mode}` : '';
        lines.push(`Coverage → ${[mode, depth].filter(Boolean).join(' ')}`.trim());
    }
    if (resolved.summary?.brevity) {
        lines.push(`Summary brevity → ${resolved.summary.brevity}`);
    }
    if (resolved.tone) {
        lines.push(`Tone → ${resolved.tone}`);
    }
    const focus = resolved.focus || {};
    const focusEntries = Object.entries(focus);
    if (focusEntries.length) {
        for (const [key, value] of focusEntries) {
            if (value && typeof value === 'object') {
                const on = value.on === false ? 'off' : 'on';
                const weight = typeof value.weight === 'number' ? ` weight=${value.weight}` : '';
                lines.push(`Focus.${key} → ${on}${weight}`.trim());
            }
            else {
                lines.push(`Focus.${key} → ${JSON.stringify(value)}`);
            }
        }
    }
    const industryFilters = Array.isArray(resolved.industry?.filters) ? resolved.industry?.filters : [];
    if (industryFilters && industryFilters.length) {
        lines.push(`Industry filters → ${industryFilters.join(', ')}`);
    }
    return lines.join('\n');
}
function serializeCanonicalEntities(entities) {
    if (!Array.isArray(entities) || entities.length === 0)
        return '';
    return entities
        .map(entity => {
        const matched = entity.matched ? ` ← "${entity.matched}"` : '';
        const conf = typeof entity.confidence === 'number' ? ` (confidence ${entity.confidence.toFixed(2)})` : '';
        return `- ${entity.canonical} [${entity.type}]${matched}${conf}`;
    })
        .join('\n');
}
function serializeOpenQuestions(openQuestions, limit = 3) {
    if (!Array.isArray(openQuestions) || openQuestions.length === 0)
        return '';
    return openQuestions
        .slice(0, limit)
        .map((q, idx) => {
        const topic = q?.context?.topic ? ` (topic: ${q.context.topic})` : '';
        return `${idx + 1}. ${q?.question || 'Clarify preference'}${topic}`;
    })
        .join('\n');
}
export function buildSystemPrompt(userContext, agentType = 'company_research', researchMode = undefined) {
    const isResearchAgent = agentType === 'company_research';
    const isSettingsAgent = agentType === 'settings_agent';
    const isProfilerAgent = agentType === 'company_profiler';
    const role = AGENT_ROLE[agentType] || AGENT_ROLE.company_research;
    const header = `You are RebarHQ's ${role}. Deliver truthful, decision-ready intelligence for enterprise Account Executives.`;
    const behaviour = isSettingsAgent
        ? SETTINGS_BEHAVIOUR
        : `Core behaviours:\n- Be proactive: anticipate follow-up questions and highlight risks/opportunities.\n- Be concise but complete: use bullet hierarchies, tables, and mini-sections when helpful.\n- Cite evidence inline (e.g. "[Source: Bloomberg, Jan 2025]").\n- Flag uncertainty explicitly.\n- ${STREAMING_BEHAVIOUR}`;
    const preferredMode = isResearchAgent ? userContext.promptConfig?.preferred_research_type || undefined : undefined;
    const resolvedMode = (isResearchAgent ? (researchMode || preferredMode || 'deep') : 'deep');
    const modeHint = isResearchAgent ? MODE_HINT[resolvedMode] : null;
    const contextSections = [
        formatSection('Profile', serializeProfile(userContext.profile)),
        formatSection('Custom Criteria', serializeCriteria(userContext.customCriteria)),
        formatSection('Signal Preferences', serializeSignals(userContext.signals)),
        formatSection('Disqualifying Criteria', serializeDisqualifiers(userContext.disqualifiers)),
        formatSection('Resolved Preference Summary', serializeResolvedPrefs(userContext.resolvedPrefs)),
        (() => {
            if (!userContext?.resolvedPrefs)
                return null;
            try {
                const json = JSON.stringify(userContext.resolvedPrefs, null, 2);
                return formatSection('Resolved Preferences JSON', json);
            }
            catch {
                return null;
            }
        })(),
        formatSection('Canonical Entities', serializeCanonicalEntities(userContext.canonicalEntities)),
        formatSection('Open Questions', serializeOpenQuestions(userContext.openQuestions))
    ].filter(Boolean);
    const contextBlock = contextSections.length > 0
        ? `CONTEXT\n${contextSections.join('\n\n')}`
        : 'CONTEXT\nNo stored profile yet. Assume enterprise AE defaults (15 strategic accounts, deep discovery focus). Proceed without re-asking; note any inferred preferences for future briefs.';
    const extras = [];
    if (contextSections.length === 0 && isResearchAgent) {
        extras.push('Context fallback: Assume enterprise AE defaults and explicitly offer at the end to tailor format for next time (e.g., "Want a sharper summary next briefing?").');
    }
    else if (contextSections.length === 0 && isSettingsAgent) {
        extras.push('Context fallback: No profile stored yet. Guide the user through defining ICP, key signals, and disqualifiers step by step.');
    }
    if (userContext.resolvedPrefs) {
        extras.push('Resolved preferences provided above. Honor them strictly—bias retrieval, synthesis, and recommendations toward stated focus/tone/depth.');
    }
    if (Array.isArray(userContext.canonicalEntities) && userContext.canonicalEntities.length) {
        extras.push('Canonical entities are specified; treat synonymous terms accordingly and avoid re-asking for confirmation unless conflicting evidence arises.');
    }
    if (Array.isArray(userContext.openQuestions) && userContext.openQuestions.length) {
        extras.push('Saved open questions exist. Surface at most two relevant clarifiers proactively and mark them resolved once answered within the response.');
    }
    if (isResearchAgent) {
        extras.push(CLARIFIER_GUARDRAILS);
        extras.push(DELIVERY_FORCE_GUIDANCE);
        extras.push(ZERO_CLARIFIER_RULE);
    }
    else if (isSettingsAgent) {
        extras.push('Configuration guardrails: Keep the conversation lightweight, avoid rigid report sections, and confirm changes before saving.');
        extras.push('When applying or suggesting an update, state the change explicitly (e.g., "Updating target industry to Aerospace") and offer one related follow-up (e.g., "Want me to start monitoring security breaches weekly too?").');
    }
    const followups = Array.isArray(userContext.promptConfig?.default_followup_questions)
        ? userContext.promptConfig?.default_followup_questions.filter((q) => typeof q === 'string' && q.trim().length > 0)
        : [];
    if (modeHint)
        extras.push(`Mode guidance: ${modeHint}`);
    if (isResearchAgent && userContext.promptConfig?.guardrail_profile) {
        extras.push(`Guardrail profile: ${userContext.promptConfig.guardrail_profile}`);
    }
    const summaryPref = isResearchAgent ? userContext.promptConfig?.default_output_brevity : undefined;
    let summaryPreferenceTag = '';
    if (isResearchAgent && summaryPref === 'short') {
        extras.push('Summary preference: Deliver a crisp executive summary and High Level summary (<=3 bullets) that highlights the sharpest signals only.');
        summaryPreferenceTag = '<summary_preference level="short">Executive summary ≤2 sentences. High Level summary must have ≤3 ultra-concise bullets using action verbs.</summary_preference>';
    }
    else if (isResearchAgent && summaryPref === 'long') {
        extras.push('Summary preference: Provide a richer executive summary and High Level summary (7–10 bullets) with added context for timing, risks, and next steps.');
        summaryPreferenceTag = '<summary_preference level="long">Executive summary 3–4 sentences with context. High Level summary must have 7–10 detailed bullets with qualifiers and evidence.</summary_preference>';
    }
    else if (isResearchAgent && summaryPref === 'standard') {
        extras.push('Summary preference: Use the standard-length High Level summary (5–6 bullets) with balanced context.');
        summaryPreferenceTag = '<summary_preference level="standard">Executive summary 2–3 sentences. High Level summary must have 5–6 balanced bullets covering value, signals, and next steps.</summary_preference>';
    }
    const tonePref = userContext.promptConfig?.default_tone;
    if (tonePref === 'warm') {
        extras.push('Tone preference: Keep the narrative warm, encouraging, and relationship-first without losing clarity.');
    }
    else if (tonePref === 'direct') {
        extras.push('Tone preference: Write in a direct, outcome-driven voice with crisp phrasing and minimal filler.');
    }
    else {
        extras.push('Tone preference: Maintain a balanced, consultative tone blending warmth with clear guidance.');
    }
    if (isResearchAgent && userContext.promptConfig?.always_tldr === false) {
        extras.push('The user may toggle the High Level summary off; only omit it if they explicitly say so in the latest request.');
    }
    else if (isResearchAgent) {
        extras.push('Always include the High Level summary unless the user explicitly opts out during this conversation.');
    }
    if (isResearchAgent && userContext.promptConfig?.summary_preference_set) {
        extras.push('The user already chose their summary length preference. Do not re-ask; just use the saved default unless they change it.');
    }
    const recentPreferenceConfirmations = Array.isArray(userContext.recentPreferenceConfirmations)
        ? userContext.recentPreferenceConfirmations.filter((entry) => typeof entry?.key === 'string')
        : [];
    if (isResearchAgent && recentPreferenceConfirmations.length) {
        const confirmationLabels = recentPreferenceConfirmations
            .map((entry) => {
            if (typeof entry?.label === 'string' && entry.label.trim())
                return entry.label.trim();
            const key = typeof entry?.key === 'string' ? entry.key : '';
            return key ? key.split('.').pop()?.replace(/_/g, ' ') || key : '';
        })
            .filter((label) => Boolean(label));
        if (confirmationLabels.length) {
            const formattedList = formatList(confirmationLabels);
            extras.push(`Preference update: The user just confirmed ${formattedList}. Thank them, acknowledge you'll keep that focus in future briefs, and avoid re-asking for the same preference in this response. If you offer more tweaks, suggest different angles.`);
        }
    }
    const recentAliasConfirmations = Array.isArray(userContext.recentAliasConfirmations)
        ? userContext.recentAliasConfirmations.filter((entry) => typeof entry?.alias === 'string' && typeof entry?.canonical === 'string')
        : [];
    if (isResearchAgent && recentAliasConfirmations.length) {
        const formattedList = recentAliasConfirmations
            .map((entry) => `"${entry.alias}" → ${entry.canonical}`)
            .join(', ');
        extras.push(`Alias update: Confirm back to the user that you've learned ${formattedList}. Let them know you'll use those canonical names automatically next time and invite corrections if needed.`);
    }
    if (isResearchAgent && resolvedMode === 'deep') {
        extras.push(DEFAULT_CRITERIA_GUIDANCE);
    }
    const profile = userContext.profile || {};
    const contextLens = [];
    const targetTitles = normalizeTargetTitles(profile.target_titles);
    if (profile.icp_definition || profile.icp || profile.industry) {
        contextLens.push(`- ICP: Tie headline insights and "Why Now" directly to ${profile.icp_definition || profile.icp || profile.industry}. Explain fit through this lens.`);
    }
    if (targetTitles.length) {
        contextLens.push(`- Target titles (${targetTitles.join(', ')}): Prioritize these roles in Deal Strategy and Decision Makers; spell out why each matters.`);
    }
    const criteriaNames = (userContext.customCriteria || [])
        .map((c) => c?.field_name || c?.name)
        .filter(Boolean);
    if (criteriaNames.length) {
        contextLens.push(`- Custom criteria (${criteriaNames.join(', ')}): Evaluate each item with Met / Not met / Unknown and cite evidence.`);
    }
    const signalNames = (userContext.signals || []).map((s) => s?.signal_type?.replace(/_/g, ' ')).filter(Boolean);
    if (signalNames.length) {
        contextLens.push(`- Signal preferences (${signalNames.join(', ')}): Highlight matching news/signals; if none, state what you'll monitor next.`);
    }
    if (contextLens.length) {
        extras.push(`Context expectations:\n${contextLens.join('\n')}\n- Thread these preferences through every section; the brief should feel tailored to this profile.`);
    }
    if (contextLens.length && targetTitles.length) {
        extras.push('Decision Maker guidance: Where possible, surface contacts that align with saved target titles and include personalization drawn from those roles.');
        extras.push('Leadership guidance: In the Leadership/Decision Makers sections, actively search for the saved target titles (and close adjacencies—e.g., VP RevOps vs. Head of Revenue Operations). If you cannot find exact matches, surface the closest relevant roles and explain the overlap. Always cite why each surfaced contact maps to the user’s priorities.');
    }
    if (contextLens.length && criteriaNames.length) {
        extras.push('In the "Custom Criteria" section, list each criterion explicitly with status (Met / Not met / Unknown) and a one-sentence rationale or follow-up action.');
    }
    if (contextLens.length && signalNames.length) {
        extras.push('In "Signals" and "Why Now", prioritize activity that maps to the user’s preferred signal types.');
    }
    if (profile.icp_definition || profile.icp) {
        extras.push(`Use the user's ICP phrasing verbatim in the Executive Summary (e.g., "${(profile.icp_definition || profile.icp)}"). Tie fit and timing back to that wording.`);
    }
    const researchFocusAreas = Array.isArray(profile.research_focus)
        ? profile.research_focus.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : [];
    if (researchFocusAreas.length) {
        const focusLabels = researchFocusAreas.map((item) => item.replace(/_/g, ' '));
        extras.push(`Highlight the user's research focus areas (${focusLabels.join(', ')}) in the Executive Summary and High Level sections using those exact labels.`);
    }
    if (isResearchAgent && Array.isArray(userContext.unresolvedEntities) && userContext.unresolvedEntities.length) {
        const unresolvedList = formatList(userContext.unresolvedEntities.map((term) => term.trim()).filter(Boolean));
        if (unresolvedList) {
            extras.push(`Unresolved shorthand detected: ${unresolvedList}. Politely ask the user to clarify what each item stands for exactly once, offer to remember it for future research, and pause further alias assumptions until they confirm.`);
        }
    }
    if (isResearchAgent) {
        extras.push(buildImmediateAckGuidance(resolvedMode));
        if (resolvedMode === 'specific') {
            extras.push(SPECIFIC_FOLLOW_UP_GUIDANCE);
            extras.push(FOLLOW_UP_MEMORY_GUIDANCE);
        }
        else {
            extras.push(PROACTIVE_FOLLOW_UP_GUIDANCE);
        }
        extras.push(CLOSING_CUSTOMIZATION_GUIDANCE);
    }
    if (isResearchAgent && followups.length) {
        extras.push(`Saved follow-up questions:
${followups.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}
Always answer them after the main sections inside "Saved Follow-up Answers".`);
    }
    const extraBlock = extras.length ? extras.join('\n') : '';
    const clarificationPolicy = isResearchAgent
        ? `Clarification & Defaults:\n- Do not present fill-in templates or long forms.\n- Ask at most one short clarifying question only when essential; otherwise proceed using saved profile and sensible defaults.\n- When the user supplies a company name, ticker, domain, or follow-up question, assume they are referring to that entity—do NOT ask whether they meant something else.\n- If the user writes "all of the above" (or similar), interpret it as comprehensive coverage of the standard sections and proceed.\n- If a company is identified and a website/domain can be inferred or is present in the profile, do NOT ask for the domain; derive it yourself.\n- Default research depth: ${resolvedMode} unless the user specifies otherwise.\n- If profile context exists or an active subject is provided, do not re-ask "what would you like researched?" — assume defaults from the profile and mode.\n- Never include clarification templates about scope, depth, format, timeframe, or channels in the final answer unless the user explicitly requested a menu.\n- If context is empty, do NOT ask broad follow-ups; treat saved defaults as sufficient and start researching.`
        : isSettingsAgent
            ? SETTINGS_CLARIFIER_POLICY
            : `Clarification & Defaults:\n- Confirm the user’s goal in one sentence before proceeding.\n- Ask at most one clarifying question at a time.\n- Surface assumptions and invite the user to correct them.\n- Keep momentum; if context is thin, propose the next logical question.`;
    let responseShape;
    if (isResearchAgent) {
        responseShape = resolvedMode === 'quick'
            ? `Response Shape:\n- Keep outputs concise and decision-ready; prefer bullets.\n- ${QUICK_OUTPUT}`
            : resolvedMode === 'specific'
                ? `Response Shape:\n- Keep outputs concise and answer-led.\n- ${SPECIFIC_OUTPUT}`
                : `Response Shape:\n- Keep outputs concise and decision-ready; balance mini‑paragraph synthesis with bullets.\n- ${DEEP_OUTPUT}`;
    }
    else if (isSettingsAgent) {
        responseShape = SETTINGS_RESPONSE_SHAPE;
    }
    else {
        responseShape = `Response Shape:\n- Keep outputs structured and insight-led.\n- ${STRUCTURED_OUTPUT}`;
    }
    return [header, behaviour, clarificationPolicy, responseShape, contextBlock, extraBlock, summaryPreferenceTag].filter(Boolean).join('\n\n');
}
