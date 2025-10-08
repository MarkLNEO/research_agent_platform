import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { sendApprovalNotification, sendApprovalConfirmation } from './emailService.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Load environment variables from .env.local (if present) then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Follow .windsurf/rules/gpt-5-responses-api.md — default to GPT‑5 Responses API model
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ variants).');
}
if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. /api/chat will return an error until configured.');
}

function getAuthHeader(req) {
  return req.headers['authorization'] || req.headers['Authorization'];
}

function createAuthedSupabase(authHeader) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

function estimateTokens(text = '') {
  return Math.ceil((text || '').length / 4);
}

async function checkUserCredits(supabase, userId) {
  // Ensure user row exists with 1000 free credits for new users
  const INITIAL_CREDITS = 1000;
  let { data: userRow } = await supabase
    .from('users')
    .select('id, credits_remaining, credits_total_used, approval_status')
    .eq('id', userId)
    .maybeSingle();

  if (!userRow) {
    const { data: inserted } = await supabase
      .from('users')
      .insert({ 
        id: userId, 
        credits_remaining: INITIAL_CREDITS,
        credits_total_used: 0,
        approval_status: 'pending' // New signups require admin approval
      })
      .select('id, credits_remaining, credits_total_used, approval_status')
      .single();
    userRow = inserted;
  }

  // Check approval status
  if (userRow?.approval_status === 'pending') {
    return { 
      hasCredits: false, 
      remaining: userRow?.credits_remaining || 0,
      needsApproval: true,
      message: 'Your account is pending approval. Please check your email or contact mlerner@rebarhq.ai'
    };
  }

  if (userRow?.approval_status === 'rejected') {
    return { 
      hasCredits: false, 
      remaining: 0,
      needsApproval: true,
      message: 'Your account access has been restricted. Please contact mlerner@rebarhq.ai'
    };
  }

  // Check credits - NO AUTO TOP-UP
  const remaining = userRow?.credits_remaining || 0;
  if (remaining <= 0) {
    return { 
      hasCredits: false, 
      remaining: 0,
      message: 'You have used all your free credits. Please contact mlerner@rebarhq.ai to request additional credits.'
    };
  }

  return { 
    hasCredits: true, 
    remaining,
    lowCredits: remaining < 100 // Warning threshold
  };
}

async function deductCredits(supabase, userId, tokensUsed) {
  const creditsToDeduct = Math.ceil(tokensUsed / 1000);
  const { error } = await supabase.rpc('deduct_user_credits', {
    p_user_id: userId,
    p_credits: creditsToDeduct,
  });
  if (error) console.error('Failed to deduct credits:', error);
}

async function logUsage(supabase, userId, actionType, tokensUsed, metadata = {}) {
  await supabase.from('usage_logs').insert({
    user_id: userId,
    action_type: actionType,
    tokens_used: tokensUsed,
    tool_name: 'chat',
    metadata,
  });
}

async function fetchUserContext(supabase, userId, chatId) {
  let agentType = 'company_research';
  if (chatId) {
    const { data: chatData } = await supabase
      .from('chats')
      .select('agent_type')
      .eq('id', chatId)
      .maybeSingle();
    if (chatData?.agent_type) agentType = chatData.agent_type;
  }

  const [profileResult, criteriaResult, signalsResult, disqualifiersResult, promptConfigResult, reportPrefsResult] =
    await Promise.all([
      supabase.from('company_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_custom_criteria').select('*').eq('user_id', userId).order('display_order'),
      supabase.from('user_signal_preferences').select('*').eq('user_id', userId),
      supabase.from('user_disqualifying_criteria').select('*').eq('user_id', userId),
      supabase.from('user_prompt_config').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_report_preferences').select('*').eq('user_id', userId).eq('is_active', true),
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

function buildSystemPrompt(context) {
  const { profile, customCriteria, signals, disqualifiers, promptConfig, reportPreferences, agentType } = context;

  if (agentType === 'settings_agent') {
    // Concise, friendly configuration assistant
    let prompt = `You are a concise, friendly Settings Agent. Your job is to quickly tune the user's profile so future research is sharper.

Tone & style:
- Be human and direct. No long lists. No boilerplate.
- Stream short sentences. Aim for < 6 lines total per turn.
- Offer at most 3 concrete suggestions, then ask exactly 1 focused question.

What to do each turn:
1) Briefly acknowledge what exists.
2) Suggest the top 1–3 high‑impact improvements.
3) Ask for one input (with examples) and wait.

Saving:
- Only output the save JSON after the user confirms a change. Use the exact format previously specified.
- Never dump large JSON by default.
`;

    // Light context summary
    prompt += `\nCurrent profile snapshot:\n`;
    if (profile?.company_name) prompt += `• Company: ${profile.company_name}\n`;
    if (profile?.industry) prompt += `• Industry: ${profile.industry}\n`;
    if (profile?.icp_definition) prompt += `• ICP: ${profile.icp_definition.slice(0, 140)}...\n`;
    if (Array.isArray(profile?.target_titles) && profile.target_titles.length) prompt += `• Titles: ${profile.target_titles.join(', ')}\n`;
    if (Array.isArray(profile?.competitors) && profile.competitors.length) prompt += `• Competitors: ${profile.competitors.join(', ')}\n`;
    if ((customCriteria?.length ?? 0) > 0) prompt += `• Custom criteria: ${customCriteria.length}\n`;
    if ((signals?.length ?? 0) > 0) prompt += `• Buying signals: ${signals.length}\n`;

    // Guidance rules
    prompt += `\nGuidelines:\n- Prefer plain talk over formal tone.\n- If the user gives short/ambiguous answers (e.g., "yes"), ask for the exact value you need.\n- Suggest specific examples tailored to security / enterprise ICPs when appropriate.\n- After user confirms, output one small JSON save block in a single code fence.\n`;

    return prompt;
  }

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
- Company: ${profile.company_name || 'Not specified'}
- Website: ${profile.company_url || 'Not specified'}
- Industry: ${profile.industry || 'Not specified'}
- LinkedIn: ${profile.linkedin_url || 'Not specified'}
- YouTube: ${profile.youtube_channel || 'Not specified'}

### USER DETAILS:
- Role: ${profile.user_role || 'Not specified'}
- Use Case: ${profile.use_case || 'lead_generation'}

### RESEARCH PREFERENCES:
- Research Depth: ${profile.metadata?.research_depth || 'Not set - offer choice to user'}

`;

    // Check for missing profile information
    const missingFields = [];
    if (!profile.company_name) missingFields.push('company name');
    if (!profile.company_url) missingFields.push('company website');
    if (!profile.industry) missingFields.push('industry');
    if (!profile.icp_definition) missingFields.push('ideal customer profile');
    if (!profile.competitors || profile.competitors.length === 0) missingFields.push('competitors');
    
    const onboardingData = profile.onboarding_data || {};
    if (!onboardingData.target_titles || onboardingData.target_titles.length === 0) {
      missingFields.push('target job titles');
    }
    if (!onboardingData.signal_preferences || onboardingData.signal_preferences.length === 0) {
      missingFields.push('buying signals');
    }

    if (missingFields.length > 0) {
      prompt += `### ⚠️ INCOMPLETE PROFILE NOTICE:
The user's profile is missing: ${missingFields.join(', ')}.

**IMPORTANT INSTRUCTION:**
- After completing any research request, briefly mention that adding these details would help you provide more targeted research
- Keep it conversational and non-intrusive (1-2 sentences max)
- Example: "By the way, if you share your target job titles and key competitors, I can make future research even more relevant to your sales process."
- DO NOT interrupt the research flow - only mention this AFTER delivering the research

`;
    }
  }

  if (config.include_icp_definition && profile?.icp_definition) {
    prompt += `### IDEAL CUSTOMER PROFILE:
${profile.icp_definition}

`;
  }

  if (config.include_custom_criteria && (context.customCriteria?.length ?? 0) > 0) {
    prompt += `## CUSTOM QUALIFYING CRITERIA (CRITICAL)

The user has defined these SPECIFIC data points that qualify companies in their industry:

`;
    context.customCriteria.forEach((criteria, idx) => {
      prompt += `${idx + 1}. **${criteria.field_name}** (${criteria.importance})
   - Type: ${criteria.field_type}
   - Importance: ${criteria.importance}
`;
      if (criteria.hints && Array.isArray(criteria.hints) && criteria.hints.length > 0) {
        prompt += `   - Hints: ${criteria.hints.join(', ')}
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

  if (config.include_signal_preferences && (context.signals?.length ?? 0) > 0) {
    prompt += `## BUYING SIGNALS CONFIGURATION (CRITICAL)

The user has indicated these time-sensitive events create urgency:

`;
    context.signals.forEach((signal, idx) => {
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
- Job Titles: ${profile.target_titles.join(', ')}
`;
    }
    if (profile.seniority_levels?.length) {
      prompt += `- Seniority Levels: ${profile.seniority_levels.join(', ')}
`;
    }
    if (profile.target_departments?.length) {
      prompt += `- Departments: ${profile.target_departments.join(', ')}
`;
    }
    prompt += `\n`;
  }

  if (config.include_disqualifying_criteria && (context.disqualifiers?.length ?? 0) > 0) {
    prompt += `## DISQUALIFYING CRITERIA

Automatically EXCLUDE companies that match these criteria:

`;
    context.disqualifiers.forEach((d, idx) => {
      prompt += `${idx + 1}. ${d.criterion}\n`;
    });
    prompt += `\nIf a company meets ANY disqualifying criterion:
1. Flag as "DISQUALIFIED"
2. Provide reason
3. Do NOT include in results
4. Do NOT waste tokens on full research

`;
  }

  if (Array.isArray(reportPreferences) && reportPreferences.length > 0) {
    prompt += `## REPORT FORMATTING PREFERENCES

The user has customized their report structure. When generating research reports:

`;
    reportPreferences.forEach((pref) => {
      if (pref.sections && Array.isArray(pref.sections)) {
        prompt += `### ${(String(pref.report_type || '')).toUpperCase().replace('_', ' ')}:
`;
        const sorted = pref.sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order);
        sorted.forEach((section, idx) => {
          prompt += `${idx + 1}. ${String(section.name || '')
            .replace('_', ' ')
            .toUpperCase()}${section.detail_level ? ` (${section.detail_level})` : ''}\n`;
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

  // Persisting preferences directly from the research agent
  prompt += `\n## PERSISTING PREFERENCES
At the end of a response, briefly ask if the user would like any preferences saved (ICP tweaks, custom criteria, signal preferences, competitors, target titles, or report formatting). If they agree, output a single JSON code block with EXACTLY this format so the app can persist it:

\n\n\`\`\`json
{
  "action": "save_profile",
  "profile": {
    "company_name": "...",
    "company_url": "...",
    "industry": "...",
    "icp_definition": "...",
    "target_titles": ["..."] ,
    "competitors": ["..."]
  },
  "custom_criteria": [
    { "field_name": "...", "field_type": "text|number|boolean|list", "importance": "critical|important|optional", "hints": [] }
  ],
  "signal_preferences": [
    { "signal_type": "security_breach", "importance": "critical|important|nice_to_have", "lookback_days": 90, "config": {} }
  ],
  "disqualifying_criteria": [ { "criterion": "..." } ]
}
\`\`\`
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
Don't just list facts. Show RELEVANCE to ${profile?.company_name || 'the user\'s'} offering. 
**Example of good personalization**: "CEO posted about data integration struggles - direct pain point that ${profile?.company_name || 'your platform'} solves. Mentioned spending 'too much time on manual data cleanup.'"
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

## ACCOUNT TRACKING
**CRITICAL:** When a user asks to "track", "monitor", or "add" companies to their account list:
1. **IMMEDIATELY call the add_tracked_accounts function** with the list of companies
2. **DO NOT ask for permission** - just add them
3. **After adding, confirm:** "✅ Added [X] companies to your tracked accounts. They'll now be monitored for signals."
4. **Then offer to research them:** "Would you like me to run initial research on these companies now? (Quick Brief or Deep Intelligence)"

Examples of tracking requests:
- "Track these 15 companies: Boeing, Lockheed Martin..."
- "I want to monitor Raytheon and Northrop Grumman"
- "Add these to my account list: [companies]"

**The add_tracked_accounts function:**
- Adds companies to the user's tracked accounts database
- Enables ongoing signal detection and monitoring
- Makes companies visible in the sidebar
- Is SEPARATE from one-time research

**Flow:**
1. User: "Track Boeing, Lockheed, Raytheon"
2. You: Call add_tracked_accounts({companies: [{company_name: "Boeing"}, {company_name: "Lockheed Martin"}, {company_name: "Raytheon"}]})
3. You: "✅ Added 3 companies to tracking. Want me to research them now?"
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
    prompt += `## ADDITIONAL INSTRUCTIONS\n\n${config.custom_prompt_additions}\n\n`;
  }

  prompt += `## RESPONSE STYLE\n- Keep responses CONCISE and to-the-point\n- Users are busy - respect their time with brief, actionable responses\n- Eliminate unnecessary explanations and filler text\n- Use bullet points and lists to convey information efficiently\n- When researching companies, focus on KEY findings, not exhaustive details\n- Aim for clarity and brevity over comprehensiveness\n\nKeep responses concise but comprehensive. Use markdown formatting for clarity. Focus on actionable intelligence that helps win deals.`;

  return prompt;
}

async function getChatSummary(supabase, chatId) {
  if (!chatId) return null;
  const { data } = await supabase
    .from('chats')
    .select('summary, message_count_at_summary')
    .eq('id', chatId)
    .maybeSingle();
  return data?.summary || null;
}

function optimizeContext(messages, summary, maxMessages = 20) {
  if (messages.length <= maxMessages) {
    return { messages, usedSummary: false };
  }
  const recentMessages = messages.slice(-maxMessages);
  if (summary) {
    const summaryMessage = { role: 'system', content: `[Previous conversation summary: ${summary}]` };
    return { messages: [summaryMessage, ...recentMessages], usedSummary: true };
  }
  const firstMessage = messages[0];
  return { messages: [firstMessage, ...recentMessages], usedSummary: false };
}

function toResponsesInput(messages, systemPrompt) {
  const msgs = [];
  msgs.push({ role: 'system', content: [{ type: 'input_text', text: systemPrompt }] });
  for (const m of messages) {
    if (m.role === 'assistant') {
      msgs.push({ role: m.role, content: [{ type: 'output_text', text: m.content }] });
    } else {
      msgs.push({ role: m.role, content: [{ type: 'input_text', text: m.content }] });
    }
  }
  return msgs;
}

app.post('/api/chat', async (req, res) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

    const { messages = [], stream = true, chat_id } = req.body || {};
    if (!OPENAI_API_KEY) {
      console.warn('[OPENAI] No OPENAI_API_KEY configured');
    } else {
      console.log(`[OPENAI] Streaming model: ${OPENAI_MODEL}`);
    }

    const supabase = createAuthedSupabase(authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return res.status(401).json({ error: 'Authentication failed' });
    const user = authData.user;

    const creditCheck = await checkUserCredits(supabase, user.id);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({ 
        error: creditCheck.message || 'Insufficient credits',
        needsApproval: creditCheck.needsApproval || false,
        remaining: creditCheck.remaining || 0
      });
    }
    
    // Send low credit warning if applicable
    if (creditCheck.lowCredits) {
      console.log(`[WARN] User ${user.id} has low credits: ${creditCheck.remaining}`);
    }

    const context = await fetchUserContext(supabase, user.id, chat_id);
    const systemPrompt = buildSystemPrompt(context);

    const summary = await getChatSummary(supabase, chat_id || '');
    const { messages: optimizedMessages, usedSummary } = optimizeContext(messages, summary);

    const systemTokens = estimateTokens(systemPrompt);
    const messageTokens = optimizedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const totalEstimatedTokens = systemTokens + messageTokens;

    const isInitialRequest = optimizedMessages.length <= 1;
    const lastUserMessage = optimizedMessages[optimizedMessages.length - 1]?.content?.toLowerCase() || '';
    const isResearchQuery =
      lastUserMessage.includes('research') ||
      lastUserMessage.includes('tell me about') ||
      lastUserMessage.includes('analyze') ||
      lastUserMessage.includes('find out about');

    // Enable tools for research queries even if it's the initial request
    const shouldEnableTools = isResearchQuery || !isInitialRequest;
    console.log('[TOOLS]', { isInitialRequest, isResearchQuery, shouldEnableTools, lastUserMessage });

    // Build tools array
    const tools = [];
    
    // Always include account management function (top-level schema for Responses API)
    tools.push({
      type: 'function',
      name: 'add_tracked_accounts',
      description: 'Add companies to tracked accounts for monitoring.',
      parameters: {
        type: 'object',
        properties: {
          companies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                company_name: { type: 'string' },
                industry: { type: 'string' }
              },
              required: ['company_name', 'industry'],
              additionalProperties: false
            }
          }
        },
        required: ['companies'],
        additionalProperties: false
      }
    });
    
    // Add web_search for research queries
    if (shouldEnableTools) {
      tools.push({
        type: 'web_search',
        user_location: { type: 'approximate' },
        search_context_size: isResearchQuery ? 'high' : 'medium',
      });
    }

    if (stream) {
      // Use OpenAI SDK for streaming with tool support
      const responseStream = await openai.responses.stream({
        model: OPENAI_MODEL,
        input: toResponsesInput(optimizedMessages, systemPrompt),
        text: { format: { type: 'text' }, verbosity: 'low' },
        reasoning: { effort: isInitialRequest ? 'low' : isResearchQuery ? 'high' : 'medium', summary: 'detailed' },
        tools,
        parallel_tool_calls: true,
        store: true,
        // Include full web_search_call context so we can stream query + results
        include: ['reasoning.encrypted_content', 'web_search_call.results'],
      });
      let reportedTokens = null;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Send a brief acknowledgement as a separate event type (not output_text.delta)
      const lastMsg = optimizedMessages[optimizedMessages.length - 1];
      if (lastMsg?.role === 'user') {
        const userQuery = String(lastMsg.content || '').toLowerCase();
        let ack = '';
        if (userQuery.includes('research') || userQuery.includes('tell me about') || userQuery.includes('look up')) {
          ack = "I'll research that for you and generate the report below. You'll see my search queries and sources as I go.";
        } else if (userQuery.includes('find') || userQuery.includes('discover') || userQuery.includes('prospects')) {
          ack = 'Let me find those companies for you...';
        } else if (userQuery.includes('competitor') || userQuery.includes('compare') || userQuery.includes('analyze')) {
          ack = "I'll analyze that for you...";
        }
        if (ack) {
          // Send as 'acknowledgment' type, not output_text.delta
          const ackEvent = { type: 'acknowledgment', content: ack };
          res.write(`data: ${JSON.stringify(ackEvent)}\n\n`);
        }
      }

      // Buffer for function call arguments by call_id - handles both event types
      const fc = new Map(); // call_id -> { name: string, args: string }
      let reasoningText = '';
      let responseId = null;
      let metaSent = false;
      
      // Collect all tool outputs to submit together
      const toolOutputsToSubmit = [];
      
      try {
        // Iterate through stream events
        for await (const event of responseStream) {
          // Log all events for debugging
          if (event.type?.includes('function')) {
            console.log('[EVENT]', event.type, JSON.stringify(event).substring(0, 300));
          }
          
          // Capture response ID from any response.* event
          if (!responseId && event.type?.startsWith('response.')) {
            responseId = event.response?.id ?? responseId;
            if (responseId && !metaSent) {
              // Send meta so client/user can correlate with OpenAI logs
              res.write(`data: ${JSON.stringify({ type: 'meta', model: OPENAI_MODEL, response_id: responseId })}\n\n`);
              console.log('[OPENAI] response.id:', responseId);
              metaSent = true;
            }
          }
          
          // Handle reasoning - STREAM deltas in real-time
          if (event.type === 'response.reasoning_summary_text.delta') {
            const delta = event.delta || '';
            reasoningText += delta;
            // Send delta immediately for streaming
            res.write(`data: ${JSON.stringify({ type: 'reasoning', content: delta })}\n\n`);
          } else if (event.type === 'response.reasoning_summary_text.done') {
            // Final event - reasoning complete
            if (reasoningText) {
              res.write(`data: ${JSON.stringify({ type: 'reasoning_done' })}\n\n`);
              reasoningText = '';
            }
          }
          // Handle function call arguments accumulation - TYPE 1
          else if (event.type === 'response.function_call_arguments.delta') {
            const callId = event.item_id || event.call_id;  // SDK uses item_id!
            const prev = fc.get(callId) ?? { name: '', args: '' };
            fc.set(callId, { ...prev, args: prev.args + (event.delta || event.arguments_delta || '') });
          }
          // Handle function call arguments accumulation - TYPE 2
          else if (event.type === 'response.function_call.delta') {
            const callId = event.item_id || event.call_id;  // SDK uses item_id!
            const prev = fc.get(callId) ?? { name: '', args: '' };
            const nameDelta = event.name_delta ?? '';
            const argsDelta = event.arguments_delta ?? '';
            fc.set(callId, {
              name: prev.name + nameDelta,
              args: prev.args + argsDelta
            });
          }
          // Handle function call arguments completion - PARSE BUFFERED ARGS
          else if (event.type === 'response.function_call_arguments.done') {
            const callId = event.item_id;
            const buffered = fc.get(callId) ?? { name: 'add_tracked_accounts', args: '' };
            const toolName = buffered.name || 'add_tracked_accounts'; // Default to our only tool
            const raw = event.arguments || buffered.args || '{}';
            
            console.log('[FUNCTION CALL]', toolName, 'raw args:', raw);
            
            let outputStr = '';
            try {
              const args = JSON.parse(raw);
              
              if (toolName === 'add_tracked_accounts') {
                const companies = args.companies || [];
                console.log('[PARSED COMPANIES]', companies);
                
                // Execute: Add accounts to database
                const addAccountsResponse = await fetch(
                  `${SUPABASE_URL}/functions/v1/manage-accounts`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': req.headers.authorization || '',
                      'apikey': SUPABASE_ANON_KEY,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      action: 'bulk_add',
                      accounts: companies.map(c => ({
                        company_name: c.company_name,
                        industry: c.industry || null,
                      })),
                    }),
                  }
                );
                
                const result = await addAccountsResponse.json();
                console.log('[ACCOUNTS ADDED]', result);
                
                // Notify frontend
                res.write(`data: ${JSON.stringify({
                  type: 'accounts_added',
                  count: result.summary?.added || companies.length,
                  companies: companies.map(c => c.company_name),
                })}\n\n`);
                
                const added = companies.map(c => c.company_name);
                outputStr = JSON.stringify({
                  ok: true,
                  added,
                  count: added.length,
                  companies: companies
                });
                
                // Send synthetic confirmation message
                console.log('[SENDING CONFIRMATION]', added.join(', '));
                const confirmationMessage = `✅ I've added ${added.join(', ')} to your tracked accounts.`;
                res.write(`data: ${JSON.stringify({ 
                  type: 'response.output_text.delta',
                  delta: confirmationMessage
                })}\n\n`);
              } else {
                outputStr = JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` });
              }
            } catch (e) {
              console.error('[PARSE ERROR]', e);
              outputStr = JSON.stringify({ ok: false, error: `Bad tool args: ${String(e)}`, raw });
            }
            
            // Collect tool output
            console.log('[TOOL EXECUTED]', toolName, 'CallID:', callId, 'Result:', outputStr.substring(0, 100));
            toolOutputsToSubmit.push({
              tool_call_id: callId,
              output: outputStr
            });
          }
          // Handle web search
          else if (event.type === 'response.web_search_call.in_progress') {
            const query = event.web_search_call?.query || 'Searching...';
            const partial = Array.isArray(event.web_search_call?.results)
              ? event.web_search_call.results.map(r => r.url)
              : [];
            res.write(`data: ${JSON.stringify({ type: 'web_search', query, sources: partial })}\n\n`);
          }
          else if (event.type === 'response.web_search_call.completed') {
            const query = event.web_search_call?.query || '';
            const sources = Array.isArray(event.web_search_call?.results)
              ? event.web_search_call.results.map(r => r.url)
              : [];
            res.write(`data: ${JSON.stringify({ type: 'web_search', query, sources })}\n\n`);
          }
          // Stream any other web_search_call updates generically
          else if (String(event.type || '').startsWith('response.web_search_call')) {
            const query = event.web_search_call?.query || '';
            const sources = Array.isArray(event.web_search_call?.results)
              ? event.web_search_call.results.map(r => r.url)
              : [];
            res.write(`data: ${JSON.stringify({ type: 'web_search', query, sources })}\n\n`);
          }
          // Handle output text
          else if (event.type === 'response.output_text.delta') {
            res.write(`data: ${JSON.stringify({
              type: 'response.output_text.delta',
              delta: event.delta
            })}\n\n`);
          }
          // Handle completion
          else if (event.type === 'response.completed') {
            if (event.response?.usage?.total_tokens) {
              reportedTokens = event.response.usage.total_tokens;
            }
            res.write(`data: ${JSON.stringify({ type: 'response.completed' })}\n\n`);
            break;
          }
        }
        
        // Stream ended
        res.end();
        const finalTokens = reportedTokens ?? totalEstimatedTokens;
        await logUsage(supabase, user.id, 'chat_completion', finalTokens, {
          chat_id,
          agent_type: context.agentType,
          model: OPENAI_MODEL,
        });
        await deductCredits(supabase, user.id, finalTokens);
      } catch (err) {
        console.error('Stream processing error:', err);
        try { res.end(); } catch {}
      }
      return;
    }

    // Non-streaming path (fallback - rarely used)
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: toResponsesInput(optimizedMessages, systemPrompt),
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: isInitialRequest ? 'low' : isResearchQuery ? 'high' : 'medium', summary: 'detailed' },
      tools,
      parallel_tool_calls: true,
      store: true,
    });
    try { console.log('[OPENAI] non-stream response.id:', response.id); } catch {}
    
    const data = response;
    const outputText =
      (data && (data.output_text ?? null)) ||
      (() => {
        try {
          const parts = (data?.output ?? []).filter((p) => p.type === 'output_text');
          return parts.map((p) => p.text).join('');
        } catch {
          return null;
        }
      })();

    const nonStreamingTokens = data?.usage?.total_tokens ?? totalEstimatedTokens;
    await logUsage(supabase, user.id, 'chat_completion', nonStreamingTokens, {
      chat_id,
      agent_type: context.agentType,
      model: OPENAI_MODEL,
    });
    await deductCredits(supabase, user.id, nonStreamingTokens);

    return res.json({ raw: data, text: outputText });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post('/api/update-profile', async (req, res) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });

    const supabase = createAuthedSupabase(authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return res.status(401).json({ error: 'Authentication failed' });
    const user = authData.user;

    const updateData = req.body || {};
    const results = { profile: null, custom_criteria: [], signal_preferences: [], disqualifying_criteria: [] };

    // Profile
    if (updateData.profile) {
      const { data: existingProfile } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        const { data, error } = await supabase
          .from('company_profiles')
          .update({ ...updateData.profile, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .select()
          .single();
        if (error) throw error;
        results.profile = data;
      } else {
        const { data, error } = await supabase
          .from('company_profiles')
          .insert({ user_id: user.id, ...updateData.profile })
          .select()
          .single();
        if (error) throw error;
        results.profile = data;
      }
    }

    // Custom Criteria
    if (Array.isArray(updateData.custom_criteria) && updateData.custom_criteria.length > 0) {
      await supabase.from('user_custom_criteria').delete().eq('user_id', user.id);
      const criteriaToInsert = updateData.custom_criteria.map((c, idx) => ({
        user_id: user.id,
        field_name: c.field_name,
        field_type: c.field_type,
        importance: c.importance,
        hints: c.hints || [],
        display_order: idx + 1,
      }));
      const { data, error } = await supabase.from('user_custom_criteria').insert(criteriaToInsert).select();
      if (error) throw error;
      results.custom_criteria = data;
    }

    // Signal Preferences
    if (Array.isArray(updateData.signal_preferences) && updateData.signal_preferences.length > 0) {
      await supabase.from('user_signal_preferences').delete().eq('user_id', user.id);
      const signalsToInsert = updateData.signal_preferences.map((s) => ({
        user_id: user.id,
        signal_type: s.signal_type,
        importance: s.importance,
        lookback_days: s.lookback_days || 90,
        config: s.config || {},
      }));
      const { data, error } = await supabase.from('user_signal_preferences').insert(signalsToInsert).select();
      if (error) throw error;
      results.signal_preferences = data;
    }

    // Disqualifying Criteria
    if (Array.isArray(updateData.disqualifying_criteria) && updateData.disqualifying_criteria.length > 0) {
      await supabase.from('user_disqualifying_criteria').delete().eq('user_id', user.id);
      const disqualifiersToInsert = updateData.disqualifying_criteria.map((d) => ({ user_id: user.id, criterion: d.criterion }));
      const { data, error } = await supabase.from('user_disqualifying_criteria').insert(disqualifiersToInsert).select();
      if (error) throw error;
      results.disqualifying_criteria = data;
    }

    // Prompt Config (e.g., preferred research type)
    if (updateData.prompt_config && typeof updateData.prompt_config === 'object') {
      const { data: existingCfg } = await supabase
        .from('user_prompt_config')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingCfg) {
        const { error } = await supabase
          .from('user_prompt_config')
          .update({ ...updateData.prompt_config, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_prompt_config')
          .insert({ user_id: user.id, ...updateData.prompt_config });
        if (error) throw error;
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error in /api/update-profile:', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Simple endpoint to verify OpenAI connectivity and project usage.
// Returns a Response ID you can look up in the OpenAI dashboard.
app.get('/api/openai-ping', async (_req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server' });
    }
    console.log('[OPENAI] PING using model:', OPENAI_MODEL);
    const ping = await openai.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'You are a minimal test agent.' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'Reply with OK only.' }] }
      ],
      text: { format: { type: 'text' }, verbosity: 'low' },
      store: false,
    });
    console.log('[OPENAI] PING response.id:', ping?.id);
    return res.json({ ok: true, model: OPENAI_MODEL, response_id: ping?.id, output_text: ping?.output_text });
  } catch (err) {
    console.error('[OPENAI] PING error:', err);
    const message = err?.message || String(err);
    return res.status(500).json({ ok: false, error: message });
  }
});

// Endpoint to send approval notification email
app.post('/api/notify-signup', async (req, res) => {
  try {
    const { user } = req.body;
    
    if (!user || !user.email) {
      return res.status(400).json({ error: 'Missing user data' });
    }

    // Send email notification to admin
    const result = await sendApprovalNotification(user);
    
    if (result.success) {
      console.log('[SIGNUP] Approval notification sent for:', user.email);
      return res.json({ success: true, emailId: result.emailId });
    } else {
      console.warn('[SIGNUP] Failed to send email:', result.error);
      // Don't fail the signup if email fails
      return res.json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[SIGNUP] Error in notify-signup:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint to send approval confirmation to user
app.post('/api/send-approval-confirmation', async (req, res) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const { user } = req.body;
    
    if (!user || !user.email) {
      return res.status(400).json({ error: 'Missing user data' });
    }

    const result = await sendApprovalConfirmation(user);
    
    return res.json(result);
  } catch (error) {
    console.error('[APPROVAL] Error sending confirmation:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
