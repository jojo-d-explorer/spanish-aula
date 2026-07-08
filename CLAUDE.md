# CLAUDE.md

Project briefing for Claude Code. Read `PRD.md` for the full spec; this file is
the always-loaded context.

## What we're building

A single-user, research-backed Spanish practice web app (working title *Aula*)
that is also a full-stack portfolio piece. Four interconnected tabs around a
persistent categorized **error log**, plus a sibling **Word Bank** capture
mechanism. **v1 (Writing tab) and Phase 2 (error-log spine + Word Bank) are
shipped. We are now building Phase 3: the Lessons tab, built as a
conversational thread, not a one-shot generated document.** Do not build
Workbook or Flashcards yet — Phase 3 may reference Workbook as a future
stub/link but must not implement any Workbook logic.

## Owner context (informs generated Spanish, never leaks into UI)

- Learner: adult professional, VC/finance background, targeting **DELE**
  certification (A2 now → B1 → B2). Analytical learner — values the "why."
- Target variety: **Mexican Spanish** (matches his live teacher). Note
  Rioplatense divergences where relevant.
- **Portuguese interference is an active risk** — flag false friends
  (familiar, grave, collar, emocionado, embarazada, exquisito, …) as a
  first-class error category.
- Prompt topics rotate over his interests: wine, cinema, tennis, jazz, art,
  fitness, VC/finance, plus parenting vocabulary.
- Feedback persona: **Dra. Restrepo** — warm, rigorous, non-critical about the
  *content* of his day, corrects every error of *form*.
- **Owner explicitly wants the app to stay lean and adaptable** as his level
  rises (A2 → B1 → B2) — prefer extending an existing mechanism over building
  new infrastructure. See PRD §2 and §9.6 for the concrete design pattern
  this produced (new lesson threads instead of staleness-tracking/regeneration).

## Stack

- **Frontend:** React + Vite, fully responsive (one build → phone/iPad/desktop).
- **Backend:** Vercel serverless functions that **proxy the Anthropic API**.
- **DB:** Supabase (Postgres). v1 is single-user; **no auth UI yet**.
- **Build/deploy:** Vercel. Ship v1 deployed, not just local.

## Hard rules

- **Never put the Anthropic API key in client code.** All model calls go through
  the serverless proxy. No key, no secrets, no PII in the browser bundle or in
  URLs/query strings.
- **`dialect` and `dele_level` are parameters**, injected into prompt templates.
  Default `dialect = "mx"`. Never hardcode dialect- or level-specific content.
  This applies to every message in a Lessons thread exactly as it does to Writing.
- **Runtime model routing:** grading + lessons → Sonnet; workbook + flashcard
  generation → Haiku; Anki parsing → plain Python, no LLM. Do **not** call
  Fable/Opus at runtime.
- **Enable prompt caching** on the stable system+rubric prefix; cap output tokens.
- The grader returns the **grading contract JSON** in PRD §4 — including
  per-category `obligatory_contexts` + `correct` counts — from the very first
  entry. This is load-bearing for progress trends; do not simplify it to a flat
  error list.
- **Shared modules, not copies:** the error taxonomy (enum), the grading rubric,
  and the sophistication rubric live in one place each and are imported by every
  tab that needs them.
- **Error taxonomy is frozen** (PRD §4 / §8.1) — the 25-category enum lives in
  one shared module and is never redefined per-tab or renamed without a
  migration.
- **No rollup/cache table for error trends.** Compute 14-day-window trends and
  the avoidance flag at read time directly from `error_observations`. Raw
  observations are the only source of truth (PRD §8.2–8.3).
- **Word Bank capture stays unstructured at insert time.** `term` is free text
  (word or phrase, no length constraint), with no forced grammatical
  classification — classification/dedup happens later at export time. The
  "+ Word" affordance is app-level (every tab), not tab-specific — do not
  rebuild it per-tab (PRD §8.4).
- **No tab may write to `error_observations` to alter the escalation or
  avoidance flags.** Those flags are read-only derived signals; they clear
  only through the natural trailing-window aging-out described in PRD §8.3.
  This applies specifically to Lessons: taking a lesson on a flagged category
  must NOT clear or suppress that flag (PRD §9.10).
- **Lessons does not duplicate the History view.** The existing per-category
  trend/badge view (shipped in Phase 2) is the only place flagged categories
  are browsed. Do not build a second "weak categories" widget inside Lessons
  (PRD §9.3).
- **Lessons is a conversational thread, not a single generated block.** Store
  every message in `lesson_messages`; a past `lesson_log` entry reopens the
  original thread unchanged — never regenerated. Depth is decided by the
  model on the opening reply only; going deeper or veering into a subtopic is
  just a normal follow-up message, not a special feature (PRD §9.4–9.5).
- **No staleness-detection or "regenerate at current level" feature.** As the
  owner's DELE level rises, a topic is revisited by opening a **new** thread
  via the same freeform input — never by editing or refreshing an old one.
  Each thread stores `dele_level_at_creation` so the log itself becomes a
  growth record (PRD §9.6).
- **Migration safety, non-negotiable:** before altering any existing table,
  back up current Supabase data, write the change as a versioned migration
  file (never a manual dashboard edit), and test it against a copy of real
  production data — not an empty dev database. This applies to adding the new
  `lesson_log` and `lesson_messages` tables.

## Suggested structure (adjust as needed, keep feature-first)

```
/src
  /features
    /writing        # v1: prompt gen, entry box, feedback view, history
    /word-bank      # phase 2: floating "+ Word" capture affordance (app-level)
    /lessons        # phase 3: freeform request, threaded chat view, log/tally
  /shared
    /grading        # rubric + grading contract types (shared enum, schemas)
    /prompts        # templates parameterized by dialect + dele_level
    /db             # Supabase client + queries
  /components       # shared UI
/api                # Vercel serverless functions (Anthropic proxy)
```

## Conventions

- TypeScript. Small, reviewable commits with clear messages.
- Env vars for all config/secrets; never commit `.env`. Document required vars
  in the README.
- Keep a weekly learning-log section in the README (carried over from the
  owner's prior project — it's a deliberate portfolio signal).

## Commands

_(Fill in after scaffold, e.g.)_
- `npm run dev` — local dev
- `npm run build` — production build
- `vercel deploy` — deploy

## Definition of done for v1 (shipped)

Deployed URL, works on his phone: generate a DELE-calibrated prompt → write →
receive dual-axis feedback in the Dra. Restrepo voice → entry + tagged
observations persist → History shows per-category accuracy and exposure trends
with noise-controlled trailing windows.

## Definition of done for Phase 2 (shipped)

Taxonomy is a single frozen enum, imported everywhere. Trend thresholds
(4 in-window obligatory contexts → no trend, 5 → shows), escalation (3
in-window incorrect-and-obligatory → red flag), and avoidance (exposure drop
to <half of prior window with flat/rising accuracy → yellow flag) all verified
against synthetic cases, with escalation also confirmed live on real data
(`ser_estar`). Word Bank saves both single words and multi-word phrases from
multiple tabs and persists across refresh. All Phase 1 entries/observations
intact after migration.

## Definition of done for Phase 3 (current target — see PRD §9.11)

- Freeform request input opens a new lesson thread; accepts both macro
  (grammar/category) and micro (lexical) requests; backend classifies and
  populates `topic_category` or `topic_freeform` accordingly.
- The model decides opening depth without a user-facing depth selector.
- The learner can reply within a thread to go deeper or pivot to a related
  subtopic, using a normal chat input — verified with at least one thread
  that includes a follow-up message.
- Comprehension checks, when present, are recognition-based, not production.
- Generated content respects `dialect` and `dele_level`; each thread stores
  `dele_level_at_creation`.
- Full thread persisted in `lesson_messages`; revisiting a `lesson_log` entry
  shows the original thread unchanged, not a regeneration.
- Log/tally view lists past lesson threads, countable by category, showing
  the level at which each was created.
- A synthetic test confirms taking a lesson on an escalated category does not
  clear the escalation flag — only the trailing window does.
- The global Word Bank "+ Word" affordance is confirmed working inside the
  Lessons tab (regression test, not new build).
- Migration for the new `lesson_log` and `lesson_messages` tables follows the
  standard migration safety rule above.
