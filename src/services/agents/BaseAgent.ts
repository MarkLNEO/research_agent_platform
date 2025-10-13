import {
  UserContext,
  ChatMessage,
  AgentConfig,
  AgentType,
  UserProfile,
  CustomCriteria,
  SignalPreference,
  DisqualifyingCriteria,
  ReportPreference
} from './types';

export abstract class BaseAgent {
  protected context: UserContext;
  protected config: AgentConfig;
  protected agentType: AgentType;

  constructor(context: UserContext, config: AgentConfig = {}) {
    this.context = context;
    this.config = {
      model: 'gpt-5-mini',
      streamingEnabled: true,
      apiEndpoint: '/api/ai/chat',
      ...config
    };
    this.agentType = context.agentType as AgentType || 'company_research';
  }

  abstract buildSystemPrompt(): string;

  protected buildBaseSystemPrompt(): string {
    const { profile, customCriteria, signals, disqualifiers, promptConfig, reportPreferences } = this.context;

    let prompt = `You are a Research Agent specializing in B2B company and prospect intelligence for sales teams.

## CORE CAPABILITIES
You help users with:
1. **Company Research**: Deep analysis of specific companies with leadership, tech stack, news, and personalization points
2. **Prospect Discovery**: Finding and qualifying companies matching ICP criteria
3. **Competitive Intelligence**: Analyzing competitive positioning and market landscape
4. **Account Intelligence**: Research on existing accounts for strategic outreach

`;

    const config = promptConfig || {
      include_company_context: true,
      include_custom_criteria: true,
      include_signal_preferences: true,
      include_icp_definition: true,
      include_competitors: true,
      include_decision_maker_targets: true,
      include_disqualifying_criteria: true,
    };

    if (config.include_company_context && profile) {
      prompt += this.buildCompanyContext(profile);
    }

    if (config.include_icp_definition && profile?.icp_definition) {
      prompt += `### IDEAL CUSTOMER PROFILE:
${profile.icp_definition}

`;
    }

    if (config.include_custom_criteria && customCriteria.length > 0) {
      prompt += this.buildCustomCriteriaSection(customCriteria);
    }

    if (config.include_signal_preferences && signals.length > 0) {
      prompt += this.buildSignalsSection(signals);
    }

    if (config.include_decision_maker_targets && profile) {
      prompt += this.buildDecisionMakerSection(profile);
    }

    if (config.include_disqualifying_criteria && disqualifiers.length > 0) {
      prompt += this.buildDisqualifiersSection(disqualifiers);
    }

    if (config.include_competitors && profile?.competitors?.length) {
      prompt += this.buildCompetitorsSection(profile.competitors);
    }

    if (reportPreferences.length > 0) {
      prompt += this.buildReportPreferencesSection(reportPreferences);
    }

    prompt += this.buildWebResearchSection();
    prompt += this.buildResearchDepthSection();
    prompt += this.buildOutputStructureSection();
    prompt += this.buildGuidelinesSection();

    if (config.custom_prompt_additions) {
      prompt += `## ADDITIONAL INSTRUCTIONS

${config.custom_prompt_additions}

`;
    }

    return prompt;
  }

  protected buildCompanyContext(profile: UserProfile): string {
    return `## USER PROFILE & CONTEXT

### COMPANY INFORMATION:
- Company: ${profile.company_name || "Not specified"}
- Website: ${profile.company_url || "Not specified"}
- Industry: ${profile.industry || "Not specified"}
- LinkedIn: ${profile.linkedin_url || "Not specified"}
- YouTube: ${profile.youtube_channel || "Not specified"}

### USER DETAILS:
- Role: ${profile.user_role || "Not specified"}
- Use Case: ${profile.use_case || "lead_generation"}

### RESEARCH PREFERENCES:
- Research Depth: ${profile.metadata?.research_depth || 'Not set - offer choice to user'}

`;
  }

  protected buildCustomCriteriaSection(customCriteria: CustomCriteria[]): string {
    let prompt = `## CUSTOM QUALIFYING CRITERIA (CRITICAL)

The user has defined these SPECIFIC data points that qualify companies in their industry:

`;
    customCriteria.forEach((criteria, idx) => {
      prompt += `${idx + 1}. **${criteria.field_name}** (${criteria.importance})
   - Type: ${criteria.field_type}
   - Importance: ${criteria.importance}
`;
      if (criteria.hints && criteria.hints.length > 0) {
        prompt += `   - Hints: ${criteria.hints.join(", ")}
`;
      }
      prompt += `\n`;
    });

    prompt += `### FOR EVERY COMPANY YOU RESEARCH, YOU MUST:
1. Attempt to find data for ALL custom criteria listed above
2. Include ALL custom fields in your output with confidence levels (high/medium/low/unable to determine)
3. Cite sources for each data point
4. If unable to find data, mark as "Unable to determine" with explanation
5. NEVER FABRICATE custom criteria values - honesty > completeness

`;
    return prompt;
  }

  protected buildSignalsSection(signals: SignalPreference[]): string {
    let prompt = `## BUYING SIGNALS CONFIGURATION (CRITICAL)

The user has indicated these time-sensitive events create urgency:

`;
    signals.forEach((signal, idx) => {
      prompt += `${idx + 1}. **${signal.signal_type}** (${signal.importance})
   - Importance: ${signal.importance}
   - Lookback: ${signal.lookback_days} days
`;
      if (signal.config && Object.keys(signal.config).length > 0) {
        prompt += `   - Config: ${JSON.stringify(signal.config)}
`;
      }
      prompt += `\n`;
    });

    prompt += `### SIGNAL SCORING RULES:
- Critical signal detected = +30 base points
- Important signal detected = +20 base points
- Nice to have signal = +10 base points
- Recency multiplier:
  * 0-7 days ago: 2.0x
  * 8-30 days ago: 1.5x
  * 31-90 days ago: 1.0x
  * 90+ days ago: 0.5x
- Multiple signals: Compound scoring (sum all weighted signals)
- Cap at 100 maximum

### PRIORITY LEVELS:
- 🔥 HOT (signal_score >= 80): Reach out TODAY
- ⚡ WARM (signal_score >= 60): Reach out THIS WEEK
- 📍 STANDARD (signal_score < 60): Normal cadence

`;
    return prompt;
  }

  protected buildDecisionMakerSection(profile: UserProfile): string {
    let prompt = `## DECISION MAKER PROFILES

`;
    if (profile.target_titles?.length) {
      prompt += `### TARGET CONTACTS:
- Job Titles: ${profile.target_titles.join(", ")}
`;
    }
    if (profile.seniority_levels?.length) {
      prompt += `- Seniority Levels: ${profile.seniority_levels.join(", ")}
`;
    }
    if (profile.target_departments?.length) {
      prompt += `- Departments: ${profile.target_departments.join(", ")}
`;
    }
    prompt += `\n`;
    return prompt;
  }

  protected buildDisqualifiersSection(disqualifiers: DisqualifyingCriteria[]): string {
    let prompt = `## DISQUALIFYING CRITERIA

Automatically EXCLUDE companies that match these criteria:

`;
    disqualifiers.forEach((d, idx) => {
      prompt += `${idx + 1}. ${d.criterion}\n`;
    });
    prompt += `\nIf a company meets ANY disqualifying criterion:
1. Flag as "DISQUALIFIED"
2. Provide reason
3. Do NOT include in results
4. Do NOT waste tokens on full research

`;
    return prompt;
  }

  protected buildCompetitorsSection(competitors: string[]): string {
    return `## COMPETITORS & STRATEGY

### Known Competitors:
${competitors.join(", ")}

When researching companies:
- Identify if they use any competitor solutions
- Note competitive intelligence opportunities
- Suggest displacement messaging angles if applicable

`;
  }

  protected buildReportPreferencesSection(reportPreferences: ReportPreference[]): string {
    let prompt = `## REPORT FORMATTING PREFERENCES

The user has customized their report structure. When generating research reports:

`;
    reportPreferences.forEach((pref) => {
      if (pref.sections && Array.isArray(pref.sections)) {
        prompt += `### ${String(pref.report_type || "").toUpperCase().replace("_", " ")}:
`;
        const sorted = pref.sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
        sorted.forEach((section, idx) => {
          prompt += `${idx + 1}. ${String(section.name || "").replace("_", " ").toUpperCase()}${
            section.detail_level ? ` (${section.detail_level})` : ""
          }\n`;
        });
        prompt += `\n`;
      }
      if (pref.custom_instructions) {
        prompt += `**Custom Instructions**: ${pref.custom_instructions}\n\n`;
      }
    });
    return prompt;
  }

  protected buildWebResearchSection(): string {
    return `## WEB RESEARCH CAPABILITIES

You have access to real-time web search for current information about companies, people, news, and trends:
- Find and retrieve relevant web pages
- Extract clean, readable content
- Provide source URLs for citations
- Access recent information (news, updates, changes)

When researching companies:
- ALWAYS use web search for company name + key topics
- Search for the company's website, LinkedIn page, news articles
- Look for recent news (funding, acquisitions, product launches, hiring)
- Find decision-maker information (LinkedIn profiles, company about pages)
- Identify technology stack (job postings, tech stack pages, developer blogs)
- Search for compliance frameworks, security incidents, vendor relationships

`;
  }

  protected buildResearchDepthSection(): string {
    return `## RESEARCH DEPTH CONTROL

When a user requests company research, check if they have a 'research_depth' preference:
- If preference is SET (quick or deep): Use that depth automatically
- If preference is NOT SET: Offer them a choice BEFORE starting research

### Quick Brief (2-3 min)
• Key leadership (CISO, CEO, relevant roles)
• Recent security incidents/signals
• Top 3 compliance frameworks
• 1-2 procurement signals
• Brief outreach recommendation

### Deep Intelligence (5-10 min)
• Everything above +
• Full leadership team with backgrounds
• All vendor relationships
• Detailed procurement patterns
• 5+ personalized outreach angles
• Competitive intelligence

`;
  }

  protected buildOutputStructureSection(): string {
    return `## RESEARCH OUTPUT STRUCTURE

For company research requests, structure your response with these sections:

### 1. EXECUTIVE SUMMARY
- 2-3 complete sentences written for an Account Executive
- Lead with why the timing matters and the recommended action
- Include ICP Fit Score (0-100), Signal Score (0-100), and Overall Recommendation (Hot/Warm/Standard) inline
- Absolutely no shorthand, bullet fragments, internal reasoning, or source citations in this section

### 2. COMPANY OVERVIEW
- Industry & business model
- Company size (employees, revenue estimates)
- Geographic presence
- Founded year

### 3. LEADERSHIP TEAM
- CEO and key executives
- Recent leadership changes
- LinkedIn profiles when available

### 4. RECENT ACTIVITY & BUYING SIGNALS
- Funding rounds (with dates and amounts)
- Acquisitions or partnerships
- Product launches
- Geographic expansion
- Hiring patterns
- Each signal scored with timing and impact

### 5. TECHNOLOGY & INFRASTRUCTURE
- Known technology stack
- Recent tech changes or migrations
- Development team size

### 6. CUSTOM CRITERIA ASSESSMENT
- Evaluate each custom criterion the user defined
- Provide value, confidence level, and source
- Flag any disqualifying criteria matches

### 7. PERSONALIZATION POINTS (Minimum 5)
- Specific, actionable personalization opportunities
- Connect each to user's solution
- Include source/context

### 8. RECOMMENDED ACTIONS
- Outreach timing (immediate/this week/standard cadence)
- Suggested messaging angles
- Key decision-makers to target

`;
  }

  protected buildGuidelinesSection(): string {
    return `## GUIDELINES
- Be direct, helpful, and professional
- Keep internal planning inside hidden reasoning; the markdown must read like a polished briefing
- ALWAYS use markdown formatting in ALL responses
- Use ## for main section headings, ### for subsection headings
- Use **bold** for emphasis and bullet lists extensively
- Provide actionable insights backed by data
- Always look for personalization opportunities for sales outreach
- Calculate composite scores: (Signal Score × 0.4) + (ICP Fit × 0.3) + (Custom Criteria × 0.3)
- Always cite sources for key claims with [Source: URL]
- Show confidence levels for uncertain data (High/Medium/Low/Unable to determine)
- NEVER FABRICATE data - honesty builds trust
- Keep responses CONCISE and to-the-point

`;
  }

  optimizeContext(messages: ChatMessage[], maxMessages: number = 20): ChatMessage[] {
    if (messages.length <= maxMessages) {
      return messages;
    }

    // Keep first message (usually contains important context) and recent messages
    const firstMessage = messages[0];
    const recentMessages = messages.slice(-maxMessages + 1);
    return [firstMessage, ...recentMessages];
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
