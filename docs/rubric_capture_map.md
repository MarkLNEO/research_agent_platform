# Rubric Screenshot Capture Map

This document enumerates every screenshot that must be captured for automated rubric evaluation, aligned with `docs/e2e_rubric.md`. The list is grouped by rubric section and provides:

- **ID** – unique identifier / filename (`test-artifacts/rubric/<id>.png`)
- **When** – exact moment in the flow where the capture occurs
- **Cadence** – any loop/iteration requirements
- **Purpose** – rubric reference + rationale for the image
- **Vision Prompt** – the rubric prompt subset that must be applied

---

## 1. Welcome Agent (Onboarding Flow)

### 1.1 Initial Setup & Company Information
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `onboarding-step-01-company.png` | On first onboarding screen before any input | Evaluate clarity of company name vs URL request (rubric §1.1) | “Analyze this onboarding screen for UX quality...” (rubric §1.1) |
| `onboarding-step-01a-invalid-url.png` | After attempting to enter URL in company name field and triggering validation | Confirm error/validation messaging (rubric §1.1) | Same as above |

### 1.2 Onboarding Flow Complexity
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `onboarding-step-01-company.png` | First onboarding prompt before input | Rubric §1.1 emphasis on clarity | §1.1 prompt |
| `onboarding-step-01a-invalid-url.png` | Validation/error state for company name | Rubric §1.1 error handling | Error variant prompt |
| `onboarding-step-01b-company-confirmed.png` | Same prompt populated correctly | Bridge into step flow | Step prompt |
| `onboarding-step-02-website.png` | Website URL capture | Rubric §1.2 per-step analysis | Step prompt |
| `onboarding-step-03-role.png` | Role identification | Same | Same |
| `onboarding-step-03-use-case.png` | Use-case selection | Same | Same |
| `onboarding-step-03-industry.png` | Industry question | Same | Same |
| `onboarding-step-03-icp.png` | ICP definition | Same | Same |
| `onboarding-step-04-criteria.png` | Custom qualifying criteria builder | Same | Same |
| `onboarding-mid-flow.png` | Conversation snapshot mid-way (after criteria) | Shows running context | Same |
| `onboarding-step-05-links.png` | Additional data sources / links | Same | Same |
| `onboarding-step-06-competitors.png` | Competitor capture | Same | Same |
| `onboarding-step-07-signals.png` | Buying signals selection | Same | Same |
| `onboarding-step-08-titles.png` | Target titles question | Same | Same |
| `onboarding-step-09-focus.png` | Research focus selection | Same | Same |
| `onboarding-flow-overview.png` | Post-onboarding summary chat | Rubric §1.2 overall flow evaluation | “Looking at this complete onboarding sequence...” |

> **Cadence:** Each per-step capture happens once per run in sequential order. If the flow dynamically shortens based on prior answers, capture whichever steps appear for this user journey.

### 1.3 Data Point Selection/Configuration
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `configuration-data-points.png` | Screen where user configures research/data points (if present in onboarding or soon after) | Evaluate configuration UX (rubric §1.3) | “Analyze this data configuration interface...” |

If onboarding defers configuration to a later chat step, capture the first dedicated screen that handles data point selection.

### 1.4 Signal Preferences Setup (if part of onboarding)
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `onboarding-signal-preferences.png` | Any explicit signal-preference builder encountered during onboarding | Rubric §1.3 extensions | Use same prompt as §1.3 or custom signal prompt |

---

## 2. Proactive Dashboard Greeting
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `dashboard-initial-greeting.png` | Immediately after onboarding, first landing on dashboard | Validate proactive greeting content (rubric §2, §5.1) | Custom prompt per rubric §2 |
| `dashboard-signals-focused.png` | Dashboard state when hot signals exist (seed via fixtures) | Evaluate signal surfacing | Same |
| `dashboard-no-signals.png` | Dashboard state with no signals (edge case) | Ensure empty-state messaging | Same |

---

## 3. Deep Company Research Output
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `research-exec-summary.png` | Immediately after initiating “Deep Account Research” on a company | Confirm executive summary structure | Custom prompt: rubric §1 of Deep Research |
| `research-signals-section.png` | Same report, scrolled to signals section | Validate signals timeline formatting | Same |
| `research-custom-criteria.png` | Same report, section on custom criteria | Assess criteria evaluation | Same |
| `research-decision-makers.png` | Same report, decision makers section | Evaluate personalization & CTAs | Same |
| `research-company-overview.png` | Collapsed/expanded overview section | Confirm default states | Same |
| `research-sources.png` | Sources section | Ensure citations & actions | Same |

> **Cadence:** Single report per run, but capture multiple segments. If easier, capture one full-page screenshot per section (scroll to section and capture) rather than stitched image.

---

## 4. Quick Research / Quick Facts Output
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `quick-research-summary.png` | After requesting “Quick Facts” | Validate quick mode structure | Prompt tailored to quick facts rubric |

---

## 5. Specific Question Research
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `specific-question-response.png` | After asking a targeted question (e.g., “What security tools does X use?”) | Check clarity, citations, directness | Prompt from rubric §1.C |

---

## 6. Signal Detection & Alerts
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `signals-feed.png` | Signals list with active alerts | Validate alert layout and actions | Signal rubric prompt |
| `signal-detail.png` | Expanded signal detail/drawer | Evaluate detail clarity | Same |
| `signal-settings.png` | Signal preference configuration page (also used in §1.3) | Review configuration experience | Same |

Edge cases: screenshot both “no signals yet” and “critical signal” variations if possible.

---

## 7. Account Tracking & Monitoring
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `account-dashboard.png` | Account portfolio/summary view | Assess monitoring overview UX | Account rubric prompt |
| `account-card-hot.png` | Individual account card with hot signal | Evaluate key metrics arrangement | Same |
| `account-card-empty.png` | Account with no signals / needs update | Confirm empty messaging | Same |
| `account-detail-research-history.png` | Account detail / history view | Validate past research organization | Same |

---

## 8. Meeting Intelligence
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `meeting-prep-summary.png` | Meeting prep High Level summary (discovery call) | Assess prep structure (rubric §5) | Meeting High Level summary prompt |
| `meeting-prep-decision-makers.png` | Meeting prep personalization section | Evaluate alignment with rubric requirements | Same |
| `meeting-prep-actions.png` | Meeting prep recommended actions | Same |

If multiple meeting types exist (discovery, demo, negotiation), capture one per type or note slope.

---

## 9. Platform Navigation / Core UX
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `navigation-sidebar.png` | Main sidebar expanded state | Evaluate clarity of nav labels | Navigation prompt |
| `navigation-compact.png` | Sidebar collapsed or alternate nav | Ensure icons & tooltips clarity | Same |
| `global-search.png` | Global search or command palette | Assess discoverability | Same |
| `help-support.png` | Help/support modal or section | Evaluate support access | Same |

---

## 10. Final Assessment Composite
| ID | When | Purpose | Vision Prompt |
|----|------|---------|---------------|
| `final-overview-collage.png` | Collage / multi-screen board (dashboard, research output, signal settings, meeting prep) | Feed into final rubric vision prompt (overall UX assessment) | “Provide a comprehensive UX assessment of this platform...” |

Implementation note: This can be a stitched image created post-run (e.g., via Sharp) or a large capture covering multiple views in tabs. Alternatively, compile prompts referencing individual screenshots if collage automation is heavy.

---

## Capture Cadence Summary
- **Onboarding**: 1 invalid validation + 9 step screenshots + overview = 11 images.
- **Dashboard (Proactive)**: at least 3 states (greeting, hot signals, no signals).
- **Research outputs**: 7 deep sections, 1 quick facts, 1 specific question.
- **Signals**: 3 captures (feed, detail/drawer, settings).
- **Accounts**: 4 captures.
- **Meeting prep**: 3 captures (per meeting type sample).
- **Navigation**: 4 captures.
- **Final collage**: 1 image.

Total baseline captures per run: ~33 images.

Add more variants if the product has additional flows (e.g., bulk upload screens, prompt builder overlays) relevant to the rubric.

---

## Next Implementation Steps
1. Update `rubric.spec.ts` (and additional Playwright specs if needed) to capture each ID above, ensuring deterministic navigation between states.
2. Enhance fixture seeding (e.g., insert signals, accounts, meetings) so states are reproducible before capturing.
3. Update `scripts/describe-screenshots.mjs` to map each filename to its rubric-specific prompt (replace fallback).
4. Ensure `scripts/rubric-eval.mjs` either enforces thresholds globally or allows per-section thresholds via env.
