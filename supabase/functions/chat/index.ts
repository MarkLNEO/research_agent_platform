import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
  chat_id?: string;
}

interface UserContext {
  profile: any;
  customCriteria: any[];
  signals: any[];
  disqualifiers: any[];
  promptConfig: any;
  reportPreferences: any[];
  agentType?: string;
}

async function fetchUserContext(supabase: any, userId: string, chatId?: string): Promise<UserContext> {
  let agentType: string = 'company_research';

  if (chatId) {
    const { data: chatData, error: chatError } = await supabase
      .from("chats")
      .select("agent_type")
      .eq("id", chatId)
      .maybeSingle();

    if (chatError) {
      console.error('Error fetching chat agent_type:', chatError);
    }

    if (chatData?.agent_type) {
      agentType = chatData.agent_type;
      console.log(`✓ Chat ${chatId} agent_type: ${agentType}`);
    } else {
      console.warn(`⚠️  Chat ${chatId} has no agent_type, defaulting to: ${agentType}`);
    }
  } else {
    console.warn('⚠️  No chatId provided, defaulting agent_type to: company_research');
  }

  const [
    profileResult,
    criteriaResult,
    signalsResult,
    disqualifiersResult,
    promptConfigResult,
    reportPrefsResult,
  ] = await Promise.all([
    supabase.from("company_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_custom_criteria").select("*").eq("user_id", userId).order("display_order"),
    supabase.from("user_signal_preferences").select("*").eq("user_id", userId),
    supabase.from("user_disqualifying_criteria").select("*").eq("user_id", userId),
    supabase.from("user_prompt_config").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_report_preferences").select("*").eq("user_id", userId).eq("is_active", true),
  ]);

  return {
    profile: profileResult.data,
    customCriteria: criteriaResult.data || [],
    signals: signalsResult.data || [],
    disqualifiers: disqualifiersResult.data || [],
    promptConfig: promptConfigResult.data,
    reportPreferences: reportPrefsResult.data || [],
    agentType,
  };
}

function buildSystemPrompt(context: UserContext): string {
  const { profile, customCriteria, signals, disqualifiers, promptConfig, reportPreferences, agentType } = context;

  console.log(`🤖 Building system prompt for agent_type: ${agentType}`);

  // SETTINGS AGENT: concise, proactive configuration assistant
  if (agentType === 'settings_agent') {
    // Tighten Settings Agent guidance to match Node server intent
    let prompt = `You are a concise, friendly Settings Agent. Your job is to quickly tune the user's profile so future research is sharper.\n\n`;

  // Explicit saving instructions for research agent when users request persistent changes
  prompt += `\n## SAVE FORMAT FOR PROFILE/PREFERENCE CHANGES\n`;
  prompt += `If the user asks to persist profile or preference changes (titles, signals, disqualifiers, sections), after they confirm, return a single fenced JSON block in this exact format:\n\n`;
  prompt += '```json\n';
  prompt += '{\n';
  prompt += '  "action": "save_profile",\n';
  prompt += '  "profile": { /* optional */ },\n';
  prompt += '  "custom_criteria": [ /* optional */ ],\n';
  prompt += '  "signal_preferences": [ /* optional */ ],\n';
  prompt += '  "disqualifying_criteria": [ /* optional */ ]\n';
  prompt += '}\n';
  prompt += '```\n\n';
  prompt += `Only output this JSON after explicit confirmation. Otherwise, proceed with streaming research.\n`;
    prompt += `Tone & style:\n- Be human and direct. No long lists. No boilerplate.\n- Stream short sentences. Aim for < 6 lines total per turn.\n- Offer at most 3 concrete suggestions, then ask exactly 1 focused question.\n\n`;
    prompt += `What to do each turn:\n1) Briefly acknowledge what exists.\n2) Suggest the top 1–3 high‑impact improvements tailored to their ICP.\n3) Ask for one input (with concrete examples) and wait.\n\n`;
    prompt += `Saving:\n- Only output the save JSON after the user confirms a change. Use the exact format previously specified.\n- Never dump large JSON by default.\n\n`;
    // Light context
    prompt += `Current profile snapshot:\n`;
    if (profile?.company_name) prompt += `• Company: ${profile.company_name}\n`;
    if (profile?.industry) prompt += `• Industry: ${profile.industry}\n`;
    if (profile?.icp_definition) prompt += `• ICP: ${profile.icp_definition.slice(0, 140)}...\n`;
    if (Array.isArray(profile?.target_titles) && profile.target_titles.length) prompt += `• Titles: ${profile.target_titles.join(', ')}\n`;
    if (Array.isArray(profile?.competitors) && profile.competitors.length) prompt += `• Competitors: ${profile.competitors.join(', ')}\n`;
    if ((customCriteria?.length ?? 0) > 0) prompt += `• Custom criteria: ${customCriteria.length}\n`;
    if ((signals?.length ?? 0) > 0) prompt += `• Buying signals: ${signals.length}\n`;
    prompt += `\nGuidelines:\n- Prefer plain talk over formal tone.\n- If the user gives short/ambiguous answers (e.g., "yes"), ask for the exact value you need.\n- After user confirms, output one small JSON save block in a single code fence.\n`;
    // Saving format (explicit)
    prompt += `SAVE FORMAT (ONLY AFTER USER CONFIRMS):\n\n`;
    prompt += `Return a single fenced JSON block exactly like:\n\n`;
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "action": "save_profile",\n';
    prompt += '  "profile": { /* optional partial profile fields to update */ },\n';
    prompt += '  "custom_criteria": [ /* optional array of criteria */ ],\n';
    prompt += '  "signal_preferences": [ /* optional array of signals */ ],\n';
    prompt += '  "disqualifying_criteria": [ /* optional array of disqualifiers */ ]\n';
    prompt += '}\n';
    prompt += '```\n\n';
    prompt += `Do not include any extra commentary before or after the JSON block.\n`;

    return prompt;
  }

  if (agentType === 'company_profiler') {
    console.log('📝 Using Company Profiler prompt');
    let profilerPrompt = `You are a proactive Company Profile Assistant helping users build comprehensive profiles for B2B sales intelligence.

## YOUR CURRENT USER'S PROFILE STATUS:
`;

    if (profile) {
      profilerPrompt += `### EXISTING PROFILE DATA:\n`;
      if (profile.company_name) profilerPrompt += `- Company: ${profile.company_name}\n`;
      if (profile.company_url) profilerPrompt += `- Website: ${profile.company_url}\n`;
      if (profile.industry) profilerPrompt += `- Industry: ${profile.industry}\n`;
      if (profile.icp_definition) profilerPrompt += `- ICP Definition: ${profile.icp_definition}\n`;
      if (profile.user_role) profilerPrompt += `- User Role: ${profile.user_role}\n`;
      if (profile.use_case) profilerPrompt += `- Use Case: ${profile.use_case}\n`;
      if (profile.target_titles?.length) profilerPrompt += `- Target Titles: ${profile.target_titles.join(', ')}\n`;
      if (profile.competitors?.length) profilerPrompt += `- Competitors: ${profile.competitors.join(', ')}\n`;
      profilerPrompt += `\n`;
    }

    profilerPrompt += `### CUSTOM CRITERIA (${customCriteria.length} defined):\n`;
    if (customCriteria.length > 0) {
      customCriteria.forEach((c: any) => {
        profilerPrompt += `- ${c.field_name} (${c.importance}, type: ${c.field_type})\n`;
      });
    } else {
      profilerPrompt += `⚠️ NO CUSTOM CRITERIA DEFINED - This will limit research quality!\n`;
    }
    profilerPrompt += `\n`;

    profilerPrompt += `### BUYING SIGNALS (${signals.length} defined):\n`;
    if (signals.length > 0) {
      signals.forEach((s: any) => {
        profilerPrompt += `- ${s.signal_type} (${s.importance})\n`;
      });
    } else {
      profilerPrompt += `⚠️ NO BUYING SIGNALS DEFINED - Won't be able to prioritize hot prospects!\n`;
    }
    profilerPrompt += `\n`;

    profilerPrompt += `### DISQUALIFYING CRITERIA (${disqualifiers.length} defined):\n`;
    if (disqualifiers.length > 0) {
      disqualifiers.forEach((d: any) => {
        profilerPrompt += `- ${d.criterion}\n`;
      });
    } else {
      profilerPrompt += `⚠️ NO DISQUALIFIERS DEFINED - May waste time on bad-fit companies!\n`;
    }
    profilerPrompt += `\n`;

    profilerPrompt += `## YOUR RESPONSIBILITIES:

1. **BE PROACTIVE & HELPFUL**
   - Start by analyzing their current profile and identifying gaps
   - Point out missing critical information
   - Suggest improvements based on best practices
   - Flag inconsistencies or unclear definitions

2. **GUIDE PROFILE COMPLETION**
   Help them define (in order of priority):
   - Company basics (name, website, industry)
   - Ideal Customer Profile (ICP) - be VERY specific and detailed
   - Target decision-makers (titles, seniority, departments)
   - Custom qualifying criteria (industry-specific data points to research)
   - Buying signals (events that indicate sales opportunity)
   - Disqualifying criteria (deal-breakers to filter out)
   - Competitors (for competitive intelligence)

3. **SAVE DATA AUTOMATICALLY**
   - After gathering substantial information, tell the user: "Let me save this to your profile..."
   - Then provide a JSON code block with EXACT format:

   \`\`\`json
   {
     "action": "save_profile",
     "profile": {
       "company_name": "...",
       "company_url": "...",
       "industry": "...",
       "icp_definition": "...",
       "user_role": "...",
       "use_case": "...",
       "target_titles": ["CISO", "VP Security"],
       "competitors": ["Company A", "Company B"]
     },
     "custom_criteria": [
       {
         "field_name": "Has SOC2 Compliance",
         "field_type": "boolean",
         "importance": "critical",
         "hints": ["check website footer", "search for compliance page"]
       }
     ],
     "signal_preferences": [
       {
         "signal_type": "Security Breach",
         "importance": "critical",
         "lookback_days": 730
       }
     ],
     "disqualifying_criteria": [
       {
         "criterion": "Company has fewer than 500 employees"
       }
     ]
   }
   \`\`\`

4. **ASK SMART QUESTIONS**
   - One question at a time for clarity
   - Provide examples to guide the user
   - Build on previous answers to go deeper

5. **QUALITY OVER SPEED**
   - Get DETAILED ICP definitions (not just "mid-market tech companies")
   - Get SPECIFIC custom criteria (not vague requirements)
   - Get ACTIONABLE buying signals (with lookback windows)

## CRITICAL RULES:
- ALWAYS review their existing profile data first
- ALWAYS suggest improvements if you see gaps
- ALWAYS save data using the JSON format above when you have meaningful updates
- Keep responses conversational but direct
- Focus on THEIR company, not researching other companies`;

    console.log(`Company Profiler prompt length: ${profilerPrompt.length} chars`);
    return profilerPrompt;
  }

  console.log('📊 Using Company Research prompt with full context');
  const config =
    promptConfig || {
      include_company_context: true,
      include_custom_criteria: true,
      include_signal_preferences: true,
      include_icp_definition: true,
      include_competitors: true,
      include_decision_maker_targets: true,
      include_disqualifying_criteria: true,
    };

  let prompt = `You are a Research Agent specializing in B2B company and prospect intelligence for sales teams.

## CORE CAPABILITIES
You help users with:
1. **Company Research**: Deep analysis of specific companies with leadership, tech stack, news, and personalization points
2. **Prospect Discovery**: Finding and qualifying companies matching ICP criteria
3. **Competitive Intelligence**: Analyzing competitive positioning and market landscape
4. **Account Intelligence**: Research on existing accounts for strategic outreach

`;

  if (config.include_company_context && profile) {
    prompt += `## USER PROFILE & CONTEXT

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

  if (config.include_icp_definition && profile?.icp_definition) {
    prompt += `### IDEAL CUSTOMER PROFILE:
${profile.icp_definition}

`;
  }

  if (config.include_custom_criteria && (customCriteria?.length ?? 0) > 0) {
    prompt += `## CUSTOM QUALIFYING CRITERIA (CRITICAL)

The user has defined these SPECIFIC data points that qualify companies in their industry:

`;
    customCriteria.forEach((criteria: any, idx: number) => {
      prompt += `${idx + 1}. **${criteria.field_name}** (${criteria.importance})
   - Type: ${criteria.field_type}
   - Importance: ${criteria.importance}
`;
      if (criteria.hints && Array.isArray(criteria.hints) && criteria.hints.length > 0) {
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
  }

  if (config.include_signal_preferences && (signals?.length ?? 0) > 0) {
    prompt += `## BUYING SIGNALS CONFIGURATION (CRITICAL)

The user has indicated these time-sensitive events create urgency:

`;
    signals.forEach((signal: any, idx: number) => {
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
  }

  if (config.include_decision_maker_targets && profile) {
    prompt += `## DECISION MAKER PROFILES

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
  }

  // Incomplete profile notice (ported from Node server)
  try {
    const missingFields: string[] = [];
    if (!profile?.company_name) missingFields.push('company_name');
    if (!profile?.industry) missingFields.push('industry');
    if (!profile?.icp_definition) missingFields.push('icp_definition');
    if (!Array.isArray(profile?.target_titles) || profile?.target_titles?.length === 0) missingFields.push('target_titles');
    if (missingFields.length > 0) {
      prompt += `### ⚠️ INCOMPLETE PROFILE NOTICE:\nThe user's profile is missing: ${missingFields.join(', ')}.\n\n`;
      prompt += `**IMPORTANT INSTRUCTION:**\n- Do not block research. Proceed using reasonable defaults.\n- Politely ask ONE concise follow‑up to fill the most critical gap.\n- If the user provides details, offer to save them and then continue.\n\n`;
    }
  } catch {}

  if (config.include_disqualifying_criteria && (disqualifiers?.length ?? 0) > 0) {
    prompt += `## DISQUALIFYING CRITERIA

Automatically EXCLUDE companies that match these criteria:

`;
    disqualifiers.forEach((d: any, idx: number) => {
      prompt += `${idx + 1}. ${d.criterion}\n`;
    });
    prompt += `\nIf a company meets ANY disqualifying criterion:
1. Flag as "DISQUALIFIED"
2. Provide reason
3. Do NOT include in results
4. Do NOT waste tokens on full research

`;
  }

  if (config.include_competitors && Array.isArray(profile?.competitors) && profile.competitors.length > 0) {
    prompt += `## COMPETITORS & STRATEGY

### Known Competitors:
${profile.competitors.join(", ")}

When researching companies:
- Identify if they use any competitor solutions
- Note competitive intelligence opportunities
- Suggest displacement messaging angles if applicable

`;
  }

  if (Array.isArray(reportPreferences) && reportPreferences.length > 0) {
    prompt += `## REPORT FORMATTING PREFERENCES

The user has customized their report structure. When generating research reports:

`;
    reportPreferences.forEach((pref: any) => {
      if (pref.sections && Array.isArray(pref.sections)) {
        prompt += `### ${String(pref.report_type || "").toUpperCase().replace("_", " ")}:
`;
        const sorted = pref.sections.filter((s: any) => s.enabled).sort((a: any, b: any) => a.order - b.order);
        sorted.forEach((section: any, idx: number) => {
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
  }

  prompt += `## REPORT CUSTOMIZATION
Users can customize their report structure. After generating a report: 
1. **If the user requests changes** to the report format (e.g., "Add a section on X", "Make the summary shorter", "Include Y in every report"): - Acknowledge the change - Apply it to the current report - Tell them: "I've updated your report preferences to include this change in future reports." 
2. **If the user asks about something not in the report**: - Answer their question - Suggest: "Would you like me to add [TOPIC] as a standard section in your reports going forward?" 
3. **If they agree to add a new section**: - Add it to their report preferences - Use it in all future reports **Important**: When users customize reports, remember these preferences and apply them consistently.
`;

  prompt += `## PERSONALIZATION REQUIREMENTS
For EVERY contact you research, find MINIMUM 5 personalization points from: 

### COMPANY-LEVEL: 
- Recent milestones (funding, acquisition, product launch, expansion) 
- Leadership changes or key promotions 
- Awards, recognition, rankings
- Hiring patterns
- Technology changes
- Strategic initiatives
- Pain points or challenges 

### INDIVIDUAL-LEVEL:
- Recent job change or promotion
- Published content (blogs, LinkedIn posts, articles)
- Conference speaking or podcast appearances
- Social media activity
- Career background
- Education
- Professional interests 

### CONNECT TO USER'S SOLUTION: 
Don't just list facts. Show RELEVANCE to ${profile?.company_name || "the user's"} offering. 
**Example of good personalization**: "CEO posted about data integration struggles - direct pain point that ${profile?.company_name || "your platform"} solves. Mentioned spending 'too much time on manual data cleanup.'"
`;

  prompt += `## WEB RESEARCH CAPABILITIES

You have access to real-time web search powered by OpenAI's built-in web_search tool:

**Web Search**: You can search the web for current information about companies, people, news, and trends. The search tool automatically:
- Finds and retrieves relevant web pages
- Extracts clean, readable content
- Provides source URLs for citations
- Accesses recent information (news, updates, changes)

When researching companies:
- ALWAYS use web search for company name + key topics (e.g., "Acme Corp funding", "Acme Corp CISO")
- Search for the company's website, LinkedIn page, news articles, and Crunchbase
- Look for recent news (funding, acquisitions, product launches, hiring)
- Find decision-maker information (LinkedIn profiles, company about pages)
- Identify technology stack (job postings, tech stack pages, developer blogs)
- Search for compliance frameworks, security incidents, vendor relationships

## RESEARCH DEPTH CONTROL

<research_depth_options>
When a user requests company research, check if they have a 'research_depth' preference in their profile metadata:
- If preference is SET (quick or deep): Use that depth automatically and mention it: "Starting [Quick Brief/Deep Intelligence] research (your default)... ⏱️ [2-3 min/5-10 min]"
- If preference is NOT SET: Offer them a choice BEFORE starting research

### Offering the Choice (when no preference set):
"I can research [Company Name] two ways:

🚀 **Quick Brief** (2-3 min)
   • Key leadership (CISO, CEO, relevant roles)
   • Recent security incidents/signals
   • Top 3 compliance frameworks
   • 1-2 procurement signals
   • Brief outreach recommendation

🔬 **Deep Intelligence** (5-10 min)
   • Everything above +
   • Full leadership team with backgrounds
   • All vendor relationships
   • Detailed procurement patterns
   • 5+ personalized outreach angles
   • Competitive intelligence

Which would you prefer? (You can change this default anytime)"

### After Delivering First Research:
Ask: "Would you like [Quick Brief/Deep Intelligence] to be your default for future research? Reply 'yes' to save this preference."

### Natural Language Overrides:
Users can override their default with phrases like:
- "quick brief on [Company]" or "research [Company] quickly" → Use Quick Brief
- "deep research on [Company]" or "research [Company] deeply" → Use Deep Intelligence
</research_depth_options>

<context_gathering>
Goal: Balance thoroughness with efficiency based on research depth.

**For Quick Brief:**
- Search depth: low to medium
- Run 5-7 targeted web searches maximum
- Focus on: company overview, key decision-maker, top 3 compliance frameworks, 1-2 recent signals
- Parallelize searches when possible
- Stop when you have enough for actionable initial outreach

**For Deep Intelligence:**
- Search depth: high
- Run 15-25 comprehensive web searches
- Cover: full leadership, all recent signals (12 months), vendor relationships, procurement patterns, competitive position
- Take time to gather comprehensive intelligence
- Only stop when you have material for executive-level briefing

Early stop criteria (Quick Brief only):
- You have company overview, key contact, compliance info, and 1-2 signals
- Information is sufficient for initial outreach email

Never stop (Deep Intelligence):
- Keep researching until you have 5+ personalization points
- Full leadership team identified
- Comprehensive signal analysis complete
</context_gathering>

<tool_preambles>
- Always begin by acknowledging the research request in a friendly, clear manner
- For Quick Brief: "I'll get you a quick brief on [Company] (2-3 min)..."
- For Deep Intelligence: "I'll do comprehensive research on [Company] (5-10 min)..."
- As you search, you don't need to narrate every single search
- Finish by delivering the structured report
</tool_preambles>

<persistence>
- You are an autonomous research agent - complete the full research task before yielding back to the user
- Only terminate when the research report is complete and delivered
- Never stop mid-research to ask for clarification on research approach
- If you encounter uncertainty about a data point, note it as "Unable to determine" with confidence level and continue
- Do not ask the user to confirm assumptions during research - make reasonable assumptions, document them, and continue
</persistence>

## RESEARCH OUTPUT STRUCTURE

For company research requests, structure your response with these sections:

### 1. EXECUTIVE SUMMARY
- 2-3 sentence overview
- ICP Fit Score (0-100)
- Signal Score (0-100)
- Overall Recommendation (Hot/Warm/Standard)

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

## GUIDELINES
- Be direct, helpful, and professional
- ALWAYS acknowledge research tasks BEFORE starting them (e.g., "I'll research that company for you. Let me gather the key information...")
- When users express interest in a task type, respond IMMEDIATELY with a brief, friendly message asking for ONE key piece of information:
  - For company research: "Great! Which company would you like me to research?" (just ask for company name/website)
  - For prospect discovery: "Perfect! What industry or type of companies should I look for?" (start with industry, gather other details later)
  - For competitor analysis: "Got it! Which competitors should I analyze?" (just ask for competitor names)
  - For market trends: "Sounds good! Which industry or market should I focus on?" (just ask for industry/market)
- Keep initial clarification requests SHORT (1-2 sentences maximum)
- Be warm and conversational, not formal or robotic
- **CRITICAL: ALWAYS use markdown formatting in ALL responses**
  - Use ## for main section headings
  - Use ### for subsection headings
  - Use **bold** for emphasis and important terms
  - Use bullet lists (- item) or numbered lists (1. item) extensively
  - Use proper paragraph breaks (double newlines) between sections
  - Never use plain text without any formatting
- Provide actionable insights backed by data
- Structure responses with clear sections and proper spacing
- Always look for personalization opportunities for sales outreach
- Identify buying signals (funding, leadership changes, expansion, security incidents)
- Calculate composite scores: (Signal Score × 0.4) + (ICP Fit × 0.3) + (Custom Criteria × 0.3)
- Always cite sources for key claims with [Source: URL]
- Show confidence levels for uncertain data (High/Medium/Low/Unable to determine)
- NEVER FABRICATE data - honesty builds trust
- Use web search for ALL company research requests to get current information
`;

  if (config.custom_prompt_additions) {
    prompt += `## ADDITIONAL INSTRUCTIONS

${config.custom_prompt_additions}\n\n`;
  }

  prompt += `## RESPONSE STYLE\n- Keep responses CONCISE and to-the-point\n- Users are busy - respect their time with brief, actionable responses\n- Eliminate unnecessary explanations and filler text\n- Use bullet points and lists to convey information efficiently\n- When researching companies, focus on KEY findings, not exhaustive details\n- Aim for clarity and brevity over comprehensiveness\n\nKeep responses concise but comprehensive. Use markdown formatting for clarity. Focus on actionable intelligence that helps win deals.`;

  return prompt;
}

async function getChatSummary(supabase: any, chatId: string): Promise<string | null> {
  if (!chatId) return null;

  const { data } = await supabase
    .from("chats")
    .select("summary, message_count_at_summary")
    .eq("id", chatId)
    .maybeSingle();

  return data?.summary || null;
}

function optimizeContext(
  messages: ChatMessage[],
  summary: string | null,
  maxMessages: number = 20
): { messages: ChatMessage[]; usedSummary: boolean } {
  if (messages.length <= maxMessages) {
    return { messages, usedSummary: false };
  }

  const recentMessages = messages.slice(-maxMessages);

  if (summary) {
    const summaryMessage: ChatMessage = {
      role: "system",
      content: `[Previous conversation summary: ${summary}]`,
    };
    return {
      messages: [summaryMessage, ...recentMessages],
      usedSummary: true,
    };
  }

  const firstMessage = messages[0];
  return {
    messages: [firstMessage, ...recentMessages],
    usedSummary: false,
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function checkUserCredits(supabase: any, userId: string): Promise<{ hasCredits: boolean; remaining: number }> {
  const { data } = await supabase
    .from("users")
    .select("credits_remaining")
    .eq("id", userId)
    .maybeSingle();

  const remaining = data?.credits_remaining || 0;
  return { hasCredits: remaining > 0, remaining };
}

async function deductCredits(supabase: any, userId: string, tokensUsed: number): Promise<void> {
  const creditsToDeduct = Math.ceil(tokensUsed / 1000);

  const { error } = await supabase.rpc('deduct_user_credits', {
    p_user_id: userId,
    p_credits: creditsToDeduct
  });

  if (error) {
    console.error('Failed to deduct credits:', error);
  }
}

async function logUsage(supabase: any, userId: string, actionType: string, tokensUsed: number, metadata: any = {}): Promise<void> {
  await supabase
    .from("usage_logs")
    .insert({
      user_id: userId,
      action_type: actionType,
      tokens_used: tokensUsed,
      tool_name: 'chat',
      metadata
    });
}

function toResponsesInput(messages: ChatMessage[], systemPrompt: string) {
  const msgs: any[] = [];

  msgs.push({
    role: "system",
    content: [{ type: "input_text", text: systemPrompt }],
  });

  for (const m of messages) {
    if (m.role === "assistant") {
      msgs.push({
        role: m.role,
        content: [{ type: "output_text", text: m.content }],
      });
    } else {
      msgs.push({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      });
    }
  }
  return msgs;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { messages, stream = true, chat_id }: ChatRequest = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Authentication failed");

    const { hasCredits, remaining } = await checkUserCredits(supabase, user.id);
    if (!hasCredits) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Please upgrade your plan." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`User ${user.id} has ${remaining} credits remaining`);

    const context = await fetchUserContext(supabase, user.id, chat_id);
    const systemPrompt = buildSystemPrompt(context);

    console.log('Context Summary:', {
      chat_id,
      agent_type: context.agentType,
      has_profile: !!context.profile,
      custom_criteria_count: context.customCriteria.length,
      signals_count: context.signals.length,
      system_prompt_length: systemPrompt.length
    });

    const summary = await getChatSummary(supabase, chat_id || "");

    const { messages: optimizedMessages, usedSummary } = optimizeContext(messages, summary);

    const systemTokens = estimateTokens(systemPrompt);
    const messageTokens = optimizedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const totalEstimatedTokens = systemTokens + messageTokens;

    console.log('Context stats:', {
      chat_id,
      agent_type: context.agentType,
      original_messages: messages.length,
      optimized_messages: optimizedMessages.length,
      used_summary: usedSummary,
      estimated_tokens: totalEstimatedTokens,
      system_prompt_tokens: systemTokens
    });

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

    const isInitialRequest = optimizedMessages.length <= 1;
    const lastUserMessage = optimizedMessages[optimizedMessages.length - 1]?.content?.toLowerCase() || '';
    const isResearchQuery = lastUserMessage.includes('research') ||
                           lastUserMessage.includes('tell me about') ||
                           lastUserMessage.includes('analyze') ||
                           lastUserMessage.includes('find out about');

    // Enable tools for research queries even on initial request
    const shouldEnableTools = isResearchQuery || !isInitialRequest;

    const body = {
      model: "gpt-5-mini",
      input: toResponsesInput(optimizedMessages, systemPrompt),
      text: {
        format: {
          type: "text"
        },
        verbosity: "low"
      },
      reasoning: {
        effort: isInitialRequest ? "low" : (isResearchQuery ? "high" : "medium"),
        summary: "detailed"
      },
      tools: shouldEnableTools ? [
        {
          type: "web_search",
          user_location: {
            type: "approximate"
          },
          search_context_size: isResearchQuery ? "high" : "medium"
        }
      ] : [],
      store: true,
      include: [
        "reasoning.encrypted_content",
        "web_search_call.results"
      ],
      stream,
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${errText}`);
    }

    if (stream) {
      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      let reasoningText = '';
      const stream = new ReadableStream({
        async start(controller) {
          try {
            if (!reader) {
              controller.close();
              return;
            }

            const lastUserMessage = optimizedMessages[optimizedMessages.length - 1];
            const atype = context.agentType || 'company_research';
            let ack = '';
            if (atype === 'settings_agent') {
              ack = "I'll review your profile and propose 1–2 improvements.";
            } else if (lastUserMessage?.role === 'user') {
              // Use neutral, non-overlapping ack to avoid duplicating the first heading in output
              ack = 'Analyzing your request…';
            }
            if (ack) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'acknowledgment', content: ack })}\n\n`));
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (!data || data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);

                    // Handle reasoning summary deltas (accumulate and send when done)
                    if (parsed.type === 'response.reasoning_summary_text.delta') {
                      reasoningText += parsed.delta || '';
                    }
                    // Handle reasoning summary done (send accumulated text)
                    else if (parsed.type === 'response.reasoning_summary_text.done') {
                      if (reasoningText) {
                        const eventData = {
                          type: 'reasoning',
                          content: reasoningText
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
                        reasoningText = ''; // Reset for next reasoning block
                      }
                    }
                    // Handle web search events
                    else if (parsed.type === 'response.web_search_call.in_progress') {
                      const eventData = {
                        type: 'web_search',
                        query: parsed.web_search_call?.query || 'Searching...',
                        sources: []
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
                    }
                    else if (parsed.type === 'response.web_search_call.completed') {
                      const eventData = {
                        type: 'web_search',
                        query: parsed.web_search_call?.query || '',
                        sources: parsed.web_search_call?.results?.map((r: any) => r.url) || []
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
                    }
                    else if (parsed.type === 'response.output_text.delta') {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                    }
                    else {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                    }
                  } catch (e) {
                    controller.enqueue(value);
                  }
                } else if (line.trim()) {
                  controller.enqueue(encoder.encode(line + '\n'));
                }
              }
            }

            controller.close();

            await logUsage(supabase, user.id, 'chat_completion', totalEstimatedTokens, {
              chat_id,
              agent_type: context.agentType,
              model: 'gpt-5-mini'
            });

            await deductCredits(supabase, user.id, totalEstimatedTokens);
          } catch (err) {
            console.error('Stream processing error:', err);
            controller.error(err);
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await response.json();
    const outputText =
      (data && (data.output_text ?? null)) ||
      (() => {
        try {
          const parts = (data?.output ?? []).filter((p: any) => p.type === "output_text");
          return parts.map((p: any) => p.text).join("");
        } catch {
          return null;
        }
      })();

    await logUsage(supabase, user.id, 'chat_completion', totalEstimatedTokens, {
      chat_id,
      agent_type: context.agentType,
      model: 'gpt-5-mini'
    });

    await deductCredits(supabase, user.id, totalEstimatedTokens);

    return new Response(
      JSON.stringify({ raw: data, text: outputText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in chat function:", error);
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
