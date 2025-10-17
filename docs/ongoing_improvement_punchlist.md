# Improvement Punchlist
This document will serve as a living document to track and prioritize potential improvements to the Research Agent Platform.

## 🚀 PRIORITY 1: Proactive Meeting Intelligence System

### Overview

**The Killer Feature:** Automatically research upcoming meetings and deliver bulletproof prep documents before every call, eliminating the 45+ minutes typically spent on pre-call research.

**Value Proposition:** "I never walk into a meeting unprepared anymore. Every morning, I have perfect prep docs for today's meetings - all the research done, all the context pulled, personalized talking points ready. It's like having a research team working for me 24/7."

**User Impact:**
- Saves 30-60 minutes per meeting in research time
- Never miss important context (past conversations, recent signals, key people)
- Walk into every call with confidence and specific talking points
- Proactive rather than reactive - system does the work

---

### Feature Components

#### 1. Calendar Integration (Automatic Sync)

**Supported Calendar Systems:**
- Google Calendar (OAuth 2.0)
- Microsoft Outlook/Office 365 (OAuth 2.0)
- Apple Calendar (via Google/Outlook sync)

**Implementation Tasks:**

##### A. OAuth Setup & Authentication
- [ ] Register OAuth apps with Google and Microsoft
- [ ] Implement OAuth flow with PKCE for security
- [ ] Store encrypted refresh tokens for ongoing access
- [ ] Handle token refresh automatically
- [ ] Build calendar disconnect/reconnect flow
- [ ] Add calendar permissions explanation screen
- [ ] Implement OAuth error handling (denied access, expired tokens)

##### B. Meeting Detection Service
- [ ] Create background job to poll calendars every 15 minutes
- [ ] Parse calendar events into structured meeting data
- [ ] Detect external meetings (attendees outside user's company domain)
- [ ] Extract company names from meeting titles and attendee domains
- [ ] Classify meeting types (discovery, demo, negotiation, check-in, renewal)
- [ ] Calculate meeting priority (high/medium/low) based on timing and type
- [ ] Filter out internal meetings, personal events, all-day events
- [ ] Handle recurring meetings intelligently

##### C. Meeting Context Aggregation
- [ ] Integrate with CRM (Salesforce, HubSpot) to pull account data
- [ ] Search email history for past correspondence with attendees
- [ ] Find previous meetings with same company/people
- [ ] Retrieve latest research on the company (if exists)
- [ ] Pull notes from tracked accounts
- [ ] Aggregate all context before generating prep

##### D. Intelligent Research Strategy
- [ ] Build research strategy engine that adapts to meeting type
- [ ] Define focus areas for each meeting type
- [ ] Determine research depth (quick/standard/deep) based on context
- [ ] Select appropriate sections to include in prep doc
- [ ] Handle follow-up meetings differently (focus on "what changed")

##### E. Meeting Prep Generation
- [ ] Create meeting prep document generator
- [ ] Build High Level summary generation (1 sentence + 3-5 key bullets)
- [ ] Generate relationship context from past interactions
- [ ] Summarize recent developments (signals, news, changes)
- [ ] Create attendee intelligence profiles with personalization
- [ ] Generate meeting strategy (objectives, questions, objection handling)
- [ ] Build quick reference cheat sheet
- [ ] Generate post-meeting action items

##### F. Smart Delivery System
- [ ] Build delivery scheduling system based on preferences
- [ ] Implement "night before" delivery (6pm in meeting timezone)
- [ ] Implement "morning of" delivery (7am in meeting timezone)
- [ ] Handle urgent meetings (<2 hours away) with immediate delivery
- [ ] Create daily digest format for users with many meetings
- [ ] Email template for meeting prep
- [ ] Slack integration for prep notifications
- [ ] In-app notification system
- [ ] PDF generation for attachments

##### G. Post-Meeting Feedback
- [ ] Build post-meeting feedback capture form
- [ ] Capture meeting outcome (excellent/good/neutral/poor/cancelled)
- [ ] Collect feedback on prep quality (1-5 rating)
- [ ] Ask what was helpful and what was missing
- [ ] Capture meeting notes and next steps
- [ ] Update CRM with meeting outcome
- [ ] Learn from feedback to improve future preps

---

#### 2. Manual Upload Options (Enterprise/Privacy-Conscious Users)

**Upload Methods:**
- CSV file upload (batch)
- ICS/iCal file upload (exported from calendar)
- Manual single meeting entry (ad-hoc)
- Email forwarding (convenience)

**Implementation Tasks:**

##### A. CSV Upload System
- [ ] Create CSV upload interface with drag-and-drop
- [ ] Build CSV parser with validation
- [ ] Generate downloadable CSV template with examples
- [ ] Support flexible column mapping (detect field names)
- [ ] Handle various date/time formats
- [ ] Validate required fields (minimum: company, date, time)
- [ ] Preview parsed meetings before processing
- [ ] Show validation errors with specific row numbers
- [ ] Allow user to fix errors before proceeding
- [ ] Support up to 50 meetings per upload
- [ ] Show estimated credit cost before processing

**CSV Template Format:**
```csv
Meeting Title,Date,Time,Timezone,Company,Attendee Emails,Meeting Type,Meeting Link,Notes
Discovery Call with Boeing,2024-11-20,14:00,PST,Boeing,"james.chen@boeing.com,sarah.martinez@boeing.com",discovery,https://zoom.us/j/123,First call with CISO
Demo: Acme Corp,2024-11-21,10:00,EST,Acme Corp,john.doe@acme.com,demo,https://meet.google.com/xyz,Follow-up from discovery
```

##### B. ICS/iCal File Upload
- [ ] Build ICS file parser (support iCalendar standard)
- [ ] Extract all event fields (summary, dates, attendees, location, description)
- [ ] Handle timezone conversions properly
- [ ] Parse attendee information (email, name, role)
- [ ] Show preview of all events in file
- [ ] Add filtering options (external only, date range, etc.)
- [ ] Allow selective meeting research (checkboxes)
- [ ] Provide "Export from Calendar" instructions for each platform
- [ ] Handle large calendar files efficiently
- [ ] Support multiple calendar exports in one session

##### C. Manual Single Meeting Entry
- [ ] Build manual meeting entry form
- [ ] Add company name autocomplete with suggestions
- [ ] Date/time picker with timezone support
- [ ] Meeting type dropdown (discovery, demo, negotiation, etc.)
- [ ] Email tag input for attendees
- [ ] Free-form context text area
- [ ] Meeting link input (Zoom, Google Meet, etc.)
- [ ] Show estimated credit cost
- [ ] Immediate prep generation option
- [ ] Save as draft for later

##### D. Email Forwarding System
- [ ] Generate unique email address per user (e.g., cliff.userid@meetings.app.com)
- [ ] Set up email receiving infrastructure (SendGrid, Mailgun, or custom)
- [ ] Parse incoming emails for .ics attachments
- [ ] Extract meeting details from calendar invites
- [ ] Send confirmation email to user
- [ ] Handle errors gracefully (no attachment, invalid format)
- [ ] Create vCard download for easy contact saving
- [ ] Build testing interface for email forwarding

##### E. Company Name Extraction
- [ ] Build multi-strategy company extraction:
  - Check tracked accounts first
  - Extract from attendee email domains
  - Parse meeting title with regex patterns
  - Use GPT to extract from title + description
  - Fall back to user confirmation
- [ ] Domain-to-company name mapping service
- [ ] Filter common domains (gmail.com, yahoo.com, etc.)
- [ ] Assign confidence scores to extractions
- [ ] Build company confirmation UI for low-confidence extractions
- [ ] Allow user to edit/correct company names
- [ ] Learn from corrections to improve extraction

##### F. Recurring Upload Workflow
- [ ] Build recurring reminder scheduling system
- [ ] Support weekly, bi-weekly, monthly reminders
- [ ] Multi-channel reminders (email, Slack, in-app)
- [ ] Customizable reminder timing
- [ ] Track reminder engagement
- [ ] One-click disable for reminders
- [ ] Show upload history and frequency

##### G. Upload Method Comparison
- [ ] Build comparison page showing all methods
- [ ] Highlight pros/cons of each approach
- [ ] Show recommended method based on user needs
- [ ] Allow users to enable multiple methods
- [ ] Track which methods are most popular

---

### Database Schema

```sql
-- Calendar connections
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider VARCHAR(20) NOT NULL, -- 'google' | 'microsoft'
  provider_calendar_id VARCHAR(255), -- Their calendar ID in provider system
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT NOT NULL, -- Encrypted
  token_expires_at TIMESTAMP,
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  sync_errors JSONB, -- Track any sync issues
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_provider (user_id, provider),
  INDEX idx_next_sync (last_sync_at, sync_enabled)
);

-- Detected meetings from calendar or uploads
CREATE TABLE detected_meetings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  source VARCHAR(20) NOT NULL, -- 'calendar_sync' | 'csv_upload' | 'ics_upload' | 'manual_entry' | 'email_forward'
  source_id VARCHAR(255), -- Calendar event ID or upload batch ID
  
  -- Meeting details
  title VARCHAR(500),
  company_name VARCHAR(255),
  company_extracted_confidence VARCHAR(10), -- 'high' | 'medium' | 'low'
  company_confirmed BOOLEAN DEFAULT FALSE,
  meeting_datetime TIMESTAMP NOT NULL,
  meeting_end_datetime TIMESTAMP,
  timezone VARCHAR(50),
  location TEXT, -- Zoom link, room, etc.
  description TEXT,
  
  -- Attendees
  organizer_email VARCHAR(255),
  organizer_name VARCHAR(255),
  attendees JSONB, -- Array of {email, name, domain, isExternal}
  
  -- Classification
  is_external BOOLEAN DEFAULT FALSE,
  meeting_type VARCHAR(20), -- 'discovery' | 'demo' | 'negotiation' | 'check-in' | 'renewal' | 'unknown'
  meeting_type_confidence DECIMAL(3,2),
  priority VARCHAR(10), -- 'high' | 'medium' | 'low'
  
  -- Processing
  should_research BOOLEAN DEFAULT TRUE,
  research_status VARCHAR(20), -- 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  research_scheduled_at TIMESTAMP,
  prep_doc_id UUID, -- References meeting_prep_documents
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_datetime (user_id, meeting_datetime),
  INDEX idx_research_status (research_status, research_scheduled_at),
  INDEX idx_company (company_name, user_id)
);

-- Meeting context aggregated from various sources
CREATE TABLE meeting_context (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES detected_meetings(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- CRM data
  crm_account_id VARCHAR(255),
  crm_account_data JSONB, -- {name, stage, dealSize, closeDate, owner, etc}
  
  -- Past interactions
  previous_meetings JSONB, -- Array of past meeting summaries
  email_history JSONB, -- Array of email exchanges
  
  -- Research data
  latest_research_id UUID,
  latest_research_date TIMESTAMP,
  tracked_account_id UUID,
  
  -- Aggregated at
  aggregated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_meeting (meeting_id)
);

-- Generated meeting prep documents
CREATE TABLE meeting_prep_documents (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES detected_meetings(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Metadata
  company_name VARCHAR(255) NOT NULL,
  meeting_datetime TIMESTAMP NOT NULL,
  meeting_type VARCHAR(20),
  generated_at TIMESTAMP DEFAULT NOW(),
  
  -- Document sections (all JSONB for flexibility)
  tldr JSONB, -- {oneLineSummary, keyTalkingPoints, criticalInfo, recommendedApproach}
  relationship_context JSONB, -- {lastMeeting, keyNotes, openItems, sentiment}
  recent_developments JSONB, -- {signals, news, changes}
  attendee_intel JSONB, -- Array of attendee profiles
  meeting_strategy JSONB, -- {objectives, questions, objections, positioning}
  company_intelligence JSONB, -- {overview, news, techStack, customCriteria}
  post_meeting_actions JSONB, -- Array of suggested actions
  cheat_sheet JSONB, -- {companyFacts, namesToKnow, keySoundbites}
  
  -- Full document
  full_document JSONB, -- Complete structured document
  
  -- Generated content
  pdf_url TEXT, -- S3 URL for PDF version
  pdf_generated_at TIMESTAMP,
  
  -- Delivery tracking
  delivered_at TIMESTAMP,
  delivery_method VARCHAR(20), -- 'email' | 'slack' | 'in-app' | 'multiple'
  opened_at TIMESTAMP,
  
  INDEX idx_meeting (meeting_id),
  INDEX idx_user_datetime (user_id, meeting_datetime),
  INDEX idx_company (company_name, user_id)
);

-- Meeting prep delivery schedule
CREATE TABLE prep_delivery_schedule (
  id UUID PRIMARY KEY,
  prep_doc_id UUID NOT NULL REFERENCES meeting_prep_documents(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  delivery_time TIMESTAMP NOT NULL,
  delivery_method VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled' | 'delivered' | 'failed'
  
  delivered_at TIMESTAMP,
  error_message TEXT,
  
  INDEX idx_delivery_time (delivery_time, status)
);

-- Meeting outcomes (feedback)
CREATE TABLE meeting_outcomes (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES detected_meetings(id),
  prep_doc_id UUID REFERENCES meeting_prep_documents(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Attendance
  attended BOOLEAN,
  outcome VARCHAR(20), -- 'excellent' | 'good' | 'neutral' | 'poor' | 'cancelled'
  
  -- Prep feedback
  prep_rating INTEGER, -- 1-5
  prep_was_helpful JSONB, -- Array of strings
  prep_was_missing JSONB, -- Array of strings
  
  -- Meeting notes
  key_discussions JSONB,
  next_steps JSONB,
  decisions JSONB,
  
  -- Deal progress
  stage_change VARCHAR(50),
  deal_status VARCHAR(20), -- 'advanced' | 'stalled' | 'lost'
  
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_meeting (meeting_id),
  INDEX idx_prep_rating (prep_rating, submitted_at)
);

-- User preferences for meeting intelligence
CREATE TABLE meeting_intelligence_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  
  -- Calendar settings
  calendar_sync_enabled BOOLEAN DEFAULT FALSE,
  sync_frequency_minutes INTEGER DEFAULT 15,
  
  -- Upload preferences
  email_forwarding_enabled BOOLEAN DEFAULT FALSE,
  email_forwarding_address VARCHAR(255),
  recurring_upload_reminder BOOLEAN DEFAULT FALSE,
  reminder_frequency VARCHAR(20), -- 'weekly' | 'biweekly' | 'monthly'
  
  -- Delivery preferences
  delivery_method VARCHAR(20) DEFAULT 'email', -- 'email' | 'slack' | 'in-app' | 'all'
  delivery_timing VARCHAR(20) DEFAULT 'both', -- 'night-before' | 'morning-of' | 'both'
  custom_hours_before INTEGER,
  digest_format VARCHAR(20) DEFAULT 'individual', -- 'individual' | 'daily-digest'
  urgent_meeting_threshold_hours INTEGER DEFAULT 2,
  
  -- Research preferences
  auto_research_external_meetings BOOLEAN DEFAULT TRUE,
  minimum_meeting_duration_minutes INTEGER DEFAULT 15,
  exclude_keywords JSONB, -- Array of meeting title keywords to skip
  
  -- Notification preferences
  notify_on_new_signal BOOLEAN DEFAULT TRUE,
  notify_on_prep_ready BOOLEAN DEFAULT TRUE,
  notify_on_prep_update BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Upload batches (for CSV/ICS uploads)
CREATE TABLE meeting_upload_batches (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  
  upload_method VARCHAR(20) NOT NULL, -- 'csv' | 'ics' | 'email_forward'
  filename VARCHAR(255),
  file_size INTEGER,
  
  total_meetings_detected INTEGER,
  valid_meetings INTEGER,
  invalid_meetings INTEGER,
  meetings_researched INTEGER,
  
  validation_errors JSONB, -- Array of {row, field, message}
  
  status VARCHAR(20) DEFAULT 'processing', -- 'processing' | 'completed' | 'failed'
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  INDEX idx_user_created (user_id, created_at)
);
```

---

### API Endpoints

```typescript
// Calendar connection
POST   /api/calendar/connect/:provider        // Initiate OAuth flow
GET    /api/calendar/callback/:provider       // OAuth callback
GET    /api/calendar/status                   // Check connection status
DELETE /api/calendar/disconnect/:provider     // Disconnect calendar
POST   /api/calendar/sync                     // Manual sync trigger

// Meeting detection & management
GET    /api/meetings/upcoming                 // Get upcoming meetings
GET    /api/meetings/:id                      // Get meeting details
PATCH  /api/meetings/:id/company              // Confirm/update company name
DELETE /api/meetings/:id                      // Delete meeting (won't research)
POST   /api/meetings/:id/research             // Trigger research manually

// Manual uploads
POST   /api/meetings/upload/csv               // Upload CSV file
POST   /api/meetings/upload/ics               // Upload ICS file
POST   /api/meetings/manual                   // Create single meeting manually
GET    /api/meetings/upload/template          // Download CSV template

// Meeting prep
GET    /api/meeting-prep/:id                  // Get prep document
GET    /api/meeting-prep/:id/pdf              // Download PDF
POST   /api/meeting-prep/:id/refresh          // Regenerate prep
POST   /api/meeting-prep/:id/deliver          // Manual delivery trigger
GET    /api/meeting-prep/today                // Today's meetings digest

// Meeting outcomes
POST   /api/meetings/:id/outcome              // Submit post-meeting feedback
GET    /api/meetings/:id/outcome              // Get feedback if exists

// Preferences
GET    /api/preferences/meeting-intelligence  // Get all preferences
PATCH  /api/preferences/meeting-intelligence  // Update preferences
POST   /api/preferences/delivery-test         // Test delivery settings

// Email forwarding
GET    /api/email-forwarding/address          // Get user's unique email
POST   /api/email-forwarding/enable           // Enable email forwarding
POST   /api/email-forwarding/test             // Send test email
```

---

### UI Components

#### 1. Calendar Sync Onboarding

```tsx
<CalendarSyncOnboarding>
  <OnboardingHeader>
    <HeaderIcon>📅</HeaderIcon>
    <HeaderTitle>Never walk into a meeting unprepared</HeaderTitle>
    <HeaderSubtitle>
      Connect your calendar and get research on every meeting automatically
    </HeaderSubtitle>
  </OnboardingHeader>
  
  <BenefitsList>
    <Benefit icon="🔍" label="Deep research before every meeting">
      Company intelligence, signals, decision makers, and talking points
    </Benefit>
    <Benefit icon="📊" label="Context from everywhere">
      Your CRM, emails, past conversations - all synthesized
    </Benefit>
    <Benefit icon="💡" label="Personalized strategy">
      Meeting-specific objectives, questions, and objection handling
    </Benefit>
    <Benefit icon="⏰" label="Delivered when you need it">
      Night before, morning of, or both - your choice
    </Benefit>
  </BenefitsList>
  
  <CalendarOptions>
    <ConnectButton 
      provider="google"
      icon={<GoogleIcon />}
      onClick={() => initiateOAuth('google')}
    >
      <ButtonText>Connect Google Calendar</ButtonText>
      <ButtonSubtext>Most popular</ButtonSubtext>
    </ConnectButton>
    
    <ConnectButton 
      provider="microsoft"
      icon={<OutlookIcon />}
      onClick={() => initiateOAuth('microsoft')}
    >
      <ButtonText>Connect Outlook Calendar</ButtonText>
      <ButtonSubtext>Office 365 & Outlook.com</ButtonSubtext>
    </ConnectButton>
  </CalendarOptions>
  
  <PermissionsExplainer>
    <ExplainerToggle>What permissions do you need? ▼</ExplainerToggle>
    <ExplainerContent>
      <PermissionItem>
        <PermissionIcon>✓</PermissionIcon>
        <PermissionText>
          <strong>Read calendar events:</strong> To see upcoming meetings
        </PermissionText>
      </PermissionItem>
      <PermissionItem>
        <PermissionIcon>✗</PermissionIcon>
        <PermissionText>
          <strong>We will NOT:</strong> Modify events, access personal calendars, or share data
        </PermissionText>
      </PermissionItem>
    </ExplainerContent>
  </PermissionsExplainer>
  
  <AlternativeOption>
    <AlternativeText>
      Can't connect your calendar?
    </AlternativeText>
    <AlternativeLink onClick={() => showManualUploadOptions()}>
      Try manual upload options →
    </AlternativeLink>
  </AlternativeOption>
</CalendarSyncOnboarding>
```

#### 2. Manual Upload Options Screen

```tsx
<ManualUploadOptions>
  <OptionsHeader>
    <Title>Manual Meeting Upload</Title>
    <Subtitle>
      Choose the method that works best for your workflow
    </Subtitle>
  </OptionsHeader>
  
  <MethodsGrid>
    <MethodCard recommended>
      <MethodIcon>📧</MethodIcon>
      <MethodBadge>Easiest</MethodBadge>
      <MethodName>Email Forwarding</MethodName>
      <MethodDescription>
        Forward meeting invites to your unique email address
      </MethodDescription>
      
      <MethodPros>
        <ProItem>✓ No calendar access needed</ProItem>
        <ProItem>✓ Works with any calendar</ProItem>
        <ProItem>✓ Just forward and forget</ProItem>
      </MethodPros>
      
      <MethodButton onClick={() => setupEmailForwarding()}>
        Get Email Address
      </MethodButton>
    </MethodCard>
    
    <MethodCard>
      <MethodIcon>📄</MethodIcon>
      <MethodName>CSV Upload</MethodName>
      <MethodDescription>
        Upload a spreadsheet with your meetings
      </MethodDescription>
      
      <MethodPros>
        <ProItem>✓ Batch upload 50 meetings</ProItem>
        <ProItem>✓ Works from any source</ProItem>
        <ProItem>✓ Full control over data</ProItem>
      </MethodPros>
      
      <MethodButton onClick={() => openCSVUpload()}>
        Upload CSV
      </MethodButton>
    </MethodCard>
    
    <MethodCard>
      <MethodIcon>📅</MethodIcon>
      <MethodName>Calendar Export</MethodName>
      <MethodDescription>
        Export .ics file from your calendar and upload
      </MethodDescription>
      
      <MethodPros>
        <ProItem>✓ Includes all meeting details</ProItem>
        <ProItem>✓ Works with any calendar app</ProItem>
        <ProItem>✓ Batch multiple meetings</ProItem>
      </MethodPros>
      
      <MethodButton onClick={() => openICSUpload()}>
        Upload ICS File
      </MethodButton>
    </MethodCard>
    
    <MethodCard>
      <MethodIcon>✍️</MethodIcon>
      <MethodName>Manual Entry</MethodName>
      <MethodDescription>
        Add meetings one at a time
      </MethodDescription>
      
      <MethodPros>
        <ProItem>✓ Quick for single meetings</ProItem>
        <ProItem>✓ Add context directly</ProItem>
        <ProItem>✓ No export needed</ProItem>
      </MethodPros>
      
      <MethodButton onClick={() => openManualEntry()}>
        Add Meeting
      </MethodButton>
    </MethodCard>
  </MethodsGrid>
  
  <MethodsNote>
    💡 You can use multiple methods. Many users set up email forwarding for convenience 
    and use manual entry for ad-hoc meetings.
  </MethodsNote>
  
  <ReconsiderCalendarSync>
    <ReconsiderText>
      Changed your mind?
    </ReconsiderText>
    <ReconsiderButton onClick={() => showCalendarSync()}>
      Connect Calendar Instead
    </ReconsiderButton>
  </ReconsiderCalendarSync>
</ManualUploadOptions>
```

#### 3. Meeting Prep Dashboard

```tsx
<MeetingPrepDashboard>
  <DashboardHeader>
    <HeaderLeft>
      <Title>📅 Meeting Intelligence</Title>
      <CalendarStatus>
        {calendarConnected ? (
          <StatusConnected>
            ✓ Calendar synced
            <LastSyncTime>Last sync: 5 min ago</LastSyncTime>
          </StatusConnected>
        ) : (
          <StatusNotConnected>
            Manual uploads only
            <ConnectLink onClick={connectCalendar}>Connect calendar</ConnectLink>
          </StatusNotConnected>
        )}
      </CalendarStatus>
    </HeaderLeft>
    
    <HeaderRight>
      <ViewToggle>
        <ToggleButton active={view === 'today'}>Today</ToggleButton>
        <ToggleButton active={view === 'week'}>This Week</ToggleButton>
        <ToggleButton active={view === 'all'}>All Upcoming</ToggleButton>
      </ViewToggle>
      
      <UploadButton onClick={() => openUploadModal()}>
        + Upload Meetings
      </UploadButton>
    </HeaderRight>
  </DashboardHeader>
  
  <TodaySection>
    <SectionHeader>
      <SectionTitle>Today's Meetings</SectionTitle>
      <MeetingCount>
        {todayMeetings.length} meeting{todayMeetings.length !== 1 && 's'}
      </MeetingCount>
    </SectionHeader>
    
    {todayMeetings.length === 0 ? (
      <EmptyState>
        <EmptyIcon>✨</EmptyIcon>
        <EmptyTitle>No meetings today</EmptyTitle>
        <EmptySubtitle>Enjoy your free time!</EmptySubtitle>
      </EmptyState>
    ) : (
      <MeetingsGrid>
        {todayMeetings.map(meeting => (
          <MeetingCard key={meeting.id} priority={meeting.priority}>
            <CardHeader>
              <TimeSlot>{formatTime(meeting.datetime)}</TimeSlot>
              <CompanyName>{meeting.company}</CompanyName>
              {meeting.priority === 'high' && (
                <PriorityBadge>⚡ High Priority</PriorityBadge>
              )}
            </CardHeader>
            
            <CardBody>
              <MeetingType badge>{meeting.type}</MeetingType>
              <AttendeesRow>
                <AttendeeIcon>👥</AttendeeIcon>
                <AttendeeNames>
                  {meeting.attendees.slice(0, 2).map(a => a.name).join(', ')}
                  {meeting.attendees.length > 2 && ` +${meeting.attendees.length - 2}`}
                </AttendeeNames>
              </AttendeesRow>
              
              {meeting.prep && (
                <PrepPreview>
                  <PrepTLDR>{meeting.prep.tldr}</PrepTLDR>
                  <KeyPoints>
                    {meeting.prep.keyPoints.slice(0, 2).map((point, i) => (
                      <KeyPoint key={i}>• {point}</KeyPoint>
                    ))}
                  </KeyPoints>
                </PrepPreview>
              )}
            </CardBody>
            
            <CardActions>
              {meeting.prep ? (
                <>
                  <ActionButton 
                    variant="primary" 
                    onClick={() => viewFullPrep(meeting.id)}
                  >
                    📄 View Full Prep
                  </ActionButton>
                  <ActionButton 
                    variant="outline"
                    onClick={() => downloadPDF(meeting.prep.id)}
                  >
                    Download PDF
                  </ActionButton>
                  {meeting.meetingLink && (
                    <ActionButton
                      variant="secondary"
                      onClick={() => window.open(meeting.meetingLink)}
                    >
                      Join Meeting
                    </ActionButton>
                  )}
                </>
              ) : (
                <PrepStatus status={meeting.researchStatus}>
                  {meeting.researchStatus === 'pending' && '⏳ Prep scheduled'}
                  {meeting.researchStatus === 'in_progress' && '🔄 Researching... (2 min remaining)'}
                  {meeting.researchStatus === 'failed' && '❌ Research failed'}
                </PrepStatus>
              )}
            </CardActions>
            
            {meeting.prep && meeting.prep.deliveredAt && (
              <DeliveryStatus>
                <DeliveryIcon>✓</DeliveryIcon>
                <DeliveryText>
                  Sent {formatRelativeTime(meeting.prep.deliveredAt)}
                  {meeting.prep.openedAt && ` • Opened ${formatRelativeTime(meeting.prep.openedAt)}`}
                </DeliveryText>
              </DeliveryStatus>
            )}
          </MeetingCard>
        ))}
      </MeetingsGrid>
    )}
  </TodaySection>
  
  <UpcomingSection>
    <SectionHeader>
      <SectionTitle>Later This Week</SectionTitle>
      <MeetingCount>{upcomingMeetings.length} meetings</MeetingCount>
    </SectionHeader>
    
    <CompactMeetingsList>
      {upcomingMeetings.map(meeting => (
        <CompactMeetingRow key={meeting.id} onClick={() => viewMeeting(meeting.id)}>
          <MeetingDate>{formatDate(meeting.datetime)}</MeetingDate>
          <MeetingTime>{formatTime(meeting.datetime)}</MeetingTime>
          <CompanyName>{meeting.company}</CompanyName>
          <MeetingType badge small>{meeting.type}</MeetingType>
          <PrepStatus>
            {meeting.prep ? (
              <StatusReady>✓ Ready</StatusReady>
            ) : (
              <StatusPending>Scheduled</StatusPending>
            )}
          </PrepStatus>
          <ChevronRight />
        </CompactMeetingRow>
      ))}
    </CompactMeetingsList>
  </UpcomingSection>
</MeetingPrepDashboard>
```

#### 4. Full Meeting Prep Document View

```tsx
<MeetingPrepView>
  <PrepHeader>
    <BackButton onClick={goBack}>← Back to Meetings</BackButton>
    
    <HeaderContent>
      <CompanyLogo src={prep.company.logo} />
      <HeaderInfo>
        <CompanyName>{prep.company.name}</CompanyName>
        <MeetingDateTime>
          {formatFullDateTime(prep.meeting.datetime)}
        </MeetingDateTime>
        <MeetingTypeBadge>{prep.meeting.type}</MeetingTypeBadge>
      </HeaderInfo>
    </HeaderContent>
    
    <HeaderActions>
      <ActionButton 
        icon="📥"
        onClick={() => downloadPDF(prep.id)}
      >
        Export PDF
      </ActionButton>
      <ActionButton 
        icon="📧"
        onClick={() => emailPrep(prep.id)}
      >
        Email Me
      </ActionButton>
      <ActionButton 
        icon="🔄"
        onClick={() => refreshPrep(prep.id)}
      >
        Refresh
      </ActionButton>
      <MoreButton>⋯</MoreButton>
    </HeaderActions>
  </PrepHeader>
  
  {/* High Level summary - Always first, always expanded */}
  <TLDRSection>
    <SectionIcon>⚡</SectionIcon>
    <SectionContent>
      <SectionTitle>High Level</SectionTitle>
      
      <OneLineSummary>{prep.tldr.summary}</OneLineSummary>
      
      <KeyTalkingPoints>
        {prep.tldr.keyPoints.map((point, i) => (
          <TalkingPoint key={i}>
            <PointNumber>{i + 1}</PointNumber>
            <PointText>{point}</PointText>
            <CopyButton onClick={() => copy(point)} />
          </TalkingPoint>
        ))}
      </KeyTalkingPoints>
      
      {prep.tldr.criticalInfo.length > 0 && (
        <CriticalInfoBox>
          <InfoLabel>🚨 Critical Info:</InfoLabel>
          <InfoList>
            {prep.tldr.criticalInfo.map((info, i) => (
              <InfoItem key={i}>{info}</InfoItem>
            ))}
          </InfoList>
        </CriticalInfoBox>
      )}
      
      <RecommendedApproach>
        <ApproachLabel>Recommended Approach:</ApproachLabel>
        <ApproachText>{prep.tldr.approach}</ApproachText>
      </RecommendedApproach>
    </SectionContent>
  </TLDRSection>
  
  {/* Relationship Context (if exists) */}
  {prep.relationshipContext && (
    <CollapsibleSection defaultExpanded>
      <SectionHeader onClick={toggle}>
        <SectionIcon>🤝</SectionIcon>
        <SectionTitle>Relationship Context</SectionTitle>
        <ChevronIcon expanded={expanded} />
      </SectionHeader>
      
      {expanded && (
        <SectionContent>
          <RelationshipTimeline>
            <TimelineEntry>
              <EntryDate>
                Last meeting: {formatDate(prep.relationshipContext.lastMeeting)}
              </EntryDate>
              <EntryContent>
                <EntryLabel>Key points discussed:</EntryLabel>
                {prep.relationshipContext.notes.map((note, i) => (
                  <Note key={i}>• {note}</Note>
                ))}
              </EntryContent>
            </TimelineEntry>
            
            {prep.relationshipContext.openItems.length > 0 && (
              <OpenItemsBox>
                <OpenItemsLabel>Open items from last time:</OpenItemsLabel>
                {prep.relationshipContext.openItems.map((item, i) => (
                  <OpenItem key={i}>
                    <Checkbox />
                    <ItemText>{item}</ItemText>
                  </OpenItem>
                ))}
              </OpenItemsBox>
            )}
          </RelationshipTimeline>
          
          <SentimentIndicator sentiment={prep.relationshipContext.sentiment}>
            Relationship status: {prep.relationshipContext.sentiment}
          </SentimentIndicator>
        </SectionContent>
      )}
    </CollapsibleSection>
  )}
  
  {/* Recent Developments */}
  <CollapsibleSection defaultExpanded>
    <SectionHeader onClick={toggle}>
      <SectionIcon>🚨</SectionIcon>
      <SectionTitle>Recent Developments</SectionTitle>
      <ChevronIcon expanded={expanded} />
    </SectionHeader>
    
    {expanded && (
      <SectionContent>
        {prep.recentDevelopments.signals.length > 0 && (
          <SignalsTimeline>
            {prep.recentDevelopments.signals.map(signal => (
              <SignalCard key={signal.id} severity={signal.severity}>
                <SignalHeader>
                  <SignalBadge severity={signal.severity}>
                    {signal.severity === 'critical' ? '🔴' : '🟡'} {signal.severity}
                  </SignalBadge>
                  <SignalDate>{signal.daysAgo}d ago</SignalDate>
                </SignalHeader>
                
                <SignalTitle>{signal.title}</SignalTitle>
                <SignalDescription>{signal.description}</SignalDescription>
                
                <SignalImpact>
                  <ImpactLabel>💡 Why this matters:</ImpactLabel>
                  <ImpactText>{signal.impact}</ImpactText>
                </SignalImpact>
                
                <SignalSource href={signal.url}>
                  📰 View source →
                </SignalSource>
              </SignalCard>
            ))}
          </SignalsTimeline>
        )}
        
        {prep.recentDevelopments.news.length > 0 && (
          <NewsSection>
            <NewsHeader>Recent News:</NewsHeader>
            {prep.recentDevelopments.news.map(news => (
              <NewsItem key={news.id} href={news.url}>
                <NewsDate>{formatDate(news.date)}</NewsDate>
                <NewsHeadline>{news.headline}</NewsHeadline>
              </NewsItem>
            ))}
          </NewsSection>
        )}
      </SectionContent>
    )}
  </CollapsibleSection>
  
  {/* Attendee Intelligence */}
  <CollapsibleSection defaultExpanded>
    <SectionHeader onClick={toggle}>
      <SectionIcon>👥</SectionIcon>
      <SectionTitle>Who's Who</SectionTitle>
      <AttendeeCount>
        {prep.attendeeIntel.length} {prep.attendeeIntel.length === 1 ? 'person' : 'people'}
      </AttendeeCount>
      <ChevronIcon expanded={expanded} />
    </SectionHeader>
    
    {expanded && (
      <SectionContent>
        <AttendeesGrid>
          {prep.attendeeIntel.map(attendee => (
            <AttendeeCard key={attendee.email}>
              <AttendeeHeader>
                <Avatar src={attendee.photo} name={attendee.name} />
                <AttendeeInfo>
                  <AttendeeName>{attendee.name}</AttendeeName>
                  <AttendeeTitle>{attendee.title}</AttendeeTitle>
                  <AttendeeRole badge>{attendee.role}</AttendeeRole>
                </AttendeeInfo>
              </AttendeeHeader>
              
              <AttendeeBackground>
                {attendee.background}
              </AttendeeBackground>
              
              {attendee.personalization.length > 0 && (
                <PersonalizationSection>
                  <PersonalizationLabel>Personalization points:</PersonalizationLabel>
                  {attendee.personalization.map((point, i) => (
                    <PersonalizationPoint key={i}>
                      💬 {point}
                    </PersonalizationPoint>
                  ))}
                </PersonalizationSection>
              )}
              
              <AttendeeActions>
                {attendee.linkedIn && (
                  <ActionLink href={attendee.linkedIn}>
                    View LinkedIn →
                  </ActionLink>
                )}
                <ActionButton 
                  size="small"
                  onClick={() => draftEmailTo(attendee.email)}
                >
                  Draft Email
                </ActionButton>
              </AttendeeActions>
            </AttendeeCard>
          ))}
        </AttendeesGrid>
      </SectionContent>
    )}
  </CollapsibleSection>
  
  {/* Meeting Strategy */}
  <CollapsibleSection defaultExpanded>
    <SectionHeader onClick={toggle}>
      <SectionIcon>🎯</SectionIcon>
      <SectionTitle>Meeting Strategy</SectionTitle>
      <ChevronIcon expanded={expanded} />
    </SectionHeader>
    
    {expanded && (
      <SectionContent>
        <ObjectivesSection>
          <PrimaryObjective>
            <ObjectiveLabel>Primary Objective:</ObjectiveLabel>
            <ObjectiveText>{prep.strategy.primaryObjective}</ObjectiveText>
          </PrimaryObjective>
          
          {prep.strategy.secondaryObjectives.length > 0 && (
            <SecondaryObjectives>
              <ObjectiveLabel>Also try to:</ObjectiveLabel>
              {prep.strategy.secondaryObjectives.map((obj, i) => (
                <Objective key={i}>• {obj}</Objective>
              ))}
            </SecondaryObjectives>
          )}
        </ObjectivesSection>
        
        <DiscoveryQuestions>
          <QuestionsHeader>
            <QuestionsLabel>Discovery Questions:</QuestionsLabel>
            <CopyAllButton onClick={() => copyAll(prep.strategy.questions)}>
              Copy All
            </CopyAllButton>
          </QuestionsHeader>
          
          {prep.strategy.questions.map((q, i) => (
            <Question key={i}>
              <QuestionNumber>{i + 1}.</QuestionNumber>
              <QuestionText>{q}</QuestionText>
              <QuestionActions>
                <CopyButton onClick={() => copy(q)}>Copy</CopyButton>
              </QuestionActions>
            </Question>
          ))}
        </DiscoveryQuestions>
        
        {prep.strategy.objections.length > 0 && (
          <ObjectionHandling>
            <ObjectionsLabel>Expected Objections & Responses:</ObjectionsLabel>
            {prep.strategy.objections.map((obj, i) => (
              <ObjectionCard key={i}>
                <Objection>
                  <ObjectionIcon>❓</ObjectionIcon>
                  <ObjectionText>{obj.objection}</ObjectionText>
                </Objection>
                <Response>
                  <ResponseIcon>✓</ResponseIcon>
                  <ResponseText>{obj.response}</ResponseText>
                </Response>
              </ObjectionCard>
            ))}
          </ObjectionHandling>
        )}
        
        {prep.strategy.competitive && (
          <CompetitiveNote>
            <NoteLabel>Competitive Positioning:</NoteLabel>
            <NoteText>{prep.strategy.competitive}</NoteText>
          </CompetitiveNote>
        )}
      </SectionContent>
    )}
  </CollapsibleSection>
  
  {/* Company Intelligence - Collapsed by default */}
  <CollapsibleSection defaultExpanded={false}>
    <SectionHeader onClick={toggle}>
      <SectionIcon>🏢</SectionIcon>
      <SectionTitle>Company Intelligence</SectionTitle>
      <ChevronIcon expanded={expanded} />
    </SectionHeader>
    
    {expanded && (
      <SectionContent>
        {/* Full company details, tech stack, custom criteria, etc. */}
      </SectionContent>
    )}
  </CollapsibleSection>
  
  {/* Floating Quick Reference Cheat Sheet */}
  <CheatSheet sticky>
    <CheatSheetHeader>
      <CheatSheetIcon>📝</CheatSheetIcon>
      <CheatSheetTitle>Quick Reference</CheatSheetTitle>
      <MinimizeButton onClick={toggleCheatSheet} />
    </CheatSheetHeader>
    
    {!minimized && (
      <CheatSheetContent>
        <CheatSection>
          <CheatLabel>Company Facts:</CheatLabel>
          <CheatList>
            {prep.cheatSheet.facts.map((fact, i) => (
              <CheatItem key={i}>{fact}</CheatItem>
            ))}
          </CheatList>
        </CheatSection>
        
        <CheatSection>
          <CheatLabel>Names to Know:</CheatLabel>
          <CheatList>
            {prep.cheatSheet.names.map((name, i) => (
              <CheatItem key={i}>{name}</CheatItem>
            ))}
          </CheatList>
        </CheatSection>
        
        <CheatSection>
          <CheatLabel>Key Soundbites:</CheatLabel>
          <CheatList>
            {prep.cheatSheet.soundbites.map((soundbite, i) => (
              <CheatItem key={i}>"{soundbite}"</CheatItem>
            ))}
          </CheatList>
        </CheatSection>
      </CheatSheetContent>
    )}
  </CheatSheet>
  
  {/* Post-meeting feedback prompt (after meeting time) */}
  {isPastMeeting && !hasOutcome && (
    <FeedbackPrompt>
      <PromptIcon>📝</PromptIcon>
      <PromptText>
        How did the meeting go? Your feedback helps us improve future prep.
      </PromptText>
      <PromptActions>
        <Button 
          variant="primary"
          onClick={() => openFeedbackModal()}
        >
          Share Feedback
        </Button>
        <TextButton onClick={dismissFeedback}>
          Maybe later
        </TextButton>
      </PromptActions>
    </FeedbackPrompt>
  )}
</MeetingPrepView>
```

---

### Background Jobs

```typescript
// Calendar sync job - runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  await syncCalendarsForActiveUsers();
});

async function syncCalendarsForActiveUsers() {
  const connections = await db.calendarConnections.findMany({
    where: {
      syncEnabled: true,
      lastSyncAt: {
        lt: new Date(Date.now() - 15 * 60 * 1000) // More than 15 min ago
      }
    }
  });
  
  for (const connection of connections) {
    try {
      await syncCalendar(connection);
    } catch (error) {
      console.error(`Sync failed for user ${connection.userId}:`, error);
      await logSyncError(connection.id, error);
    }
  }
}

// Meeting prep generation job - runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await generateScheduledPreps();
});

async function generateScheduledPreps() {
  const meetings = await db.detectedMeetings.findMany({
    where: {
      shouldResearch: true,
      researchStatus: 'pending',
      researchScheduledAt: {
        lte: new Date() // Time to research
      }
    },
    take: 10 // Process 10 at a time
  });
  
  for (const meeting of meetings) {
    await generateMeetingPrep(meeting.id);
  }
}

// Prep delivery job - runs every minute
cron.schedule('* * * * *', async () => {
  await deliverScheduledPreps();
});

async function deliverScheduledPreps() {
  const scheduled = await db.prepDeliverySchedule.findMany({
    where: {
      status: 'scheduled',
      deliveryTime: {
        lte: new Date()
      }
    }
  });
  
  for (const delivery of scheduled) {
    await deliverMeetingPrep(delivery);
  }
}

// Upload reminder job - runs daily at 6pm user's timezone
cron.schedule('0 18 * * *', async () => {
  await sendUploadReminders();
});
```

---

### Testing Requirements

#### Unit Tests
- [ ] Calendar OAuth flow (success, denied, error)
- [ ] Meeting detection logic (external/internal, company extraction)
- [ ] Meeting type classification accuracy
- [ ] CSV parsing (valid, invalid, missing fields)
- [ ] ICS parsing (various calendar formats)
- [ ] Company name extraction (all strategies)
- [ ] Meeting context aggregation
- [ ] Prep document generation
- [ ] Delivery scheduling logic
- [ ] Background job execution

#### Integration Tests
- [ ] End-to-end calendar sync flow
- [ ] CSV upload to prep generation
- [ ] ICS upload to prep generation
- [ ] Manual entry to prep generation
- [ ] Email forwarding to prep generation
- [ ] CRM data integration
- [ ] Email history integration
- [ ] Delivery to all channels (email, Slack, in-app)
- [ ] PDF generation
- [ ] Feedback submission and learning

#### Edge Cases
- [ ] Meetings without company name
- [ ] Meetings with no external attendees
- [ ] Very short meetings (<15 min)
- [ ] All-day events
- [ ] Recurring meetings
- [ ] Meetings with 10+ attendees
- [ ] Last-minute meetings (<1 hour notice)
- [ ] Cancelled meetings
- [ ] Rescheduled meetings
- [ ] CSV with 50 meetings (max)
- [ ] ICS with 100+ events
- [ ] Company names that are ambiguous
- [ ] Attendees without email addresses
- [ ] Meetings in different timezones

#### Performance Tests
- [ ] Calendar sync with 100+ events
- [ ] Batch prep generation (10 meetings simultaneously)
- [ ] Large CSV upload (50 meetings)
- [ ] Large ICS file (1000+ events)
- [ ] Prep generation time (<3 minutes target)
- [ ] Dashboard load time with 50 meetings
- [ ] PDF generation time (<10 seconds target)

#### User Acceptance Tests
- [ ] Complete calendar sync onboarding
- [ ] Upload CSV and confirm meetings
- [ ] Upload ICS and filter meetings
- [ ] Manual entry of single meeting
- [ ] Set up email forwarding
- [ ] Receive email prep (night before)
- [ ] Receive email prep (morning of)
- [ ] Open prep doc and navigate sections
- [ ] Download PDF
- [ ] Submit post-meeting feedback
- [ ] Change delivery preferences
- [ ] Disconnect and reconnect calendar

---

### Success Metrics

#### Activation Metrics
- **Calendar connection rate:** >80% of users connect calendar within first session
- **Manual upload adoption:** 20-30% of users prefer manual upload
- **Email forwarding setup:** >40% of manual upload users enable email forwarding
- **Meeting detection accuracy:** >95% of meetings correctly identified
- **Company extraction accuracy:** >90% company names extracted correctly

#### Usage Metrics
- **Meetings detected per user per week:** Target 5-10 meetings
- **Prep docs opened:** >75% of generated preps opened before meeting
- **Time spent reviewing prep:** 5-10 minutes average
- **PDF downloads:** >40% of preps downloaded
- **Mobile access:** >30% of preps viewed on mobile

#### Quality Metrics
- **Prep doc rating:** Target >4.5/5
- **"Was helpful" rate:** >90% of users find prep helpful
- **Attendee identification accuracy:** >95%
- **Meeting type classification accuracy:** >85%
- **Time saved per meeting:** Target 30+ minutes

#### Business Impact
- **Deal velocity improvement:** Target 20% faster from meeting to close
- **Win rate improvement:** Target 10% higher win rate
- **Meeting success improvement:** Self-reported 40%+ better outcomes
- **Feature NPS:** Target >70

#### Retention
- **Weekly active usage:** >70% of users with calendar connected
- **30-day retention:** >80% of activated users still using after 30 days
- **Feature becomes core:** >60% say they'd be "very disappointed" without it

---

### Implementation Phases

#### Phase 1: MVP (Weeks 1-2) - P0
**Goal:** Basic calendar sync + email delivery working end-to-end

- [ ] Google Calendar OAuth integration
- [ ] Meeting detection and parsing
- [ ] Basic meeting prep generation (standard template)
- [ ] Email delivery system
- [ ] Simple prep document UI
- [ ] Manual single meeting entry (fallback)

**Success Criteria:**
- Can connect Google Calendar
- Detects external meetings accurately
- Generates and emails prep docs
- Users can view prep in app

#### Phase 2: Intelligence (Weeks 3-4) - P0
**Goal:** Context-aware, high-quality prep docs

- [ ] Microsoft Outlook integration
- [ ] CRM integration (Salesforce)
- [ ] Meeting type classification
- [ ] Context-aware research strategy
- [ ] Attendee intelligence
- [ ] Relationship context from past meetings

**Success Criteria:**
- Works with Outlook
- Pulls CRM data into prep
- Prep quality rated >4/5
- Meeting type correctly classified >80% of time

#### Phase 3: Manual Upload (Weeks 5-6) - P1
**Goal:** Alternative for users who can't sync calendar

- [ ] CSV upload with validation
- [ ] ICS file upload
- [ ] Company name extraction (multi-strategy)
- [ ] Email forwarding system
- [ ] Upload method comparison page

**Success Criteria:**
- 20%+ of users choose manual upload
- CSV upload accuracy >90%
- Email forwarding works reliably
- Equal prep quality for manual vs synced

#### Phase 4: Optimization (Weeks 7-8) - P1
**Goal:** Delivery timing, preferences, mobile, polish

- [ ] Delivery preferences (timing, channel)
- [ ] Daily digest format
- [ ] Post-meeting feedback capture
- [ ] Mobile-optimized prep view
- [ ] Slack integration
- [ ] PDF generation improvements

**Success Criteria:**
- >75% open rate for delivered preps
- Users customize delivery preferences
- Feedback submission >40%
- Mobile experience rated well

#### Phase 5: Advanced (Weeks 9-10) - P2
**Goal:** Learning, automation, team features

- [ ] Learning from feedback
- [ ] Recurring upload reminders
- [ ] HubSpot CRM integration
- [ ] Gmail/Outlook email history
- [ ] Team sharing features
- [ ] Advanced competitive intelligence

**Success Criteria:**
- Prep quality improves over time
- Recurring reminders drive engagement
- Multiple CRM integrations working
- Teams collaborating on prep

---

### Priority Summary

**Must Have (P0):**
- Calendar sync (Google + Microsoft)
- Basic meeting detection
- Meeting prep generation
- Email delivery
- Manual single meeting entry

**Should Have (P1):**
- CSV upload
- ICS upload
- CRM integration
- Meeting type classification
- Delivery preferences
- Post-meeting feedback

**Nice to Have (P2):**
- Email forwarding
- Recurring reminders
- Slack integration
- Daily digest
- Team features
- Learning from feedback

---

### Notes & Considerations

**Security:**
- Encrypt all OAuth tokens
- Use PKCE for OAuth flows
- Request minimum necessary calendar permissions
- Clear data retention policy
- Allow users to disconnect and delete data

**Privacy:**
- Never sync personal/private calendar events
- Filter out events marked as private
- Don't store sensitive meeting content
- Clear explanation of what's accessed

**Performance:**
- Async processing for all research
- Queue system for batch uploads
- Caching for frequently accessed data
- Progressive loading in UI
- Background jobs don't impact user experience

**Scalability:**
- Calendar sync rate limiting per user
- Queue-based prep generation
- CDN for PDF delivery
- Database indexes on critical queries
- Monitor credit usage per feature

**Error Handling:**
- Graceful OAuth failures
- Retry logic for API calls
- Clear error messages to users
- Admin alerts for system failures
- Fallback to manual entry if sync fails

---

This is the **#1 priority feature** - the one that will make users say "I can't live without this." Every other feature supports this core value proposition: **never walk into a meeting unprepared again.**

## Agent Quality Testing and Continuous Improvement

### Agent Quality Testing

#### Agent Quality Testing Process

1. **Save All Interactions**
   - Store every user message and agent response with full context
   - Include metadata: timestamp, response time, tokens used, conversation ID
   - Capture user context: account ID, research ID, tracked accounts
   - Track whether interaction is part of key workflow (onboarding, research, account upload)

2. **Capture User Feedback**
   - Add thumbs up/down buttons after every agent response
   - On thumbs down, show quick reason checkboxes:
     - Not helpful
     - Wrong information
     - Too verbose
     - Missing context
     - Other (optional text)
   - Track feedback rate and sentiment trends

3. **Automated Evaluation Strategy**
   - **Evaluate immediately (within seconds):**
     - All thumbs-down interactions
     - First 3 sessions per new user
   - **Evaluate in batch (every 15 minutes):**
     - 50% of all other interactions (random sampling)
     - 100% of key workflows (research completion, account upload, signal configuration)
     - Any interaction that errored or timed out
   - **Never evaluate:**
     - Simple acknowledgments ("ok", "thanks")
     - System messages

4. **Evaluation Dimensions (1-10 scale)**
   - Helpfulness: Does it solve the user's problem?
   - Value Density: Information-to-word ratio
   - Quality of Insights: Specific vs generic
   - Proactivity: Anticipates needs vs reactive
   - Contextual Awareness: Remembers conversation history
   - Tone & Personality: Human vs robotic
   - Clarity & Scannability: Can grasp key points in 5 seconds
   - Actionability: Clear next steps provided
   - Intelligence Signaling: Strategic insights demonstrated
   - Response Timing: Appropriate pacing and speed

5. **Evaluation Service Implementation**
   - Use gpt-5-nano for all automated evaluations
   - Return structured JSON with scores, issues, and suggestions
   - Process batch evaluations every 15 minutes
   - Store evaluation results in database linked to interaction

#### Continuous Learning Loop

1. **Collect (Real-time)**
   - Interaction logs with full context
   - User feedback (thumbs up/down + reasons)
   - Performance metrics (response time, token usage)
   - Error logs and timeouts

2. **Evaluate (Async, 15-min batches)**
   - Run gpt-5-nano evaluations on sampled interactions
   - Calculate dimension scores and overall score
   - Flag interactions scoring <7 on any dimension
   - Identify patterns in low-scoring interactions

3. **Analyze (Weekly Review)**
   - Generate weekly scorecard dashboard showing:
     - Average scores per dimension with trends
     - User satisfaction rate (thumbs up %)
     - Response time percentiles (p50, p95, p99)
     - Token usage trends
     - Common failure patterns
     - Top issues by frequency
   - Review all flagged interactions (score <7)
   - Identify systemic issues vs one-off problems

4. **Improve (Sprint-based)**
   - Update agent prompts based on identified patterns
   - A/B test new prompts against control group
   - Track eval scores for both variants
   - Implement improvements if new variant scores ≥5% better
   - Document prompt changes and rationale

5. **Validate (Before deploying)**
   - Run evaluations on test set of 100 historical interactions
   - Ensure new prompts score ≥ old prompts on all dimensions
   - Check for regressions on key workflows
   - Manual review of 10 sample responses
   - Deploy to 10% of users, monitor for 48 hours, then full rollout

#### Database Schema

```sql
-- Interaction logs
CREATE TABLE interaction_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  user_message TEXT NOT NULL,
  agent_response TEXT NOT NULL,
  context JSONB, -- {accountId, researchId, workflowType, etc}
  response_time_ms INTEGER,
  tokens_used INTEGER,
  is_key_workflow BOOLEAN DEFAULT FALSE,
  error_occurred BOOLEAN DEFAULT FALSE,
  INDEX idx_user_timestamp (user_id, timestamp),
  INDEX idx_conversation (conversation_id),
  INDEX idx_key_workflow (is_key_workflow, timestamp)
);

-- User feedback
CREATE TABLE interaction_feedback (
  id UUID PRIMARY KEY,
  interaction_id UUID REFERENCES interaction_logs(id),
  user_id UUID NOT NULL,
  feedback_type VARCHAR(20) NOT NULL, -- 'positive' | 'negative'
  reason VARCHAR(50), -- 'not_helpful' | 'wrong_info' | 'too_verbose' | etc
  additional_comments TEXT,
  timestamp TIMESTAMP NOT NULL,
  INDEX idx_interaction (interaction_id),
  INDEX idx_feedback_type (feedback_type, timestamp)
);

-- Automated evaluations
CREATE TABLE interaction_evaluations (
  id UUID PRIMARY KEY,
  interaction_id UUID REFERENCES interaction_logs(id),
  evaluated_at TIMESTAMP NOT NULL,
  
  -- Dimension scores (1-10)
  helpfulness_score DECIMAL(3,1),
  value_density_score DECIMAL(3,1),
  quality_score DECIMAL(3,1),
  proactivity_score DECIMAL(3,1),
  contextual_awareness_score DECIMAL(3,1),
  tone_score DECIMAL(3,1),
  clarity_score DECIMAL(3,1),
  actionability_score DECIMAL(3,1),
  intelligence_score DECIMAL(3,1),
  timing_score DECIMAL(3,1),
  
  overall_score DECIMAL(3,1),
  critical_issues JSONB, -- ["Issue 1", "Issue 2"]
  strengths JSONB, -- ["Strength 1", "Strength 2"]
  suggested_improvement TEXT,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  
  INDEX idx_overall_score (overall_score),
  INDEX idx_flagged (flagged_for_review, evaluated_at),
  INDEX idx_interaction (interaction_id)
);

-- Prompt versions for A/B testing
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY,
  prompt_name VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,
  prompt_text TEXT NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  traffic_percentage DECIMAL(5,2), -- 0-100
  created_at TIMESTAMP NOT NULL,
  created_by UUID,
  notes TEXT,
  UNIQUE(prompt_name, version)
);

-- A/B test results
CREATE TABLE ab_test_results (
  id UUID PRIMARY KEY,
  prompt_version_id UUID REFERENCES prompt_versions(id),
  test_period_start TIMESTAMP NOT NULL,
  test_period_end TIMESTAMP,
  interactions_count INTEGER,
  avg_overall_score DECIMAL(3,1),
  avg_dimension_scores JSONB,
  user_satisfaction_rate DECIMAL(5,2),
  winner BOOLEAN,
  notes TEXT
);
```

#### Evaluation Service Code

```typescript
// services/evaluationService.ts

interface EvaluationResult {
  scores: {
    helpfulness: number;
    valueDensity: number;
    quality: number;
    proactivity: number;
    contextualAwareness: number;
    tone: number;
    clarity: number;
    actionability: number;
    intelligence: number;
    timing: number;
  };
  overallScore: number;
  criticalIssues: string[];
  strengths: string[];
  suggestedImprovement: string;
}

export async function evaluateInteraction(
  interaction: InteractionLog
): Promise<EvaluationResult> {
  const prompt = buildEvaluationPrompt(interaction);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(response.choices[0].message.content);
  
  // Flag for review if any dimension <7
  const flagged = Object.values(result.scores).some(score => score < 7);
  
  await db.interactionEvaluations.create({
    interactionId: interaction.id,
    ...result.scores,
    overallScore: result.overallScore,
    criticalIssues: result.criticalIssues,
    strengths: result.strengths,
    suggestedImprovement: result.suggestedImprovement,
    flaggedForReview: flagged,
    evaluatedAt: new Date()
  });
  
  return result;
}

function buildEvaluationPrompt(interaction: InteractionLog): string {
  return `
You are evaluating a research agent's response quality. Grade 1-10 on each dimension.

USER MESSAGE: "${interaction.userMessage}"

AGENT RESPONSE: "${interaction.agentResponse}"

CONTEXT: ${JSON.stringify(interaction.context)}

RESPONSE TIME: ${interaction.responseTimeMs}ms

Grade each dimension (1-10):
1. Helpfulness - Does it solve the problem?
2. Value Density - Info-to-word ratio (avoid fluff)
3. Quality of Insights - Specific vs generic
4. Proactivity - Anticipates needs vs reactive only
5. Contextual Awareness - Remembers conversation
6. Tone & Personality - Human vs robotic
7. Clarity & Scannability - Can grasp in 5 seconds
8. Actionability - Clear next steps
9. Intelligence Signaling - Strategic insights
10. Response Timing - Appropriate for query complexity

Return JSON only:
{
  "scores": {
    "helpfulness": 8,
    "valueDensity": 7,
    "quality": 8,
    "proactivity": 6,
    "contextualAwareness": 7,
    "tone": 8,
    "clarity": 7,
    "actionability": 9,
    "intelligence": 7,
    "timing": 8
  },
  "overallScore": 7.5,
  "criticalIssues": ["Too verbose", "No proactive suggestion"],
  "strengths": ["Good insights", "Clear structure"],
  "suggestedImprovement": "Add next step suggestion at end"
}
`;
}

// Background job - runs every 15 minutes
export async function processPendingEvaluations() {
  const pending = await db.interactionLogs.findMany({
    where: {
      evaluatedAt: null,
      shouldEvaluate: true
    },
    take: 100,
    orderBy: { timestamp: 'desc' }
  });

  const results = await Promise.all(
    pending.map(interaction => evaluateInteraction(interaction))
  );

  console.log(`Evaluated ${results.length} interactions`);
  
  // Alert if scores dropped significantly
  const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
  if (avgScore < 7.5) {
    await sendAlert('Quality Alert', `Average score dropped to ${avgScore}`);
  }
  
  return results;
}
```

#### Weekly Dashboard Queries

```typescript
// analytics/weeklyScorecard.ts

export async function generateWeeklyScorecard(startDate: Date, endDate: Date) {
  const evaluations = await db.interactionEvaluations.findMany({
    where: {
      evaluatedAt: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const avgScores = {
    helpfulness: average(evaluations.map(e => e.helpfulnessScore)),
    valueDensity: average(evaluations.map(e => e.valueDensityScore)),
    quality: average(evaluations.map(e => e.qualityScore)),
    proactivity: average(evaluations.map(e => e.proactivityScore)),
    contextualAwareness: average(evaluations.map(e => e.contextualAwarenessScore)),
    tone: average(evaluations.map(e => e.toneScore)),
    clarity: average(evaluations.map(e => e.clarityScore)),
    actionability: average(evaluations.map(e => e.actionabilityScore)),
    intelligence: average(evaluations.map(e => e.intelligenceScore)),
    timing: average(evaluations.map(e => e.timingScore))
  };

  const userFeedback = await db.interactionFeedback.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const satisfactionRate = 
    userFeedback.filter(f => f.feedbackType === 'positive').length /
    userFeedback.length * 100;

  const flaggedInteractions = evaluations.filter(e => e.flaggedForReview);

  const commonIssues = extractCommonIssues(evaluations.map(e => e.criticalIssues));

  return {
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    interactionsEvaluated: evaluations.length,
    avgScores,
    userSatisfaction: {
      thumbsUp: userFeedback.filter(f => f.feedbackType === 'positive').length,
      thumbsDown: userFeedback.filter(f => f.feedbackType === 'negative').length,
      satisfactionRate
    },
    flaggedForReview: flaggedInteractions.length,
    commonIssues
  };
}
```

#### Real-Time Alerting

```typescript
// monitoring/qualityAlerts.ts

export async function checkQualityThresholds() {
  // Check last hour's performance
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const recentEvals = await db.interactionEvaluations.findMany({
    where: {
      evaluatedAt: { gte: oneHourAgo }
    }
  });

  if (recentEvals.length < 10) return; // Not enough data

  const avgScores = calculateAverageScores(recentEvals);

  // Alert thresholds
  const alerts = [];
  
  if (avgScores.overall < 7.5) {
    alerts.push({
      severity: 'high',
      message: `Overall quality dropped to ${avgScores.overall.toFixed(1)} in last hour`
    });
  }

  if (avgScores.proactivity < 7.0) {
    alerts.push({
      severity: 'medium',
      message: `Proactivity score at ${avgScores.proactivity.toFixed(1)} - agent may be too reactive`
    });
  }

  if (avgScores.valueDensity < 7.0) {
    alerts.push({
      severity: 'medium',
      message: `Value density at ${avgScores.valueDensity.toFixed(1)} - responses may be too verbose`
    });
  }

  // Send alerts to Slack/email
  for (const alert of alerts) {
    await sendSlackAlert(alert);
  }
}

// Run every hour
cron.schedule('0 * * * *', checkQualityThresholds);
```

#### Implementation Checklist

- [ ] Create database tables for interaction logs, feedback, evaluations
- [ ] Add thumbs up/down UI component after agent responses
- [ ] Implement interaction logging middleware
- [ ] Build evaluation service with gpt-5-nano
- [ ] Create background job for batch evaluations (every 15 min)
- [ ] Build weekly scorecard dashboard
- [ ] Set up real-time quality alerts
- [ ] Create flagged interaction review interface
- [ ] Implement A/B testing framework for prompt changes
- [ ] Document prompt change process and approval workflow

> **Prompt deployment reminder:** Prompt edits under `server/routes/_lib` only go live after recompiling the server bundle. After committing prompt changes, run `npm run build` (or restart the API via `npm run dev:api`) so `server-build/` picks up the new instructions, then redeploy/restart the API and verify the logs show the updated prompt.

---

## Visual Testing & UX Improvements

### End-to-End User Testing Process

#### Testing Persona: Cliff (AE)
- Role: Account Executive selling security/compliance software
- Accounts: 15 strategic accounts in aerospace & defense
- Key needs: Monitor for breaches, prioritize outreach timing, personalized research

#### Phase 1: First-Time User Experience (30 min)
- [ ] Sign up flow - note friction points
- [ ] Initial landing screen - proactive vs empty
- [ ] First research without forms - document blockers
- [ ] Custom criteria setup - conversational vs forms
- [ ] Screenshot each major screen

**Success Criteria:**
- Can research company in <5 minutes without setup
- No "complete profile first" blockers
- Agent asks clarifying questions inline
- Natural language criteria accepted

#### Phase 2: Account Management (20 min)
- [ ] Upload 15-account CSV
- [ ] Configure signal tracking conversationally
- [ ] Navigate away and return
- [ ] Find accounts in sidebar
- [ ] Check for signal indicators

**Success Criteria:**
- CSV upload works with just company names
- Accounts visible in sidebar with badges
- Signal configuration feels conversational
- Can filter to hot accounts easily

#### Phase 3: Research Quality (30 min)
- [ ] Deep research on tracked account
- [ ] Evaluate scannability (5-second test)
- [ ] Check for signals prominence
- [ ] Find custom criteria results
- [ ] Draft email from research
- [ ] Export report to PDF

**Success Criteria:**
- Can grasp key points in 5 seconds
- Signals use red/orange and appear first
- Custom criteria clearly displayed
- Quick actions prominent (draft, export)

#### Phase 4: Daily Workflow (15 min)
- [ ] Log in next day - note greeting
- [ ] Test: "Which accounts need attention?"
- [ ] Test: "Refresh all my accounts"
- [ ] Test: "Show accounts with recent signals"
- [ ] Test: "Add security incidents to my criteria"

**Success Criteria:**
- Dashboard greeting shows signals proactively
- Natural language commands work
- Can update profile via chat
- Account prioritization clear

#### Phase 5: Profile Completion (10 min)
- [ ] Check profile health indicator
- [ ] Note how completion is prompted
- [ ] Add criteria conversationally
- [ ] Add signal via natural language
- [ ] Dismiss or complete profile

**Success Criteria:**
- Profile health non-intrusive (sidebar widget)
- Can update via chat commands
- Explains impact of missing features
- Dismissible if user prefers

### Visual Quality Checklist

#### Dashboard Greeting
- [ ] Signals appear first (no scrolling needed)
- [ ] Use red/orange backgrounds for hot signals
- [ ] Action buttons prominent and clear
- [ ] Account summary scannable
- [ ] Smart suggestions feel natural
- [ ] Loading states smooth (skeletons not spinners)

#### Research Output
- [ ] Executive summary visually dominant
- [ ] Signals section uses color coding
- [ ] Custom criteria in grid layout
- [ ] Expandable sections work smoothly
- [ ] Quick action bar always visible
- [ ] Mobile responsive

#### Account Dashboard
- [ ] Hot accounts visually distinct (thick border, color)
- [ ] Signal badges stand out
- [ ] Filtering intuitive
- [ ] Bulk actions accessible
- [ ] Last researched date clear

#### Sidebar
- [ ] Profile health compact but noticeable
- [ ] Account list with signal badges
- [ ] Recent chats have meaningful labels (not "Company Profile" x9)
- [ ] Quick navigation to key sections

### Issue Tracking Template

```markdown
## Issue #[number]: [Title]

**Priority:** P0 (Blocker) | P1 (Major) | P2 (Polish)
**Type:** Bug | Enhancement | Visual | Performance | Agent Quality
**Component:** Dashboard | Onboarding | Research | Accounts | Sidebar | Agent
**Status:** Open | In Progress | Testing | Closed

### Description
[What's wrong or what needs improvement?]

### Expected Behavior
[What should happen?]

### Current Behavior
[What actually happens?]

### Impact on User (Cliff's perspective)
[How does this affect the workflow?]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Observe issue]

### Screenshots
[Visual reference]

### Proposed Solution
[How to fix it]

### Testing Checklist
- [ ] Fix implemented
- [ ] Visual test passed
- [ ] Functional test passed
- [ ] No regressions
- [ ] Agent quality scores maintained

### Notes
[Additional context]
```

---

## Feature Requests & Enhancements

### Submitted Requests
*Track user-submitted feature requests here*

### Prioritization Framework
**P0 - Critical:** Blocks core workflow or causes data loss
**P1 - High:** Significantly improves core workflow
**P2 - Medium:** Nice-to-have enhancement
**P3 - Low:** Future consideration

---

## Technical Debt

### Performance
- [ ] Optimize dashboard load time (<2s target)
- [ ] Implement lazy loading for account lists
- [ ] Add caching for frequently accessed data
- [ ] Database query optimization

### Code Quality
- [ ] Add TypeScript types to all components
- [ ] Refactor duplicated code
- [ ] Improve error handling
- [ ] Add comprehensive logging

### Infrastructure
- [ ] Set up monitoring and alerting
- [ ] Implement automated backups
- [ ] Add load testing
- [ ] Set up staging environment

---

## Completed Improvements

### [Date] - [Title]
**What:** [Description]
**Impact:** [How it improved the product]
**Metrics:** [Before/after scores or metrics]
