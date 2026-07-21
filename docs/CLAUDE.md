# CLAUDE.md

Project briefing for Claude Code. Read `PRD.md` for the full spec and
`ROADMAP.md` for what's coming after the current phase; this file is the
always-loaded context, so it stays short and states only what's true right now.

## What we're building

A single-user, research-backed Spanish practice web app (working title *Aula*)
that is also a full-stack portfolio piece. Four interconnected tabs — Writing,
Lessons, Workbook, Flashcards — around a persistent categorized **error log**,
plus a sibling **Word Bank** capture mechanism.

**Phases 0–5 are shipped** (Writing, error-log spine + Word Bank, Lessons,
Workbook + Anki read-path ingestion, Flashcards + Anki export). Phase 6
(multi-tenancy/monetization) is parked on purpose.

**Current target: Phase 8 — Revisión, the revision cycle** (`PRD.md` §9).
**Phase 10 — Lectura, the input tab** is fast-tracked to build immediately
after Phase 8 ships (`PRD.md` §10). Do not start Phase 10 until Phase 8's
definition of done is met — it modifies the existing grading path and should
not be in flight alongside a new tab.

**Do not build Phase 7 (targeted prompt elicitation) or Phase 9 (focused
feedback budget) right now.** They're specced at summary level in
`docs/ROADMAP.md` and will get full PRD sections when they become current.

## Owner context (informs generated Spanish, never leaks into UI)

- Learner: adult professional, VC/finance background, targeting **DELE**
  certification (A2 heading toward B1/B2). Analytical learner — values the "why."
- Target variety: **Mexican Spanish** (matches his live teachers). Note
  Rioplatense divergences where relevant.
- **Portuguese interference is an active risk** — flag false friends
  (familiar, grave, collar, emocionado, embarazada, exquisito, …) as a
  first-class error category. This applies with extra weight in Lectura
  (Phase 10): a false-friend gloss at first encounter is where the wrong
  inference fossilizes.
- Prompt topics rotate over his interests: wine, cinema, tennis, jazz, art,
  fitness, VC/finance, plus parenting vocabulary.
- Feedback persona: **Dra. Restrepo** — warm, rigorous, non-critical about the
  *content* of his day, corrects every error of *form*.

## Stack

- **Frontend:** React + Vite, fully responsive (one build → phone/iPad/desktop).
- **Backend:** Vercel serverless functions that **proxy the Anthropic API**.
  **Hobby-plan 12-function ceiling is already binding** — consolidate routes,
  do not add new function files without checking the current count.
- **DB:** Supabase (Postgres). Single-user; a temporary access-code gate
  (`src/shared/auth/accessGate.ts`) protects the public repo's deployed
  instance — explicitly not real auth.
- **Build/deploy:** Vercel.

## Hard rules

- **Never put the Anthropic API key in client code.** All model calls go through
  the serverless proxy. No key, no secrets, no PII in the browser bundle or in
  URLs/query strings.
- **`dialect` and `dele_level` are parameters**, injected into prompt templates.
  Default `dialect = "mx"`. Never hardcode dialect- or level-specific content.
- **Runtime model routing:** grading + lessons → Sonnet; workbook, flashcard,
  and lectura generation → Haiku; Anki parsing → plain Python, no LLM. Do
  **not** call Fable/Opus at runtime.
- **Enable prompt caching** on the stable system+rubric prefix; cap output
  tokens; check `stop_reason` and use a completeness guard on every grading
  call — a truncated `feedback_prose` or `uptake` block must be caught, not
  silently persisted (see the 07-10 truncation bug).
- **The grading contract JSON (`PRD.md` §4) does not change shape**, including
  through Phase 8 and Phase 10. Extensions are additive top-level keys only
  (e.g. Phase 8's `uptake` block). Never simplify it to a flat error list.
- **Shared modules, not copies:** the error taxonomy (enum), the grading
  rubric, and the sophistication rubric live in one place each and are
  imported by every tab that needs them.
- **Error taxonomy is frozen** (`PRD.md` §4 / §8.1) — the 25-category enum
  lives in one shared module and is never redefined per-tab or renamed
  without a migration.
- **No rollup/cache table for error trends.** Compute 14-day-window trends
  and the avoidance flag at read time directly from `error_observations`. Raw
  observations are the only source of truth (`PRD.md` §8.2–8.3).
- **Trend-affecting schema is append-only.** New columns may be added to
  `error_observations` and related tables; existing columns and the frozen
  taxonomy are never renamed or repurposed without a migration and a backfill
  plan. Trend comparability from entry #1 is load-bearing.
- **Revision observations never leak into accuracy/exposure trends**
  (`PRD.md` §9.7). Every History trend query filters `is_revision = false`.
  Write the isolation test before writing the revision feature.
- **Lectura never writes to `error_observations`** (`PRD.md` §10.5). Reading
  comprehension is not a production error and gets no rows in that table.
- **Word Bank capture stays unstructured at insert time.** `term` is free text
  (word or phrase, no length constraint), with no forced grammatical
  classification — classification/dedup happens later at export time.
- **Anything deterministic gets no model call.** Tokenizing, frequency
  ranking, known-item diffing, threshold filtering, answer matching — plain
  code, not a Haiku call.
- **Never let a model invent a date.** Anywhere a `created_at` / capture date
  matters for a tag or record (e.g. Word Bank captures, `leccion::` tags),
  thread the real date through explicitly; omit the tag rather than let the
  model guess (the 07-11 fabricated-date bug).
- **Migration safety, non-negotiable:** before altering any existing table,
  back up current Supabase data, write the change as a versioned migration
  file (never a manual dashboard edit), and test it against a copy of real
  production data — not an empty dev database. Real entries from every shipped
  phase already exist and must survive every future migration.

## Structure (current)

```
/src
  /features
    /writing        # prompt gen, free journal, feedback, history
    /word-bank      # app-level floating "+ Word" capture
    /lessons        # threaded conversational grammar explainers
    /workbook       # exercise generation, grading, Anki weak-item ingest UI
    /flashcards     # card generation, staged review, per-deck TSV export
    /revision       # NEW — Phase 8: revision editor, uptake display
    /lectura        # NEW — Phase 10: paste-in reading, glossing, enhancement
  /shared
    /grading        # error taxonomy + grading contract types — one source of truth
    /prompts        # writing-prompt templates, parameterized by dialect + level
    /flashcards     # Anki deck/note-type schema, generation tool + types
    /lexis           # NEW — Phase 10: frequency list, tokenizer, lemma diff logic
    /settings       # DELE-level nudge logic
    /auth           # temporary access-code gate
    /db             # Supabase client + queries (server-only, never imported by frontend)
/api                # Vercel serverless functions (proxy Anthropic API + token metering)
/docs
  PRD.md            # full spec, phase-by-phase — §9 (Phase 8), §10 (Phase 10) are current
  ROADMAP.md        # forward-looking only, not authoritative — orientation, not instructions
  ANKI_SCHEMA.md    # the real Anki deck contract Flashcards generates against
/supabase/migrations
```

## Conventions

- TypeScript. Small, reviewable commits with clear messages.
- Env vars for all config/secrets; never commit `.env`. Document required vars
  in the README.
- Keep the weekly learning-log section in the README current — including bugs
  and dead ends, not just what shipped. That honesty is a deliberate portfolio
  signal, keep it up for Phase 8 and Phase 10.

## Commands

- `npm run dev` — frontend only (plain Vite, fast reload, `/api` routes 404)
- `npm run dev:full` — frontend + `/api` functions together (`vercel dev`) —
  use this when testing anything that calls Claude or the database
- `npm run build` — production build
- `npm run deploy` — deploy to production (`vercel deploy --prod`)

## Definition of done for v1 (shipped)

Deployed URL, works on his phone: generate a DELE-calibrated prompt → write →
receive dual-axis feedback in the Dra. Restrepo voice → entry + tagged
observations persist → History shows per-category accuracy and exposure trends
with noise-controlled trailing windows.

## Definition of done for Phase 8 (current target — see `PRD.md` §9.10)

- A revision saves with correct `parent_entry_id` and `revision_number = 1`.
- History accuracy and exposure trends are **numerically identical** before
  and after a revision is saved, proven by fixture test.
- The revision editor shows error location and category only; corrections
  appear only after an explicit reveal, and `revealed_corrections` records it.
- A synthetic revision that rewrites around a flagged obligatory context is
  scored `avoided`, not `fixed`.
- Resolution count mismatch against the parent observation set fails the
  write and surfaces an error, rather than persisting partial data.
- Uptake rate and avoidance-on-revision rate display once each reaches 5
  in-window resolutions.
- Revision of a revision works.
- All existing entries and observations are intact and queryable after migration.

## Definition of done for Phase 10 (fast-tracked, builds after Phase 8 — see `PRD.md` §10.8)

- A pasted 600-word article renders with unknown items glossed and known
  items untouched, verified against real `known_cards` state — including at
  least one inflected form whose lemma is in the deck.
- At least one false friend in a test article is flagged as such in its gloss.
- Comprehension questions generate in Spanish at the stored DELE level.
- The enhancement toggle highlights a currently-flagged category and turns
  off cleanly.
- One-tap capture writes to `word_bank` with the correct context sentence and
  the real capture date.
- `error_observations` row count is **unchanged** by any Lectura activity.
- Total model cost for one article is visible in `usage_log`, under one cent
  for a typical news article.
- No new serverless functions were added.
