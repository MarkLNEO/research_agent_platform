# Research Agent Platform: Ground Truth Document
**For: Coding Agent**  
**Last Updated: 2024**  
**Version: 1.0 - FINAL**

---

## 🎯 Product Vision

**One sentence:** A proactive AI research agent that saves Account Executives 45+ minutes per meeting by automatically delivering perfect meeting prep, deep company intelligence, buying signals, and personalized talking points.

**Not:** A chatbot. Not a search tool. Not a CRM. Not a prospecting tool for mass outreach.

**Is:** An intelligent assistant that works in the background, monitors accounts, detects signals, conducts deep research, and proactively prepares AEs for every meeting without them asking.

---

## 👤 Primary User: Cliff (The Account Executive)

**Profile:**
- **Role:** Account Executive at enterprise software company
- **Target Accounts:** 15 strategic accounts (not 1000s)
- **Sales Cycle:** 3-12 months, complex deals
- **Main Pain:** Spends 45-60 minutes researching before every call, scattered across ChatGPT, LinkedIn, Google News
- **Current Behavior:** Has account list in spreadsheet, manually checks for news/signals, loses context between calls
- **What Success Looks Like:** "I never walk into a meeting unprepared. Every morning I have perfect prep docs for today's calls. When I need to research a company, I get deep intelligence in 2 minutes instead of 45."

**NOT building for:**
- BDRs doing mass prospecting (secondary persona at best)
- Marketing teams doing market research
- Researchers doing academic work
- Anyone needing 100+ company research per week

**Core Jobs to Be Done:**
1. ✅ **Research companies deeply** - Give me everything I need to know about a company in 2 minutes
2. ✅ **Monitor my 15 accounts** - Alert me when something important happens
3. ✅ **Prep me for meetings** - Give me everything I need before a call
4. ✅ **Save research context** - Remember what we discussed, what matters to this account
5. ✅ **Tell me who to contact** - Decision makers, personalization points, talking points
6. ✅ **Show me timing signals** - When is the right time to reach out?

---

## ⚡ Core Principles (Non-Negotiable)

### 1. Proactive, Not Reactive
**Wrong:** Empty "Ask me anything" screen waiting for user input  
**Right:** "Good morning! 2 hot signals on your accounts. Boeing had a disruption 2 days ago - want me to research them?"

**Implementation:**
- Dashboard greeting shows signals and insights immediately
- Agent suggests next actions, doesn't wait to be asked
- Background monitoring runs continuously
- Notifications for important events

### 2. Conversational, Not Forms
**Wrong:** Multi-step wizard with JSON examples and technical fields  
**Right:** "Just tell me what information helps you qualify companies" → User types naturally → Agent extracts criteria

**Implementation:**
- Natural language input for all configuration
- Inline clarifying questions during conversations
- No "settings pages" - everything via chat
- GPT-powered extraction of structured data from conversational input

### 3. Just-In-Time Configuration
**Wrong:** Force user to complete profile before using anything  
**Right:** User researches immediately, agent asks for preferences as they become relevant

**Implementation:**
- User can research on first login without setup
- After 1st research: "Want me to track this company?"
- After 3rd research: "I noticed you're researching aerospace - is this your target industry?"
- After 5th research: "Want to set up signal monitoring?"
- Profile builds progressively through usage

### 4. Action-Oriented
**Wrong:** Dense research reports with no clear next step  
**Right:** "Signal detected → Here's what matters → Contact CISO within 2 weeks → [Draft Email]"

**Implementation:**
- Every insight has a suggested action
- Quick-action buttons prominently displayed
- One-click from insight to execution
- Clear "next steps" in every output

### 5. Deep Research + Meeting Intelligence = Core Product
**Wrong:** Generic surface-level company facts  
**Right:** Deep intelligence (tech stack, decision makers, signals, competitive intel) + Perfect meeting prep

**Implementation:**
- Deep research mode: Comprehensive company intelligence in 2-3 minutes
- Quick research mode: Essential facts in 30 seconds
- Meeting prep mode: Context-aware preparation for specific meeting
- All research linked to accounts for continuity

---

## 🔧 Critical Technical Constraints

### OpenAI API Requirements

**MANDATORY - READ CAREFULLY:**

```
This project uses OpenAI's GPT-5/GPT-5-mini and the Responses API ONLY.

DO NOT revert to GPT-4o or another model.
DO NOT revert to the Completions API.
DO NOT use any deprecated API endpoints.

If you are uncertain about something related to the model or API, 
use DeepWiki or another resource to access the GPT-5 and/or Responses API docs.

Resources:
- Responses API Docs: https://platform.openai.com/docs/guides/migrate-to-responses
- GPT-5 Docs: https://platform.openai.com/docs/guides/latest-model

ALL responses MUST be STREAMING. Always. No exceptions.
```

**What this means for implementation:**

```typescript
// ✅ CORRECT - Responses API with streaming
const response = await openai.responses.create({
  model: 'gpt-5', // or 'gpt-5-mini' for cheaper operations
  messages: [...],
  stream: true, // ALWAYS true
});

// Process stream
for await (const chunk of response) {
  // Handle streaming chunks
}

// ❌ WRONG - Do not use
const response = await openai.chat.completions.create({...}); // Old API
const response = await openai.completions.create({...}); // Deprecated
```

**Model Selection:**
- **gpt-5:** Use for deep research, meeting prep, complex analysis
- **gpt-5-mini:** Use for evaluations, simple extractions, cost optimization

### Testing & Development Rules

**ABSOLUTELY NO EXCEPTIONS TO THESE RULES:**

1. **NO FAKING/MOCKING/STUBBING**
   - Do not fake test results
   - Do not mock API responses for "testing purposes"
   - Do not stub functionality to "pass tests"
   - Work with real, actual scenarios ONLY
   - If something doesn't work, FIX IT - don't fake it

2. **NO FALSE TEST REPORTS**
   - Do not report a test as passed when it wasn't actually run
   - Writing a test ≠ running a test
   - Test must execute and pass to count
   - If a test fails, report the failure and fix the issue

3. **FOLLOW THE MIGRATION PLAN**
   - Work from: `/Users/marklerner/Research_Agent_Platform_wndsrf/docs/migration_and_visual_iterative_testing_and_updating_plan.md`
   - Follow requirements exactly as proposed
   - Do not skip steps
   - Do not assume functionality works without testing

4. **HANDLE TOOL FAILURES PROPERLY**
   - If MCP Playwright server is down → Use Puppeteer
   - If an API is unavailable → Find alternative or fix the issue
   - If a dependency is broken → Debug and resolve
   - Never work around issues by faking functionality

### Streaming Implementation Requirements

**All agent responses MUST stream:**

```typescript
// Research responses
async function* streamResearch(query: string) {
  const stream = await openai.responses.create({
    model: 'gpt-5',
    messages: [{ role: 'user', content: query }],
    stream: true,
  });
  
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}

// Meeting prep generation
async function* streamMeetingPrep(context: MeetingContext) {
  const stream = await openai.responses.create({
    model: 'gpt-5',
    messages: buildMeetingPrepPrompt(context),
    stream: true,
  });
  
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}

// Frontend consumption
const response = streamResearch('Research Boeing');
for await (const chunk of response) {
  updateUI(chunk); // Progressive rendering
}
```

**Why streaming matters:**
- User sees progress immediately
- No 30-second wait for full response
- Better UX - feels responsive
- Can cancel long-running operations
- Progressive rendering of research sections

---

## ✅ Must Have Features (P0 - Core Product)

### 1. Deep Company Research

**What it is:**
Comprehensive research on any company, delivered in 2-3 minutes with full intelligence.

**Research Types:**

**A. Deep Account Research** (~25-35 credits, ~2 min)
```
Full intelligence report including:
- Executive summary with ICP fit score
- Recent signals (breaches, leadership changes, funding, etc.)
- Custom criteria evaluation (user-configured)
- Decision makers with personalization points
- Tech stack analysis
- Competitive intelligence
- Company overview and financials
- News and recent developments
- Recommended next actions
```

**B. Quick Facts** (~5-10 credits, ~30 sec)
```
Essential information only:
- Company size and revenue
- Industry and headquarters
- Leadership team
- Recent major news
- Quick ICP fit assessment
```

**C. Specific Question** (variable credits)
```
User asks: "What security tools does Boeing use?"
Agent researches and answers specifically
Focused, targeted intelligence
```

**Research Flow:**

```typescript
// User initiates research
User: "Research Boeing"

// Agent clarifies (first time only)
Agent: "What type of research?
[Deep Account Research] (~25 credits, 2 min)
[Quick Facts] (~5 credits, 30 sec)  
[Specific Question]"

User: [selects Deep Account Research]

// On subsequent requests, remember preference
User: "Research Lockheed Martin"
Agent: [automatically does Deep Account Research]
// But allows override: "Or try: Quick Facts | Specific Question"
```

**Research Output Structure:**

```tsx
<ResearchOutput>
  {/* 1. EXECUTIVE SUMMARY - Always first, always prominent */}
  <ExecutiveSummaryCard>
    <CompanyHeader>
      <Logo />
      <Name>Boeing</Name>
      <Industry>Aerospace & Defense</Industry>
      <PriorityBadge>🔥 HOT LEAD</PriorityBadge>
    </CompanyHeader>
    
    <KeyInsight>
      Boeing is experiencing heightened focus on security due to 
      recent operational challenges, creating opportunity for 
      infrastructure conversations.
    </KeyInsight>
    
    <MetricsGrid>
      <Metric label="ICP Fit" value="92/100" status="excellent" />
      <Metric label="Signal Strength" value="78/100" status="hot" />
      <Metric label="Timing" value="Good" status="positive" />
      <Metric label="Criteria Match" value="4/5" status="good" />
    </MetricsGrid>
    
    <RecommendedAction>
      Next Step: Contact CISO about supply chain security. 
      Reference operational challenges.
      <ActionButton>Draft Email</ActionButton>
    </RecommendedAction>
  </ExecutiveSummaryCard>
  
  {/* 2. SIGNALS - Expanded by default, color-coded */}
  <SignalsSection expanded={true}>
    <SectionHeader icon="🚨">Buying Signals Detected</SectionHeader>
    <SignalsTimeline>
      {/* Critical signals in red, important in orange */}
      <SignalCard severity="critical">
        <SignalDate>2 days ago</SignalDate>
        <SignalTitle>Manufacturing Disruption</SignalTitle>
        <SignalDescription>...</SignalDescription>
        <SignalImpact>Why this matters: ...</SignalImpact>
      </SignalCard>
    </SignalsTimeline>
  </SignalsSection>
  
  {/* 3. CUSTOM CRITERIA - Expanded by default */}
  <CustomCriteriaSection expanded={true}>
    <SectionHeader icon="✅">Your Qualifying Criteria</SectionHeader>
    <CriteriaGrid>
      <CriterionCard status="met">
        <CriterionName>Recent security incidents</CriterionName>
        <CriterionValue>Yes - disruption 2 days ago</CriterionValue>
        <CriterionSource>Source →</CriterionSource>
      </CriterionCard>
      {/* More criteria... */}
    </CriteriaGrid>
  </CustomCriteriaSection>
  
  {/* 4. DECISION MAKERS - Expanded by default */}
  <DecisionMakersSection expanded={true}>
    <SectionHeader icon="🎯">Key Contacts</SectionHeader>
    <ContactsGrid>
      <ContactCard>
        <ContactHeader>
          <Avatar />
          <Name>James Chen</Name>
          <Title>CISO</Title>
          <RoleBadge>Decision Maker</RoleBadge>
        </ContactHeader>
        <PersonalizationPoints>
          <Point>💬 New to role (2 months)</Point>
          <Point>💬 Previously at Lockheed</Point>
          <Point>💬 Focused on supply chain security</Point>
        </PersonalizationPoints>
        <ContactActions>
          <Button>Draft Email</Button>
          <Button>LinkedIn</Button>
        </ContactActions>
      </ContactCard>
    </ContactsGrid>
  </DecisionMakersSection>
  
  {/* 5. COMPANY OVERVIEW - Collapsed by default */}
  <CompanyOverviewSection expanded={false}>
    <SectionHeader icon="🏢">Company Overview</SectionHeader>
    {/* Full details when expanded */}
  </CompanyOverviewSection>
  
  {/* 6. SOURCES - Collapsed by default */}
  <SourcesSection expanded={false}>
    <SectionHeader icon="📚">Sources & Methodology</SectionHeader>
    {/* Source list when expanded */}
  </SourcesSection>
  
  {/* Quick Actions Bar - Sticky at bottom */}
  <QuickActionsBar sticky>
    <Button icon="📧">Draft Email</Button>
    <Button icon="📄">Export PDF</Button>
    <Button icon="📋">Copy Summary</Button>
    <Button icon="⭐">Track Account</Button>
  </QuickActionsBar>
</ResearchOutput>
```

**Custom Criteria System:**

```typescript
// User defines criteria conversationally
User: "I need to know if they've had breaches, what security 
       tools they use, if they have a CISO, and their compliance 
       requirements"

// GPT-5 extracts structured criteria
const criteria = await extractCriteria(userInput);
// Returns:
[
  {
    name: "Recent security incidents",
    type: "boolean",
    importance: "critical",
    searchHints: ["breach", "ransomware", "hack", "incident"]
  },
  {
    name: "Security stack",
    type: "list",
    importance: "important",
    searchHints: ["SIEM", "EDR", "firewall", "Splunk", "CrowdStrike"]
  },
  {
    name: "Has dedicated CISO",
    type: "boolean",
    importance: "important",
    searchHints: ["CISO", "Chief Information Security Officer"]
  },
  {
    name: "Compliance frameworks",
    type: "list",
    importance: "optional",
    searchHints: ["SOC 2", "ISO 27001", "NIST", "HIPAA", "GDPR"]
  }
]

// During research, GPT-5 evaluates each criterion
const evaluation = await evaluateCriteria(companyData, criteria);
// Returns for each criterion:
{
  criterionId: "...",
  status: "met" | "not_met" | "unknown",
  value: "...", // What was found
  confidence: 0.0-1.0,
  explanation: "...",
  source: "..." // URL or reference
}
```

**Research Quality Requirements:**

Every deep research MUST include:
- ✅ At least 3 recent signals (if any exist)
- ✅ Evaluation of ALL custom criteria
- ✅ At least 2 decision makers with personalization
- ✅ ICP fit score with explanation
- ✅ Recommended next action
- ✅ Sources for all major claims
- ✅ Completed in <3 minutes

**Integration with Account Tracking:**

```typescript
// After research completes
Agent: "✓ Research complete for Boeing

Would you like me to:
[Track this account] - Monitor for changes and signals
[Research another] - Move on to next company
[Draft outreach] - Create personalized email"

// If user tracks account
await createTrackedAccount({
  companyName: "Boeing",
  latestResearch: researchId,
  customCriteria: userCriteria,
  monitoringEnabled: true
});

// Future research on same company
Agent: "I researched Boeing 5 days ago. Want me to:
[Update research] - Refresh with latest data (15 credits)
[View previous] - See last research
[What changed?] - Compare to previous (10 credits)"
```

### 2. Proactive Dashboard Greeting

**What it is:**
When user logs in, agent greets them with signals, insights, and suggestions - never empty.

**Dashboard Structure:**

```tsx
<DashboardGreeting>
  {/* Contextual greeting */}
  <Greeting>
    Good {timeOfDay}, {firstName}!
  </Greeting>
  
  {/* HOT SIGNALS - Most prominent if any exist */}
  {hasSignals && (
    <SignalAlertsSection variant="critical">
      <AlertHeader>
        🔥 {signalCount} hot signal{signalCount > 1 ? 's' : ''} 
        detected on your accounts
      </AlertHeader>
      
      <SignalsList>
        <SignalItem severity="critical" company="Boeing">
          Manufacturing disruption 2 days ago
          <SignalAction>Research Boeing</SignalAction>
        </SignalItem>
        <SignalItem severity="high" company="Lockheed">
          New CISO appointed
          <SignalAction>View Details</SignalAction>
        </SignalItem>
      </SignalsList>
      
      <ViewAllButton>View all signals</ViewAllButton>
    </SignalAlertsSection>
  )}
  
  {/* ACCOUNT SUMMARY */}
  <AccountSummary>
    <SummaryStats>
      <Stat icon="📊" count={15}>accounts tracked</Stat>
      <Stat icon="🔥" count={4} highlight>with hot signals</Stat>
      <Stat icon="📅" count={3}>need research updates</Stat>
    </SummaryStats>
  </AccountSummary>
  
  {/* SMART SUGGESTIONS - Context-aware */}
  <SmartSuggestions>
    <SuggestionLabel>Or try asking me:</SuggestionLabel>
    <SuggestionChips>
      <Chip>"Which accounts had changes this week?"</Chip>
      <Chip>"Research my top 5 accounts"</Chip>
      <Chip>"Show accounts with security incidents"</Chip>
    </SuggestionChips>
  </SmartSuggestions>
  
  {/* UPCOMING MEETINGS - If calendar connected */}
  {hasUpcomingMeetings && (
    <UpcomingMeetings>
      <MeetingHeader>📅 Today's Meetings</MeetingHeader>
      <MeetingCard>
        <MeetingTime>2:00 PM</MeetingTime>
        <MeetingCompany>Boeing</MeetingCompany>
        <MeetingStatus>✓ Prep ready</MeetingStatus>
        <MeetingAction>View Prep</MeetingAction>
      </MeetingCard>
    </UpcomingMeetings>
  )}
</DashboardGreeting>
```

**Backend Data Aggregation:**

```typescript
// GET /api/dashboard/greeting
async function getDashboardGreeting(userId: string) {
  // Run in parallel for speed
  const [signals, accountStats, meetings, suggestions] = await Promise.all([
    getRecentSignals(userId, { unviewed: true, limit: 5 }),
    getAccountStatistics(userId),
    getUpcomingMeetings(userId, { within: '24h' }),
    generateSmartSuggestions(userId)
  ]);
  
  return {
    greeting: {
      timeOfDay: getTimeOfDay(),
      firstName: user.firstName
    },
    signals,
    accountStats,
    upcomingMeetings: meetings,
    suggestions
  };
}
```

### 3. Account Tracking & Monitoring

**What it is:**
User can track their 15 strategic accounts. System monitors each account continuously for changes.

**Account Management:**

```typescript
// Add account via chat
User: "Add Boeing to my account list"

Agent: "✓ Added Boeing to tracking.

I'll monitor for:
• New signals (breaches, leadership changes, funding)
• Updates to your custom criteria
• News and announcements

Want me to research Boeing now? (~25 credits)
[Research now] [Monitor only] [Add more accounts]"

// Bulk upload via CSV
User: "Upload my account list"

Agent: [Shows upload interface]

// After upload
Agent: "✓ Uploaded 15 accounts:
• Boeing
• Lockheed Martin
• Raytheon Technologies
• [show first 5, then 'and 10 more...']

What would you like to do?
[Research all 15 now] (~375 credits, 15 min)
[Set up monitoring only] (I'll alert you when signals appear)
[Research specific accounts]"
```

**Account Dashboard:**

```tsx
<AccountDashboard>
  <DashboardHeader>
    <Title>📊 Your Account Portfolio</Title>
    <FilterChips>
      <Chip active count={15}>All</Chip>
      <Chip count={4} variant="danger">🔥 Hot</Chip>
      <Chip count={3}>Needs Update</Chip>
    </FilterChips>
  </DashboardHeader>
  
  <AccountsGrid>
    <AccountCard priority="hot">
      <CardHeader>
        <Logo src="boeing.png" />
        <CompanyInfo>
          <CompanyName>Boeing</CompanyName>
          <CompanyMeta>Aerospace • 150K employees</CompanyMeta>
        </CompanyInfo>
        <PriorityBadge>🔥 HOT</PriorityBadge>
      </CardHeader>
      
      {/* Recent signal banner */}
      <SignalBanner severity="critical">
        🚨 Manufacturing disruption (2d ago)
      </SignalBanner>
      
      <AccountMetrics>
        <Metric label="ICP Fit" value="92/100" />
        <Metric label="Signal Score" value="78/100" />
        <Metric label="Updated" value="5 days ago" />
      </AccountMetrics>
      
      <CardActions>
        <Button icon="💬">Discuss</Button>
        <Button icon="🔄">Update</Button>
        <Button icon="📄">Report</Button>
      </CardActions>
    </AccountCard>
    
    {/* More account cards... */}
  </AccountsGrid>
  
  <BulkActions>
    <Button>🔄 Refresh all 15 accounts</Button>
    <Button>📥 Export all reports</Button>
    <Button>+ Add more accounts</Button>
  </BulkActions>
</AccountDashboard>
```

**Conversational Account Commands:**

```typescript
// View accounts
User: "Show my accounts"
→ Displays account dashboard in chat

// Filter accounts
User: "Which accounts have signals?"
→ Shows only accounts with recent signals

User: "Show me accounts that need updating"
→ Shows accounts not researched in 14+ days

// Batch operations
User: "Refresh all my accounts"
→ Queues research for all tracked accounts
→ Shows progress and estimated completion

User: "Research my top 5 priority accounts"
→ Agent: "Which accounts are top priority?"
   OR uses signal score to determine top 5
```

### 4. Signal Detection & Alerts

**What it is:**
Background service monitors tracked accounts every 6 hours. Detects important events. Alerts user immediately.

**Signal Types:**

```typescript
enum SignalType {
  // Critical (immediate alert)
  SECURITY_BREACH = 'security_breach',
  DATA_BREACH = 'data_breach',
  RANSOMWARE = 'ransomware',
  CYBER_ATTACK = 'cyber_attack',
  
  // High importance
  LEADERSHIP_CHANGE = 'leadership_change', // CISO, CTO, CEO
  FUNDING_ROUND = 'funding_round',
  ACQUISITION = 'acquisition',
  MERGER = 'merger',
  
  // Medium importance
  PRODUCT_LAUNCH = 'product_launch',
  HIRING_SURGE = 'hiring_surge',
  OFFICE_OPENING = 'office_opening',
  PARTNERSHIP = 'partnership',
  
  // Configurable
  CUSTOM_KEYWORD = 'custom_keyword' // User-defined
}
```

**Signal Detection Service:**

```typescript
// Background job - runs every 6 hours
async function detectSignals() {
  const users = await getActiveUsersWithTracking();
  
  for (const user of users) {
    const accounts = await getTrackedAccounts(user.id);
    
    for (const account of accounts) {
      // For each signal type user cares about
      for (const signalPref of user.signalPreferences) {
        const detected = await detectSignalForAccount(
          account,
          signalPref
        );
        
        if (detected.length > 0) {
          // Save signals
          await saveSignals(detected);
          
          // Calculate priority
          const priority = calculateSignalPriority(detected);
          
          // Notify user if critical
          if (priority === 'critical') {
            await notifyUser(user, account, detected);
          }
          
          // Update account signal score
          await updateAccountSignalScore(account.id);
        }
      }
    }
  }
}

// Detection logic uses GPT-5 + web search
async function detectSignalForAccount(
  account: TrackedAccount,
  signalPref: SignalPreference
): Promise<Signal[]> {
  // Search for recent news/events
  const searchResults = await webSearch({
    query: `${account.companyName} ${signalPref.keywords.join(' OR ')}`,
    dateRange: 'last_7_days'
  });
  
  // Use GPT-5 to analyze if this is a real signal
  const analysis = await analyzeForSignals(searchResults, signalPref);
  
  return analysis.signals;
}
```

**Conversational Signal Configuration:**

```typescript
// User sets up monitoring
User: "Alert me when aerospace companies have security breaches"

// GPT-5 extracts signal preference
const extracted = await extractSignalPreference(userInput);
// Returns:
{
  industryFilter: "aerospace",
  signalType: "security_breach",
  importance: "critical",
  keywords: ["breach", "ransomware", "hack", "cyber attack"],
  lookbackDays: 7
}

Agent: "Got it! I'll monitor for:
✓ Security breaches in aerospace industry
✓ Check every 6 hours
✓ Alert you immediately for critical events

This applies to: Boeing, Lockheed Martin, Raytheon (3 accounts)

[Looks good] [Adjust settings]"

// Subsequent signal configurations
User: "Also alert me about leadership changes"

Agent: "✓ Added signal monitoring:
• Leadership changes (CISO, CTO, CEO level)
• For all 15 tracked accounts
• Importance: High

[Configure] [Done]"
```

**Signal Alert Display:**

```tsx
// Dashboard - most prominent
<SignalAlertsSection>
  <AlertHeader>
    🚨 2 hot signals detected on your accounts
  </AlertHeader>
  
  <SignalCard severity="critical">
    <SignalCompany>Boeing</SignalCompany>
    <SignalType badge>Security Breach</SignalType>
    <SignalDescription>
      Manufacturing systems disrupted in cyber incident
    </SignalDescription>
    <SignalDate>2 days ago</SignalDate>
    <SignalActions>
      <Button variant="primary">Research Boeing</Button>
      <Button variant="outline">Dismiss</Button>
    </SignalActions>
  </SignalCard>
</SignalAlertsSection>

// Sidebar - account list badges
<SidebarAccount>
  <AccountIcon>📄</AccountIcon>
  <AccountName>Boeing</AccountName>
  <SignalBadge count={2} severity="critical">2</SignalBadge>
</SidebarAccount>

// Email notification (for critical only)
<EmailNotification>
  Subject: 🚨 Critical signal: Boeing security breach
  
  Hey Cliff,
  
  I detected a critical signal on one of your accounts:
  
  Boeing - Security Breach (2 hours ago)
  Manufacturing systems disrupted in cyber incident
  
  This is a hot opportunity to reach out about security resilience.
  
  [Research Boeing] [View All Signals]
</EmailNotification>
```

### 5. Meeting Intelligence System

**What it is:**
Automatically research upcoming meetings and deliver perfect prep documents before every call.

**Calendar Integration:**

```typescript
// Google Calendar OAuth
async function connectGoogleCalendar(userId: string) {
  const authUrl = generateGoogleOAuthURL({
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    redirectUri: `${appUrl}/api/calendar/callback/google`
  });
  
  return { authUrl };
}

// Meeting detection
async function detectMeetings(userId: string): Promise<DetectedMeeting[]> {
  const events = await calendar.getEvents({
    userId,
    timeMin: new Date(),
    timeMax: addDays(new Date(), 7) // Next 7 days
  });
  
  return events
    .filter(event => isExternalMeeting(event))
    .map(event => ({
      id: event.id,
      title: event.summary,
      datetime: event.start.dateTime,
      attendees: extractAttendees(event),
      company: extractCompanyName(event),
      meetingType: classifyMeetingType(event),
      priority: calculatePriority(event)
    }));
}
```

**Manual Upload Options:**

```typescript
// CSV Upload
interface CSVMeeting {
  'Meeting Title': string;
  'Date': string; // 2024-11-20
  'Time': string; // 14:00
  'Timezone': string; // PST
  'Company': string;
  'Attendee Emails': string; // comma-separated
  'Meeting Type'?: string;
  'Meeting Link'?: string;
  'Notes'?: string;
}

// User uploads CSV
const meetings = await parseCSV(file);
const validated = await validateMeetings(meetings);

Agent: "✓ Parsed 15 meetings from your CSV

Validation results:
• 13 meetings ready to research
• 2 need company name confirmation

[Review meetings] [Confirm & research all]"

// ICS File Upload
const icsData = await parseICS(file);
const meetings = extractMeetingsFromICS(icsData);

Agent: "Found 47 events in calendar file

Filters:
☑ Only external meetings (18 meetings)
☑ Only upcoming (15 meetings)
□ Date range: [Select range]

[Research selected meetings (15)] (~375 credits)"

// Manual Single Entry
<ManualMeetingForm>
  <FormField required>
    <Label>Company Name</Label>
    <CompanyInput suggestions={companyAutocomplete} />
  </FormField>
  
  <FormField required>
    <Label>Meeting Date & Time</Label>
    <DateTimeInput timezone={userTimezone} />
  </FormField>
  
  <FormField>
    <Label>Meeting Type</Label>
    <Select>
      <option>Discovery Call</option>
      <option>Demo</option>
      <option>Negotiation</option>
      <option>Check-in</option>
    </Select>
  </FormField>
  
  <FormField>
    <Label>Attendees (optional)</Label>
    <EmailInput multiple />
  </FormField>
  
  <FormField>
    <Label>Additional Context</Label>
    <TextArea placeholder="Any info I should know?" />
  </FormField>
  
  <FormActions>
    <EstimatedCost>~25 credits</EstimatedCost>
    <Button>Generate Meeting Prep</Button>
  </FormActions>
</ManualMeetingForm>

// Email Forwarding
// User forwards meeting invite to: cliff.{userId}@meetings.app.com
// System parses .ics attachment automatically
async function handleForwardedMeeting(email: IncomingEmail) {
  const icsAttachment = email.attachments.find(a => 
    a.contentType === 'text/calendar'
  );
  
  const meeting = parseICS(icsAttachment.content);
  await queueMeetingPrep(meeting);
  
  await sendConfirmation(email.from, meeting);
}
```

**Meeting Prep Generation:**

```typescript
// Meeting-type-specific research strategy
function determineResearchStrategy(meeting: DetectedMeeting): ResearchStrategy {
  switch (meeting.type) {
    case 'discovery':
      return {
        focus: [
          'Company overview and recent news',
          'Key decision makers',
          'Current tech stack',
          'Recent signals indicating need',
          'Competitive landscape'
        ],
        depth: 'deep',
        sections: [
          'executive_summary',
          'recent_signals',
          'decision_makers',
          'tech_stack',
          'discovery_questions'
        ]
      };
      
    case 'demo':
      return {
        focus: [
          'Use cases relevant to them',
          'Technical requirements',
          'Success stories from similar companies',
          'Technical decision makers'
        ],
        depth: 'standard',
        sections: [
          'executive_summary',
          'use_cases',
          'technical_requirements',
          'demo_focus_areas'
        ]
      };
      
    case 'negotiation':
      return {
        focus: [
          'Budget and authority indicators',
          'Decision timeline',
          'Competition status',
          'ROI justification'
        ],
        depth: 'deep',
        sections: [
          'executive_summary',
          'budget_indicators',
          'competitive_position',
          'negotiation_strategy'
        ]
      };
      
    // ... other types
  }
}

// Generate prep document
async function generateMeetingPrep(meeting: DetectedMeeting) {
  // 1. Aggregate context
  const context = await aggregateMeetingContext(meeting);
  
  // 2. Determine strategy
  const strategy = determineResearchStrategy(meeting);
  
  // 3. Conduct research (if needed)
  let research;
  if (!context.latestResearch || isStale(context.latestResearch)) {
    research = await conductResearch(meeting.company, strategy);
  } else {
    research = context.latestResearch;
  }
  
  // 4. Generate meeting-specific prep using GPT-5 streaming
  const prepStream = await generatePrepDocument({
    meeting,
    context,
    strategy,
    research
  });
  
  // 5. Stream to database as it generates
  const prep = await savePrepDocument(prepStream);
  
  // 6. Schedule delivery
  await scheduleDelivery(prep, meeting);
  
  return prep;
}
```

**Meeting Prep Document Structure:**

```tsx
<MeetingPrepDocument>
  {/* TL;DR - Always first */}
  <TLDRSection>
    <OneLiner>
      Boeing is hot - recent disruption + security focus = perfect timing
    </OneLiner>
    
    <KeyTalkingPoints>
      <Point>Manufacturing disruption 2 days ago elevated security priority</Point>
      <Point>New CISO (James Chen) open to conversations</Point>
      <Point>Using Cisco/Palo Alto - no SOAR solution detected</Point>
    </KeyTalkingPoints>
    
    <CriticalInfo>
      🚨 Their competitor Lockheed just had breach - reference this
    </CriticalInfo>
    
    <RecommendedApproach>
      Lead with operational resilience. Reference disruption. 
      Emphasize supply chain security.
    </RecommendedApproach>
  </TLDRSection>
  
  {/* Relationship Context (if exists) */}
  <RelationshipContext>
    <LastMeeting date="10/15/2024">
      Key notes:
      • Discussed budget constraints
      • Sarah mentioned Q1 2025 budget refresh
      • Left voicemail for CISO - no response yet
    </LastMeeting>
    
    <OpenItems>
      ☐ Follow up on pricing proposal
      ☐ Schedule technical deep dive
    </OpenItems>
  </RelationshipContext>
  
  {/* Recent Developments */}
  <RecentDevelopments>
    <Signals>
      {/* Signal timeline */}
    </Signals>
    <News>
      {/* Recent news */}
    </News>
  </RecentDevelopments>
  
  {/* Attendee Intelligence */}
  <AttendeeIntel>
    <Attendee>
      <Name>James Chen</Name>
      <Title>CISO</Title>
      <Role>Decision Maker</Role>
      <Background>
        New to role (2 months). Previously CISO at Lockheed Martin.
        Focus on supply chain security.
      </Background>
      <Personalization>
        💬 Mentioned "operational resilience" in recent interview
        💬 Led security transformation at previous company
        💬 Active on LinkedIn - posts about zero trust
      </Personalization>
      <SuggestedOpening>
        "James, I saw you recently joined Boeing as CISO - congrats! 
        Given your supply chain security focus and the recent 
        disruption, I thought this might be timely..."
      </SuggestedOpening>
    </Attendee>
  </AttendeeIntel>
  
  {/* Meeting Strategy */}
  <MeetingStrategy>
    <PrimaryObjective>
      Understand their security priorities post-disruption
    </PrimaryObjective>
    
    <DiscoveryQuestions>
      <Question>
        1. How has the recent disruption impacted security priorities?
      </Question>
      <Question>
        2. What's your current approach to supply chain security?
      </Question>
      <Question>
        3. Where do you see the biggest gaps in your security stack?
      </Question>
    </DiscoveryQuestions>
    
    <ExpectedObjections>
      <Objection>
        "We already have Cisco/Palo Alto"
        → Response: "Great foundation. What we add is orchestration 
           across those tools for faster incident response..."
      </Objection>
    </ExpectedObjections>
  </MeetingStrategy>
  
  {/* Quick Reference Cheat Sheet */}
  <CheatSheet sticky>
    <CompanyFacts>
      • 150K employees
      • $80B revenue
      • Commercial + Defense
    </CompanyFacts>
    
    <NamesToKnow>
      • James Chen (CISO)
      • Sarah Martinez (Dir. IT)
    </NamesToKnow>
    
    <KeySoundbites>
      • "operational resilience"
      • "supply chain security"
      • "zero trust"
    </KeySoundbites>
  </CheatSheet>
</MeetingPrepDocument>
```

**Delivery System:**

```typescript
// Smart delivery based on preferences
async function scheduleDelivery(prep: MeetingPrep, meeting: Meeting) {
  const prefs = await getUserPreferences(prep.userId);
  const meetingTime = meeting.datetime;
  
  const deliveryTimes = [];
  
  // Night before (6pm in meeting timezone)
  if (prefs.deliveryTiming === 'night-before' || prefs.deliveryTiming === 'both') {
    const nightBefore = setHours(subDays(meetingTime, 1), 18);
    if (nightBefore > new Date()) {
      deliveryTimes.push(nightBefore);
    }
  }
  
  // Morning of (7am in meeting timezone)
  if (prefs.deliveryTiming === 'morning-of' || prefs.deliveryTiming === 'both') {
    const morningOf = setHours(meetingTime, 7);
    if (morningOf > new Date() && morningOf < meetingTime) {
      deliveryTimes.push(morningOf);
    }
  }
  
  // Urgent (<2 hours) - deliver immediately
  const hoursUntil = differenceInHours(meetingTime, new Date());
  if (hoursUntil < prefs.urgentThreshold) {
    await deliverImmediately(prep);
    return;
  }
  
  // Schedule all deliveries
  for (const time of deliveryTimes) {
    await schedulePrepDelivery({
      prepId: prep.id,
      deliveryTime: time,
      method: prefs.deliveryMethod // email, slack, in-app, all
    });
  }
}
```

### 6. Conversational Profile Building

**What it is:**
Agent learns user preferences through conversation, not forms. Profile builds progressively.

**Onboarding Flow:**

```typescript
// First login
Agent: "👋 Hey! I'm your Research Agent.

I help sales teams research companies and track accounts.
No forms to fill out - you can start right away.

[Jump right in] - Research a company now
[Quick chat first] - 2 min to personalize"

// If user selects "Jump right in"
User: "Research Boeing"

Agent: "Quick question before I start: What type of research?

[Deep Account Research] 
Full report: leadership, signals, contacts, tech stack
~25-35 credits, ~2 min

[Quick Facts]
Basic info: size, industry, headquarters
~5-10 credits, ~30 sec

[Specific Question]
Ask me anything specific about Boeing"

User: [selects Deep Account Research]

Agent: "One more thing - I can look for specific data you care about.
For example: security incidents, tech stack, compliance needs.

Want to tell me what to look for?

[Yes - customize] [Generic is fine] [Not sure yet]"

// If user customizes
User: "I need to know if they've had breaches, what security 
       tools they use, if they have a CISO, and their compliance 
       requirements"

// GPT-5 extracts criteria (shown above in Research section)

Agent: "Got it! I'll track these 4 things:
✓ Recent security incidents
✓ Security stack (SIEM, EDR, etc.)
✓ Has dedicated CISO
✓ Compliance frameworks

[Looks good] [Add more] [Edit]"

// Continues with research...

// After research completes
Agent: [Shows research output]

"By the way - I noticed Boeing had a disruption. Want me to alert
you when companies have events like this?

[Set up signal tracking] [Maybe later]"

// Just-in-time signal setup
User: [Set up signal tracking]

Agent: "What events should I monitor for?

Just tell me naturally - I'll figure out the details."

User: "Alert me about security breaches in aerospace companies"

// Extract and confirm (shown in Signals section)
```

**Progressive Profile Building:**

```typescript
// Trigger prompts at right moments
const profilePrompts = {
  afterFirstResearch: {
    condition: (user) => user.researchCount === 1,
    message: "Want me to track this company and alert you if anything changes?",
    actions: ['track_account', 'no_thanks']
  },
  
  afterThirdResearch: {
    condition: (user) => user.researchCount === 3 && !user.hasIndustry,
    message: "I noticed you're researching aerospace companies. Is this your target industry?",
    actions: ['confirm_industry', 'different_industry']
  },
  
  afterFifthResearch: {
    condition: (user) => user.researchCount === 5 && !user.hasSignals,
    message: "You've researched 5 companies but I'm not monitoring for changes. Want to set up signal tracking?",
    actions: ['setup_signals', 'remind_later']
  },
  
  afterFirstWeek: {
    condition: (user) => daysSince(user.createdAt) === 7 && !user.hasCalendar,
    message: "Want me to research your upcoming meetings automatically? Connect your calendar and I'll prep you before every call.",
    actions: ['connect_calendar', 'manual_upload', 'not_interested']
  }
};

// Profile health calculation
function calculateProfileHealth(user: User): ProfileHealth {
  let score = 0;
  
  // Critical items (60 points total)
  if (user.customCriteria.length > 0) score += 30; // Most important
  if (user.signalPreferences.length > 0) score += 30; // Most important
  
  // Important items (30 points)
  if (user.trackedAccounts.length > 0) score += 15;
  if (user.hasCalendarConnected || user.meetingPrefsConfigured) score += 15;
  
  // Nice-to-have (10 points)
  if (user.role) score += 5;
  if (user.industry) score += 5;
  
  return {
    score,
    critical: user.customCriteria.length === 0 || user.signalPreferences.length === 0,
    recommendations: generateRecommendations(user)
  };
}
```

**Non-Intrusive Profile Health:**

```tsx
// Sidebar widget - compact
<ProfileHealthWidget onClick={expand}>
  <HealthBar value={40} severity="warning" />
  <HealthLabel>
    Profile: 40%
    {hasCritical && <AlertBadge>!</AlertBadge>}
  </HealthLabel>
</ProfileHealthWidget>

// Expanded view
<ProfileHealthExpanded>
  <Header>
    <Title>Profile Health: 40%</Title>
    <CloseButton />
  </Header>
  
  <MissingItems>
    <MissingItem severity="critical">
      <Icon>🚨</Icon>
      <ItemName>Signal tracking</ItemName>
      <Impact>You're missing hot opportunities</Impact>
      <FixButton>Set up</FixButton>
    </MissingItem>
    
    <MissingItem severity="important">
      <Icon>🎯</Icon>
      <ItemName>Custom criteria (need 3 more)</ItemName>
      <Impact>Research will be more generic</Impact>
      <FixButton>Add</FixButton>
    </MissingItem>
  </MissingItems>
  
  <FixAllButton>Complete profile (2 min)</FixAllButton>
</ProfileHealthExpanded>

// Contextual message (dismissible, shown once per day max)
<ProfileHealthMessage dismissible>
  <MessageIcon>⚠️</MessageIcon>
  <MessageContent>
    <Title>Profile Health Check</Title>
    <Text>
      Your profile is 40% complete. You're missing signal tracking,
      which means you won't be alerted when accounts have incidents.
    </Text>
    <Impact>
      High Impact: I found 9 companies with recent breaches in your 
      industry, but don't know if this matters to you.
    </Impact>
  </MessageContent>
  
  <MessageActions>
    <Button variant="primary">Fix now (1 min)</Button>
    <Button variant="text">Dismiss forever</Button>
  </MessageActions>
</ProfileHealthMessage>
```

---

## ❌ Must NOT Have Features

### 1. Empty "Chat Interface" as Primary Experience
**Why wrong:** Passive, unclear, feels like ChatGPT  
**What instead:** Proactive greeting with signals/insights

### 2. Multi-Step Setup Wizards
**Why wrong:** Friction before value, users abandon  
**What instead:** Research immediately, progressive profile building

### 3. Technical Configuration (JSON, complex forms)
**Why wrong:** Cliff is a seller, not a developer  
**What instead:** Natural language for everything

### 4. Blocking "Complete Profile" Banners
**Why wrong:** Annoying, breaks flow  
**What instead:** Small sidebar widget, dismissible messages

### 5. Generic Research (No Account Context)
**Why wrong:** No continuity, no learning  
**What instead:** Link research to accounts, track history

### 6. Mass Prospecting Features
**Why wrong:** Wrong user (BDR not AE)  
**What instead:** Deep research on 15 accounts, not 1000

### 7. Buried Signal Alerts
**Why wrong:** Defeats the purpose  
**What instead:** Dashboard prominence, notifications, impossible to miss

### 8. Poor Mobile Experience
**Why wrong:** Users review prep on phones  
**What instead:** Mobile-optimized, responsive, touch-friendly

### 9. Non-Streaming Responses
**Why wrong:** 30-second wait feels broken  
**What instead:** Stream everything, progressive rendering

### 10. Using Old APIs/Models
**Why wrong:** We're on GPT-5/Responses API now  
**What instead:** GPT-5 + Responses API + streaming, always

---

## 📊 Implementation Priorities

### Phase 1: Foundation (P0 - Must Have Before Launch)

**Core Research System:**
- [ ] Deep account research with GPT-5 streaming
- [ ] Quick facts research mode
- [ ] Custom criteria extraction from natural language
- [ ] Research output with proper visual hierarchy
- [ ] Executive summary, signals, criteria, decision makers sections
- [ ] Quick actions bar (Draft Email, Export PDF, Track Account)

**Proactive Agent:**
- [ ] Dashboard greeting with signals aggregation
- [ ] Smart suggestions based on user context
- [ ] Account summary statistics
- [ ] Upcoming meetings preview (if calendar connected)

**Account Tracking:**
- [ ] Database schema for tracked accounts
- [ ] CSV upload with validation
- [ ] Manual account add via chat
- [ ] Account list in sidebar with signal badges
- [ ] Account dashboard with filtering
- [ ] Bulk operations (refresh all, export)

**Conversational Onboarding:**
- [ ] Welcome with immediate usage option
- [ ] Inline research type selection
- [ ] Natural language criteria extraction
- [ ] Just-in-time profile building triggers
- [ ] Non-intrusive profile health widget

**Technical Foundation:**
- [ ] GPT-5/GPT-5-mini integration with Responses API
- [ ] Streaming for ALL agent responses
- [ ] Database schema (accounts, research, signals, meetings)
- [ ] Background job infrastructure (cron/queue)

### Phase 2: Intelligence (P0 - Core Value)

**Signal Detection:**
- [ ] Signal detection service (6-hour background job)
- [ ] Signal types: breach, leadership, funding, hiring, etc.
- [ ] Conversational signal configuration
- [ ] Signal preference extraction with GPT-5
- [ ] Signal scoring algorithm
- [ ] Dashboard signal alerts (prominent)
- [ ] Email notifications (critical only)
- [ ] Sidebar signal badges

**Enhanced Research:**
- [ ] Meeting-type-specific research strategies
- [ ] Context aggregation (CRM, emails, past research)
- [ ] Attendee intelligence and personalization
- [ ] Relationship context from past interactions
- [ ] Competitive intelligence
- [ ] Tech stack analysis
- [ ] ICP fit scoring

**Meeting Intelligence MVP:**
- [ ] Google Calendar OAuth integration
- [ ] Meeting detection and parsing
- [ ] Company extraction from meeting details
- [ ] Meeting type classification
- [ ] Basic meeting prep generation
- [ ] Email delivery system
- [ ] Prep document UI (TL;DR, strategy, attendees)

### Phase 3: Meeting Intelligence Complete (P0 - Killer Feature)

**Calendar & Upload:**
- [ ] Microsoft Outlook OAuth integration
- [ ] CSV meeting upload with validation
- [ ] ICS file parsing and filtering
- [ ] Manual single meeting entry form
- [ ] Email forwarding system (unique address per user)
- [ ] Company name extraction (multi-strategy)

**Meeting Prep Quality:**
- [ ] Meeting-type-specific prep strategies
- [ ] Discovery call prep format
- [ ] Demo prep format
- [ ] Negotiation prep format
- [ ] Check-in prep format
- [ ] Attendee intel with personalization
- [ ] Quick reference cheat sheet
- [ ] Post-meeting feedback capture

**Delivery & Optimization:**
- [ ] Delivery preferences (night before, morning of, both)
- [ ] Daily digest format
- [ ] Slack integration
- [ ] Mobile-optimized prep view
- [ ] PDF generation
- [ ] Meeting outcome tracking

### Phase 4: Polish & Scale (P1 - Production Ready)

**Performance:**
- [ ] Dashboard load time <2 seconds
- [ ] Research completion <3 minutes
- [ ] Lazy loading for large lists
- [ ] Caching layer (Redis)
- [ ] Database query optimization
- [ ] CDN for static assets

**UX Polish:**
- [ ] Sidebar improvements (better labels, navigation)
- [ ] Research output scannability
- [ ] Loading states and skeletons
- [ ] Error handling and user-friendly messages
- [ ] Empty states throughout
- [ ] Mobile responsive design

**Testing:**
- [ ] Visual testing with Puppeteer
- [ ] End-to-end workflow testing
- [ ] Edge case handling
- [ ] Error recovery testing
- [ ] Performance testing
- [ ] Mobile testing

**Integration:**
- [ ] CRM integration (Salesforce)
- [ ] Email history (Gmail/Outlook)
- [ ] Export functionality
- [ ] Webhooks for external systems

---

## 🎨 Design Standards

### Visual Hierarchy Rules

**Importance = Visual Weight**

1. **Critical (Signals, Alerts):**
   - Red/orange backgrounds (#FFF5F5, #FFFAF0)
   - Large text (16-18px)
   - Icons (🔥, 🚨, ⚡)
   - Top of screen, no scrolling needed

2. **Important (Key Findings, Actions):**
   - Boxed/bordered
   - Medium text (14-16px)
   - Bold labels
   - Prominent buttons

3. **Standard (Supporting Details):**
   - Normal text (14px)
   - Expandable sections
   - Can be collapsed by default

4. **Reference (Sources, Metadata):**
   - Small text (12-13px)
   - Gray color (#6B7280)
   - Collapsed by default

### Color System

```scss
// Signals & Priority
$hot-red: #FF4444;
$hot-bg: #FFF5F5;
$warm-orange: #FFA500;
$warm-bg: #FFFAF0;

// Semantic
$success-green: #10B981;
$success-bg: #D1FAE5;
$warning-yellow: #F59E0B;
$warning-bg: #FEF3C7;
$error-red: #EF4444;
$error-bg: #FEE2E2;

// Primary
$primary-blue: #2563EB;
$primary-hover: #1D4ED8;
$primary-light: #DBEAFE;

// Neutral
$gray-50: #F9FAFB;
$gray-100: #F3F4F6;
$gray-200: #E5E7EB;
$gray-300: #D1D5DB;
$gray-600: #4B5563;
$gray-700: #374151;
$gray-900: #111827;
```

### Component Patterns

**Cards:**
```scss
.card {
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
}

.card-hot {
  border-left: 4px solid $hot-red;
  background: $hot-bg;
}
```

**Buttons:**
```scss
.button {
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &-primary {
    background: $primary-blue;
    color: white;
    
    &:hover {
      background: $primary-hover;
      transform: translateY(-1px);
    }
  }
}
```

**Expandable Sections:**
```scss
.section {
  border: 1px solid $gray-200;
  border-radius: 12px;
  margin-bottom: 16px;
  
  &-header {
    padding: 16px 24px;
    cursor: pointer;
    background: $gray-50;
    
    &:hover {
      background: $gray-100;
    }
  }
  
  &-content {
    padding: 24px;
    
    &.collapsed {
      display: none;
    }
  }
}
```

### Typography

```scss
$font-family: 'Inter', -apple-system, sans-serif;

h1 { font: 700 32px/1.2 $font-family; }
h2 { font: 600 24px/1.3 $font-family; }
h3 { font: 600 20px/1.4 $font-family; }
h4 { font: 600 16px/1.5 $font-family; }

.body-large { font: 400 16px/1.6 $font-family; }
.body { font: 400 14px/1.5 $font-family; }
.body-small { font: 400 13px/1.5 $font-family; }
.caption { font: 400 12px/1.4 $font-family; }
```

### Spacing

```scss
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;
$spacing-xl: 32px;
$spacing-2xl: 48px;
```

---

## 💾 Database Schema (Core Tables)

```sql
-- Tracked accounts
CREATE TABLE tracked_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  company_url VARCHAR(500),
  industry VARCHAR(100),
  employee_count INTEGER,
  
  added_at TIMESTAMP DEFAULT NOW(),
  last_researched_at TIMESTAMP,
  monitoring_enabled BOOLEAN DEFAULT TRUE,
  
  latest_research_id UUID,
  signal_score INTEGER DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'standard',
  
  INDEX idx_user_company (user_id, company_name),
  INDEX idx_signal_score (signal_score DESC)
);

-- Research results
CREATE TABLE research_results (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES tracked_accounts(id),
  
  company_name VARCHAR(255) NOT NULL,
  research_type VARCHAR(20), -- 'deep' | 'quick' | 'specific'
  
  executive_summary JSONB,
  signals JSONB,
  custom_criteria JSONB,
  decision_makers JSONB,
  company_intelligence JSONB,
  sources JSONB,
  
  icp_fit_score INTEGER,
  signal_score INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  tokens_used INTEGER,
  credits_used INTEGER,
  
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_account (account_id, created_at DESC)
);

-- Signals
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES tracked_accounts(id),
  user_id UUID NOT NULL,
  
  signal_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL, -- 'critical' | 'high' | 'medium' | 'low'
  title VARCHAR(500),
  description TEXT,
  impact TEXT,
  
  detected_at TIMESTAMP DEFAULT NOW(),
  event_date DATE,
  source_url VARCHAR(1000),
  
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMP,
  dismissed BOOLEAN DEFAULT FALSE,
  
  INDEX idx_account_date (account_id, detected_at DESC),
  INDEX idx_user_unviewed (user_id, viewed, detected_at DESC)
);

-- Detected meetings
CREATE TABLE detected_meetings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  source VARCHAR(20), -- 'calendar_sync' | 'csv' | 'ics' | 'manual' | 'email'
  
  title VARCHAR(500),
  company_name VARCHAR(255),
  meeting_datetime TIMESTAMP NOT NULL,
  timezone VARCHAR(50),
  attendees JSONB,
  
  meeting_type VARCHAR(20), -- 'discovery' | 'demo' | 'negotiation' | etc
  priority VARCHAR(10), -- 'high' | 'medium' | 'low'
  
  research_status VARCHAR(20) DEFAULT 'pending',
  prep_doc_id UUID,
  
  INDEX idx_user_datetime (user_id, meeting_datetime)
);

-- Meeting prep documents
CREATE TABLE meeting_prep_documents (
  id UUID PRIMARY KEY,
  meeting_id UUID REFERENCES detected_meetings(id),
  user_id UUID NOT NULL,
  
  company_name VARCHAR(255),
  meeting_datetime TIMESTAMP,
  meeting_type VARCHAR(20),
  
  tldr JSONB,
  relationship_context JSONB,
  recent_developments JSONB,
  attendee_intel JSONB,
  meeting_strategy JSONB,
  company_intelligence JSONB,
  cheat_sheet JSONB,
  
  generated_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  
  pdf_url TEXT,
  
  INDEX idx_meeting (meeting_id),
  INDEX idx_user_datetime (user_id, meeting_datetime)
);

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  
  -- Custom criteria
  custom_criteria JSONB, -- Array of criteria objects
  
  -- Signal preferences
  signal_preferences JSONB, -- Array of signal preference objects
  
  -- Meeting intelligence
  calendar_sync_enabled BOOLEAN DEFAULT FALSE,
  delivery_method VARCHAR(20) DEFAULT 'email',
  delivery_timing VARCHAR(20) DEFAULT 'both',
  
  -- Profile metadata
  role VARCHAR(50),
  industry VARCHAR(100),
  company_domain VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Calendar connections
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  provider VARCHAR(20) NOT NULL, -- 'google' | 'microsoft'
  
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT NOT NULL, -- Encrypted
  token_expires_at TIMESTAMP,
  
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  
  INDEX idx_user_provider (user_id, provider)
);
```

---

## 🔧 API Requirements

### Streaming Implementation

**Every GPT-5 call MUST stream:**

```typescript
// ✅ CORRECT
async function* researchCompany(query: string) {
  const stream = await openai.responses.create({
    model: 'gpt-5',
    messages: buildResearchPrompt(query),
    stream: true, // REQUIRED
  });
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

// Frontend consumption
const response = researchCompany('Boeing');
for await (const chunk of response) {
  appendToUI(chunk); // Progressive rendering
}
```

**Model Selection:**

```typescript
// Use gpt-5 for:
- Deep research
- Meeting prep generation
- Complex analysis
- Strategic recommendations

// Use gpt-5-mini for:
- Criteria extraction
- Signal classification
- Quality evaluations
- Simple classifications
```

### API Endpoints

```typescript
// Research
POST   /api/research                    // Start research (returns stream)
GET    /api/research/:id                // Get completed research
POST   /api/research/:id/refresh        // Refresh research

// Accounts
GET    /api/accounts                    // List tracked accounts
POST   /api/accounts                    // Add account
POST   /api/accounts/upload             // CSV upload
PATCH  /api/accounts/:id                // Update account
DELETE /api/accounts/:id                // Remove from tracking
POST   /api/accounts/bulk-research      // Research multiple

// Signals
GET    /api/signals                     // Get recent signals
GET    /api/signals/unviewed            // Unviewed signals only
PATCH  /api/signals/:id/view            // Mark as viewed
PATCH  /api/signals/:id/dismiss         // Dismiss signal

// Meetings
GET    /api/meetings/upcoming           // Upcoming meetings
POST   /api/meetings/upload/csv         // Upload CSV
POST   /api/meetings/upload/ics         // Upload ICS
POST   /api/meetings/manual             // Add single meeting
GET    /api/meeting-prep/:id            // Get prep doc
GET    /api/meeting-prep/:id/pdf        // Download PDF

// Calendar
POST   /api/calendar/connect/:provider  // OAuth initiation
GET    /api/calendar/callback/:provider // OAuth callback
DELETE /api/calendar/disconnect         // Disconnect calendar
POST   /api/calendar/sync               // Manual sync

// Dashboard
GET    /api/dashboard/greeting          // Dashboard data

// Preferences
GET    /api/preferences                 // Get all preferences
PATCH  /api/preferences                 // Update preferences
```

---

## 🧭 Decision Framework

When uncertain, use this framework:

### 1. Does it make the agent more proactive?
- **Yes:** Strongly consider
- **No:** Deprioritize

### 2. Is it conversational or forms-based?
- **Conversational:** Build it
- **Forms:** Find conversational alternative

### 3. Does it reduce clicks to value?
- **Fewer clicks:** Good
- **More clicks:** Bad

### 4. Does Cliff (AE) need this?
- **Yes:** Priority
- **No but BDR needs it:** Lower priority
- **Neither:** Don't build

### 5. Is it meeting-intelligence-related?
- **Yes:** High priority
- **No:** Lower priority

### 6. Does it use GPT-5 + Responses API + streaming?
- **Yes:** Correct
- **No:** Fix immediately

### 7. Are you faking/mocking/stubbing?
- **Yes:** STOP - build real functionality
- **No:** Continue

---

## ✅ Definition of Done

Before marking ANY feature complete:

**Functional:**
- [ ] Core functionality works end-to-end
- [ ] Uses GPT-5/GPT-5-mini (NOT GPT-4o)
- [ ] Uses Responses API (NOT Completions API)
- [ ] ALL responses stream (no exceptions)
- [ ] Error handling comprehensive
- [ ] Loading states implemented
- [ ] Edge cases handled
- [ ] Mobile responsive

**UX:**
- [ ] Proactive, not reactive
- [ ] Conversational, not forms
- [ ] Action-oriented (clear next steps)
- [ ] Visually scannable (hierarchy clear)
- [ ] <3 clicks to complete task

**Quality:**
- [ ] Matches design standards
- [ ] Performance acceptable (<3s)
- [ ] No console errors
- [ ] Actually tested (not just written)
- [ ] Tests run and pass (not reported as passing without running)

**Documentation:**
- [ ] Code commented
- [ ] Schema documented
- [ ] Known limitations noted

---

## 🚨 Critical Rules (NEVER BREAK)

### 1. GPT-5 + Responses API ONLY
```
DO NOT use:
- GPT-4o or older models
- Completions API
- Any deprecated endpoints

DO use:
- GPT-5 or GPT-5-mini
- Responses API
- Streaming (always)

If uncertain, check:
- https://platform.openai.com/docs/guides/migrate-to-responses
- https://platform.openai.com/docs/guides/latest-model
```

### 2. ALWAYS Stream
```
Every single GPT response MUST stream.
No exceptions.
No "I'll add streaming later."
Stream from day 1.
```

### 3. NO Faking/Mocking
```
Do not fake test results.
Do not mock API responses to "pass tests."
Do not stub functionality.
Work with real scenarios only.

If something doesn't work:
- Fix the underlying issue
- Don't work around it
- Don't fake it
```

### 4. NO False Test Reports
```
Writing a test ≠ Running a test.
Only report tests as passed if:
- They were actually executed
- They actually passed
- Results are real

If a test fails:
- Report the failure
- Fix the issue
- Re-run and verify
```

### 5. Follow Migration Plan
```
Work from:
/Users/marklerner/Research_Agent_Platform_wndsrf/docs/migration_and_visual_iterative_testing_and_updating_plan.md

- Follow requirements exactly
- Don't skip steps
- Don't assume functionality works
- Test everything
```

### 6. Handle Tool Failures
```
If MCP Playwright is down:
- Use Puppeteer instead
- Don't fake test results

If an API is unavailable:
- Find alternative
- Fix the issue
- Don't stub responses

Never work around by faking.
```

---

## 🎯 North Star Metric

**User Success = Meeting Prep Quality Rating**

Target: **>4.5/5** average rating

This is the metric that matters most. If users love their meeting prep:
- They use product daily
- They tell colleagues
- They renew/upgrade
- Everything else follows

Every decision should ask: **"Does this improve meeting prep quality?"**

---

## ✨ The Vision

When complete, Cliff should say:

> "This is magic. I used to spend an hour before every call digging through LinkedIn, news, our CRM, past emails. Now I wake up and my prep is in my inbox. Every meeting. Perfect talking points. I know who I'm talking to, what they care about, why now is the right time.
>
> When I need to research a company, I type the name and get deep intelligence in 2 minutes. Not ChatGPT surface-level stuff - actual decision makers, tech stack, recent signals, personalized talking points.
>
> I've closed 3 deals in the last month because I reached out the day after they had a security incident. My manager asked me how I'm always so prepared. I just smiled and said 'I have a system.'
>
> This product is my unfair advantage."

That's the bar. Build toward this vision with every commit.

---

**END OF GROUND TRUTH DOCUMENT**

*This is your source of truth. When in doubt, refer back here. When making trade-offs, use the decision framework. When prioritizing, remember: deep research + meeting intelligence = core product. Everything else supports these.*