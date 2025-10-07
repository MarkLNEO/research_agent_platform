/**
 * GPT-5 Optimized Prompt Library
 *
 * Production-ready prompts incorporating all GPT-5 best practices:
 * - Instruction hierarchy to prevent contradictions
 * - Tool preambles for superior UX
 * - Persistence directives for autonomous completion
 * - Context gathering optimization
 * - Verbosity control per context
 * - Reasoning effort adaptation
 */

export interface PromptConfig {
  reasoning_effort: 'low' | 'medium' | 'high';
  verbosity: 'low' | 'medium' | 'high' | 'adaptive';
  persistence_level: 'minimal' | 'standard' | 'maximum';
  search_depth: 'quick' | 'standard' | 'comprehensive';
}

/**
 * Quick Company Lookup - Optimized for speed
 */
export const QUICK_LOOKUP_PROMPT = {
  config: {
    reasoning_effort: 'low',
    verbosity: 'low',
    persistence_level: 'minimal',
    search_depth: 'quick'
  } as PromptConfig,

  prompt: `
<context_gathering>
- Search depth: very low
- Maximum 2 tool calls for basic information
- Bias strongly toward speed over comprehensiveness
- If confident match found in first search, stop immediately
</context_gathering>

<tool_preambles>
- "Looking up [Company]..."
- On success: "✓ Found [Company]: [One-line description]"
- On failure: "Could not find reliable information about [Company]"
</tool_preambles>

<quick_scan_focus>
Priority data only:
1. Company name and website
2. Industry and size
3. One key differentiator
4. Primary product/service
Skip everything else for speed
</quick_scan_focus>

<output_style>
- Finish with a **SOURCES** list containing at least two credible links formatted as \`- [Title](https://...)\`.
- Reference the relevant source inline when sharing each fact so the AE can verify instantly.
- If no trustworthy source is found, state "Source needed" rather than inventing data.
</output_style>`
};

/**
 * Sales Outreach Research - Optimized for personalization
 */
export const SALES_OUTREACH_PROMPT = {
  config: {
    reasoning_effort: 'medium',
    verbosity: 'adaptive',
    persistence_level: 'standard',
    search_depth: 'standard'
  } as PromptConfig,

  prompt: `
<persistence>
- Find at least 3 unique personalization hooks before stopping
- If initial searches are generic, automatically dig deeper
- Never return generic insights like "they value innovation"
- Continue until you have specific, unexpected angles
</persistence>

<tool_preambles>
- "I'll research [Company] to craft a personalized outreach strategy..."
- "🔍 Scanning for unique angles and recent triggers..."
- "💡 Discovery: [Specific insight with outreach potential]"
- "✅ Found [X] personalization opportunities. Here's your outreach strategy..."
</tool_preambles>

<personalization_hierarchy>
Tier 1 (Highest Impact):
- Recent pain points mentioned by executives
- Specific initiatives they're struggling with
- Technology gaps creating measurable problems

Tier 2 (Strong Relevance):
- Recent leadership changes with new priorities
- Competitive pressures they're facing
- Growth challenges at their current stage

Tier 3 (Good Hooks):
- Company culture and values alignment
- Industry-specific challenges
- Seasonal or timely opportunities
</personalization_hierarchy>

<outreach_intel>
For each company, identify:
1. PRIMARY HOOK: The #1 most compelling reason to reach out now
2. PAIN × SOLUTION: How their specific pain maps to your solution
3. SOCIAL PROOF: Similar companies you've helped
4. CONVERSATION STARTER: Unique observation showing you did homework
5. OBJECTION PREEMPT: Address their likely concern upfront
</outreach_intel>`
};

/**
 * ICP Matching - Optimized for qualification
 */
export const ICP_MATCHING_PROMPT = {
  config: {
    reasoning_effort: 'medium',
    verbosity: 'medium',
    persistence_level: 'standard',
    search_depth: 'standard'
  } as PromptConfig,

  prompt: `
<context_gathering>
- Parallelize searches across all ICP criteria
- Stop when you can definitively score each criterion
- If ambiguous, seek disambiguating evidence (1 retry max)
- Early exit on obvious disqualifiers
</context_gathering>

<tool_preambles>
- "Evaluating [Company] against your ICP criteria..."
- "🎯 Checking: [Specific criterion]"
- "✅ Match: [Criterion met with evidence]"
- "⚠️ Partial: [Criterion partially met - explanation]"
- "❌ Miss: [Criterion not met - specific reason]"
- "📊 ICP Score: [X/Y] criteria met ([percentage]% match)"
</tool_preambles>

<scoring_methodology>
For each criterion:
- STRONG MATCH (100%): Clear evidence with specific examples
- LIKELY MATCH (75%): Indirect evidence or patterns suggest fit
- POSSIBLE MATCH (50%): Some signals but needs validation
- UNLIKELY MATCH (25%): Weak signals or conflicting evidence
- NO MATCH (0%): Clear evidence against or no signals found

Include confidence level and evidence quality for each score
</scoring_methodology>

<match_analysis>
Structure findings as:
1. OVERALL FIT: [Score]% match with [confidence level]
2. STRENGTHS: Top 3 reasons they're a good fit
3. GAPS: What doesn't align (and if it matters)
4. VERDICT: Pursue, Nurture, or Pass (with reasoning)
5. NEXT STEPS: Specific action based on score
</match_analysis>`
};

/**
 * Competitive Intelligence - Optimized for strategic insights
 */
export const COMPETITIVE_INTEL_PROMPT = {
  config: {
    reasoning_effort: 'high',
    verbosity: 'high',
    persistence_level: 'maximum',
    search_depth: 'comprehensive'
  } as PromptConfig,

  prompt: `
<persistence>
- Research until you understand their complete competitive position
- Find specific examples of wins and losses
- Identify patterns across multiple data points
- Don't stop at surface-level competitor lists
- Uncover the "why" behind their competitive choices
</persistence>

<tool_preambles>
- "Conducting competitive analysis for [Company]..."
- "🔍 Mapping competitive landscape and market position..."
- "⚔️ Analyzing: [Competitor] vs [Company] on [dimension]"
- "🎯 Strategic insight: [Specific competitive advantage/vulnerability]"
- "✅ Analysis complete. Here's how to position against [Company]..."
</tool_preambles>

<competitive_dimensions>
Analyze across multiple vectors:
1. PRODUCT: Features, capabilities, roadmap
2. MARKET: Segments, geography, verticals
3. PRICING: Model, tiers, value prop
4. CUSTOMERS: Logos, case studies, testimonials
5. PARTNERSHIPS: Integrations, channels, alliances
6. MOMENTUM: Growth rate, funding, news
7. WEAKNESSES: Complaints, gaps, churn signals
</competitive_dimensions>

<strategic_synthesis>
Transform analysis into action:
- WHERE THEY WIN: Specific scenarios and reasons
- WHERE THEY LOSE: Vulnerabilities to exploit
- BATTLEGROUND: Where you compete directly
- DIFFERENTIATION: Your unique advantages
- POSITIONING: How to frame the conversation
- PROOF POINTS: Evidence supporting your position
</strategic_synthesis>`
};

/**
 * Technology Stack Analysis - Optimized for technical discovery
 */
export const TECH_STACK_PROMPT = {
  config: {
    reasoning_effort: 'medium',
    verbosity: 'medium',
    persistence_level: 'standard',
    search_depth: 'standard'
  } as PromptConfig,

  prompt: `
<context_gathering>
- Start with technical detection tools
- Verify with job postings and engineering blogs
- Look for integration opportunities
- Identify gaps and pain points
- Map stack to business objectives
</context_gathering>

<tool_preambles>
- "Analyzing technology stack for [Company]..."
- "🔧 Detected: [Technology] used for [purpose]"
- "🔌 Integration opportunity: [Your solution] + [Their tool]"
- "⚠️ Gap identified: Missing [capability]"
- "✅ Complete tech profile with [X] integration points"
</tool_preambles>

<stack_analysis>
Map their technology across layers:
1. INFRASTRUCTURE: Cloud, hosting, CDN
2. DATA: Databases, warehouses, analytics
3. BACKEND: Languages, frameworks, APIs
4. FRONTEND: Frameworks, libraries, tools
5. DEVOPS: CI/CD, monitoring, security
6. BUSINESS: CRM, marketing, sales tools
7. COLLABORATION: Communication, project management
</stack_analysis>

<opportunity_mapping>
For each technology found:
- INTEGRATION: Can we integrate? How?
- REPLACEMENT: Could we replace it? Why?
- COMPLEMENT: How do we add value?
- GAPS: What's missing that we provide?
- PAIN POINTS: Known issues with their tools
</opportunity_mapping>

<evidence_rules>
- Every technology claim must cite a source inline \`(Source: [Title](https://...))\`.
- Finish with a SOURCES list formatted as Markdown links so AEs can verify quickly.
- If evidence is inconclusive, mark it as "Needs validation" instead of guessing.
</evidence_rules>`
};

/**
 * Executive Briefing - Optimized for C-level engagement
 */
export const EXECUTIVE_BRIEFING_PROMPT = {
  config: {
    reasoning_effort: 'high',
    verbosity: 'low', // Executives want concise insights
    persistence_level: 'maximum',
    search_depth: 'comprehensive'
  } as PromptConfig,

  prompt: `
<verbosity_control>
Status updates: minimal
Research findings: bullet points only
Strategic insights: concise but complete
Recommendations: clear, numbered, actionable
</verbosity_control>

<tool_preambles>
- "Preparing executive briefing on [Company]..."
- "✓ [Insight category] analyzed"
- Final: "Executive briefing ready. [X] strategic insights identified."
</tool_preambles>

<executive_focus>
Only information that drives decisions:
1. STRATEGIC POSITION: Market standing in 1-2 sentences
2. FINANCIAL HEALTH: Funding, revenue, growth trajectory
3. DECISION MAKERS: Who to engage and their priorities
4. TIMING: Why now is the right time
5. VALUE PROP: Specific to their situation
6. RISK/REWARD: Clear trade-offs
7. NEXT STEP: Single recommended action
</executive_focus>

<briefing_format>
Structure as:
COMPANY: [Name] | [Industry] | [Size] | [Stage]
OPPORTUNITY SIZE: [Revenue potential]
STRATEGIC FIT: [1-line explanation]
KEY INSIGHTS: [3 bullets max]
RECOMMENDATION: [Clear action]
CONFIDENCE: [High/Medium/Low with reason]
</briefing_format>`
};

/**
 * Bulk Research - Optimized for parallel processing
 */
export const BULK_RESEARCH_PROMPT = {
  config: {
    reasoning_effort: 'low', // Speed over depth for bulk
    verbosity: 'low',
    persistence_level: 'minimal',
    search_depth: 'quick'
  } as PromptConfig,

  prompt: `
<context_gathering>
- Maximum 2 searches per company
- Extract only essential data points
- Skip if confidence < 70%
- Optimize for throughput
- Batch similar companies for efficiency
</context_gathering>

<bulk_optimization>
Process in parallel batches:
- Group by industry for context reuse
- Cache common patterns
- Skip deep analysis
- Flag only high-value prospects
- Mark ambiguous cases for follow-up
</bulk_optimization>

<data_extraction>
Per company, capture only:
☐ Company name and website
☐ Industry and employee count
☐ One key product/service
☐ Top ICP match indicator
☐ Outreach priority (High/Medium/Low)
</data_extraction>`
};

/**
 * Helper function to combine base prompt with specific scenario
 */
export function buildScenarioPrompt(
  basePrompt: string,
  scenarioPrompt: string,
  config: PromptConfig
): string {
  return `${basePrompt}

${scenarioPrompt}

<reasoning_effort>${config.reasoning_effort}</reasoning_effort>
<verbosity_setting>${config.verbosity}</verbosity_setting>`;
}

/**
 * Adaptive prompt selection based on user intent
 */
export function selectOptimalPrompt(userQuery: string): {
  prompt: string;
  config: PromptConfig;
} {
  const query = userQuery.toLowerCase();

  // Quick lookups
  if (query.includes('quick') || query.includes('basic') || query.includes('what is')) {
    return { prompt: QUICK_LOOKUP_PROMPT.prompt, config: QUICK_LOOKUP_PROMPT.config };
  }

  // Sales/outreach focused
  if (query.includes('outreach') || query.includes('personalize') || query.includes('email')) {
    return { prompt: SALES_OUTREACH_PROMPT.prompt, config: SALES_OUTREACH_PROMPT.config };
  }

  // ICP/qualification
  if (query.includes('icp') || query.includes('qualify') || query.includes('fit')) {
    return { prompt: ICP_MATCHING_PROMPT.prompt, config: ICP_MATCHING_PROMPT.config };
  }

  // Competitive analysis
  if (query.includes('competitor') || query.includes('compete') || query.includes('vs')) {
    return { prompt: COMPETITIVE_INTEL_PROMPT.prompt, config: COMPETITIVE_INTEL_PROMPT.config };
  }

  // Technical analysis
  if (query.includes('tech') || query.includes('stack') || query.includes('tools')) {
    return { prompt: TECH_STACK_PROMPT.prompt, config: TECH_STACK_PROMPT.config };
  }

  // Executive/strategic
  if (query.includes('executive') || query.includes('strategic') || query.includes('brief')) {
    return { prompt: EXECUTIVE_BRIEFING_PROMPT.prompt, config: EXECUTIVE_BRIEFING_PROMPT.config };
  }

  // Bulk operations
  if (query.includes('bulk') || query.includes('list') || query.includes('multiple')) {
    return { prompt: BULK_RESEARCH_PROMPT.prompt, config: BULK_RESEARCH_PROMPT.config };
  }

  // Default to balanced sales outreach
  return { prompt: SALES_OUTREACH_PROMPT.prompt, config: SALES_OUTREACH_PROMPT.config };
}
