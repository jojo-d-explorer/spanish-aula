# CLAUDE.md

Project briefing for Claude Code. Read `PRD.md` for the full spec; this file is
the always-loaded context.

## What we're building

A single-user (for now), research-backed Spanish practice web app (working
title *Aula*) that is also a full-stack portfolio piece. Four interconnected
tabs around a persistent categorized **error log**, plus a sibling **Word
Bank**. **Writing, Phase 2 (error-log spine + Word Bank), and Phase 3 (Lessons)
are shipped. Phase 4 (Workbook + Anki read-path ingest + proxy token metering)
is the current build.** Do not build Flashcards (Phase 5), the Anki write-back
path, or any auth/billing (Phase 6) yet.

## Owner context (informs generated Spanish, never leaks into UI)

- Learner: adult professional, VC/finance background, targeting **DELE**
  (A2 now → B1 → B2). Analytical — values the "why."
- Target variety: **Mexican Spanish**. Note Rioplatense divergences where relevant.
- **Portuguese interference is an active risk** — flag false friends
  (familiar, grave, collar, emocionado, embarazada, exquisito, …) first-class.
- Prompt topics rotate over interests: wine, cinema, tennis, jazz, art, fitness,
  VC/finance, plus parenting.
- Feedback persona: **Dra. Restrepo** — warm, rigorous, non-critical about the
  *content*, corrects every error of *form*.
- Owner wants the app **lean and adaptable** as level rises — extend existing
  mechanisms over new infrastructure.
- Owner is **thinking ahead to sharing/selling this** (Phase 6, parked). Build
  nothing for it now EXCEPT the proxy token metering below, which is cheap now
  and load-bearing later.

## Stack

- **Frontend:** React + Vite, fully responsive.
- **Backend:** Vercel serverless functions that **proxy the Anthropic API**.
- **DB:** Supabase (Postgres). Single-user; **no auth UI yet**.
- **Build/deploy:** Vercel.

## Hard rules

- **Never put the Anthropic API key in client code.** All calls go through the
  serverless proxy. No secrets/PII in the browser bundle or in URLs.
- **Proxy meters tokens per call (NEW, build this phase).** Every model call
  logs `input_tokens` + `output_tokens` (both returned by the API), plus tab,
  model, and a placeholder `user_id`, into a `usage_log` table. Zero cost now,
  foundational for future pricing/caps/"know your cost" (PRD §6.1, §11). Do not
  skip this — retrofitting loses the cost baseline.
- **`dialect` and `dele_level` are parameters**, injected into prompt templates.
  Default `dialect = "mx"`. Never hardcode dialect/level content. Workbook
  exercises are calibrated to these exactly like Writing/Lessons.
- **Explanatory content is mixed-language weighted by `dele_level`, going
  forward from Phase 4** (new Workbook rationale text): English for core rule
  + English/Portuguese contrastive notes; Spanish for examples, exercises,
  checks. Not a retrofit for shipped Lessons, which stays Spanish-first as-is.
- **Runtime model routing:** grading + lessons → Sonnet; workbook + flashcard
  generation → Haiku; Anki parsing → plain Python, no LLM. Do **not** call
  Fable/Opus at runtime. (This routing is also the future margin story — keep
  high-volume generation on Haiku.)
- **Enable prompt caching** on the stable system+rubric prefix; cap output tokens.
- The grader returns the **grading contract JSON** (PRD §4) with per-category
  `obligatory_contexts` + `correct` counts — identically for prompted entries,
  free-journal entries, and Workbook sentence-production answers. Do not
  simplify to a flat error list.
- **Shared modules, not copies:** error taxonomy (enum), grading rubric, and
  sophistication rubric each live in one place, imported by every tab.
- **Error taxonomy is frozen** (PRD §4 / §8.1) — never redefined per-tab or
  renamed without a migration.
- **No rollup/cache table for error trends.** Compute 14-day-window trends and
  the avoidance flag at read time from `error_observations`.
- **Workbook writes REAL observations to the shared `error_observations`
  table** with `source_tab='workbook'` — same table as Writing, feeding the
  same trend/escalation/avoidance math. These are genuine attempts, not
  synthetic rows. Requires adding a `source_tab` column (migration, §8.5).
  This is the ONLY sanctioned way a non-Writing tab writes observations, and it
  writes forward-only (never edits/deletes existing rows to change a flag).
- **Objective exercise grading is auto-match-first, LLM-fallback for
  near-misses only** (accent-only diffs, defensible alternates) — no API call
  when a plain normalized match succeeds. Sentence production is LLM-graded.
- **Anki ingest is READ-PATH ONLY this phase:** parse an uploaded `.colpkg`
  (SQLite) in plain Python, extract weak items by FSRS stability/lapses/
  retention. Card generation, TSV/`.apkg` export, and master-list dedup are
  **Phase 5** — do not build them now (PRD §10.5).
- **Word Bank capture stays unstructured**; "+ Word" is app-level (every tab),
  not rebuilt per-tab.
- **No staleness/regeneration machinery for Lessons; threads store
  `dele_level_at_creation`.**
- **Migration safety, non-negotiable:** back up Supabase data, versioned
  migration file, test against a copy of real production data. Applies to the
  `source_tab` column and the `usage_log` table added this phase.
- **Do not build Phase 6 (auth, billing, tiers, BYO-key, onboarding).** Only
  the metering groundwork (above) is in scope now.
- **Temporary access-code gate — not Phase 6 auth.** The live deployment is
  gated by a single shared passphrase (`APP_ACCESS_CODE`) + a signed
  HTTP-only cookie, checked independently by every serverless function via
  `requireAccess()` — see `src/shared/auth/accessGate.ts`. This exists only
  because the repo is now public and the deployment can't be left wide open;
  it has no accounts, no per-user anything, and is explicitly not the
  multi-user system in PRD §11. Trivial to rip out later without touching
  any Phase 0-5 feature code.

## Suggested structure (feature-first)

```
/src
  /features
    /writing        # prompt gen, free journal, feedback, history
    /word-bank      # app-level floating "+ Word"
    /lessons        # threaded chat, log/tally
    /workbook       # phase 4: exercise gen, session view, grading, anki ingest UI
  /shared
    /grading        # rubric + grading contract types (shared enum, schemas)
    /prompts        # templates parameterized by dialect + dele_level
    /db             # Supabase client + queries
  /components
/api                # Vercel serverless functions (Anthropic proxy + token metering)
/scripts            # plain-Python Anki .colpkg parser (no LLM)
```

## Conventions

- TypeScript. Small, reviewable commits. Env vars for secrets; never commit
  `.env`. Keep the weekly learning-log section in the README.

## Definitions of done

- **v1 / Phase 2 / Phase 3:** shipped (see repo history).
- **Phase 3 open follow-up:** add `react-markdown` so `**bold**`/`##` render in
  lesson bubbles; live-verify the `dele_level_at_creation` pinning invariant.
- **Phase 4 (current):**
  - Four exercise types (contextual cloze, conjugation recall, sentence
    production, isolated gap-fill) generate in the owner's worksheet style,
    calibrated to `dialect` + `dele_level`. No matching type.
  - Session sourcing works auto (from a flagged category) and via freeform
    request; Writing's feedback screen deep-links into a seeded session.
  - Objective grading auto-match-first + LLM near-miss fallback; sentence
    production LLM-graded.
  - Workbook attempts write `error_observations` with `source_tab='workbook'`
    into the shared table; a synthetic drill adds to a category's in-window
    counts, and sustained correct answers are the path by which its escalation
    flag ages out.
  - `.colpkg` upload → Python parser returns a weak-item list by FSRS
    stability/lapses, usable as a Workbook targeting source. Read path only.
  - Proxy token metering live: every call logs input/output tokens to
    `usage_log`.
  - Migrations (`source_tab` column, `usage_log` table) follow the safety rule;
    all prior data intact.
- **Phase 5 / Phase 6:** not started / parked (PRD §11).
