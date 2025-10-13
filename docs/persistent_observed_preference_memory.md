# PRD — Persistent Preference Memory for Sales Research & Insight Agent

## 0. Summary

Build a dual-layer memory system that (1) **learns implied user preferences** from normal usage, (2) **persists explicit knowledge** the user confirms, and (3) **injects ≤1–2 KB** of memory into model calls to shape tone, length, structure, topic emphasis, and source bias—without bloating context or creeping out the user. Stack is **Vercel (API routes) + Supabase**. No n8n.

---

## 1. Problem Statement

Users repeatedly restate stylistic and structural preferences (e.g., “shorter,” “more direct,” “put ICP fit first,” “focus on pricing pressure”). Today these are either not remembered or remembered ad-hoc, causing friction, inconsistent results, and context bloat if naively appended to prompts.

---

## 2. Goals & Non-Goals

### Goals

* Learn **implied** preferences from behavior with lightweight online updates.
* Persist **explicit** rules the user approves (“knowledge entries”).
* Retrieve a **compact memory block** (≤1–2 KB) per request.
* Provide **transparent control** (view, accept, reset, pause learning).
* Ship with measurable impact on acceptance rate and edit effort.

### Non-Goals

* No full CRM-style profile, no personal attribute inference.
* No chain-of-thought storage; no long raw session logs in prompts.
* No coding/design agent behaviors (scope is sales research & insights).

---

## 3. Personas & Core Use Cases

* **Mark (Power user / Builder):** Wants deterministic, concise outputs tuned to his style.
* **AE/SDR (Operator):** Needs consistent summaries with the right emphasis and length.
* **RevOps Lead (Reviewer):** Wants stat-heavy evidence and risk callouts first.

**Top Use Cases**

1. Generate a company/contact insight brief with the right **tone/length/structure**.
2. Emphasize **topics** the user consistently values (e.g., pricing pressure).
3. Favor certain **sources** (official site > LinkedIn > news) without re-prompting.
4. Convert stable tendencies into **explicit, human-readable rules** on approval.

---

## 4. Requirements

### Functional

1. Detect and store **preference signals** from normal actions (shorter/longer, reorder sections, add stats, topic emphasis, source choice, TL;DR behavior).
2. Maintain two layers:

   * **Implicit Preferences** (agent-scoped JSON with confidences, decays over time).
   * **Explicit Knowledge Entries** (user-confirmed rules; enable/disable).
3. **Suggest knowledge** when an implicit preference is stable/confident.
4. Build a **Compact Memory Block** and prepend to system prompt.
5. Provide **APIs** to record signals, fetch memory block, list/confirm suggestions.
6. Respect **context budget**: memory injection ≤1–2 KB.
7. **Transparency controls**: view learned prefs, accept/lock/reset, pause learning.

### Non-Functional

* P95 memory fetch < 120 ms.
* Store only content-shaping prefs; redact sensitive data.
* Schema evolves without breaking; implicit model is tolerant to missing keys.

---

## 5. Preference Ontology (Sales Research Agent)

* **Presentation:** `tone (direct↔warm)`, `formality`, `jargon_level`, `length (brief|standard|long)`, `evidence_density`, `tldr(on/trigger)`, `rec_action_bias`.
* **Structure:** `section_order` (e.g., `["Signals","ICP fit","Risks","Next steps"]`), `facet_budget`.
* **Topic Affinity:** weighted freeform map `{ "pricing_pressure": 0.83, "toolchain": 0.68, ... }`.
* **Source Bias:** weighted map `{ "official": 0.9, "linkedin": 0.7, "news": 0.5, "forums": 0.3 }`.

---

## 6. Learning Model (First Principles)

* **Signals In:** overrides, chip clicks, shorten/lengthen, section reorder, explicit “focus on X,” quoting specific sources, TL;DR usage.
* **Update Rules:**

  * **Scalars** (`tone`, `evidence_density`, `jargon_level`, mapped to [0,1]): EMA with bounded step; maintain `count` and `confidence`.
  * **Categorical length** (`brief|standard|long`): store `scale01` + `choice`; EMA.
  * **Ranked** (`section_order`): pairwise promote/demote on reorder events.
  * **Maps** (`topic_affinity`, `source_bias`): additive updates with weekly decay.
* **Confidence Gating:** Only apply silently when `confidence ≥ 0.6` **and** recent corroboration exists (≥2 consistent signals in last N sessions).
* **Suggestion Threshold:** When `confidence ≥ 0.8` and stable, propose explicit knowledge.

---

## 7. Retrieval & Context Budget

* Always retrieve:

  * Up to **8 enabled knowledge entries** (explicit).
  * Implicit prefs filtered to `confidence ≥ 0.6`:

    * `tone`, `length`, `evidence_density`, `tldr_trigger`, `facet_budget`, `section_order` (≤4 items), `topics` (Top-5), `sources` (Top-4).
* Render as a single fenced block:

```
<<memory v=1 agent=SalesResearch>
# confirmed knowledge
- Exclude HubSpot customers.
- Keep outputs concise and stat-heavy.

# implicit tendencies
tone: direct(0.74); length: brief; evidence: high; facet_budget: 3; tldr: on@300
structure: ["Signals","ICP fit","Risks","Next steps"]
topics: {pricing_pressure:0.83, toolchain:0.68, security:0.44}
sources: {official:0.90, linkedin:0.70, news:0.50}
</memory>
```

Hard cap the block at ~1.8 KB.

---

## 8. UX Requirements

### Surfaces

* **Suggestions Snackbar/Panel:** “I’ve noticed you prefer concise, stat-heavy briefs. Save this as a rule?” [Save] [Dismiss]
* **Knowledge List (explicit rules):** title, content, enabled toggle, created date.
* **Preferences (implicit view):** read-only list of active tendencies with confidence; actions: **Lock as Rule**, **Reset**, **Pause learning**.

### Flows

1. **Silent Learning → Suggestion:** On stable high-confidence implicit pref, enqueue suggestion.
2. **User Accepts:** Create knowledge entry; keep implicit as is or reset (configurable).
3. **User Edits Rule:** Update knowledge entry text; explicit overrides implicit on conflicts.
4. **Pause Learning:** Stop writing new signals; keep retrieval.

---

## 9. Data Model (Supabase)

```sql
-- Explicit rules
create table knowledge_entries (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null,
  title text not null,
  content text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Implicit, loose schema
create table implicit_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null,
  key text not null,
  value_json jsonb not null,  -- {"scale01":0.74,"conf":0.82} or {"order":[...]} or {"map":{...}}
  updated_at timestamptz not null default now(),
  primary key (user_id, agent, key)
);

-- Append-only audit
create table preference_events (
  id bigserial primary key,
  user_id uuid not null,
  agent text not null,
  key text not null,
  observed_json jsonb not null,
  weight float8 not null default 1,
  ts timestamptz not null default now()
);

-- Suggestions awaiting confirmation
create table knowledge_suggestions (
  id bigserial primary key,
  user_id uuid not null,
  agent text not null,
  title text not null,
  content text not null,
  reason text,
  created_at timestamptz not null default now()
);
```

Indexes: `(user_id, agent)`, plus RLS as needed.

---

## 10. API Surface (Vercel Routes)

| Route                        | Method      | Purpose                                         | Request                           | Response                     |                |        |
| ---------------------------- | ----------- | ----------------------------------------------- | --------------------------------- | ---------------------------- | -------------- | ------ |
| `/api/agent/signal`          | POST        | Record a preference signal (online update)      | `{agent, key, observed, weight?}` | `{ok, key, value}`           |                |        |
| `/api/memory/block`          | GET         | Build compact memory block for prompt injection | `?agent=`                         | `{block}`                    |                |        |
| `/api/memory/rollup`         | POST (cron) | Apply decay & generate suggestions              | none                              | `{ok, updates, suggestions}` |                |        |
| `/api/knowledge/suggestions` | GET         | List pending suggestions                        | `?agent=`                         | `{suggestions:[...]}`        |                |        |
| `/api/knowledge/confirm`     | POST        | Convert suggestion → knowledge entry            | `{suggestion_id}`                 | `{ok}`                       |                |        |
| `/api/knowledge`             | GET         | List knowledge entries                          | `?agent=`                         | `{entries:[...]}`            |                |        |
| `/api/knowledge`             | POST        | Create/update/delete entry                      | `{op:'create                      | update                       | delete', ...}` | `{ok}` |

Auth: Supabase JWT (Bearer). Service key for cron.

---

## 11. Instrumentation & Metrics

### Product KPIs

* **Acceptance Rate**: % generations accepted without regeneration/edit.
* **Edit Effort**: median tokens deleted/added after first output.
* **Time to First Accept**: time from request → accepted output.
* **Suggestion CTR**: saves / suggestions shown.
* **Rule Stickiness**: % sessions where explicit rule influences output.

### Diagnostics

* Signals per session; implicit key confidences over time; memory block size distribution; latency of `/api/memory/block`.

### Experimentation

* A/B: **memory-on** vs **memory-off**; **implicit-only** vs **explicit-augmented**.
* Bandit for `length` default vs chip prompt.

---

## 12. Privacy, Safety, Compliance

* Store only **content-shaping** prefs; **no** health, religion, politics, precise location, or personal identity attributes.
* Provide **Delete All Memory** and **Pause Learning**.
* RLS on all user-scoped tables. Audit via `preference_events`.

---

## 13. Edge Cases & Failure Modes

* **Preference Thrash:** Clamp max daily delta; require 2+ consistent signals to flip defaults.
* **Conflict (explicit vs implicit):** Explicit wins; log conflict.
* **Context Bloat:** Enforce byte cap; truncate topics/sources; never include events.
* **Cold Start:** Use sensible defaults; show chips (“Brief | Standard | Long”) until confidence rises.
* **Multi-agent contamination:** Scope by `agent` key; do not reuse across agents.

---

## 14. Rollout Plan

**Milestone 1 (Week 1–2): Core plumbing**

* Tables, `/api/agent/signal`, `/api/memory/block`.
* Inject memory block into the chat route.
* Hardcoded 3–4 signals (length, tone, evidence, structure).

**Milestone 2 (Week 3): Suggestions + UI**

* `/api/memory/rollup` cron, suggestions list, confirm flow.
* Minimal UI: Knowledge list, Suggestions panel, Pause learning.

**Milestone 3 (Week 4): Metrics & A/B**

* Analytics events, dashboards, AB test harness.
* Tune thresholds, decay, and budgets.

**Milestone 4 (Week 5+): Polishing**

* Additional signals (topic, sources, TL;DR).
* Advanced ranking for section order; better copy for suggestions.

---

## 15. QA Acceptance Criteria

* Memory block never exceeds **1.8 KB** (assert in tests).
* With 3 consistent “Shorter” actions, default length flips to **brief** within 2 sessions.
* Suggestions appear only when confidence ≥ **0.8** and persist until actioned.
* Disabling a knowledge entry immediately changes output behavior.
* “Pause learning” results in **no new** `preference_events`/`implicit_preferences` writes.

---

## 16. Open Questions

1. Confidence model: simple EMA/log-count vs contextual bandit for `length`? (Phase 2)
2. Should accepting a suggestion **reset** the underlying implicit tracker or keep as shadow state?
3. Do we expose a per-project memory scope now or later?
4. How do we visualize **topic affinity** without overpromising determinism?

---

## 17. Appendix — Canonical Signals Map

| UI/Behavior                                         | API Payload (`/api/agent/signal`)                                        | Example                |                 |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- | --------------- |
| Click “Shorter/Longer”                              | `{ key:'length', observed:{choice:'brief'                                | 'long'}, weight:1.5 }` | Shorter → brief |
| “Make it more direct/warmer”                        | `{ key:'tone', observed:{scale01:0.85}, weight:1.5 }`                    | Direct ↑               |                 |
| “Add stats/benchmarks” / heavy edits adding numbers | `{ key:'evidence_density', observed:{scale01:0.8}, weight:1.2 }`         | Evidence ↑             |                 |
| Drag section order                                  | `{ key:'structure', observed:{promote:'ICP fit'}, weight:1 }`            | Promote ICP fit        |                 |
| Emphasize topic in prompts repeatedly               | `{ key:'topic_affinity', observed:{pricing_pressure:+0.2}, weight:1.2 }` | Topic ↑                |                 |
| Cite official site                                  | `{ key:'source_bias', observed:{official:+0.15}, weight:1 }`             | Source ↑               |                 |
| Toggle TL;DR / set threshold                        | `{ key:'tldr_trigger', observed:{tokens:300}, weight:1 }`                | TL;DR 300              |                 |

---

## 18. Success Criteria (90-day)

* **+20–30%** increase in first-shot acceptance rate.
* **−25%** median edit effort.
* ≥ **50%** of active users accept at least one suggestion → knowledge entry.
* Memory block P95 **<1.2 KB**, fetch P95 **<120 ms**.

---

This PRD gives engineering exact tables, endpoints, learning rules, UX flows, budgets, and metrics to implement a Manus-style—but leaner and domain-specific—memory system for your sales research agent.
