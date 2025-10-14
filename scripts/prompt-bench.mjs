import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 })

function loadRubrics() {
  try {
    const md = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')
    const greeting = 'Greeting+name; surface hot signals with actions; summary stats; smart suggestions; upcoming meetings with prep'
    const deep = 'Exec summary first; ≥3 signals; criteria eval; ≥2 decision makers; ICP fit + next step; sources; <3min'
    return { greeting, deep }
  } catch {
    return {
      greeting: 'Greeting+name; signals+actions; stats; suggestions; meetings',
      deep: 'Exec summary; signals; criteria; DMs; fit+next step; sources; speed'
    }
  }
}

function buildSystemPrompt(userContext) {
  const { profile, customCriteria = [], signals = [], disqualifiers = [] } = userContext || {}
  const ctx = []
  if (profile?.company_name) ctx.push(`Company: ${profile.company_name}`)
  if (profile?.company_url) ctx.push(`Website: ${profile.company_url}`)
  if (profile?.industry) ctx.push(`Industry: ${profile.industry}`)
  if (profile?.user_role) ctx.push(`Role: ${profile.user_role}`)
  if (profile?.use_case) ctx.push(`Use Case: ${profile.use_case}`)
  if (customCriteria.length) ctx.push(`Criteria: ${customCriteria.map(c => `${c.field_name} (${c.importance})`).join('; ')}`)
  if (signals.length) ctx.push(`Signals: ${signals.map(s => `${s.signal_type} (${s.importance})`).join('; ')}`)
  if (disqualifiers.length) ctx.push(`Disqualifiers: ${disqualifiers.map(d => d.criterion).join('; ')}`)

  return `You are a B2B research assistant for sales.
<policy>
- Use web_search only for research/verification.
- Stream short deltas; use Markdown; avoid boilerplate.
</policy>
<output>
Use clear headings and lists; cite sources when used.
</output>
<context>\n${ctx.join('\n')}\n</context>`
}

async function judgeOutput({ prompt, output, rubrics }) {
  const stream = await openai.responses.stream({
    model: 'gpt-5-mini',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'You are a strict rubric-based evaluator. Respond with a single JSON object only.' }] },
      { role: 'user', content: [
        { type: 'input_text', text: `EVALUATE this assistant output against the rubrics. Return JSON:\n{\n  "scores": {"alignment": 1-10, "deep_research_fit": 1-10},\n  "issues": ["issue"...],\n  "improvements": ["action"...]\n}\n\nRubrics:\n- Proactive Greeting: ${rubrics.greeting}\n- Deep Research: ${rubrics.deep}\n\nPROMPT:\n${prompt}\n\nOUTPUT:\n${output}` }
      ]}
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
      else text = final.output.filter(i => i?.type === 'output_text').map(i => i.text).join('\n')
    } else if (final.output_text) text = String(final.output_text)
  }
  try { return JSON.parse(text) } catch { return null }
}

async function runScenario({ userContext, query }) {
  const sys = buildSystemPrompt(userContext)
  const stream = await openai.responses.stream({
    model: 'gpt-5-mini',
    input: [
      { role: 'system', content: [{ type: 'input_text', text: sys }] },
      { role: 'user', content: [{ type: 'input_text', text: query }] }
    ],
    tools: [{ type: 'web_search' }],
    text: { format: { type: 'text' }, verbosity: 'low' },
    reasoning: { effort: 'medium' },
    store: false
  })
  let out = ''
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      out += event.delta
    }
  }
  const final = await stream.finalResponse()
  if (!out) {
    if (Array.isArray(final.output)) {
      const msg = final.output.find(i => i?.type === 'message')
      if (msg?.content?.[0]?.text) out = msg.content[0].text
      else out = final.output.filter(i => i?.type === 'output_text').map(i => i.text).join('\n')
    } else if (final.output_text) out = String(final.output_text)
  }
  return { sys, out }
}

async function main() {
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const testEmail = process.env.E2E_EMAIL || 'codex.e2e@nevereverordinary.com'
  const { data: users } = await supa.auth.admin.listUsers()
  const user = users.users.find(u => (u.email || '').toLowerCase() === testEmail.toLowerCase())
  if (!user) throw new Error('No test user found')

  const [profile, criteria, prefs, disq] = await Promise.all([
    supa.from('company_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supa.from('user_custom_criteria').select('*').eq('user_id', user.id),
    supa.from('user_signal_preferences').select('*').eq('user_id', user.id),
    supa.from('user_disqualifying_criteria').select('*').eq('user_id', user.id)
  ])

  const userContext = {
    profile: profile.data || {},
    customCriteria: criteria.data || [],
    signals: prefs.data || [],
    disqualifiers: disq.data || []
  }

  const rubrics = loadRubrics()
  const scenarios = [
    { name: 'Deep account research', query: 'Research Boeing' },
    { name: 'Quick facts', query: 'Quick facts: Lockheed Martin' },
    { name: 'Specific question', query: 'Who is the CISO of Raytheon and recent security incidents?' }
  ]

  const results = []
  for (const s of scenarios) {
    let out = ''
    let sys = ''
    let judge = null
    let error = null
    // Retry the scenario a couple of times on transient failures
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await runScenario({ userContext, query: s.query })
        sys = r.sys
        out = r.out
        break
      } catch (e) {
        error = `scenario_error_attempt_${attempt}: ${e?.message || e}`
        if (attempt < 3) await new Promise(res => setTimeout(res, attempt * 1000))
      }
    }
    // Only attempt judging if we have output
    if (out) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          judge = await judgeOutput({ prompt: `${sys}\n\nUSER:${s.query}`, output: out, rubrics })
          break
        } catch (e) {
          error = `judge_error_attempt_${attempt}: ${e?.message || e}`
          if (attempt < 2) await new Promise(res => setTimeout(res, attempt * 1000))
        }
      }
    }
    results.push({ name: s.name, query: s.query, output: out, judge, error })
  }

  const reportPath = path.join(root, 'test-artifacts', 'prompt_bench_report.json')
  fs.writeFileSync(reportPath, JSON.stringify({ user: testEmail, when: new Date().toISOString(), results }, null, 2))
  console.log('Saved prompt benchmark to', reportPath)
}

main().catch(e => {
  // Do not hard-fail E2E on bench network errors; record and continue
  try {
    const reportPath = path.join(root, 'test-artifacts', 'prompt_bench_report.json')
    fs.writeFileSync(reportPath, JSON.stringify({ error: String(e), when: new Date().toISOString() }, null, 2))
    console.warn('Prompt bench failed, wrote error report to', reportPath)
  } catch {}
  process.exit(0)
})
