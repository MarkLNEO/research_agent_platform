import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'

const root = process.cwd()
// Only analyze curated screenshots we explicitly captured for analysis.
// Avoid pulling in failing test screenshots from test-results (often login pages).
const targets = [
  path.join(root, 'test-artifacts')
]

const SMOKE = process.env.RUBRIC_SMOKE === '1'
const defaultSmokeList = 'onboarding-step-01-company,dashboard-signals-focused,research-exec-summary,signal-detail,meeting-prep-summary'
const smokeSet = new Set(
  (process.env.RUBRIC_SMOKE_IDS || defaultSmokeList)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)
const stageThreshold = Number(process.env.RUBRIC_STAGE_THRESHOLD ?? '600000')
const perImageThreshold = Number(process.env.RUBRIC_IMAGE_THRESHOLD ?? '120000')
const scriptStart = Date.now()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function collectPngs(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectPngs(p))
    else if (/\.png$/i.test(entry.name)) files.push(p)
  }
  return files
}

function loadAgentsCriteria() {
  try {
    const md = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    // Minimal, robust extraction: hardcode concise rubrics with optional fallbacks
    const greetingRubric = [
      'Non-empty greeting with time-of-day + first name',
      'Prominent hot signals with actions; show counts/severity',
      'Summary stats: accounts tracked/hot/needs update',
      'Smart suggestions chips (next-best actions)',
      'Upcoming meetings with prep ready (if calendar connected)'
    ].join('; ');
    const deepResearchRubric = [
      'Executive Summary first, strong visual hierarchy',
      '≥3 recent signals (if exist)',
      'Evaluate all custom criteria',
      '≥2 decision makers with personalization',
      'ICP fit score + recommended next action',
      'Citations: sources for major claims',
      'Performance: delivered < 3 minutes'
    ].join('; ');
    return { greetingRubric, deepResearchRubric };
  } catch {
    // Fallback to embedded summaries
    return {
      greetingRubric: 'Greeting + name; show hot signals with actions; account stats; smart suggestions; upcoming meetings with prep',
      deepResearchRubric: 'Exec summary; ≥3 signals; criteria evaluation; ≥2 decision makers; fit score + next step; sources; <3min'
    };
  }
}

const defaultDescribePrompt = (greetingRubric, deepResearchRubric) => `You are a seasoned product designer and UX critic.

Given a single UI screenshot from a sales research app, provide:
1) Page type (what view this appears to be)
2) Key CTAs visible
3) Obvious errors/notices (loading, empty, warnings)
4) A11y risks (contrast, unlabeled icons, tiny tap targets, focus states)
5) Alignment to product rubrics:
   - Proactive Dashboard Greeting rubric: ${greetingRubric}
   - Deep Research Output rubric: ${deepResearchRubric}

Then provide a "Vibe Scorecard" (1–10) with very brief rationales:
- Aesthetics/Polish (1–10)
- Visual Hierarchy (1–10)
- Clarity/Comprehension (1–10)
- Momentum/Next-step Energy (1–10)
- Proactive Greeting fit (1–10)
- Deep Research fit (1–10)
- Accessibility (1–10)

Finally, output 3 specific, high-leverage improvements (bullets beginning with a verb).

Keep output concise and skimmable.`;

const onboardingStepPrompt = `Analyze this onboarding step for complexity and clarity:
1. Is the purpose of this step immediately obvious?
2. Is the value proposition clear (why user should provide this information)?
3. How many decisions or inputs are required on this screen?
4. Is there a progress indicator? If so, is it clear how far along the user is?
5. Is the cognitive load appropriate for an onboarding experience?
6. Could this step be simplified, combined with another step, or eliminated?
7. Are CTAs (buttons) clear and action-oriented?
8. Is the visual design clean and focused, or cluttered?

Provide a complexity score (1-10, where 10 is very complex) and specific recommendations to simplify.`;

const rubricDescribePrompts = new Map([
  ['test-artifacts/rubric/onboarding-step-01-company.png', `Analyze this onboarding screen for UX quality. Evaluate:
1. Is it immediately clear what information is being requested (company name vs URL)?
2. Are the form labels and placeholders clear and unambiguous?
3. Is there helpful microcopy or guidance to prevent errors?
4. Does the visual hierarchy guide the user's attention appropriately?
5. Is the form field validation visible and understandable?
6. Does the screen feel overwhelming or appropriately simple?
7. Is there a clear value proposition explaining why this information is needed?

Rate each criterion 1-5 and provide specific UI/UX improvement recommendations.`],
  ['test-artifacts/rubric/onboarding-step-01a-invalid-url.png', `Analyze this onboarding screen for UX quality. Evaluate:
1. Is it immediately clear what information is being requested (company name vs URL)?
2. Are error states communicated clearly when the wrong input type is provided?
3. Does the validation message guide the user toward the correct format?
4. Does the layout help the user recover quickly?
5. Rate clarity and helpfulness of this error state (1-5) and give improvements.`],
  ['test-artifacts/rubric/onboarding-step-01b-company-confirmed.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-02-website.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-03-role.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-03-use-case.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-03-industry.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-03-icp.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-04-criteria.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-05-links.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-06-competitors.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-07-signals.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-08-titles.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-step-09-focus.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-mid-flow.png', onboardingStepPrompt],
  ['test-artifacts/rubric/onboarding-flow-overview.png', `Looking at this complete onboarding sequence:
1. What is the total number of steps shown?
2. Does the flow feel too long or appropriately concise?
3. Are there any steps that appear redundant or unnecessary?
4. Is there a logical progression from one step to the next?
5. Where could steps be consolidated without losing essential information?
6. Overall, would you rate this as "simple" (1-3 steps), "moderate" (4-5 steps), or "complex" (6+ steps)?

Recommend an ideal flow with specific consolidation suggestions.`],
  ['test-artifacts/rubric/onboarding-complete.png', `Evaluate the first post-onboarding dashboard experience:
1. Does the greeting surface critical insights immediately?
2. Are counts (tracked accounts, hot signals, needs update) prominent and comprehensible?
3. Are suggested next actions (chips/buttons) relevant and actionable?
4. Is there clear indication of upcoming meetings/prep if available?
5. Rate how confident a user would feel proceeding after onboarding (1-5) and suggest improvements.`],
  ['test-artifacts/rubric/configuration-data-points.png', `Analyze this data configuration interface:
1. Does it clearly explain what the user is configuring?
2. Are defaults or recommendations provided to guide the user?
3. How easy is it to add, remove, or adjust data points?
4. Are validation errors or constraints communicated effectively?
5. Is there an obvious primary action once configuration is finished?
6. Identify the top usability risks and recommend improvements.`],
  ['test-artifacts/rubric/signal-settings.png', `Audit the signal settings page:
1. Are monitored signal types, severities, and cadence clearly explained?
2. Is it obvious how to add, edit, or remove monitored signals?
3. Do defaults align with high-value triggers for an enterprise AE?
4. Evaluate hierarchy between critical vs. informational alerts.
5. Recommend adjustments to make this configuration faster and less error-prone.`],
  ['test-artifacts/rubric/dashboard-initial-greeting.png', `Review the proactive dashboard greeting in a clean state:
1. Is the salutation (time of day + name) prominent and personable?
2. Do key metrics (tracked accounts, hot, needs update) appear without overwhelming the user?
3. Are suggestion chips relevant when no signals exist?
4. Does the layout set expectations for what the agent will monitor next?
Provide a 1-5 confidence score on how ready the user feels after onboarding and give improvements.`],
  ['test-artifacts/rubric/dashboard-signals-focused.png', `Evaluate the dashboard when hot signals are present:
1. Are urgent signals visually prioritized with severity coding?
2. Does each alert communicate why it matters and what to do next?
3. Are actions (research, view all signals) obvious and low-friction?
4. Does the rest of the dashboard remain legible despite the alert stack?
Give two quick UX adjustments to improve clarity.`],
  ['test-artifacts/rubric/research-exec-summary.png', `Critique the executive summary card:
1. Does it immediately communicate why this account matters now?
2. Are scores (ICP fit, signals, composite) legible and contextualized?
3. Is the recommended next action actionable and time-bound?
4. List two tweaks to sharpen prioritization or storytelling.`],
  ['test-artifacts/rubric/research-signals-section.png', `Evaluate the buying signals section:
1. Are signal types, recency, and impact obvious at a glance?
2. Do severity indicators map to the rubric's critical/high/medium definitions?
3. Is it clear how many total signals are active and what to tackle first?
Suggest improvements that would help an AE brief leadership quickly.`],
  ['test-artifacts/rubric/research-custom-criteria.png', `Review the custom criteria grid:
1. Does each criterion show status, value found, and confidence as required?
2. Can the AE see at a glance which criteria are unmet or unknown?
3. Is sourcing or evidence accessible for each row?
Recommend UI adjustments to speed up qualification.`],
  ['test-artifacts/rubric/research-decision-makers.png', `Audit the decision makers section:
1. Do at least two contacts include role, context, and personalization cues?
2. Are call-to-action buttons (draft email, LinkedIn) aligned with outreach flow?
3. Does the layout help an AE choose who to engage first?
List improvements to strengthen personalization signals.`],
  ['test-artifacts/rubric/research-company-overview.png', `Check the company overview block:
1. Are core firmographics (industry, size, location, founded, website) complete?
2. Is the hierarchy clear enough for a 5-second skim?
3. Note any missing fields critical for enterprise account research.`],
  ['test-artifacts/rubric/research-sources.png', `Evaluate the sourcing list:
1. Are there at least two credible sources with clickable links?
2. Do titles make it clear what evidence each source provides?
3. Suggest ways to improve trustworthiness or reduce clutter.`],
  ['test-artifacts/rubric/quick-research-summary.png', `Grade this Quick Facts response:
1. Does it deliver the promised snapshot (industry, size, leaders, recent news, fit score) in under 6 sections?
2. Is the formatting scannable for a 30-second read?
3. Highlight any missing essentials or extra noise.`],
  ['test-artifacts/rubric/specific-question-response.png', `Evaluate this specific research answer:
1. Does it provide a direct, cited response to the user's question?
2. Are evidence and next-step suggestions included?
3. Flag any ambiguity or unsupported claims.`],
  ['test-artifacts/rubric/signals-feed.png', `Review the signals feed list:
1. Can the AE filter or scan by severity/date easily?
2. Are descriptions actionable without opening details?
3. Suggest optimizations to manage 20+ signals efficiently.`],
  ['test-artifacts/rubric/signal-detail.png', `Assess the signal detail drawer:
1. Does it surface severity, description, date, and source link?
2. Are mark-as-viewed and dismiss controls obvious?
3. Is there a clear path to launch updated research from here?
Recommend two UI tweaks.`],
  ['test-artifacts/rubric/account-dashboard.png', `Analyze the tracked account overview:
1. Are hot/warm/stale indicators easy to parse?
2. Does the layout support scanning 5+ accounts quickly?
3. Highlight opportunities to emphasize risk/opportunity states.`],
  ['test-artifacts/rubric/account-card-hot.png', `Critique this hot account card:
1. Does it justify why the account is hot (signals, scores, recency)?
2. Are action affordances present (open signals, research, notes)?
3. Suggest improvements to emphasize urgency.`],
  ['test-artifacts/rubric/account-card-empty.png', `Evaluate the empty/low-signal account card:
1. Does it communicate that no new activity exists?
2. Are next-step prompts available (refresh research, add notes)?
3. Recommend copy or visual tweaks to avoid dead-ends.`],
  ['test-artifacts/rubric/account-detail-research-history.png', `Assess the research history list card:
1. Does it concisely summarize the report (subject, summary, score, recency)?
2. Are selection and bulk actions accessible?
3. Identify opportunities to highlight account changes since last research.`],
  ['test-artifacts/rubric/meeting-prep-summary.png', `Review the meeting prep High Level summary:
1. Does it capture timing, objective, and critical insights in <5 bullets?
2. Would an AE feel confident walking into the call after reading this?
3. Suggest enhancements to sharpen relevance.`],
  ['test-artifacts/rubric/meeting-prep-decision-makers.png', `Evaluate the meeting prep decision makers section:
1. Are roles, priorities, and personalization hooks clear for each attendee?
2. Does the layout make delegation (who handles whom) obvious?
3. Note any missing prep info the AE would need.`],
  ['test-artifacts/rubric/meeting-prep-actions.png', `Critique the meeting prep recommended actions:
1. Are steps sequenced, time-bound, and specific?
2. Do they align with the account's buying signals and stakeholders?
3. Provide ideas to tighten accountability or follow-up cues.`],
  ['test-artifacts/rubric/navigation-sidebar.png', `Assess the primary navigation sidebar:
1. Are labels/iconography clear for main workflows (chat, history, settings)?
2. Is the hierarchy logical for an AE's daily cadence?
3. Suggest adjustments to improve discoverability or reduce clutter.`],
  ['test-artifacts/rubric/navigation-compact.png', `Evaluate the collapsed navigation:
1. Do icons retain meaning without labels?
2. Are tooltips or affordances present to avoid disorientation?
3. Recommend improvements for rapid toggling between states.`],
  ['test-artifacts/rubric/global-search.png', `Review the research search input:
1. Is affordance for search/filtering obvious?
2. Are supporting controls (filters, sort) discoverable from this control?
3. Suggest ways to clarify scope (reports, notes, accounts).`],
  ['test-artifacts/rubric/help-support.png', `Evaluate this help/support touchpoint:
1. Does it clearly explain why the banner/notices appear?
2. Are recommended actions contextual and easy to follow?
3. Provide feedback on tone and persistence (is dismissal reasonable?).`],
  ['test-artifacts/rubric/final-overview-collage.png', `Provide an overall UX verdict based on this composite view:
1. Does the platform communicate actionability, prioritization, and trust?
2. Identify the strongest and weakest moments across the captured UI.
3. Give a 1-10 recommendation score for the AE persona and justify it.`],
  ['test-artifacts/rubric/dashboard-no-signals.png', `Assess the dashboard when accounts exist but signals are cleared:
1. Does the empty state reassure the user and suggest smart next steps?
2. Are account stats still informative without alert noise?
3. Highlight any ambiguity between "no news" and "data stale".`],
]);

async function* streamDescribe(filePath, promptOverride) {
  const b64 = fs.readFileSync(filePath).toString('base64')
  const { greetingRubric, deepResearchRubric } = loadAgentsCriteria();
  const promptText = promptOverride || defaultDescribePrompt(greetingRubric, deepResearchRubric);
  const stream = await openai.responses.stream({
    model: 'gpt-5',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: promptText },
          { type: 'input_image', image_url: `data:image/png;base64,${b64}` }
        ]
      }
    ]
  })
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      yield event.delta
    }
  }
  await stream.finalResponse()
}

async function jsonScore(filePath, greetingRubric, deepResearchRubric) {
  const b64 = fs.readFileSync(filePath).toString('base64')
  const stream = await openai.responses.stream({
    model: 'gpt-5',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Produce ONLY a JSON object for this screenshot with the following shape:\n{\n  "scores": {\n    "aesthetics": 1-10,\n    "hierarchy": 1-10,\n    "clarity": 1-10,\n    "momentum": 1-10,\n    "proactive_greeting_fit": 1-10,\n    "deep_research_fit": 1-10,\n    "accessibility": 1-10\n  },\n  "issues": ["short bullet", ...],\n  "improvements": ["high leverage change", ...],\n  "notes": "one sentence"\n}\n\nRubrics:\n- Proactive Greeting: ${greetingRubric}\n- Deep Research: ${deepResearchRubric}` },
          { type: 'input_image', image_url: `data:image/png;base64,${b64}` }
        ]
      }
    ],
    text: { format: { type: 'text' } },
    store: false
  })
  let text = ''
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      text += event.delta
    }
  }
  const final = await stream.finalResponse()
  if (!text) {
    if (Array.isArray(final.output)) {
      const msg = final.output.find(i => i?.type === 'message')
      if (msg?.content?.[0]?.text) text = msg.content[0].text
      else {
        const t = final.output.filter(i => i?.type === 'output_text' && typeof i.text === 'string').map(i => i.text).join('\n')
        if (t) text = t
      }
    } else if (final.output_text) {
      text = String(final.output_text)
    }
  }
  const match = text.match(/\{[\s\S]*\}$/)
  try { return JSON.parse(match ? match[0] : text) } catch { return null }
}

async function runWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      const itemStart = Date.now();
      const output = await worker(items[index], index);
      const elapsed = Date.now() - itemStart;
      if (perImageThreshold && elapsed > perImageThreshold) {
        throw new Error(`Vision analysis for ${items[index]} exceeded ${perImageThreshold}ms (took ${elapsed}ms)`);
      }
      if (stageThreshold && Date.now() - scriptStart > stageThreshold) {
        throw new Error(`Vision analysis exceeded stage threshold ${stageThreshold}ms`);
      }
      results[index] = output;
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

async function main() {
  let images = targets.flatMap(collectPngs)
  if (SMOKE) {
    images = images.filter(p => smokeSet.has(path.basename(p, '.png')))
  }
  // Skip any images that look like login or error overlays to keep the signal clean.
  images = images.filter(p => !/login/i.test(path.basename(p)) && !/test-failed/i.test(p))
  if (images.length === 0) {
    console.log('No screenshots found in test-artifacts/ or test-results/')
    return
  }
  const outPath = path.join(root, 'test-artifacts', 'screenshot_analysis.md')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `# Screenshot Analysis\n\nReviewed ${images.length} image(s).\n\n`)

  const analyses = await runWithLimit(images, 4, async (img, index) => {
    const relKey = path.relative(root, img).split(path.sep).join('/');
    const promptOverride = rubricDescribePrompts.get(relKey) || null;
    let buf = '';
    for await (const token of streamDescribe(img, promptOverride)) {
      buf += token;
    }
    let score = null;
    try {
      const { greetingRubric, deepResearchRubric } = loadAgentsCriteria();
      score = await jsonScore(img, greetingRubric, deepResearchRubric);
    } catch (e) {
      console.error('Score generation failed for', relKey, e);
    }
    console.log(`[vision] analyzed ${index + 1}/${images.length}: ${relKey}`);
    return { file: path.relative(root, img), description: buf, score };
  });

  const jsonOut = []
  for (const result of analyses) {
    fs.appendFileSync(outPath, `\n## ${result.file}\n\n${result.description}\n`)
    if (result.score) {
      jsonOut.push({ file: result.file, ...result.score })
    }
  }
  // Save machine-readable report
  try {
    const jsonPath = path.join(root, 'test-artifacts', 'vision_report.json')
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2))
    console.log(`Saved JSON report to ${path.relative(root, jsonPath)}`)
  } catch {}
  console.log(`\nSaved analysis to ${path.relative(root, outPath)}`)
  const totalElapsed = Date.now() - scriptStart
  console.log(`[vision] processed ${images.length} screenshot(s) in ${(totalElapsed / 1000).toFixed(1)}s`)
  if (stageThreshold && totalElapsed > stageThreshold) {
    throw new Error(`Vision analysis finished but exceeded stage threshold ${stageThreshold}ms (took ${totalElapsed}ms)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
