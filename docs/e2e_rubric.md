# Welcome Agent & Platform UI/UX Testing Rubric

## Overview & Testing Approach

### What We're Testing
This rubric covers two interconnected areas:
1. **Welcome Agent (Onboarding Flow)**: The initial user experience from signup through first dashboard view
2. **Core Platform UI/UX**: Navigation, data visibility, feature clarity, and core functionality across the entire platform

### Why We're Testing
Previous user feedback identified critical usability issues including unclear features, navigation problems, broken functionality, and an overly complex onboarding process. This testing ensures all feedback has been addressed and validates that the platform embodies principles of simplicity, clarity, and efficiency.

### How We're Testing
**Automated Testing (Playwright):**
- Simulate user journey from signup through key tasks
- Validate functionality, navigation flows, and UI element presence
- Capture screenshots at critical points for visual analysis

**Vision LLM Analysis:**
- Screenshots sent to vision model with specific evaluation prompts
- Assesses visual clarity, information hierarchy, cognitive load, and UX quality
- Provides objective assessment of whether UI meets usability standards

---

## Test Information
- **Tester Name:** ________________
- **Date:** ________________
- **Platform Version:** ________________
- **Test Environment:** ________________

---

## 1. WELCOME AGENT (ONBOARDING FLOW)

### Purpose
Validate that the onboarding experience is streamlined, clear, and successfully guides users to the dashboard without confusion or unnecessary complexity.

### 1.1 Initial Setup & Company Information

#### Playwright Test Instructions
```javascript
// Navigate to signup page
// Fill company information fields
// Test validation: input URL in company name field (should reject or guide)
// Test validation: input company name correctly
// Verify no redundant requests for same information
// Count number of steps/screens in onboarding
// Time the complete flow
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** First onboarding screen (company information entry)

**Vision LLM Prompt:**
```
Analyze this onboarding screen for UX quality. Evaluate:
1. Is it immediately clear what information is being requested (company name vs URL)?
2. Are the form labels and placeholders clear and unambiguous?
3. Is there helpful microcopy or guidance to prevent errors?
4. Does the visual hierarchy guide the user's attention appropriately?
5. Is the form field validation visible and understandable?
6. Does the screen feel overwhelming or appropriately simple?
7. Is there a clear value proposition explaining why this information is needed?

Rate each criterion 1-5 and provide specific UI/UX improvement recommendations.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Company name vs URL distinction is immediately clear | ☐ | | |
| Form validation prevents incorrect input format | ☐ | | |
| Helpful error messages guide user to correct format | ☐ | | |
| User is not asked for redundant information | ☐ | | |
| No technical jargon or confusing terminology | ☐ | | |

---

### 1.2 Onboarding Flow Complexity

#### Playwright Test Instructions
```javascript
// Count total number of screens/steps in onboarding
// Measure time from start to dashboard
// Track number of user inputs required
// Identify any optional vs required steps
// Test skip/back navigation if available
// Verify progress indicator accuracy
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Each step of the onboarding flow (take 1 screenshot per step)

**Vision LLM Prompt (for each screen):**
```
Analyze this onboarding step for complexity and clarity:
1. Is the purpose of this step immediately obvious?
2. Is the value proposition clear (why user should provide this information)?
3. How many decisions or inputs are required on this screen?
4. Is there a progress indicator? If so, is it clear how far along the user is?
5. Is the cognitive load appropriate for an onboarding experience?
6. Could this step be simplified, combined with another step, or eliminated?
7. Are CTAs (buttons) clear and action-oriented?
8. Is the visual design clean and focused, or cluttered?

Provide a complexity score (1-10, where 10 is very complex) and specific recommendations to simplify.
```

**Screenshot Point:** Complete onboarding flow overview (all steps in sequence)

**Vision LLM Prompt:**
```
Looking at this complete onboarding sequence:
1. What is the total number of steps shown?
2. Does the flow feel too long or appropriately concise?
3. Are there any steps that appear redundant or unnecessary?
4. Is there a logical progression from one step to the next?
5. Where could steps be consolidated without losing essential information?
6. Overall, would you rate this as "simple" (1-3 steps), "moderate" (4-5 steps), or "complex" (6+ steps)?

Recommend an ideal flow with specific consolidation suggestions.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Total steps/screens: _____ (Target: 3-5 max) | ☐ | | |
| Time to complete: _____ (Target: <3 minutes) | ☐ | | |
| Each step has clear, stated purpose | ☐ | | |
| Progress indicator shows current position | ☐ | | |
| No steps feel unnecessary or redundant | ☐ | | |
| Can navigate back to previous steps | ☐ | | |
| Overall flow feels streamlined, not overwhelming | ☐ | | |

---

### 1.3 Data Point Selection/Configuration

#### Playwright Test Instructions
```javascript
// Navigate to data configuration screen (if exists)
// Test if user must manually identify data types (SHOULD NOT)
// Test if defaults are pre-selected
// Test "uncheck to remove" functionality
// Test "add custom data point" functionality
// Try edge case inputs: "All", special characters, very long strings
// Verify validation messages for invalid inputs
// Test if "skip" or "use defaults" option exists
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Data point configuration screen

**Vision LLM Prompt:**
```
Analyze this data configuration interface:
1. Is the user being asked to do technical work (like identifying data types)? This should NOT be required.
2. Is the copy framed as "review/customize defaults" vs "set up from scratch"?
3. Are smart defaults already selected?
4. Does the wording match: "Here are the [X] data points we'll track. Uncheck any you don't want or add missing ones"?
5. Is the interface scannable - can you quickly see what will be tracked?
6. Does the UI feel like configuration overhead, or like helpful customization?
7. Is it clear that users can skip/accept defaults if they want?

Rate the "setup burden" from 1-10 (where 10 is high burden) and suggest how to reduce friction.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| User does NOT need to manually identify data types | ☐ | | |
| Smart defaults are pre-selected | ☐ | | |
| Copy frames this as review/customize, not setup | ☐ | | |
| Uses recommended wording about tracking/customizing | ☐ | | |
| Input validation works for all expected inputs | ☐ | | |
| Edge cases handled (e.g., "All" as input works or gives helpful error) | ☐ | | |
| Can accept defaults and move forward quickly | ☐ | | |

---

### 1.4 Welcome Agent Completion & Redirect

#### Playwright Test Instructions
```javascript
// Complete all onboarding steps
// Click final "Get Started" or "Complete Setup" button
// Measure time until dashboard appears
// Verify URL changes to dashboard route
// Check for success message/confirmation
// Verify dashboard is fully loaded and interactive
// Test if user can re-access Welcome Agent if needed
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point 1:** Final onboarding screen (before completion)

**Vision LLM Prompt:**
```
Analyze this final onboarding screen:
1. Is there a clear, prominent CTA to complete setup?
2. Does the button text communicate what happens next (e.g., "Go to Dashboard")?
3. Is there a sense of accomplishment or progress completion?
4. Are there any last-minute instructions or tips that feel valuable?
5. Does the screen feel like a natural conclusion to the onboarding?

Rate the "completion experience" from 1-5 and suggest improvements.
```

**Screenshot Point 2:** Dashboard immediately after onboarding completion

**Vision LLM Prompt:**
```
Analyze this post-onboarding dashboard:
1. Does it clearly look like the main dashboard/home screen?
2. Is the transition from onboarding smooth and logical?
3. Are there any welcome messages or "next steps" guidance?
4. Is it immediately clear what the user should do next?
5. Does the user feel oriented or lost?

Rate the "landing experience" from 1-5 and suggest improvements for user orientation.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Successfully redirects to Dashboard upon completion | ☐ | | |
| Redirect happens within 2 seconds | ☐ | | |
| User receives confirmation of successful setup | ☐ | | |
| Dashboard is fully loaded and interactive | ☐ | | |
| Clear indication that onboarding is complete | ☐ | | |
| Consistent terminology: "Welcome Agent" used if referenced | ☐ | | |

---

## 2. AUTHENTICATION & ACCOUNT MANAGEMENT

### Purpose
Ensure users can access and exit the platform securely with clear, accessible controls.

### 2.1 Signup Page

#### Playwright Test Instructions
```javascript
// Navigate to root URL
// Verify dedicated signup page exists and is accessible
// Test signup form submission
// Verify required fields are clearly marked
// Test form validation for invalid inputs
// Verify successful signup proceeds to Welcome Agent
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Signup page

**Vision LLM Prompt:**
```
Analyze this signup page:
1. Is the purpose of the page immediately clear?
2. Are form fields appropriately labeled with clear expectations?
3. Is the visual hierarchy effective (most important elements stand out)?
4. Is the CTA button prominent and action-oriented?
5. Are there any friction points (too many fields, unclear requirements)?
6. Does the page feel trustworthy and professional?
7. Is there appropriate white space and visual breathing room?

Rate signup page quality from 1-5 and list friction points to address.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Dedicated signup page exists and is accessible | ☐ | | |
| Signup form is clear and concise | ☐ | | |
| Form validation provides helpful feedback | ☐ | | |
| Successful signup proceeds to Welcome Agent | ☐ | | |

---

### 2.2 Logout Functionality

#### Playwright Test Instructions
```javascript
// Log in to platform
// Navigate to multiple pages (dashboard, different sections)
// On each page, verify logout button is present and visible
// Document logout button location/position
// Click logout button
// Verify confirmation dialog (if applicable)
// Verify redirect to appropriate page (login/home)
// Attempt to navigate back (should not be logged in)
// Verify session is truly cleared
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Main dashboard/platform view with navigation visible

**Vision LLM Prompt:**
```
Analyze this interface for account management visibility:
1. Can you immediately identify the logout button/option? Where is it located?
2. Is the logout button appropriately visible without being intrusive?
3. Does the button location follow common UX patterns (top-right corner, user menu, etc.)?
4. Are there any other account management options visible (settings, profile)?
5. Is the user's identity/account clearly shown?
6. Does the navigation feel complete with account controls in logical places?

Rate account control visibility from 1-5 and specify exact location improvements.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Logout button exists and is clearly visible | ☐ | | |
| Logout button location: ________________ | ☐ | | |
| Logout button accessible from all main pages | ☐ | | |
| Logout functions correctly | ☐ | | |
| User redirected appropriately after logout | ☐ | | |
| Session fully cleared (cannot back-button to logged-in state) | ☐ | | |

---

## 3. NAVIGATION & INFORMATION ARCHITECTURE

### Purpose
Validate that users can easily navigate the platform and always know where they are and how to get where they need to go.

### 3.1 Primary Navigation & Home Access

#### Playwright Test Instructions
```javascript
// From dashboard, navigate to various sections
// From each section, verify presence of Home/Dashboard button
// Click Home/Dashboard button from each location
// Verify return to main dashboard
// Test "Return to Dashboard" link if Home button doesn't exist
// Navigate deep into nested views, test return to home
// Check for breadcrumb navigation
// Test back button behavior
// Verify current location is visually indicated
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Main navigation bar/menu from dashboard

**Vision LLM Prompt:**
```
Analyze this navigation interface:
1. Is there a clear Home or Dashboard button in the main navigation?
2. If no dedicated Home button, is "Return to Dashboard" easily accessible?
3. Does the navigation structure feel intuitive and well-organized?
4. Are navigation labels clear and descriptive?
5. Is the current location/page clearly indicated?
6. Is the information hierarchy clear (primary vs secondary navigation)?
7. Does the navigation follow familiar patterns?

Rate navigation clarity from 1-5 and specify missing navigation elements.
```

**Screenshot Point:** Navigation from a sub-page or deep section

**Vision LLM Prompt:**
```
From this deeper page view:
1. Can you easily identify how to return to the home/dashboard?
2. Is there a breadcrumb trail or clear navigation path shown?
3. Would a user feel oriented or potentially lost?
4. Are there multiple ways to navigate back/home?
5. Is the navigation persistent or does it disappear on sub-pages?

Rate ease of navigation from deep pages: 1-5, and suggest improvements.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Home/Dashboard button exists in main navigation | ☐ | | |
| Home button works from all pages | ☐ | | |
| If no Home button: "Return to Dashboard" is adequate | ☐ | | |
| Navigation structure is intuitive | ☐ | | |
| Current location clearly indicated | ☐ | | |
| Can navigate to any main section in ≤2 clicks | ☐ | | |
| Back navigation works as expected | ☐ | | |
| Navigation is consistent across all pages | ☐ | | |

---

### 3.2 Feature & Agent Naming/Clarity

#### Playwright Test Instructions
```javascript
// Locate "Profile Coach" in UI
// Check for tooltip/help text on hover
// Check for description/explanation text
// Navigate to Profile Coach (if applicable)
// Verify purpose is clear within 5 seconds of viewing
// Repeat for all agents/features with non-obvious names
// List all features that lack clear purpose indicators
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Profile Coach (and any other unclear features)

**Vision LLM Prompt:**
```
Analyze this feature/agent interface:
1. What is this feature called? Is the name self-explanatory?
2. Is there a visible description, tooltip, or help text explaining its purpose?
3. Within 3 seconds of seeing this, would a new user understand what it does?
4. Does the visual design or iconography help communicate purpose?
5. Is the naming consistent with similar features?
6. If this feature is not immediately clear, should it be renamed, better explained, or removed?

Rate "immediate comprehensibility" from 1-5 and recommend naming/description improvements.
```

**Screenshot Point:** Overview of all main features/agents

**Vision LLM Prompt:**
```
Looking at this overview of features:
1. Are all feature names clear and descriptive?
2. Is the terminology consistent and appropriate for business users (not developers)?
3. Are there any features that seem out of place or confusing?
4. Is "Welcome Agent" terminology used consistently for onboarding?
5. Would a new user understand the purpose of each feature at a glance?

List any features that need clarification or renaming.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| "Profile Coach" has clear description/tooltip | ☐ | | |
| Purpose of Profile Coach is immediately understandable | ☐ | | |
| If Profile Coach purpose is unclear, consider removal | ☐ | | |
| "Welcome Agent" terminology used consistently | ☐ | | |
| All features have clear, user-friendly names | ☐ | | |
| No technical jargon in feature names | ☐ | | |
| Help text/tooltips available for non-obvious features | ☐ | | |

---

## 4. DATA VISIBILITY & MANAGEMENT

### Purpose
Ensure users can easily see what data is being captured and access their research/company information without friction.

### 4.1 Company Data Points Visibility

#### Playwright Test Instructions
```javascript
// Navigate to company view/profile
// Locate where data points are displayed
// Count clicks required from dashboard to view data points
// Verify all configured data points are visible
// Test if data points can be edited/modified
// Check for search/filter functionality
// Verify data is organized logically
// Test with multiple companies if applicable
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Company view showing data points

**Vision LLM Prompt:**
```
Analyze this company data view:
1. Are the data points being captured clearly visible and easy to scan?
2. Is the information organized in a logical, hierarchical manner?
3. Can you quickly identify what data is being tracked for this company?
4. Is the layout clean and uncluttered?
5. Are data points labeled clearly?
6. Is there appropriate visual grouping or categorization?
7. Can you easily see what data exists vs what's missing?

Rate data visibility from 1-5 and suggest layout improvements.
```

**Screenshot Point:** Path from dashboard to data points view (multiple screenshots showing navigation)

**Vision LLM Prompt:**
```
Looking at this navigation path to view company data points:
1. How many clicks/steps did it take to reach this information?
2. Was the path intuitive or did it require exploration?
3. Are there clear visual indicators pointing to where this information lives?
4. Could this information be surfaced earlier or more prominently?

Rate accessibility of data points from 1-5 (where 5 is easily accessible).
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Easy to view which data points are captured per company | ☐ | | |
| Location of data point view: ________________ | ☐ | | |
| Data point visibility requires ≤2 clicks from main screen | ☐ | | |
| Data is presented in scannable, organized format | ☐ | | |
| Can identify what data is tracked at a glance | ☐ | | |
| Can easily edit/modify data points being tracked | ☐ | | |
| Data organization is logical and intuitive | ☐ | | |

---

### 4.2 Research History

#### Playwright Test Instructions
```javascript
// Navigate to Research History section
// Verify it displays all relevant chats/research
// If empty state appears when data exists, log as bug
// Test search/filter functionality
// Verify items are organized logically (date, company, topic)
// Check for clear labeling and timestamps
// Test clicking into individual research items
// Verify Research History updates after new research is saved
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Research History section with populated data

**Vision LLM Prompt:**
```
Analyze this Research History interface:
1. Is the purpose of this section immediately clear?
2. Are research items organized in a scannable, logical way?
3. Can you quickly understand what each research item is about?
4. Is there appropriate metadata (dates, companies, topics)?
5. Are there helpful filters or search capabilities visible?
6. Does the interface invite exploration or feel overwhelming?
7. Is there clear indication of how to access full research details?

Rate usability from 1-5 and suggest organizational improvements.
```

**Screenshot Point:** Research History empty state (if applicable)

**Vision LLM Prompt:**
```
Analyze this empty state:
1. Is the empty state helpful or confusing?
2. Does it explain what Research History is for?
3. Does it provide clear next steps or encourage action?
4. Could this empty state be mistaken for a bug or missing data?

Rate empty state effectiveness from 1-5 and suggest improvements.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Research History displays all relevant chats/research | ☐ | | |
| No incorrect empty state when data exists | ☐ | | |
| Purpose of Research History is immediately clear | ☐ | | |
| Tooltip/help text explains its function | ☐ | | |
| Can filter/search within Research History | ☐ | | |
| Items organized logically (date, company, etc.) | ☐ | | |
| Easy to access full details of each research item | ☐ | | |

---

## 5. CORE FUNCTIONALITY

### Purpose
Validate that primary user actions work reliably and provide appropriate feedback.

### 5.1 Save to Research Functionality

#### Playwright Test Instructions
```javascript
// Perform research or create content to save
// Locate "Save to Research" button
// Verify button is visible and enabled
// Click "Save to Research" button
// Verify success confirmation appears
// Navigate to Research History
// Verify saved item appears in Research History
// Test saving multiple items
// Test edge cases (saving same item twice, saving empty content)
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Interface with "Save to Research" button visible

**Vision LLM Prompt:**
```
Analyze this save functionality:
1. Is the "Save to Research" button clearly visible and identifiable?
2. Is it positioned where you'd expect to find a save action?
3. Does the button styling indicate it's interactive?
4. Is there any text or iconography that reinforces the action?
5. Does the button fit the overall design system?

Rate button visibility and clarity from 1-5.
```

**Screenshot Point:** Success confirmation after save

**Vision LLM Prompt:**
```
Analyze this save confirmation:
1. Is there a clear confirmation that the save was successful?
2. Does the confirmation provide enough information (what was saved, where it went)?
3. Is there a link or path to view the saved item?
4. Does the confirmation disappear automatically or require dismissal?
5. Is the confirmation noticeable but not disruptive?

Rate confirmation effectiveness from 1-5.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| "Save to Research" button is clearly visible | ☐ | | |
| Button functions correctly on first attempt | ☐ | | |
| Success confirmation appears after save | ☐ | | |
| Saved items appear in Research History | ☐ | | |
| Can save multiple items without issues | ☐ | | |
| Appropriate handling of edge cases | ☐ | | |

---

### 5.2 Form Validation & Error Handling

#### Playwright Test Instructions
```javascript
// Test all input forms across the platform
// Submit forms with invalid data (wrong format, empty required fields)
// Verify helpful error messages appear
// Verify error messages are specific, not generic
// Verify forms retain data after validation error
// Test field-level validation (real-time feedback)
// Test submission button disabled state during processing
// Verify success messages after successful submission
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Form with validation error displayed

**Vision LLM Prompt:**
```
Analyze this form error handling:
1. Is the error message clearly visible and noticeable?
2. Is the error message helpful and specific (not just "invalid")?
3. Is it clear which field has the error?
4. Does the error message explain how to fix the issue?
5. Is the visual treatment of the error appropriate (color, icon, position)?
6. Did the form retain the user's input?

Rate error handling quality from 1-5 and suggest improvements.
```

#### Manual Testing Checklist
| Criteria | Pass/Fail | Notes/Issues | Severity (L/M/H) |
|----------|-----------|--------------|------------------|
| Input fields accept expected formats | ☐ | | |
| Clear error messages for invalid inputs | ☐ | | |
| Error messages are helpful (explain how to fix) | ☐ | | |
| Forms don't clear on validation error | ☐ | | |
| Field-level validation provides real-time feedback | ☐ | | |
| Success messages appear after successful actions | ☐ | | |

---

## 6. HOLISTIC USER EXPERIENCE ASSESSMENT

### Purpose
Evaluate overall UX quality across the entire platform using comprehensive screenshots and user journey analysis.

### 6.1 Visual Consistency & Design System

#### Playwright Test Instructions
```javascript
// Take screenshots of 10-15 different pages/sections
// Navigate through primary user flows
// Document any visual inconsistencies
// Note typography variations
// Check button styling consistency
// Verify color usage aligns across views
// Check spacing and layout consistency
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Collection of 10-15 different screens across the platform

**Vision LLM Prompt:**
```
Analyze this collection of screens for visual consistency:
1. Is there a cohesive design system evident across all screens?
2. Are typography styles consistent (headers, body text, labels)?
3. Are button styles, colors, and treatments consistent?
4. Is spacing and layout consistent throughout?
5. Do color schemes feel unified or disjointed?
6. Are there any screens that feel out of place or poorly designed?
7. Does the platform feel professionally designed and polished?

Rate visual consistency from 1-5 and identify specific inconsistencies.
```

#### Manual Testing Checklist
| Criteria | Rating (1-5) | Notes |
|----------|--------------|-------|
| Visual design is consistent across platform | ☐☐☐☐☐ | |
| Typography hierarchy is clear and consistent | ☐☐☐☐☐ | |
| Button and interactive element styling is uniform | ☐☐☐☐☐ | |
| Color usage is purposeful and consistent | ☐☐☐☐☐ | |
| Platform feels polished and professional | ☐☐☐☐☐ | |

---

### 6.2 Information Clarity & Cognitive Load

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Dashboard/home screen

**Vision LLM Prompt:**
```
Analyze this dashboard for information clarity and cognitive load:
1. Is the information hierarchy immediately clear (most important info stands out)?
2. Is the dashboard overwhelming, appropriately informative, or too sparse?
3. Can you quickly understand the purpose of each section?
4. Are there clear next actions or CTAs?
5. Is copy concise and helpful, or verbose and technical?
6. Does the layout guide your eye naturally through the content?
7. What is the cognitive load score (1-10, where 10 is very high load)?

Rate clarity from 1-5 and suggest specific simplifications.
```

**Screenshot Point:** Most complex screen in the platform

**Vision LLM Prompt:**
```
Analyze this complex screen:
1. What makes this screen complex?
2. Is the complexity necessary or could it be simplified?
3. Are there clear visual groupings to manage the complexity?
4. Does the screen feel overwhelming or manageable?
5. Are there progressive disclosure opportunities (hiding less important info)?
6. Could information be broken across multiple views?

Rate manageability from 1-5 and suggest complexity reduction strategies.
```

#### Manual Testing Checklist
| Criteria | Rating (1-5) | Notes |
|----------|--------------|-------|
| Purpose of each feature is immediately clear | ☐☐☐☐☐ | |
| Copy is concise and helpful | ☐☐☐☐☐ | |
| User never feels confused about next steps | ☐☐☐☐☐ | |
| Appropriate help text/tooltips provided | ☐☐☐☐☐ | |
| Information is scannable and well-organized | ☐☐☐☐☐ | |
| Platform doesn't feel overwhelming | ☐☐☐☐☐ | |

---

### 6.3 Efficiency & User Flow

#### Playwright Test Instructions
```javascript
// Define 5 key user tasks (e.g., "research a company", "save research", "view data points")
// For each task, measure:
//   - Number of clicks to complete
//   - Time to complete
//   - Number of page loads/transitions
//   - Whether path is intuitive (did user navigate correctly without backtracking)
// Document optimal path vs actual path taken
// Identify any dead ends or confusing moments
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** User flow sequence for key task (multiple screenshots showing each step)

**Vision LLM Prompt:**
```
Analyze this user flow for [specific task]:
1. How many steps are shown in this flow?
2. Does each step feel necessary or are there redundant screens?
3. Is the flow linear and logical, or does it jump around?
4. Are there clear CTAs guiding the user forward at each step?
5. Where could steps be consolidated or removed?
6. Overall, does this flow feel efficient or cumbersome?

Rate flow efficiency from 1-5 and recommend consolidation opportunities.
```

#### Manual Testing Checklist
| Criteria | Rating (1-5) | Notes |
|----------|--------------|-------|
| Key tasks completed with minimal clicks | ☐☐☐☐☐ | |
| No unnecessary or redundant steps | ☐☐☐☐☐ | |
| Flow feels natural and intuitive | ☐☐☐☐☐ | |
| User can complete tasks without assistance | ☐☐☐☐☐ | |
| Platform doesn't require technical knowledge | ☐☐☐☐☐ | |

---

## 7. CRITICAL ISSUES RESOLUTION VALIDATION

### Purpose
Verify each issue from previous user feedback has been fully resolved.

#### Playwright Test Instructions
```javascript
// For each issue below, execute specific test case
// Document current state (fixed/not fixed)
// If fixed, verify solution is effective
// If not fixed, document severity and impact
```

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** For any unresolved issue, capture the relevant screen

**Vision LLM Prompt:**
```
Analyze whether this previous issue appears to be resolved:
[Include specific issue description]

1. Based on this screenshot, does the issue appear to be present or resolved?
2. If resolved, does the solution feel complete and well-executed?
3. If still present, how severe does this issue appear from a UX perspective?
4. What would be the ideal solution to this issue?

Provide clear assessment: RESOLVED or NOT RESOLVED, with explanation.
```

### Issue Validation Checklist

| Original Issue | Status | Notes | Screenshot Taken |
|----------------|--------|-------|------------------|
| ❌ No logout button | ☑ Fixed ☐ Not Fixed | Visible in sidebar header + collapsed state (`src/components/Sidebar.tsx`) | ☐ |
| ❌ Can't easily view data points per company | ☑ Fixed ☐ Not Fixed | Profile Coach summary card + completeness checklist (`src/pages/CompanyProfile.tsx`, `src/components/ProfileCompleteness.tsx`) | ☐ |
| ❌ No homescreen button (other than return to dashboard) | ☑ Fixed ☐ Not Fixed | Home CTA wired via sidebar `onHome` prop | ☐ |
| ❌ Save to research button not working | ☑ Fixed ☐ Not Fixed | Save dialog persists outputs via Supabase (`src/pages/DashboardNew.tsx`) | ☐ |
| ❌ Company name/URL confusion in onboarding | ☑ Fixed ☐ Not Fixed | URL detection auto-fills name + website (`src/pages/OnboardingEnhanced.tsx`) | ☐ |
| ❌ Onboarding flow too complex | ☑ Fixed ☐ Not Fixed | Welcome Agent guided steps with clarifying copy | ☐ |
| ❌ Profile Coach unclear purpose | ☑ Fixed ☐ Not Fixed | Renamed route `/profile-coach` + explainer banner (`src/pages/CompanyProfile.tsx`) | ☐ |
| ❌ Research History blank/unclear purpose | ☑ Fixed ☐ Not Fixed | Filtered history view with export controls (`src/pages/ResearchHistory.tsx`) | ☐ |
| ❌ Missing signup page | ☑ Fixed ☐ Not Fixed | Dedicated signup experience with approvals (`src/pages/Signup.tsx`) | ☐ |
| ❌ Users shouldn't identify data types | ☑ Fixed ☐ Not Fixed | Profile Coach infers data types automatically | ☐ |
| ❌ Data type input validation issues | ☑ Fixed ☐ Not Fixed | Validation handled during criterion capture (`src/pages/OnboardingEnhanced.tsx`) | ☐ |
| ❌ Dashboard redirect failure after onboarding | ☑ Fixed ☐ Not Fixed | `finishOnboarding` navigates to home with success message | ☐ |
| ❌ Welcome Agent naming inconsistency | ☑ Fixed ☐ Not Fixed | Onboarding copy + header use "Welcome Agent" consistently | ☐ |

---

## 8. SPIRIT OF FEEDBACK - GUIDING PRINCIPLES VALIDATION

### Purpose
Ensure the platform embodies the core principles derived from user feedback, not just fixes individual issues.

#### Screenshot & Vision LLM Analysis

**Screenshot Point:** Complete user journey from signup to completing first task (10-15 screenshots)

**Vision LLM Prompt:**
```
Analyze this complete user journey against these principles:

**SIMPLICITY FIRST**: Does the platform avoid making users do technical/complex work?
**CLEAR PURPOSE**: Does every feature have obvious value and function?
**EFFICIENT NAVIGATION**: Can users get anywhere in ≤3 clicks?
**SMART DEFAULTS**: Does the system do heavy lifting; users just customize?
**TRANSPARENT DATA**: Can users always see what's being tracked/saved?
**RELIABLE CORE FUNCTIONS**: Do primary actions work consistently?
**STREAMLINED ONBOARDING**: Does onboarding deliver value quickly without overwhelming?
**HELPFUL, NOT TECHNICAL**: Does copy speak to business users, not developers?

For each principle:
1. Rate how well the platform embodies it (1-5)
2. Provide specific examples supporting or contradicting the principle
3. Suggest improvements to better align with the principle

Provide overall assessment: Does this platform feel like it was designed with these principles in mind?
```

### Principles Checklist

| Principle | Pass/Fail | Evidence | Improvements Needed |
|-----------|-----------|----------|---------------------|
| **Simplicity First:** Users don't do technical work | ☐ | | |
| **Clear Purpose:** Every feature has obvious value | ☐ | | |
| **Efficient Navigation:** Anywhere in ≤3 clicks | ☐ | | |
| **Smart Defaults:** System does heavy lifting | ☐ | | |
| **Transparent Data:** Always see what's tracked | ☐ | | |
| **Reliable Core Functions:** Actions work consistently | ☐ | | |
| **Streamlined Onboarding:** Quick to value | ☐ | | |
| **Helpful, Not Technical:** Business-friendly copy | ☐ | | |

---

## 9. FINAL ASSESSMENT & RECOMMENDATIONS

### Overall Scores

**Welcome Agent (Onboarding):**
- **Completion Time:** _______ minutes (Target: <3 min)
- **Number of Steps:** _______ (Target: 3-5)
- **Complexity Rating:** ☐☐☐☐☐ (1 = simple, 5 = complex)
- **User Confidence:** ☐☐☐☐☐ (Would users feel confident after onboarding?)
- **Overall Rating:** ☐☐☐☐☐

**Platform UI/UX:**
- **Navigation Clarity:** ☐☐☐☐☐
- **Feature Clarity:** ☐☐☐☐☐
- **Data Visibility:** ☐☐☐☐☐
- **Visual Design:** ☐☐☐☐☐
- **Overall Rating:** ☐☐☐☐☐

### Critical Blockers
Issues that would prevent user adoption:
1. ________________
2. ________________
3. ________________

### Prioritized Recommendations

**🔴 High Priority (Must Fix):**
- ________________
- ________________
- ________________

**🟡 Medium Priority (Should Fix):**
- ________________
- ________________
- ________________

**🟢 Low Priority (Nice to Have):**
- ________________
- ________________
- ________________

### Vision LLM Summary Analysis

**Screenshot Point:** Dashboard with all major navigation visible + 3-5 key screens

**Vision LLM Prompt:**
```
Provide a comprehensive UX assessment of this platform:

1. **First Impressions**: What are the immediate strengths and weaknesses visible in these screens?

2. **Usability Score**: Rate the overall usability from 1-10, considering:
   - Information clarity
   - Navigation intuitiveness
   - Visual design quality
   - Task completion efficiency
   - Error prevention and handling

3. **Top 3 UX Strengths**: What does this platform do exceptionally well?

4. **Top 3 UX Issues**: What are the most critical UX problems that need immediate attention?

5. **Target User Assessment**: Based on the design and copy, who is the intended user? Does the platform successfully cater to business users vs technical users?

6. **Competitive Comparison**: Compared to modern SaaS platforms, how does this platform's UX quality rank? (Below average, average, above average, excellent)

7. **Recommendation**: Based on this assessment, would you recommend:
   - ✅ SHIP: Platform is ready for users
   - ⚠️ MINOR FIXES: A few issues need addressing first
   - 🛑 MAJOR REVISION: Significant UX work needed before launch

Provide specific, actionable recommendations for improvement.
```

---

## 10. TEST EXECUTION CHECKLIST

### Pre-Test Setup
- [ ] Playwright test environment configured
- [ ] Test user accounts created
- [ ] Vision LLM API access confirmed
- [ ] Screenshot storage location prepared
- [ ] Test data prepared (if needed)

### During Testing
- [ ] All Playwright test scripts executed
- [ ] Screenshots captured at designated points
- [ ] Vision LLM prompts sent for all screenshots
- [ ] Manual observations documented
- [ ] Edge cases tested
- [ ] Performance issues noted

### Post-Test Activities
- [ ] All data compiled and organized
- [ ] Vision LLM responses analyzed
- [ ] Critical issues prioritized
- [ ] Recommendations documented
- [ ] Report prepared for stakeholders
- [ ] Follow-up test plan created (if needed)

---

## Testing Session Summary
- **Testing Date:** _______
- **Total Issues Found:** _______
  - **Critical:** _______
  - **High:** _______
  - **Medium:** _______
  - **Low:** _______
- **Previous Issues Resolved:** _______ / 13
- **New Issues Discovered:** _______
- **Vision LLM Overall UX Score:** _______ / 10
- **Overall Recommendation:** ☐ Ship ☐ Minor Fixes Needed ☐ Major Revision Needed

**Next Steps:**
1. ________________
2. ________________
3. ________________
