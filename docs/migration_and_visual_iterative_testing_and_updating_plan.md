# Research Agent Platform: Complete Implementation & Iteration Guide

**For: Coding Agent (Claude with MCP Puppeteer)**
**Project Goal:** Transform platform into best-in-class agentic research tool for B2B sales (AE/BDR workflows)
**Target Outcome:** 110% of platform's potential value

---

## Table of Contents

1. [Context & Design Philosophy](#1-context--design-philosophy)
2. [User Personas & Workflows](#2-user-personas--workflows)
3. [Core Feature Specifications](#3-core-feature-specifications)
4. [UI/UX Component Library](#4-uiux-component-library)
5. [Implementation Roadmap](#5-implementation-roadmap)
6. [Visual Testing Framework](#6-visual-testing-framework)
7. [Gap Identification Process](#7-gap-identification-process)
8. [Iteration Protocol](#8-iteration-protocol)

---

## 1. Context & Design Philosophy

### 1.1 Current State Analysis

**What exists now:**
- Basic chat interface with research agent
- Simple onboarding with company profile
- Research history in sidebar (poor labels: "Company Profile" repeated)
- Profile health indicator (40% complete in sidebar)
- Quick action cards on dashboard (Find Hot Leads, Batch Research, etc.)
- Basic research output in chat

**Critical problems identified:**
1. **Wrong primary focus** - Built for BDR prospecting, not AE account management
2. **Overwhelming profile setup** - JSON examples, technical language, forms-first approach
3. **No account tracking** - One-time research disappears into chat history
4. **Missing signal monitoring** - No proactive alerts or ongoing monitoring
5. **Poor research organization** - "Company Profile" x9 in sidebar (which company?)
6. **Not truly agentic** - Reactive ("ask me anything") not proactive (alerts, suggestions)
7. **Profile completion friction** - Big banner blocks usage, technical configuration

### 1.2 Core Design Principles

**Agentic First:**
- Agent should be **proactive** (greet with insights, not empty screen)
- Agent should **learn** from usage (not require upfront configuration)
- Agent should **suggest** next actions (not wait for commands)
- Agent should **remember** context (accounts, past research, preferences)
- Agent should **monitor** continuously (signals, changes, opportunities)

**Conversational Everything:**
- Configuration via natural language, not forms
- Updates via chat commands, not settings pages
- Profile building through conversation, not wizards
- Even "dashboards" presented as chat messages

**Just-In-Time Complexity:**
- Start simple, add features as needed
- Ask questions when relevant, not upfront
- Learn from behavior before asking explicitly
- Progressive disclosure over forms

**Action-Oriented:**
- Every insight has a suggested next step
- Quick-action buttons for common workflows
- One-click from research → outreach
- Minimize clicks to value

---

## 2. User Personas & Workflows

### 2.1 Primary Persona: Cliff (Account Executive)

**Profile:**
- Role: AE selling security/compliance software to enterprise
- Account list: 15 strategic accounts (defense/aerospace)
- Use case: Deep account research, not mass prospecting
- Pain point: Spends 45-60 min per account in ChatGPT, scrolling to find old prompts
- Critical needs:
  - Track specific accounts
  - Monitor for security breaches (buying signal)
  - Know when to reach out (timing signals)
  - Extract specific data (security stack, CISO, compliance needs)

**Key Workflows:**
1. **Upload account list** → Track 15 accounts continuously
2. **Get daily briefing** → "2 hot signals on your accounts"
3. **Research specific account** → Deep dive when signal detected
4. **Batch research** → Update all 15 accounts before quarterly review
5. **Draft outreach** → From research → personalized email

**Success Metrics:**
- Saves 45+ minutes per research session
- Never misses a security breach at target accounts
- Gets 5+ personalization points per contact
- Can generate presentation deck from 15 account research

### 2.2 Secondary Persona: BDR (Lead Generation)

**Profile:**
- Role: BDR finding new prospects
- Use case: Discover 20-50 new companies weekly matching ICP
- Pain point: Manual research, no signal detection, generic outreach
- Critical needs:
  - Find companies with active buying signals
  - Get qualification data quickly
  - Build lists for outreach campaigns

**Key Workflows:**
1. **Smart search** → "Find 20 SaaS companies with recent breaches"
2. **Batch qualification** → Upload 50 prospects, get ICP fit scores
3. **Export to CRM** → Push qualified leads to HubSpot/Salesforce

### 2.3 Design Priority

**Phase 1 (Current sprint):** Build for Cliff (AE workflow)
**Phase 2:** Add BDR optimizations
**Reason:** AE workflow is more complex; if it works for AEs, BDRs get value automatically

---

## 3. Core Feature Specifications

### 3.1 Proactive Agent Dashboard

**Location:** Main chat area on initial load

**Behavior:**
Instead of empty "Ask me anything", agent should greet proactively with:

**Component Structure:**
```jsx
<ChatArea>
  <AgentMessage type="greeting" priority="high">
    {/* Morning/afternoon/evening contextual greeting */}
    <Greeting time={timeOfDay} userName={user.firstName} />
    
    {/* Signal alerts - MOST PROMINENT */}
    {hasHotSignals && (
      <SignalAlertsSection variant="critical">
        <SectionHeader icon="🔥">
          {signalCount} hot signal{signalCount > 1 ? 's' : ''} detected on your accounts
        </SectionHeader>
        
        <SignalsList maxVisible={3}>
          {signals.map(signal => (
            <SignalItem 
              key={signal.id}
              severity={signal.severity}
              company={signal.company}
              description={signal.description}
              daysAgo={signal.daysAgo}
              onClick={() => researchCompany(signal.company)}
            />
          ))}
        </SignalsList>
        
        <SignalActions>
          <ActionButton variant="primary" icon="📊">
            Research {signals[0].company} (updated analysis)
          </ActionButton>
          <ActionButton variant="secondary" icon="🔍">
            View all signals
          </ActionButton>
        </SignalActions>
      </SignalAlertsSection>
    )}
    
    {/* Account status summary */}
    <AccountSummary>
      <SummaryItem icon="📊" count={accountStats.total}>
        accounts tracked
      </SummaryItem>
      <SummaryItem icon="🔥" count={accountStats.hot} highlight>
        with hot signals
      </SummaryItem>
      <SummaryItem icon="📅" count={accountStats.stale}>
        need research updates
      </SummaryItem>
    </AccountSummary>
    
    {/* Smart suggestions based on context */}
    <SmartSuggestions>
      <SuggestionHeader>Or try asking me:</SuggestionHeader>
      <SuggestionChips>
        <Chip onClick={sendMessage("Which accounts had changes this week?")}>
          "Which accounts had changes this week?"
        </Chip>
        <Chip onClick={sendMessage("Research my top 5 accounts")}>
          "Research my top 5 accounts"
        </Chip>
        <Chip onClick={sendMessage("Show accounts with security incidents")}>
          "Show accounts with security incidents"
        </Chip>
      </SuggestionChips>
    </SmartSuggestions>
  </AgentMessage>
</ChatArea>
```

**Visual Requirements:**
- Signal alerts must be **visually dominant** (red/orange, large, top of message)
- Use icons + color coding for severity (🔥 red = critical, ⚡ yellow = important)
- Action buttons must be **immediately visible** (no scrolling needed)
- Smart suggestions should feel **natural** (conversational, not robotic)

**Data Requirements:**
```typescript
interface DashboardData {
  signals: Array<{
    id: string;
    company: string;
    type: 'security_breach' | 'leadership_change' | 'funding' | 'hiring_surge';
    severity: 'critical' | 'high' | 'medium';
    description: string;
    date: Date;
    daysAgo: number;
    sourceUrl: string;
  }>;
  accountStats: {
    total: number;
    hot: number; // with recent signals
    stale: number; // >14 days since research
    researched: number;
  };
  userContext: {
    firstName: string;
    role: 'ae' | 'bdr' | 'marketing';
    industry: string;
    accountsConfigured: boolean;
    signalsConfigured: boolean;
  };
}
```

**Implementation Notes:**
1. **Backend endpoint:** `GET /api/dashboard/greeting` - returns dashboard data
2. **Refresh frequency:** Every page load + every 5 minutes if tab active
3. **Empty state:** If no signals, show account summary + suggestions only
4. **First-time user:** Different greeting (see Section 3.2 - Onboarding)

---

### 3.2 Conversational Onboarding

**Trigger:** First login OR profile <50% complete

**Behavior:** Two paths based on user preference

#### Path A: Immediate Usage (Recommended)

User can **start researching immediately**, agent learns as they go.

**Flow:**
```
1. Welcome message with two options:
   - "Jump right in" → Research something now
   - "Quick chat first" → 2-minute guided setup

2. If "Jump right in":
   User: "Research Boeing"
   
   Agent: "Quick question before I start - what type of research?"
   [Deep Account Research] [Quick Facts] [Specific Question]
   
   User selects "Deep Account Research"
   
   Agent: "One more thing - I can look for specific data you care about.
          For example: security incidents, tech stack, compliance needs.
          
          Want to tell me what to look for?"
   [Yes - customize] [Generic is fine] [Not sure yet]
   
3. If user selects "Yes - customize":
   Agent: "Just tell me in plain English - what info helps you qualify companies?"
   
   [Text area with placeholder examples]
   
   User types naturally: "I need to know if they've had breaches, 
   what security tools they use, if they have a CISO, and their 
   compliance requirements"
   
   Agent extracts structured criteria:
   "Got it! I'll track these 4 things:
   ✓ Recent security incidents
   ✓ Security stack (SIEM, EDR, etc.)
   ✓ Has dedicated CISO
   ✓ Compliance frameworks
   
   [Looks good] [Add more] [Edit]"
   
4. Agent continues with research, incorporating custom criteria
   
5. After research completes, proactive suggestion:
   "By the way - I noticed Boeing had a disruption. Want me to alert
   you when companies have events like this?
   
   [Set up signal tracking] [Maybe later]"
```

**Component Structure:**
```jsx
// First message - Welcome
<AgentMessage type="welcome">
  <WelcomeHeader>
    <WaveIcon>👋</WaveIcon>
    <WelcomeText>Hey! I'm your Research Agent.</WelcomeText>
  </WelcomeHeader>
  
  <IntroText>
    I help sales teams research companies and track accounts.
    No forms to fill out - you can start right away.
  </IntroText>
  
  <PathOptions>
    <PathCard 
      icon="🚀"
      title="Jump right in"
      description="Research a company now"
      quickStarters={[
        "Research Boeing",
        "Find companies like Stripe",
        "What can you do?"
      ]}
      onClick={() => selectPath('immediate')}
    />
    
    <PathCard 
      icon="💬"
      title="Quick chat first"
      description="2 min to personalize"
      preview="I'll ask about your role and what you're looking for"
      onClick={() => selectPath('guided')}
    />
  </PathOptions>
</AgentMessage>

// Clarification messages (shown as needed)
<AgentMessage type="clarification">
  <QuestionText>
    Quick question before I start: What type of research?
  </QuestionText>
  
  <ResearchTypeOptions>
    <TypeOption
      icon="📊"
      title="Deep Account Research"
      description="Full report: leadership, signals, contacts, tech stack"
      cost="~25-35 credits"
      time="~2 min"
      recommended
    />
    <TypeOption
      icon="⚡"
      title="Quick Facts"
      description="Basic info: size, industry, headquarters"
      cost="~5-10 credits"
      time="~20 sec"
    />
    <TypeOption
      icon="🔍"
      title="Specific Question"
      description="Answer something specific"
      cost="Varies"
    />
  </ResearchTypeOptions>
</AgentMessage>

// Custom criteria extraction
<AgentMessage type="learning">
  <InstructionText>
    Perfect! Just tell me in plain English - what information helps
    you decide if a company is worth your time?
  </InstructionText>
  
  <NaturalLanguageInput
    placeholder="Example: I need to know if they've had security incidents, what security tools they use, whether they're in a regulated industry..."
    minRows={3}
    onSubmit={extractCriteria}
  />
  
  <HelpExamples collapsed>
    <ExamplesToggle>Need ideas? See examples</ExamplesToggle>
    <ExamplesList>
      <Example industry="Security">
        Recent breaches, security stack, CISO, compliance needs
      </Example>
      <Example industry="Sales Tools">
        Current CRM, sales team size, outbound volume, tech stack
      </Example>
    </ExamplesList>
  </HelpExamples>
</AgentMessage>

// Confirmation of extracted criteria
<AgentMessage type="confirmation">
  <ConfirmationHeader>
    <CheckIcon>✓</CheckIcon>
    <ConfirmText>Got it! I'll track these for every company:</ConfirmText>
  </ConfirmationHeader>
  
  <ExtractedCriteria>
    {criteria.map((c, idx) => (
      <CriterionCard key={idx} importance={c.importance}>
        <CriterionBadge>{c.importance}</CriterionBadge>
        <CriterionName>{c.name}</CriterionName>
        <CriterionExplanation>
          I'll search for: {c.hints.join(', ')}
        </CriterionExplanation>
        <EditButton onClick={() => editCriterion(idx)}>Edit</EditButton>
      </CriterionCard>
    ))}
  </ExtractedCriteria>
  
  <ConfirmActions>
    <Button variant="primary">Perfect - continue</Button>
    <Button variant="text">Add another criterion</Button>
  </ConfirmActions>
  
  <SavedNote>✓ Saved to profile</SavedNote>
</AgentMessage>
```

#### Path B: Guided Setup

If user clicks "Quick chat first":

**Flow:** 4-question conversation
1. What's your role? [BDR/AE/Marketing/Other]
2. What helps you qualify companies? [Natural language input]
3. What events create urgency? [Signal checkboxes]
4. Who do you typically contact? [Job titles, seniority]

**Visual Pattern:**
```jsx
<ConversationalSetup>
  <ProgressIndicator current={1} total={4} />
  
  <Question number={1}>
    <QuestionText>What's your role?</QuestionText>
    
    <SelectionCards>
      <Card icon="🎯" label="BDR/SDR" sublabel="Find prospects" />
      <Card icon="💼" label="AE" sublabel="Research accounts" highlighted />
      <Card icon="📊" label="Marketing" sublabel="Market research" />
    </SelectionCards>
    
    <OrDivider />
    
    <TextInput placeholder="Or type your role..." />
  </Question>
  
  <NavigationButtons>
    <Button variant="secondary" disabled>Back</Button>
    <Button variant="primary">Continue</Button>
  </NavigationButtons>
</ConversationalSetup>
```

**Key Implementation Details:**

1. **Natural Language Processing:**
```typescript
// Backend function to extract criteria from user input
async function extractCriteriaFromText(text: string): Promise<Criterion[]> {
  // Use GPT-5/5-mini to parse natural language into structured criteria
  const prompt = `
    Extract custom qualifying criteria from this text:
    "${text}"
    
    Return JSON array with:
    - name: criterion name
    - type: 'text' | 'number' | 'boolean' | 'list'
    - importance: 'critical' | 'important' | 'optional'
    - hints: array of keywords to search for
    
    Examples:
    "recent security incidents" → 
      {name: "Recent security incidents", type: "boolean", importance: "critical", hints: ["breach", "ransomware", "hack"]}
  `;
  
  const result = await callGPT4(prompt);
  return JSON.parse(result);
}
```

2. **Progressive Profile Building:**
```typescript
// Track profile completion through usage
interface ProfileCompletion {
  hasRole: boolean;
  hasCustomCriteria: boolean;
  hasSignals: boolean;
  hasTargetTitles: boolean;
  hasAccountList: boolean;
  completionPercent: number;
}

function calculateProfileHealth(user: User): ProfileCompletion {
  const hasRole = !!user.role;
  const hasCustomCriteria = user.customCriteria.length > 0;
  const hasSignals = user.signalPreferences.length > 0;
  const hasTargetTitles = user.targetTitles.length > 0;
  const hasAccountList = user.trackedAccounts.length > 0;
  
  const weights = {
    role: 10,
    customCriteria: 30, // Most important
    signals: 30, // Most important
    targetTitles: 15,
    accountList: 15
  };
  
  let score = 0;
  if (hasRole) score += weights.role;
  if (hasCustomCriteria) score += weights.customCriteria;
  if (hasSignals) score += weights.signals;
  if (hasTargetTitles) score += weights.targetTitles;
  if (hasAccountList) score += weights.accountList;
  
  return {
    hasRole,
    hasCustomCriteria,
    hasSignals,
    hasTargetTitles,
    hasAccountList,
    completionPercent: score
  };
}
```

3. **Just-In-Time Profile Prompts:**
```typescript
// Trigger profile questions at right moments
const profilePrompts = {
  afterFirstResearch: {
    condition: (user) => user.researchCount === 1 && !user.hasAccountList,
    message: "Want me to track this company and alert you if anything changes?",
    actions: ['track_account', 'track_multiple', 'no_thanks']
  },
  
  afterThirdResearch: {
    condition: (user) => user.researchCount === 3 && !user.hasIndustry,
    message: "I noticed you're researching aerospace companies. Is this your target industry?",
    actions: ['confirm_industry', 'specify_different', 'multiple_industries']
  },
  
  afterFifthResearch: {
    condition: (user) => user.researchCount === 5 && !user.hasSignals,
    message: "You've researched 5 companies but I'm not monitoring for changes. Want to set up signal tracking?",
    actions: ['setup_signals', 'remind_later']
  }
};
```

---

### 3.3 Account Tracking & Management

**Purpose:** Let AEs like Cliff track their 15 strategic accounts with continuous monitoring

**Primary Interface:** Conversational commands + visual dashboard in chat

#### Account List Management

**Adding Accounts:**

```
User: "Add Boeing to my account list"

Agent: ✓ Added Boeing to tracking.

I'll monitor for:
• New signals (breaches, leadership changes, funding)
• Your custom criteria updates
• News and announcements

Want me to research Boeing now? (~25 credits)

[Research now] [Monitor only] [Add more accounts]
```

```
User: "Upload my account list"

Agent: [Shows file upload interface]

Great! Drop your CSV here. I need at least:
• Company name (required)
• Website (optional but recommended)

[Upload area]

---

After upload:

Agent: ✓ Uploaded 15 accounts:
• Boeing
• Lockheed Martin
• Raytheon Technologies
• [show first 5, then "and 10 more..."]

What would you like to do?
[Research all 15 now (~375 credits, 15 min)]
[Set up monitoring only (I'll alert you when signals appear)]
[Research specific accounts]
```

**Viewing Accounts:**

```
User: "Show my accounts"

Agent: [Renders interactive account dashboard in chat]

📊 Your Account Portfolio

[Filter buttons: All (15) | 🔥 Hot (4) | Needs Update (3)]

[Account cards showing:
- Company logo + name
- Priority badge (HOT/WARM/STANDARD)
- Recent signal (if any)
- Last researched date
- Quick actions: Discuss, Update, Report]

[Bulk actions at bottom:
🔄 Refresh all | 📥 Export all | + Add accounts]
```

**Account Dashboard Component:**
```jsx
<AgentMessage type="account_dashboard">
  <DashboardHeader>
    <DashboardTitle icon="📊">Your Account Portfolio</DashboardTitle>
    <FilterChips>
      <Chip active={filter === 'all'} count={15}>All</Chip>
      <Chip active={filter === 'hot'} count={4} variant="danger">
        🔥 Hot
      </Chip>
      <Chip active={filter === 'stale'} count={3}>
        Needs Update
      </Chip>
    </FilterChips>
  </DashboardHeader>

  <AccountsGrid>
    {filteredAccounts.map(account => (
      <AccountCard key={account.id} priority={account.priority}>
        <CardHeader>
          <CompanyLogo src={account.logo} alt={account.name} />
          <CompanyInfo>
            <CompanyName>{account.name}</CompanyName>
            <CompanyMeta>
              {account.industry} • {account.employeeCount} employees
            </CompanyMeta>
          </CompanyInfo>
          <PriorityBadge variant={account.priority}>
            {account.priority === 'hot' ? '🔥 HOT' : account.priority}
          </PriorityBadge>
        </CardHeader>

        {account.recentSignal && (
          <SignalBanner severity={account.recentSignal.severity}>
            <SignalIcon>🚨</SignalIcon>
            <SignalText>
              {account.recentSignal.description}
              <SignalTime>({account.recentSignal.daysAgo}d ago)</SignalTime>
            </SignalText>
          </SignalBanner>
        )}

        <AccountMetrics>
          <Metric label="ICP Fit" value={`${account.icpFit}/100`} />
          <Metric label="Signal Score" value={`${account.signalScore}/100`} />
          <Metric label="Updated" value={account.lastResearched} />
        </AccountMetrics>

        <CardActions>
          <ActionBtn 
            icon="💬" 
            onClick={() => chatAbout(account.name)}
          >
            Discuss
          </ActionBtn>
          <ActionBtn 
            icon="🔄"
            onClick={() => refreshResearch(account.id)}
          >
            Update
          </ActionBtn>
          <ActionBtn 
            icon="📄"
            onClick={() => viewReport(account.id)}
          >
            Report
          </ActionBtn>
        </CardActions>
      </AccountCard>
    ))}
  </AccountsGrid>

  <BulkActions>
    <BulkBtn onClick={() => refreshAll()}>
      🔄 Refresh all 15 accounts
    </BulkBtn>
    <BulkBtn onClick={() => exportAll()}>
      📥 Export all reports
    </BulkBtn>
    <BulkBtn onClick={() => addMore()}>
      + Add more accounts
    </BulkBtn>
  </BulkActions>
</AgentMessage>
```

**Data Structure:**
```typescript
interface TrackedAccount {
  id: string;
  userId: string;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  employeeCount?: number;
  
  // Tracking metadata
  addedAt: Date;
  lastResearchedAt?: Date;
  monitoringEnabled: boolean;
  
  // Latest research data
  latestResearch?: {
    id: string;
    date: Date;
    icpFitScore: number;
    signalScore: number;
    customCriteriaData: Record<string, any>;
    decisionMakers: Contact[];
  };
  
  // Signals
  recentSignals: Signal[];
  signalScore: number; // 0-100, based on recent signals
  
  // Priority calculation
  priority: 'hot' | 'warm' | 'standard';
  
  // User actions
  lastContactedAt?: Date;
  notes?: string;
}

interface Signal {
  id: string;
  accountId: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  date: Date;
  daysAgo: number;
  sourceUrl: string;
  metadata: Record<string, any>;
  
  // User interaction
  viewed: boolean;
  viewedAt?: Date;
  dismissed: boolean;
}
```

#### Signal Monitoring System

**Backend Service:**
```typescript
// Background job that runs every 6 hours
class SignalMonitorService {
  async monitorAccounts() {
    const users = await db.getActiveUsers();
    
    for (const user of users) {
      if (!user.hasSignalPreferences) continue;
      
      const accounts = await db.getTrackedAccounts(user.id);
      
      for (const account of accounts) {
        // Check for new signals based on user preferences
        const newSignals = await this.detectSignals(
          account,
          user.signalPreferences
        );
        
        if (newSignals.length > 0) {
          // Save signals
          await db.saveSignals(newSignals);
          
          // Send notifications
          await this.notifyUser(user, account, newSignals);
          
          // Update account priority
          await this.updateAccountPriority(account.id);
        }
      }
    }
  }
  
  async detectSignals(
    account: TrackedAccount,
    signalPrefs: SignalPreference[]
  ): Promise<Signal[]> {
    const signals: Signal[] = [];
    
    for (const pref of signalPrefs) {
      let detected;
      
      switch (pref.signalType) {
        case 'security_breach':
          detected = await detectSecurityBreach(
            account.companyName,
            pref.lookbackDays
          );
          break;
        case 'leadership_change':
          detected = await detectLeadershipChange(
            account.companyName,
            pref.lookbackDays,
            pref.config.roles
          );
          break;
        // ... other signal types
      }
      
      if (detected && detected.length > 0) {
        signals.push(...detected.map(d => ({
          ...d,
          accountId: account.id,
          importance: pref.importance
        })));
      }
    }
    
    return signals;
  }
  
  async notifyUser(user: User, account: TrackedAccount, signals: Signal[]) {
    // In-app notification (shows on next login)
    await db.createNotification({
      userId: user.id,
      type: 'signal_detected',
      data: {
        accountName: account.companyName,
        signalCount: signals.length,
        signals: signals
      }
    });
    
    // Email notification (if critical)
    const criticalSignals = signals.filter(s => s.severity === 'critical');
    if (criticalSignals.length > 0) {
      await emailService.send({
        to: user.email,
        template: 'signal_alert',
        data: {
          accountName: account.companyName,
          signals: criticalSignals
        }
      });
    }
  }
}
```

**Frontend Signal Display:**
```jsx
// Sidebar: Account list with signal badges
<SidebarAccountsList>
  {accounts.map(account => (
    <AccountItem 
      key={account.id}
      onClick={() => openAccount(account.id)}
    >
      <AccountIcon priority={account.priority}>
        {account.priority === 'hot' ? '🔥' : '📄'}
      </AccountIcon>
      <AccountName>{account.name}</AccountName>
      {account.recentSignals.length > 0 && (
        <SignalBadge count={account.recentSignals.length} />
      )}
    </AccountItem>
  ))}
</SidebarAccountsList>

// Dashboard greeting: Signal alerts
<SignalAlertsWidget>
  <WidgetHeader>
    <h3>🚨 Recent Signals</h3>
    <ViewAllLink>View all →</ViewAllLink>
  </WidgetHeader>
  
  <SignalsList>
    {recentSignals.map(signal => (
      <SignalItem 
        key={signal.id}
        severity={signal.severity}
        onClick={() => viewSignalDetails(signal.id)}
      >
        <SignalIcon severity={signal.severity}>
          {signal.severity === 'critical' ? '🔴' : '🟡'}
        </SignalIcon>
        <SignalContent>
          <SignalCompany>{signal.account.name}</SignalCompany>
          <SignalText>{signal.description}</SignalText>
          <SignalTime>{signal.daysAgo}d ago</SignalTime>
        </SignalContent>
        <SignalAction>
          <Button size="small">View</Button>
        </SignalAction>
      </SignalItem>
    ))}
  </SignalsList>
</SignalAlertsWidget>
```

---

### 3.4 Enhanced Research Output

**Current Problem:** Research results are dense text blocks, hard to scan, no clear actions

**Solution:** Structured, scannable research with prominent signals and actions

**Component Structure:**

```jsx
<AgentMessage type="research_complete">
  <MessageContent>
    {/* SECTION 1: Executive Summary Card */}
    <ExecutiveSummaryCard>
      <CardHeader>
        <CompanyHeader>
          <CompanyLogo src={company.logo} />
          <CompanyName>{company.name}</CompanyName>
          <CompanyMeta>
            {company.industry} • {company.employeeCount} employees
          </CompanyMeta>
        </CompanyHeader>
        
        <PriorityBadge variant={priority}>
          {priority === 'hot' ? '🔥 HOT LEAD' : priority}
        </PriorityBadge>
      </CardHeader>

      <KeyInsight>
        {/* AI-generated TL;DR */}
        Boeing is experiencing heightened focus on security due to recent 
        operational challenges, creating opportunity for infrastructure 
        conversations.
      </KeyInsight>

      <MetricsGrid>
        <MetricCard 
          label="ICP Fit" 
          value="92/100"
          status="excellent"
        />
        <MetricCard 
          label="Signal Strength" 
          value="78/100"
          status="hot"
        />
        <MetricCard 
          label="Timing" 
          value="Good"
          status="positive"
        />
        <MetricCard 
          label="Criteria Match" 
          value="4/5"
          status="good"
        />
      </MetricsGrid>

      <RecommendedAction>
        <ActionLabel>Next Step:</ActionLabel>
        <ActionText>
          Contact CISO about supply chain security. Reference operational 
          challenges and focus on resilience.
        </ActionText>
        <ActionButton variant="primary">
          Draft outreach message
        </ActionButton>
      </RecommendedAction>
    </ExecutiveSummaryCard>

    {/* SECTION 2: Signals (Expandable, always starts expanded) */}
    <ResearchSection 
      icon="🚨"
      title="Buying Signals Detected"
      priority="high"
      defaultExpanded={true}
    >
      <SignalsTimeline>
        {signals.map(signal => (
          <TimelineItem key={signal.id} severity={signal.severity}>
            <TimelineDate>{signal.daysAgo}d ago</TimelineDate>
            
            <SignalCard>
              <SignalHeader>
                <SignalBadge severity={signal.severity}>
                  {signal.severity === 'critical' ? '🔴 High' : '🟡 Medium'}
                </SignalBadge>
                <SignalDate>{formatDate(signal.date)}</SignalDate>
              </SignalHeader>

              <SignalTitle>{signal.title}</SignalTitle>
              <SignalDescription>{signal.description}</SignalDescription>

              <SignalImpact>
                <ImpactLabel>Why this matters:</ImpactLabel>
                <ImpactText>{signal.impact}</ImpactText>
              </SignalImpact>

              <SignalSource href={signal.sourceUrl}>
                📰 Source
              </SignalSource>
            </SignalCard>
          </TimelineItem>
        ))}
      </SignalsTimeline>

      <SignalSummary>
        <SummaryLabel>Timing Assessment:</SummaryLabel>
        <StatusBadge status="warm">⚡ WARM LEAD</StatusBadge>
        <SummaryText>
          Recent operational issues elevated security to strategic priority. 
          Reach out within 2-4 weeks.
        </SummaryText>
      </SignalSummary>
    </ResearchSection>

    {/* SECTION 3: Custom Criteria (Expandable, starts expanded) */}
    <ResearchSection
      icon="✅"
      title="Custom Qualifying Criteria"
      subtitle="4 of 5 criteria met"
      defaultExpanded={true}
    >
      <CriteriaGrid>
        {customCriteria.map(criterion => (
          <CriterionCard 
            key={criterion.id}
            status={criterion.status}
          >
            <CriterionHeader>
              <CriterionName>{criterion.name}:</CriterionName>
              <StatusIcon status={criterion.status}>
                {criterion.status === 'met' ? '✅' : 
                 criterion.status === 'not_met' ? '❌' : '❓'}
              </StatusIcon>
            </CriterionHeader>

            <CriterionValue confidence={criterion.confidence}>
              {criterion.value || 'Unable to determine'}
            </CriterionValue>

            <CriterionDetail>
              {criterion.explanation}
            </CriterionDetail>

            {criterion.source && (
              <CriterionSource>
                Source: {criterion.source}
              </CriterionSource>
            )}

            {criterion.status === 'unknown' && (
              <CriterionNote>
                💡 Ask during discovery call
              </CriterionNote>
            )}
          </CriterionCard>
        ))}
      </CriteriaGrid>
    </ResearchSection>

    {/* SECTION 4: Company Overview (Collapsed by default) */}
    <ResearchSection
      icon="🏢"
      title="Company Overview"
      defaultExpanded={false}
    >
      <OverviewContent>
        {/* Standard company info */}
      </OverviewContent>
    </ResearchSection>

    {/* SECTION 5: Decision Makers (Expanded) */}
    <ResearchSection
      icon="🎯"
      title="Key Contacts & Decision Makers"
      priority="high"
      defaultExpanded={true}
    >
      <ContactsGrid>
        {contacts.map(contact => (
          <ContactCard key={contact.id}>
            <ContactHeader>
              <Avatar src={contact.photo} name={contact.name} />
              <ContactInfo>
                <ContactName>{contact.name}</ContactName>
                <ContactTitle>{contact.title}</ContactTitle>
                <ContactDepartment>{contact.department}</ContactDepartment>
              </ContactInfo>
            </ContactHeader>

            <ContactActions>
              <ActionBtn variant="primary" icon="📧">
                Draft email
              </ActionBtn>
              <ActionBtn variant="outline" icon="🔗">
                LinkedIn
              </ActionBtn>
              <ActionBtn variant="text" icon="📋">
                Copy info
              </ActionBtn>
            </ContactActions>

            <PersonalizationPoints>
              <SectionTitle>Personalization Points:</SectionTitle>
              {contact.personalization.slice(0, 3).map((point, idx) => (
                <PersonalizationItem key={idx} icon={point.icon}>
                  {point.text}
                </PersonalizationItem>
              ))}
              <ShowMoreButton>
                + Show {contact.personalization.length - 3} more
              </ShowMoreButton>
            </PersonalizationPoints>

            <OutreachSuggestion>
              <SuggestionLabel>Suggested opening:</SuggestionLabel>
              <SuggestionText>{contact.outreachSuggestion}</SuggestionText>
              <CopyButton>Copy & customize</CopyButton>
            </OutreachSuggestion>
          </ContactCard>
        ))}
      </ContactsGrid>
    </ResearchSection>

    {/* SECTION 6: Sources (Collapsed) */}
    <ResearchSection
      icon="📚"
      title="Sources & Methodology"
      defaultExpanded={false}
    >
      <SourcesList>
        {sources.map(source => (
          <SourceItem key={source.url} href={source.url}>
            {source.title}
          </SourceItem>
        ))}
      </SourcesList>
    </ResearchSection>

    {/* Floating Action Bar */}
    <QuickActionsBar>
      <ActionBtn variant="primary" icon="📧">
        Draft Email
      </ActionBtn>
      <ActionBtn icon="📄">Export PDF</ActionBtn>
      <ActionBtn icon="📋">Copy Summary</ActionBtn>
      <ActionBtn icon="🔄">Refresh</ActionBtn>
      <ActionBtn icon="⭐">Save</ActionBtn>
    </QuickActionsBar>
  </MessageContent>
</AgentMessage>
```

**Visual Requirements:**

1. **Scannable Hierarchy:**
   - Executive summary is visually dominant (larger, boxed)
   - Signals section uses color (red/yellow) and icons
   - Section headers are bold with icons
   - White space between sections

2. **Expandable Sections:**
   - Default state: Signals, Criteria, Contacts expanded
   - Company overview, sources collapsed
   - Smooth animation on expand/collapse
   - Remember user preferences

3. **Action Buttons:**
   - Primary actions prominent (Draft Email)
   - Secondary actions available but less prominent
   - Floating action bar on scroll (sticky at bottom)

4. **Priority Visual Cues:**
   ```scss
   .priority-hot {
     border-left: 4px solid #FF4444;
     background: #FFF5F5;
   }
   
   .priority-warm {
     border-left: 4px solid #FFA500;
     background: #FFFAF0;
   }
   
   .signal-critical {
     background: #FFEBEE;
     border: 1px solid #FF4444;
   }
   ```

---

### 3.5 Profile Health: Conversational Approach

**Replace:** Persistent yellow banner blocking view
**With:** Contextual, dismissible message from agent

**When to Show:**
- On login (if <60% complete)
- After 3 researches (if <40% complete)
- Never more than once per day
- Can be permanently dismissed

**Message Format:**

```jsx
<AgentMessage type="profile_health" dismissible>
  <MessageContent>
    <WarningHeader>
      <WarningIcon>⚠️</WarningIcon>
      <WarningTitle>Profile Health Check</WarningTitle>
    </WarningHeader>

    <WarningText>
      Your profile is {profileHealth}% complete. You're missing some things 
      that would make research significantly better:
    </WarningText>

    <ImpactList>
      <ImpactItem severity="critical">
        <ImpactBadge>High Impact</ImpactBadge>
        <ImpactContent>
          <ImpactTitle>No signal tracking configured</ImpactTitle>
          <ImpactExplanation>
            I found 9 companies with recent breaches in your industry, but 
            I don't know if this matters to you. Without signal tracking:
            • You won't be alerted when accounts have incidents
            • You'll miss hot opportunities
            • No prioritization of "warm" vs "cold" leads
          </ImpactExplanation>
        </ImpactContent>
        <FixButton onClick={configureSignals}>
          Fix now (1 min)
        </FixButton>
      </ImpactItem>

      <ImpactItem severity="medium">
        <ImpactBadge>Medium Impact</ImpactBadge>
        <ImpactContent>
          <ImpactTitle>Only 2 custom criteria defined</ImpactTitle>
          <ImpactExplanation>
            Most users track 4-5 criteria. Without more criteria, research 
            is generic and you'll need to manually qualify every company.
          </ImpactExplanation>
        </ImpactContent>
        <FixButton onClick={addCriteria}>Add more</FixButton>
      </ImpactItem>
    </ImpactList>

    <DismissOptions>
      <Button variant="primary" onClick={fixAll}>
        Fix everything now (2 min)
      </Button>
      <Button variant="secondary" onClick={dismissFor30Days}>
        I'm good - don't show again
      </Button>
      <TextLink onClick={remindWeekly}>
        Remind me weekly
      </TextLink>
    </DismissOptions>
  </MessageContent>
</AgentMessage>
```

**Sidebar Health Indicator:**
```jsx
// Compact, non-intrusive in sidebar
<ProfileHealthWidget collapsed onClick={expandDetails}>
  <HealthBar value={40} severity="warning" />
  <HealthLabel>
    Profile: 40%
    {criticalItemsMissing && <AlertBadge>!</AlertBadge>}
  </HealthLabel>
  <HealthHint>Click to improve</HealthHint>
</ProfileHealthWidget>

// When expanded:
<ProfileHealthExpanded>
  <HealthHeader>
    <h4>Profile Health: 40%</h4>
    <CloseButton />
  </HealthHeader>

  <MissingItems>
    <MissingItem severity="critical">
      <Icon>🚨</Icon>
      <ItemName>Signal tracking</ItemName>
      <FixButton size="small">Fix</FixButton>
    </MissingItem>
    <MissingItem severity="important">
      <Icon>🎯</Icon>
      <ItemName>Custom criteria (3 more)</ItemName>
      <FixButton size="small">Fix</FixButton>
    </MissingItem>
  </MissingItems>

  <FixAllButton variant="primary" fullWidth>
    Complete profile (2 min)
  </FixAllButton>
</ProfileHealthExpanded>
```

---

## 4. UI/UX Component Library

### 4.1 Design System

**Colors:**
```scss
// Primary
$primary-blue: #2563EB;
$primary-blue-hover: #1D4ED8;
$primary-blue-light: #DBEAFE;

// Semantic colors
$success-green: #10B981;
$warning-yellow: #F59E0B;
$warning-yellow-bg: #FEF3C7;
$error-red: #EF4444;
$error-red-bg: #FEE2E2;

// Priority colors
$hot-red: #FF4444;
$hot-red-bg: #FFF5F5;
$warm-orange: #FFA500;
$warm-orange-bg: #FFFAF0;

// Signal severity
$critical-red: #DC2626;
$high-orange: #EA580C;
$medium-yellow: #F59E0B;
$low-gray: #6B7280;

// Neutral
$gray-50: #F9FAFB;
$gray-100: #F3F4F6;
$gray-200: #E5E7EB;
$gray-300: #D1D5DB;
$gray-600: #4B5563;
$gray-700: #374151;
$gray-900: #111827;
```

**Typography:**
```scss
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

// Headings
$h1: 32px / 1.2 / 700;
$h2: 24px / 1.3 / 600;
$h3: 20px / 1.4 / 600;
$h4: 16px / 1.5 / 600;

// Body
$body-large: 16px / 1.6 / 400;
$body: 14px / 1.5 / 400;
$body-small: 13px / 1.5 / 400;
$caption: 12px / 1.4 / 400;
```

**Spacing:**
```scss
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;
$spacing-xl: 32px;
$spacing-2xl: 48px;
```

**Shadows:**
```scss
$shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
$shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
$shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
```

**Border Radius:**
```scss
$radius-sm: 4px;
$radius-md: 8px;
$radius-lg: 12px;
$radius-xl: 16px;
```

### 4.2 Core Components

#### Button Component

```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  size: 'small' | 'medium' | 'large';
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: ReactNode;
}

// Visual specs
.button {
  font-family: $font-family;
  font-weight: 500;
  border-radius: $radius-md;
  transition: all 0.2s ease;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: $spacing-sm;
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: $shadow-md;
  }
  
  &:active {
    transform: translateY(0);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    &:hover {
      transform: none;
      box-shadow: none;
    }
  }
}

.button-primary {
  background: $primary-blue;
  color: white;
  border: none;
  padding: 10px 20px;
  
  &:hover {
    background: $primary-blue-hover;
  }
}

.button-small {
  padding: 6px 12px;
  font-size: 13px;
}

.button-large {
  padding: 14px 28px;
  font-size: 16px;
}
```

#### Badge Component

```tsx
interface BadgeProps {
  variant: 'critical' | 'important' | 'optional' | 'success' | 'warning' | 'info';
  size?: 'small' | 'medium';
  children: ReactNode;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: $radius-sm;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-critical {
  background: $error-red-bg;
  color: $error-red;
}

.badge-hot {
  background: $hot-red-bg;
  color: $hot-red;
}
```

#### Card Component

```tsx
interface CardProps {
  variant?: 'default' | 'hot' | 'warm';
  interactive?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

.card {
  background: white;
  border: 1px solid $gray-200;
  border-radius: $radius-lg;
  padding: $spacing-lg;
  box-shadow: $shadow-sm;
  
  &.interactive {
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      box-shadow: $shadow-md;
      transform: translateY(-2px);
    }
  }
}

.card-hot {
  border-left: 4px solid $hot-red;
  background: $hot-red-bg;
}

.card-warm {
  border-left: 4px solid $warm-orange;
  background: $warm-orange-bg;
}
```

#### Signal Components

```tsx
// Signal Alert Banner
.signal-alert {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  padding: $spacing-lg;
  border-radius: $radius-lg;
  background: $error-red-bg;
  border: 1px solid $error-red;
  margin-bottom: $spacing-lg;
}

.signal-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.signal-content {
  flex: 1;
}

.signal-title {
  font-size: 16px;
  font-weight: 600;
  color: $gray-900;
  margin-bottom: $spacing-xs;
}

.signal-text {
  font-size: 14px;
  color: $gray-700;
  margin-bottom: $spacing-sm;
}

.signal-action {
  margin-top: $spacing-md;
}

// Signal Timeline
.signal-timeline {
  position: relative;
  padding-left: $spacing-xl;
  
  &::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: $gray-200;
  }
}

.timeline-item {
  position: relative;
  margin-bottom: $spacing-xl;
  
  &::before {
    content: '';
    position: absolute;
    left: -$spacing-xl;
    top: 4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: $primary-blue;
    border: 2px solid white;
    box-shadow: 0 0 0 2px $gray-200;
  }
  
  &.critical::before {
    background: $critical-red;
  }
}
```

#### Expandable Section

```tsx
interface ResearchSectionProps {
  icon: string;
  title: string;
  subtitle?: string;
  priority?: 'high' | 'medium' | 'low';
  defaultExpanded?: boolean;
  children: ReactNode;
}

.research-section {
  border: 1px solid $gray-200;
  border-radius: $radius-lg;
  margin-bottom: $spacing-lg;
  overflow: hidden;
  
  &.priority-high {
    border-color: $primary-blue;
    box-shadow: 0 0 0 1px $primary-blue-light;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-lg;
  background: $gray-50;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
  
  &:hover {
    background: $gray-100;
  }
}

.section-content {
  padding: $spacing-lg;
  
  &.collapsed {
    display: none;
  }
}

.chevron-icon {
  transition: transform 0.2s ease;
  
  &.expanded {
    transform: rotate(180deg);
  }
}
```

### 4.3 Layout Components

#### Chat Area Layout

```scss
.chat-area {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 900px;
  margin: 0 auto;
  padding: $spacing-lg;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-xl;
  
  // Smooth scroll behavior
  scroll-behavior: smooth;
  
  // Hide scrollbar on modern browsers
  scrollbar-width: thin;
  scrollbar-color: $gray-300 transparent;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: $gray-300;
    border-radius: 3px;
  }
}

.message {
  margin-bottom: $spacing-xl;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.agent-message {
  max-width: 800px;
}

.user-message {
  max-width: 600px;
  margin-left: auto;
  background: $primary-blue;
  color: white;
  padding: $spacing-md $spacing-lg;
  border-radius: $radius-lg;
  border-bottom-right-radius: $radius-sm;
}

.chat-input-container {
  position: sticky;
  bottom: 0;
  background: white;
  padding-top: $spacing-lg;
  border-top: 1px solid $gray-200;
}
```

#### Sidebar Layout

```scss
.sidebar {
  width: 280px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid $gray-200;
  
  @media (max-width: 768px) {
    position: fixed;
    left: -280px;
    transition: left 0.3s ease;
    z-index: 1000;
    box-shadow: $shadow-lg;
    
    &.open {
      left: 0;
    }
  }
}

.sidebar-header {
  padding: $spacing-lg;
  border-bottom: 1px solid $gray-200;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-md;
}

.sidebar-section {
  margin-bottom: $spacing-xl;
}

.sidebar-footer {
  padding: $spacing-lg;
  border-top: 1px solid $gray-200;
}
```

---

## 5. Implementation Roadmap

### 5.1 Phase 1: Foundation (Week 1)

**Priority:** Critical path features for Cliff's workflow

**Tasks:**

1. **Proactive Dashboard Greeting**
   - [x] Create `DashboardGreeting` component (ProactiveDashboard.tsx)
   - [x] Build `/api/dashboard/greeting` endpoint (dashboard-greeting edge function)
   - [x] Implement signal aggregation logic
   - [x] Add account statistics calculation
   - [x] Test empty state (no accounts/signals) - built into component
   - [x] Test populated state (with signals) - verified via `scripts/seed-dashboard.mjs`

2. **Account Tracking Database**
   - [x] Create `tracked_accounts` table
   - [x] Create `account_signals` table
   - [x] Add indexes for performance
   - [x] Build account CRUD API endpoints (manage-accounts edge function)
   - [x] Implement CSV upload/parsing (parseAccountsCSV in accountService.ts)

3. **Conversational Onboarding - Path A**
   - [x] Create welcome message component
   - [x] Build path selection UI
   - [x] Implement "research first" flow
   - [x] Add just-in-time clarification questions (already exists in ResearchChat)
   - [x] Build NLP criteria extraction (GPT-5/5-mini integration)
   - [x] Create criteria confirmation UI

4. **Enhanced Sidebar**
   - [x] Add account list widget
   - [x] Implement signal badges on accounts
   - [x] Update profile health widget (compact version) - already improved
   - [x] Improve recent chats labels - done

**Success Criteria:**
- User can start researching immediately without forms
- Agent asks clarifying questions inline
- Natural language criteria extraction works >80% accuracy
- Profile builds progressively through usage

---

### 5.2 Phase 2: Signal System (Week 2)

**Priority:** Continuous monitoring and alerts

**Tasks:**

1. **Signal Detection Service**
   - [ ] Build `SignalMonitorService` background job
   - [ ] Implement security breach detector
   - [ ] Implement leadership change detector
   - [ ] Implement funding round detector
   - [ ] Add hiring surge detector
   - [ ] Create signal scoring algorithm
**Implementation Blueprint:**

- **[Data Model]** Reuse `tracked_accounts`, `account_signals`, `user_signal_preferences`, `user_custom_criteria` in `supabase/migrations/20251003150000_add_account_tracking.sql`; extend via migration for detector metadata (e.g., `detection_source`, `raw_payload`).
- **[Background Service]** Create `SignalMonitorService` cron runner in `supabase/functions/detect-signals/` with modular detectors under `supabase/functions/detect-signals/detectors/`; orchestrate batching, rate limiting, GPT-5 Responses calls, and persistence to `account_signals` plus `signal_activity_log` (new table).
- **[Detectors]** Implement four detectors as individual modules returning structured `DetectedSignal` objects: security breach, leadership change, funding round, hiring surge. Provide shared utilities for search queries, deduplication, severity scoring.
- **[Scoring Algorithm]** Build helper in `supabase/functions/detect-signals/lib/scoring.ts` factoring signal importance, recency, confidence, and user weightings; update trigger in `supabase/migrations` if new fields required.
- **[Configuration UI]** New React view `src/pages/SignalSettings.tsx` using existing context `ResearchEngineContext`; componentizes controls (`SignalTypeSelector`, `SignalConfigDrawer`) with `@supabase/supabase-js` client hooks to CRUD `user_signal_preferences`.
- **[Alerts Surface]** Enhance `src/pages/Dashboard.tsx` and `src/components/AccountListWidget.tsx` to surface `account_signals` badges, add `SignalBanner` component for critical alerts, integrate Toaster notifications via `ToastProvider`.
- **[Email Notifications]** Extend `supabase/functions/detect-signals/index.ts` to enqueue critical signals to a new edge function `supabase/functions/send-signal-email/` using Resend (or transactional mail) with templates stored in `supabase/templates/`.
- **[Account Portfolio]** Create responsive `AccountPortfolio.tsx` page with hot/warm/stale filters, use `listTrackedAccounts` API from `src/services/accountService.ts`, include bulk actions and CSV upload leveraging existing `parseAccountsCSV` helper.
- **[Testing & Verification]** Add seeding script `scripts/seed-signals.mjs` mirroring `seed-dashboard.mjs`, plus Playwright scenarios for signal filters and alerts in `tests/signals.spec.ts`.

**Success Criteria:**
- Background job detects signals every 6 hours
- User receives notification within 6 hours of signal
- Hot accounts appear at top of dashboard
- Can filter to see only hot accounts
---

### 5.3 Phase 3: Research UX (Week 3)

**Priority:** Make research output scannable and actionable

**Tasks:**

1. **Research Output Redesign**
   - [ ] Build executive summary card
   - [ ] Create expandable section component
   - [ ] Implement signals timeline
   - [ ] Design custom criteria grid
   - [ ] Build contact cards with personalization
   - [ ] Add floating action bar

2. **Quick Actions**
   - [ ] Draft email modal/slideout
   - [ ] PDF export functionality
   - [ ] Copy summary to clipboard
   - [ ] Refresh research
   - [ ] Save to favorites
   - [ ] Push to CRM integration

3. **Account Management Commands**
   - [ ] "Show my accounts" command
   - [ ] "Add [company] to my accounts" command
   - [ ] "Which accounts have signals" command
   - [ ] "Refresh [company]" command
   - [ ] "Upload my account list" command

4. **Profile Updates**
   - [ ] Replace banner with dismissible message
   - [ ] Implement contextual profile nudges
   - [ ] Add "Update my profile" chat command
   - [ ] Build conversational profile update flow

**Success Criteria:**
- Research results load in <2 seconds
- Signals and criteria immediately visible (no scrolling)
- Can perform any action in <3 clicks
- Profile nudges are helpful, not annoying

---

### 5.4 Phase 4: Polish & Optimization (Week 4)

**Priority:** Performance, edge cases, and refinement

**Tasks:**

1. **Performance Optimization**
   - [ ] Implement lazy loading for account lists
   - [ ] Add pagination for research history
   - [ ] Optimize signal detection queries
   - [ ] Cache frequently accessed data
   - [ ] Add loading skeletons

2. **Edge Cases**
   - [ ] Handle failed signal detection gracefully
   - [ ] Add retry logic for API failures
   - [ ] Implement rate limiting UI feedback
   - [ ] Handle empty states throughout
   - [ ] Add error boundaries

3. **Mobile Responsiveness**
   - [ ] Make sidebar collapsible on mobile
   - [ ] Optimize research output for mobile
   - [ ] Add swipe gestures for account cards
   - [ ] Test on various screen sizes

4. **Accessibility**
   - [ ] Add ARIA labels
   - [ ] Ensure keyboard navigation
   - [ ] Test with screen readers
   - [ ] Check color contrast ratios

**Success Criteria:**
- All pages load in <3 seconds
- Works on mobile devices
- Passes accessibility audit
- No critical bugs

---

## 6. Visual Testing Framework

### 6.1 Testing Methodology

**Use Puppeteer to:**
1. Navigate to each screen
2. Take screenshot
3. Compare to reference designs
4. Identify visual discrepancies
5. Log issues for fixing

### 6.2 Test Scenarios

#### Scenario 1: Dashboard Greeting

**Test:**
```typescript
async function testDashboardGreeting(page: Page) {
  // Navigate to dashboard
  await page.goto('http://localhost:3000');
  
  // Wait for greeting to load
  await page.waitForSelector('[data-testid="agent-greeting"]');
  
  // Take screenshot
  await page.screenshot({
    path: './screenshots/dashboard-greeting.png',
    fullPage: true
  });
  
  // Check critical elements exist
  const checks = {
    greeting: await page.$('[data-testid="greeting-text"]'),
    signalAlerts: await page.$('[data-testid="signal-alerts"]'),
    accountSummary: await page.$('[data-testid="account-summary"]'),
    suggestions: await page.$('[data-testid="smart-suggestions"]')
  };
  
  // Log results
  console.log('Dashboard Greeting Test:', {
    hasGreeting: !!checks.greeting,
    hasSignalAlerts: !!checks.signalAlerts,
    hasAccountSummary: !!checks.accountSummary,
    hasSuggestions: !!checks.suggestions
  });
  
  // Visual checks
  const visualIssues = [];
  
  // Check if signals are visually prominent
  const signalsSection = await page.$('[data-testid="signal-alerts"]');
  if (signalsSection) {
    const bbox = await signalsSection.boundingBox();
    if (bbox && bbox.y > 200) {
      visualIssues.push('Signal alerts should be near top of page (currently at y=' + bbox.y + ')');
    }
    
    const bgColor = await page.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    }, signalsSection);
    
    if (!bgColor.includes('255, 245, 245') && !bgColor.includes('254, 242, 242')) {
      visualIssues.push('Signal alerts should have red/pink background for visibility');
    }
  }
  
  // Check action buttons are prominent
  const primaryButton = await page.$('button[variant="primary"]');
  if (primaryButton) {
    const styles = await page.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        padding: computed.padding,
        backgroundColor: computed.backgroundColor
      };
    }, primaryButton);
    
    if (parseInt(styles.fontSize) < 14) {
      visualIssues.push('Primary buttons should be at least 14px font size');
    }
  }
  
  return {
    passed: visualIssues.length === 0,
    issues: visualIssues
  };
}
```

#### Scenario 2: Onboarding Flow

**Test:**
```typescript
async function testOnboarding(page: Page) {
  await page.goto('http://localhost:3000/onboarding');
  
  const steps = [];
  
  // Step 1: Welcome message
  await page.waitForSelector('[data-testid="welcome-message"]');
  await page.screenshot({ path: './screenshots/onboarding-welcome.png' });
  
  const hasPathOptions = await page.$('[data-testid="path-options"]');
  steps.push({
    step: 'welcome',
    hasPathOptions: !!hasPathOptions,
    hasJumpRightInOption: !!(await page.$('[data-testid="path-immediate"]')),
    hasGuidedOption: !!(await page.$('[data-testid="path-guided"]'))
  });
  
  // Click "Jump right in"
  await page.click('[data-testid="path-immediate"]');
  
  // User types "Research Boeing"
  await page.waitForSelector('[data-testid="chat-input"]');
  await page.type('[data-testid="chat-input"]', 'Research Boeing');
  await page.keyboard.press('Enter');
  
  // Wait for clarification question
  await page.waitForSelector('[data-testid="clarification-question"]', { timeout: 5000 });
  await page.screenshot({ path: './screenshots/onboarding-clarification.png' });
  
  steps.push({
    step: 'clarification',
    hasClarification: true,
    hasResearchTypeOptions: !!(await page.$('[data-testid="research-type-options"]'))
  });
  
  // Select "Deep Account Research"
  await page.click('[data-testid="type-deep"]');
  
  // Wait for custom criteria question
  await page.waitForSelector('[data-testid="custom-criteria-prompt"]', { timeout: 5000 });
  await page.screenshot({ path: './screenshots/onboarding-criteria.png' });
  
  steps.push({
    step: 'custom-criteria',
    hasCriteriaPrompt: true,
    hasTextArea: !!(await page.$('textarea[placeholder*="Example:"]')),
    hasExamples: !!(await page.$('[data-testid="criteria-examples"]'))
  });
  
  return {
    passed: steps.every(s => Object.values(s).every(v => v === true || typeof v === 'string')),
    steps: steps
  };
}
```

#### Scenario 3: Research Output

**Test:**
```typescript
async function testResearchOutput(page: Page) {
  // Navigate to a completed research
  await page.goto('http://localhost:3000/research/boeing-123');
  
  await page.waitForSelector('[data-testid="research-complete"]');
  
  // Take full page screenshot
  await page.screenshot({
    path: './screenshots/research-output-full.png',
    fullPage: true
  });
  
  const sections = {
    executiveSummary: await page.$('[data-testid="executive-summary"]'),
    signals: await page.$('[data-testid="signals-section"]'),
    customCriteria: await page.$('[data-testid="criteria-section"]'),
    contacts: await page.$('[data-testid="contacts-section"]')
  };
  
  const visualChecks = [];
  
  // Check executive summary is prominent
  if (sections.executiveSummary) {
    const bbox = await sections.executiveSummary.boundingBox();
    const styles = await page.evaluate((el) => {
      return {
        fontSize: window.getComputedStyle(el.querySelector('h3')).fontSize,
        border: window.getComputedStyle(el).border,
        boxShadow: window.getComputedStyle(el).boxShadow
      };
    }, sections.executiveSummary);
    
    if (styles.boxShadow === 'none') {
      visualChecks.push('Executive summary should have box shadow for prominence');
    }
  }
  
  // Check signals use color coding
  if (sections.signals) {
    const criticalSignals = await page.$$('[data-severity="critical"]');
    if (criticalSignals.length > 0) {
      const bgColor = await page.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      }, criticalSignals[0]);
      
      if (!bgColor.includes('255') || !bgColor.includes('235')) {
        visualChecks.push('Critical signals should have red background');
      }
    }
  }
  
  // Check action buttons are visible
  const actionBar = await page.$('[data-testid="quick-actions-bar"]');
  if (actionBar) {
    const isVisible = await page.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }, actionBar);
    
    if (!isVisible) {
      visualChecks.push('Action bar should be visible without scrolling');
    }
  }
  
  // Check expandable sections
  const collapsedSections = await page.$$('[data-testid="research-section"][data-expanded="false"]');
  const expandedSections = await page.$$('[data-testid="research-section"][data-expanded="true"]');
  
  visualChecks.push({
    info: `Found ${expandedSections.length} expanded, ${collapsedSections.length} collapsed sections`,
    expected: 'Signals, Criteria, Contacts should be expanded by default'
  });
  
  return {
    passed: visualChecks.filter(c => typeof c === 'string').length === 0,
    sections: Object.keys(sections).filter(k => sections[k]),
    issues: visualChecks.filter(c => typeof c === 'string')
  };
}
```

#### Scenario 4: Account Dashboard

**Test:**
```typescript
async function testAccountDashboard(page: Page) {
  // Trigger "Show my accounts" command
  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-testid="chat-input"]');
  await page.type('[data-testid="chat-input"]', 'Show my accounts');
  await page.keyboard.press('Enter');
  
  // Wait for dashboard to render in chat
  await page.waitForSelector('[data-testid="account-dashboard"]', { timeout: 5000 });
  
  await page.screenshot({
    path: './screenshots/account-dashboard.png',
    fullPage: true
  });
  
  const checks = {
    hasFilterChips: !!(await page.$('[data-testid="filter-chips"]')),
    hasAccountCards: (await page.$$('[data-testid="account-card"]')).length > 0,
    hasBulkActions: !!(await page.$('[data-testid="bulk-actions"]'))
  };
  
  // Check hot accounts have visual priority
  const hotAccounts = await page.$$('[data-priority="hot"]');
  if (hotAccounts.length > 0) {
    const firstHotAccount = hotAccounts[0];
    const styles = await page.evaluate((el) => {
      return {
        borderLeft: window.getComputedStyle(el).borderLeftWidth,
        background: window.getComputedStyle(el).backgroundColor
      };
    }, firstHotAccount);
    
    if (parseInt(styles.borderLeft) < 3) {
      checks['hotAccountBorderIssue'] = 'Hot accounts should have thick left border';
    }
  }
  
  // Check signal badges are visible
  const signalBadges = await page.$$('[data-testid="signal-badge"]');
  if (signalBadges.length > 0) {
    const firstBadge = signalBadges[0];
    const isVisible = await page.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && computed.display !== 'none';
    }, firstBadge);
    
    checks['signalBadgesVisible'] = isVisible;
  }
  
  return checks;
}
```

### 6.3 Running Tests

**Test Runner Script:**

```typescript
// test-runner.ts
import puppeteer from 'puppeteer';

async function runAllTests() {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100 // Slow down for observation
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  const results = [];
  
  console.log('🧪 Running visual tests...\n');
  
  // Test 1: Dashboard
  console.log('📊 Testing Dashboard Greeting...');
  const dashboardResult = await testDashboardGreeting(page);
  results.push({ test: 'Dashboard', ...dashboardResult });
  console.log(dashboardResult.passed ? '✅ PASSED' : '❌ FAILED');
  if (!dashboardResult.passed) {
    console.log('Issues:', dashboardResult.issues);
  }
  console.log('');
  
  // Test 2: Onboarding
  console.log('👋 Testing Onboarding Flow...');
  const onboardingResult = await testOnboarding(page);
  results.push({ test: 'Onboarding', ...onboardingResult });
  console.log(onboardingResult.passed ? '✅ PASSED' : '❌ FAILED');
  console.log('');
  
  // Test 3: Research Output
  console.log('📄 Testing Research Output...');
  const researchResult = await testResearchOutput(page);
  results.push({ test: 'Research Output', ...researchResult });
  console.log(researchResult.passed ? '✅ PASSED' : '❌ FAILED');
  if (!researchResult.passed) {
    console.log('Issues:', researchResult.issues);
  }
  console.log('');
  
  // Test 4: Account Dashboard
  console.log('📂 Testing Account Dashboard...');
  const accountResult = await testAccountDashboard(page);
  results.push({ test: 'Account Dashboard', ...accountResult });
  console.log('');
  
  // Summary
  console.log('═══════════════════════════════════');
  console.log('TEST SUMMARY');
  console.log('═══════════════════════════════════');
  const passed = results.filter(r => r.passed !== false).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);
  console.log('');
  
  // Detailed results
  results.forEach(result => {
    console.log(`\n${result.test}:`);
    console.log(JSON.stringify(result, null, 2));
  });
  
  await browser.close();
  
  return results;
}

runAllTests().catch(console.error);
```

---

## 7. Gap Identification Process

### 7.1 Visual Gap Checklist

After implementing each feature, run through this checklist:

#### Dashboard Greeting

- [ ] **Prominence**: Are signals the FIRST thing you see?
- [ ] **Color**: Do hot signals use red/orange backgrounds?
- [ ] **Actions**: Can you act on signals without scrolling?
- [ ] **Hierarchy**: Is visual hierarchy clear (signals > summary > suggestions)?
- [ ] **Empty State**: If no signals, does it still feel useful?
- [ ] **Loading**: Are loading states smooth (skeletons, not spinners)?

#### Onboarding

- [ ] **Immediate Value**: Can user research without any setup?
- [ ] **Clarity**: Are questions easy to understand?
- [ ] **Examples**: Do examples help user understand what to input?
- [ ] **Natural Language**: Does criteria input accept conversational text?
- [ ] **Confirmation**: Does agent confirm understanding before proceeding?
- [ ] **Progress**: Does user know how far through setup they are?

#### Account Management

- [ ] **Visibility**: Are tracked accounts easy to access (sidebar)?
- [ ] **Signals**: Do signal badges stand out visually?
- [ ] **Filtering**: Can user quickly see hot accounts?
- [ ] **Actions**: Are common actions (refresh, research) one click away?
- [ ] **Bulk Operations**: Can user operate on multiple accounts at once?
- [ ] **Status**: Is it clear when account was last researched?

#### Research Output

- [ ] **Scannability**: Can user grasp key points in 5 seconds?
- [ ] **Priority**: Are signals and criteria more prominent than overview?
- [ ] **Actions**: Are next steps obvious (email contact, export, etc.)?
- [ ] **Expandable**: Do sections expand/collapse smoothly?
- [ ] **Mobile**: Does it work on mobile devices?
- [ ] **Loading**: Does research appear progressively (not all at once)?

#### Profile Health

- [ ] **Non-Intrusive**: Is profile health visible but not blocking?
- [ ] **Impact-Driven**: Does it explain WHY completion matters?
- [ ] **Dismissible**: Can user dismiss permanently if desired?
- [ ] **Contextual**: Does it appear at right moments (not constantly)?
- [ ] **Actionable**: Can user fix issues without leaving chat?

### 7.2 Functional Gap Checklist

#### Core Workflows

**Cliff's AE Workflow:**
- [ ] Upload 15 accounts → All tracked and monitoring
- [ ] Get daily briefing → Shows signals from accounts
- [ ] Research specific account → Deep dive with custom criteria
- [ ] Draft outreach → Generate email from research
- [ ] Batch refresh → Update all 15 accounts at once
- [ ] Export reports → Download all as PDFs

**BDR Prospecting Workflow:**
- [ ] Smart search → "Find 20 companies with breaches"
- [ ] Get results → Sorted by signal score
- [ ] Review qualification → See custom criteria met/not met
- [ ] Export to CRM → Push to HubSpot with data
- [ ] Build sequence → Create outreach campaign

#### Edge Cases

- [ ] **No accounts configured**: Graceful empty state with clear CTAs
- [ ] **No signals found**: Explain why and offer to adjust sensitivity
- [ ] **Signal detection fails**: Retry automatically, show partial results
- [ ] **Research timeout**: Cancel gracefully, refund credits
- [ ] **Invalid custom criteria**: Ask for clarification, provide examples
- [ ] **Duplicate accounts**: Detect and merge automatically
- [ ] **Offline mode**: Show cached data, explain can't refresh

#### Performance

- [ ] **Dashboard loads**: <2 seconds
- [ ] **Account list loads**: <1 second (with lazy loading)
- [ ] **Research completes**: <3 minutes for deep research
- [ ] **Signal detection**: Runs every 6 hours without user action
- [ ] **Batch operations**: Shows progress, doesn't block UI
- [ ] **Mobile performance**: Smooth on 3G connection

### 7.3 Usability Gap Checklist

**Run User Testing Scenarios:**

#### Scenario 1: New User (No Setup)
```
Task: "Research a company without filling out any forms"

Expected Flow:
1. User types "Research Boeing"
2. Agent asks 1-2 clarifying questions inline
3. Research completes with results
4. Agent proactively offers to save criteria

Pass Criteria:
- User never sees a "Complete your profile first" blocker
- User gets results within 5 minutes
- Agent learns from interaction

Red Flags:
- Forced through multi-step wizard
- Can't proceed without completing forms
- Technical jargon or JSON shown
```

#### Scenario 2: AE Managing Accounts
```
Task: "Track 15 accounts and get alerts when something changes"

Expected Flow:
1. User uploads CSV of 15 accounts
2. Agent confirms upload and offers to research or monitor
3. User selects "monitor only"
4. Agent configures signal tracking
5. Next login: Dashboard shows "2 new signals on your accounts"

Pass Criteria:
- CSV upload works with just company names
- User can choose to research later
- Signals appear on next login
- Clear next actions suggested

Red Flags:
- Forced to research immediately
- No way to see which accounts have signals
- Signals buried in chat history
```

#### Scenario 3: Quick Decision Making
```
Task: "Decide which of 5 accounts to prioritize this week"

Expected Flow:
1. User asks "Which of my accounts should I focus on?"
2. Agent shows accounts sorted by signal score
3. User clicks account to see details
4. Agent suggests outreach based on signals
5. User drafts email directly from research

Pass Criteria:
- Can see prioritization at a glance
- Signals clearly explain priority
- Can drill into details easily
- Actions are one click away

Red Flags:
- All accounts look equally important
- Need to research each one to understand priority
- Actions require multiple clicks
```

---

## 8. Iteration Protocol

### 8.1 Daily Iteration Cycle

**Step 1: Visual Inspection (Morning)**
```
1. Open application in browser
2. Navigate through each major screen:
   - Dashboard greeting
   - Account list
   - Research output
   - Profile settings
3. Take notes on visual issues:
   - Colors off
   - Spacing inconsistent
   - Elements misaligned
   - Text truncated
   - Icons missing
4. Create issue list prioritized by severity
```

**Step 2: Functional Testing (Morning)**
```
1. Test each workflow end-to-end:
   - Upload accounts → See in list
   - Research company → Get results
   - Configure signals → Receive alerts
   - Update profile → Changes saved
2. Note broken functionality:
   - Buttons not working
   - Data not loading
   - Errors displayed
   - Features missing
3. Add to issue list (bugs take priority over cosmetic)
```

**Step 3: Fix Issues (Afternoon)**
```
1. Start with P0 (blockers):
   - Anything preventing core workflow
   - Data not loading
   - Critical features broken
   
2. Then P1 (major issues):
   - Visual hierarchy wrong
   - Confusing UX
   - Performance problems
   
3. Then P2 (polish):
   - Color adjustments
   - Spacing fixes
   - Loading states
   
4. Document changes made
```

**Step 4: Test Fixes (End of Day)**
```
1. Re-test each fixed issue
2. Check for regressions
3. Update issue tracking
4. Note items for next day
```

### 8.2 Weekly Iteration Cycle

**Monday: Plan**
- Review previous week's progress
- Identify biggest gaps remaining
- Prioritize week's work
- Set specific deliverables

**Tuesday-Thursday: Build & Test**
- Implement features
- Run visual tests
- Fix identified issues
- Document progress

**Friday: Review & Refine**
- Run full test suite
- User scenario walkthroughs
- Performance check
- Plan next week

### 8.3 Issue Tracking Template

```markdown
## Issue #[number]: [Title]

**Priority:** P0 | P1 | P2
**Type:** Bug | Enhancement | Visual | Performance
**Component:** Dashboard | Onboarding | Research | Accounts | Sidebar
**Status:** Open | In Progress | Testing | Closed

### Description
[What's wrong or missing?]

### Expected Behavior
[What should happen?]

### Current Behavior
[What actually happens?]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Observe issue]

### Visual Reference
[Screenshot or mockup]

### Proposed Solution
[How to fix it]

### Testing Checklist
- [ ] Fix implemented
- [ ] Visual test passed
- [ ] Functional test passed
- [ ] No regressions introduced
- [ ] Mobile tested (if applicable)

### Notes
[Additional context]
```

### 8.4 Quality Gates

**Before considering a feature "done":**

#### Visual Quality Gate
- [ ] Matches design specifications
- [ ] Consistent with design system
- [ ] Proper spacing and alignment
- [ ] Correct colors and typography
- [ ] Smooth animations
- [ ] Looks good on mobile
- [ ] Screenshots match mockups

#### Functional Quality Gate
- [ ] Core functionality works end-to-end
- [ ] Edge cases handled gracefully
- [ ] Error states display properly
- [ ] Loading states implemented
- [ ] Data persists correctly
- [ ] No console errors
- [ ] Performance acceptable (<3s load)

#### UX Quality Gate
- [ ] Workflow feels natural
- [ ] Actions require minimal clicks
- [ ] User knows what to do next
- [ ] Error messages are helpful
- [ ] Success states are clear
- [ ] Tooltips/help text where needed
- [ ] Keyboard navigation works

#### Code Quality Gate
- [ ] TypeScript types defined
- [ ] Components are reusable
- [ ] No hardcoded values
- [ ] Comments explain complex logic
- [ ] Follows project conventions
- [ ] No duplicate code
- [ ] Git commits are logical

---

## 9. Success Metrics

### 9.1 User Experience Metrics

**Primary:**
- Time to first research: <2 minutes from signup
- Time to complete profile: <5 minutes (if they choose guided setup)
- Research quality score: >4.5/5 (user rating)
- Feature discoverability: >80% find key features without help

**Secondary:**
- Time to draft email: <30 seconds from research completion
- Account tracking adoption: >70% of users track accounts
- Signal engagement: >60% click on signal alerts
- Batch research usage: >40% of AEs use bulk research

### 9.2 Business Metrics

**Activation:**
- % of users who complete 1st research: >80%
- % of users who configure custom criteria: >60%
- % of users who set up signal tracking: >50%
- % of users who track accounts: >40%

**Retention:**
- Day 7 retention: >60%
- Day 30 retention: >40%
- Weekly active usage: >70% of activated users
- Monthly research volume: >10 per active user

**Efficiency:**
- Time saved vs ChatGPT: >45 minutes per deep research
- Credits per research: <40 credits average
- Signal detection accuracy: >85%
- Custom criteria extraction accuracy: >80%

### 9.3 Technical Metrics

**Performance:**
- Dashboard load time: <2s
- Research completion time: <3 min
- Signal detection frequency: Every 6 hours
- API response time p95: <500ms
- Error rate: <1%

**Reliability:**
- Uptime: >99.5%
- Signal detection success rate: >95%
- Data accuracy: >95%
- Background job success rate: >98%

---

## 10. Reference Implementation Examples

### 10.1 Complete Component Example

**Executive Summary Card:**

```tsx
// components/research/ExecutiveSummaryCard.tsx
import React from 'react';
import { Card, Badge, MetricCard, Button } from '@/components/ui';
import { CompanyData, SignalScore } from '@/types';

interface ExecutiveSummaryCardProps {
  company: CompanyData;
  icpFit: number;
  signalScore: number;
  criteriaMatch: { met: number; total: number };
  keyInsight: string;
  recommendedAction: string;
  onDraftEmail: () => void;
}

export function ExecutiveSummaryCard({
  company,
  icpFit,
  signalScore,
  criteriaMatch,
  keyInsight,
  recommendedAction,
  onDraftEmail
}: ExecutiveSummaryCardProps) {
  const priority = calculatePriority(signalScore);
  
  return (
    <Card variant={priority === 'hot' ? 'hot' : 'default'} className="mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          {company.logo && (
            <img 
              src={company.logo} 
              alt={company.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
          )}
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {company.name}
            </h2>
            <p className="text-sm text-gray-600">
              {company.industry} • {company.employeeCount?.toLocaleString()} employees
            </p>
          </div>
        </div>
        
        <Badge 
          variant={priority === 'hot' ? 'danger' : 'warning'}
          size="large"
        >
          {priority === 'hot' ? '🔥 HOT LEAD' : '⚡ WARM LEAD'}
        </Badge>
      </div>

      {/* Key Insight */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-6">
        <p className="text-base leading-relaxed text-gray-900">
          {keyInsight}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="ICP Fit"
          value={`${icpFit}/100`}
          status={getMetricStatus(icpFit)}
          tooltip="How well this company matches your ideal customer profile"
        />
        <MetricCard
          label="Signal Strength"
          value={`${signalScore}/100`}
          status={getSignalStatus(signalScore)}
          tooltip="Recent events indicating buying opportunity"
        />
        <MetricCard
          label="Timing"
          value={getTimingLabel(signalScore)}
          status={signalScore >= 70 ? 'good' : 'neutral'}
          tooltip="Based on recency and importance of signals"
        />
        <MetricCard
          label="Criteria Match"
          value={`${criteriaMatch.met}/${criteriaMatch.total}`}
          status={criteriaMatch.met >= criteriaMatch.total * 0.8 ? 'good' : 'neutral'}
          tooltip="Your custom qualifying criteria found"
        />
      </div>

      {/* Recommended Action */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700 mb-1">
              Next Step:
            </p>
            <p className="text-sm text-gray-900 mb-3">
              {recommendedAction}
            </p>
          </div>
          <Button 
            variant="primary" 
            icon="📧"
            onClick={onDraftEmail}
          >
            Draft outreach message
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Helper functions
function calculatePriority(signalScore: number): 'hot' | 'warm' | 'standard' {
  if (signalScore >= 80) return 'hot';
  if (signalScore >= 60) return 'warm';
  return 'standard';
}

function getMetricStatus(score: number): 'excellent' | 'good' | 'neutral' | 'poor' {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'neutral';
  return 'poor';
}

function getSignalStatus(score: number): 'hot' | 'warm' | 'neutral' {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  return 'neutral';
}

function getTimingLabel(signalScore: number): string {
  if (signalScore >= 80) return 'Excellent';
  if (signalScore >= 60) return 'Good';
  return 'Standard';
}
```

### 10.2 Complete API Endpoint Example

**Dashboard Greeting Endpoint:**

```typescript
// app/api/dashboard/greeting/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database';

export async function GET(req: NextRequest) {
  // Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const userId = session.user.id;
  
  try {
    // Get user context
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        companyProfile: true,
        customCriteria: true,
        signalPreferences: true,
        trackedAccounts: {
          include: {
            latestResearch: true,
            recentSignals: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                },
                viewed: false
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Calculate account statistics
    const accountStats = {
      total: user.trackedAccounts.length,
      hot: user.trackedAccounts.filter(a => {
        const signalScore = calculateSignalScore(a.recentSignals);
        return signalScore >= 80;
      }).length,
      stale: user.trackedAccounts.filter(a => {
        if (!a.latestResearch?.createdAt) return true;
        const daysSinceResearch = Math.floor(
          (Date.now() - a.latestResearch.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceResearch > 14;
      }).length,
      researched: user.trackedAccounts.filter(a => !!a.latestResearch).length
    };
    
    // Get all unviewed signals across accounts
    const allSignals = user.trackedAccounts
      .flatMap(account => 
        account.recentSignals.map(signal => ({
          ...signal,
          companyName: account.companyName,
          companyId: account.id
        }))
      )
      .sort((a, b) => {
        // Sort by severity then recency
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, 5); // Top 5 most important
    
    // Generate smart suggestions based on context
    const suggestions = generateSmartSuggestions(user, accountStats, allSignals);
    
    // Determine greeting based on time of day
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    
    const response = {
      greeting: {
        timeOfDay,
        userName: user.firstName || 'there'
      },
      signals: allSignals.map(signal => ({
        id: signal.id,
        company: signal.companyName,
        companyId: signal.companyId,
        type: signal.type,
        severity: signal.severity,
        description: signal.description,
        date: signal.date,
        daysAgo: Math.floor((Date.now() - signal.date.getTime()) / (1000 * 60 * 60 * 24)),
        sourceUrl: signal.sourceUrl
      })),
      accountStats,
      suggestions,
      userContext: {
        firstName: user.firstName,
        role: user.companyProfile?.userRole,
        industry: user.companyProfile?.industry,
        accountsConfigured: user.trackedAccounts.length > 0,
        signalsConfigured: user.signalPreferences.length > 0,
        customCriteriaConfigured: user.customCriteria.length > 0,
        profileHealth: calculateProfileHealth(user)
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Dashboard greeting error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}

function calculateSignalScore(signals: any[]): number {
  if (signals.length === 0) return 0;
  
  let score = 0;
  const now = Date.now();
  
  for (const signal of signals) {
    // Base points by importance
    const importancePoints = {
      critical: 30,
      important: 20,
      nice_to_have: 10
    };
    let points = importancePoints[signal.importance] || 10;
    
    // Recency multiplier
    const daysAgo = Math.floor((now - signal.date.getTime()) / (1000 * 60 * 60 * 24));
    let recencyMultiplier = 1.0;
    if (daysAgo <= 7) recencyMultiplier = 2.0;
    else if (daysAgo <= 30) recencyMultiplier = 1.5;
    else if (daysAgo <= 90) recencyMultiplier = 1.0;
    else recencyMultiplier = 0.5;
    
    score += points * recencyMultiplier;
  }
  
  return Math.min(Math.round(score), 100);
}

function generateSmartSuggestions(user: any, stats: any, signals: any[]): string[] {
  const suggestions = [];
  
  if (signals.length > 0) {
    suggestions.push(`Which of my accounts had changes this week?`);
    suggestions.push(`Research ${signals[0].company} and show me what changed`);
  }
  
  if (stats.stale > 0) {
    suggestions.push(`Which accounts haven't been updated in 2+ weeks?`);
  }
  
  if (stats.total >= 5) {
    suggestions.push(`Research my top 5 accounts and make a presentation`);
  }
  
  if (user.companyProfile?.industry) {
    suggestions.push(`Show me all accounts with security incidents in the last 90 days`);
  }
  
  // Default fallbacks
  if (suggestions.length < 3) {
    suggestions.push(`Tell me about my account portfolio`);
    suggestions.push(`Find companies similar to my tracked accounts`);
  }
  
  return suggestions.slice(0, 3);
}

function calculateProfileHealth(user: any): number {
  let score = 0;
  
  if (user.companyProfile?.userRole) score += 10;
  if (user.companyProfile?.industry) score += 10;
  if (user.companyProfile?.icpDefinition) score += 10;
  if (user.customCriteria.length > 0) score += 30;
  if (user.signalPreferences.length > 0) score += 30;
  if (user.trackedAccounts.length > 0) score += 10;
  
  return score;
}
```

---

## 11. Final Checklist

Before considering the platform at 110% value:

### Core Features
- [ ] Proactive dashboard greeting with signal alerts
- [ ] Conversational onboarding (immediate usage path)
- [ ] Natural language profile building
- [ ] Account tracking with CSV upload
- [ ] Signal monitoring (background job every 6 hours)
- [ ] Enhanced research output (scannable, actionable)
- [ ] Account dashboard with filtering
- [ ] Batch research operations
- [ ] Email draft generation
- [ ] Export functionality (PDF, CSV)

### User Experience
- [ ] <2 second dashboard load time
- [ ] <5 minute onboarding (if guided)
- [ ] <3 clicks to any major action
- [ ] Mobile responsive
- [ ] Smooth animations and transitions
- [ ] Clear error messages
- [ ] Helpful empty states
- [ ] Loading states throughout

### Visual Polish
- [ ] Consistent design system
- [ ] Proper color usage (signals = red/orange)
- [ ] Good typography hierarchy
- [ ] Appropriate spacing
- [ ] Icons throughout
- [ ] Box shadows for depth
- [ ] Hover states on interactive elements

### Agentic Behavior
- [ ] Agent greets proactively
- [ ] Agent suggests next actions
- [ ] Agent learns from usage
- [ ] Agent monitors in background
- [ ] Agent asks clarifying questions inline
- [ ] Agent confirms understanding
- [ ] Agent explains impact of missing data

### Edge Cases
- [ ] No accounts configured → Clear CTA
- [ ] No signals found → Explanation + adjust option
- [ ] Profile incomplete → Contextual nudges
- [ ] Research fails → Graceful error + retry
- [ ] Slow network → Progressive loading
- [ ] Mobile device → Adapted layout

### Documentation
- [ ] README with setup instructions
- [ ] Component documentation
- [ ] API endpoint documentation
- [ ] Database schema documented
- [ ] Deployment guide
- [ ] Troubleshooting guide

---

## 12. Getting Started

**For the coding agent to begin:**

1. **Read this entire document** to understand the vision
2. **Run visual tests** to establish baseline
3. **Start with Phase 1** (Foundation) from Implementation Roadmap
4. **Test after each feature** using Visual Testing Framework
5. **Identify gaps** using Gap Identification Process
6. **Iterate daily** using Iteration Protocol
7. **Move to next phase** only when quality gates passed

**First task:** Implement Proactive Dashboard Greeting (Section 3.1)

**Success indicator:** User logs in and immediately sees actionable signal alerts, not an empty "Ask me anything" screen.

---

**END OF DOCUMENT**

This guide should give you everything needed to transform the platform into a best-in-class agentic research tool. Focus on making it feel like an intelligent assistant, not a form-based application. The agent should be proactive, conversational, and continuously learning.