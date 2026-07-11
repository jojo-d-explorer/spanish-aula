# CLAUDE.md

Project briefing for Claude Code. Read `PRD.md` for the full spec; this file is
the always-loaded context.

## What we're building

A single-user (for now), research-backed Spanish practice web app (working
title *Aula*) that is also a full-stack portfolio piece. Four interconnected
tabs around a persistent categorized **error log**, plus a sibling **Word
Bank**. **Writing, Phase 2 (error-log spine + Word Bank), Phase 3 (Lessons),
and Phase 4 (Workbook + Anki read-path ingest + proxy token metering) are
shipped. Phase 5 (Flashcards: card generation + master-list dedup + Anki
write-back via TSV export) is the current build.** Do not build any
auth/billing (Phase 6) yet.

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
- **`known_structures` three-tier rule (PRD §12) — READ CAREFULLY, this is
  not a simple allow/deny list. STATUS: specified here and in the PRD, but
  NOT YET IMPLEMENTED — no `settings.known_structures` column, no Settings
  UI to edit it, and no prompt injection into Workbook's (or Flashcards')
  generation calls exist yet. Do not assume Workbook already honors this
  just because it's documented as a hard rule; verify before relying on it.**
  1. Anything **in** `known_structures` → free use everywhere.
  2. The **deliberate target** of a Workbook session or Lesson topic → exempt.
  3. Narratively-necessary-but-untaught → allowed **ONLY** in Workbook's
     **contextual cloze narrative** type, and **only if explicitly flagged
     inline** (not silent). No other content type gets this exception —
     Writing prompts must avoid untaught structures entirely, zero exception.
  4. Everything else untaught/non-essential → avoid; rewrite around it.
  - **Lessons is fully exempt** from this whole rule (§12.4).
  - **Current seed value**: present tense (regular + irregular yo-forms/-go
    verbs + stem-changing o→ue/e→ie/e→i) · preterite indefinido · present
    perfect (haber + participle) · direct object pronouns · indirect object
    pronouns · ser/estar · **ir a + infinitive ONLY** (not synthetic future) ·
    gustar-family · demonstratives. Deliberately narrower than full exposure
    history — do not "helpfully" expand it from context or memory.
  - **Growth path (NOT built this phase):** worksheet-upload-linked tagging
    is a documented future enhancement (PRD §12.5).
- **Explanatory content is mixed-language weighted by `dele_level`, going
  forward from Phase 4** (new Workbook rationale text): English for core rule
  + English/Portuguese contrastive notes; Spanish for examples, exercises,
  checks. Not a retrofit for shipped Lessons, which stays Spanish-first as-is.
- **Runtime model routing:** grading + lessons → Sonnet; workbook generation
  + the near-miss judge → Haiku; Anki parsing → plain Python, no LLM. Do
  **not** call Fable/Opus at runtime. (This routing is also the future
  margin story — keep high-volume generation on Haiku.)
- **Flashcard card-content generation is Sonnet, not Haiku — deliberate
  exception to the routing rule above.** Per `docs/ANKI_SCHEMA.md` §8:
  quality/consistency matters more than volume for this call (wrong note
  type, wrong deck, or a botched conjugation table is worse than a slightly
  slower/pricier generation). Workbook generation and the near-miss judge
  stay Haiku — this exception is scoped to Flashcards only.
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
- **Anki read path (Phase 4, shipped) stays read-only:** the `.colpkg` parser
  (`api/anki-ingest.py`) only ever parses and returns weak items — never
  writes back to the learner's Anki collection. Phase 5's write-back is a
  **separate, app-side TSV export** the learner imports into Anki manually;
  it does not touch the uploaded `.colpkg` file or write Anki's SQLite
  format directly (PRD §10.5, §14).
- **Before implementing any part of Flashcards generation, tagging, or
  export, read `docs/ANKI_SCHEMA.md`.** It's the contract between Aula and
  the owner's real Anki collection — deck structure (11 subdecks, including
  a real duplicate "06" numbering quirk, don't "fix" it), the two note types'
  exact field order, tagging conventions, the dedup approach (seed from a
  real Anki export, not the Google Doc master list), and the
  generate→review→export flow. Written because an earlier, ad hoc attempt at
  card generation had no knowledge of any of this and produced cards that
  didn't fit the real deck at all.
- **Flashcards (Phase 5) generates from two sources**: Word Bank entries and
  Anki weak items (reusing `api/anki-ingest.py`'s existing FSRS output as an
  input, not rebuilding weak-item detection; that endpoint already returns
  every card, weak or not — Flashcards' `known_cards` seeding uses the
  *unfiltered* list from the same upload, no Python changes needed).
  **Dedup happens before generation, against `known_cards`** — a term that
  already matches (via `normalizeForMatch`, reused from
  `src/shared/workbook/matching.ts`) is flagged and never sent to the
  model, not generated-then-discarded. `known_cards` is seeded from a real
  Anki export, not built up from the app's own history, and grows as
  confirmed cards are added (PRD §14, `docs/ANKI_SCHEMA.md` §7). Generation
  **stages, it doesn't commit** — cards land as `status='draft'` for
  review/edit before an explicit confirm adds them to `known_cards` and
  makes them export-eligible (`docs/ANKI_SCHEMA.md` §8). **Flashcard review
  never writes to `error_observations`** — it isn't a graded production
  attempt, and mixing it into that table would pollute the avoidance-
  proofing trend math the same way an unguarded duplicate entry would (see
  the entries-dedup discussion, PRD §13). Export is **TSV only**, one file
  per (deck, note type) group matching the real deck structure — no real
  `.apkg` binary (would require hand-rolling Anki's SQLite collection
  format or a new dependency; out of scope for "lean and adaptable" above).
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
    /flashcards     # phase 5: card generation, dedup browse view, TSV export
  /shared
    /grading        # rubric + grading contract types (shared enum, schemas)
    /prompts        # templates parameterized by dialect + dele_level
    /flashcards     # phase 5: generation tool schema + types (mirrors /workbook)
    /db             # Supabase client + queries
  /components
/api                # Vercel serverless functions (Anthropic proxy + token metering)
/scripts            # plain-Python Anki .colpkg parser (no LLM)
```

## Conventions

- TypeScript. Small, reviewable commits. Env vars for secrets; never commit
  `.env`. Keep the weekly learning-log section in the README.
- **`/api` is capped at 12 serverless functions (Vercel Hobby plan).** Check
  `ls api/*.ts api/*.py | wc -l` before adding a new endpoint file. When
  near/at 12, consolidate a related pair into one file dispatching on
  `req.method` + a query param (precedent: `api/word-bank.ts` GET/POST,
  `api/flashcards.ts` GET/GET+`?export`/POST) rather than adding a new file.
  Decision (Phase 5): keep consolidating opportunistically as this comes up,
  not a big upfront restructure — revisit only if Phase 6 needs a burst of
  new endpoints at once (options then: resource-oriented file consolidation,
  a Vercel catch-all `api/[...slug].ts` router, or upgrading to Pro).

## Mobile UI conventions (standing rules for all tabs)

- Inputs/textareas: font-size >= 16px always (prevents iOS zoom-on-focus).
  Never suppress zoom via viewport meta tag instead.
- Touch targets: minimum 44x44pt hit area on every tappable element.
- Fixed-position elements must use safe-area-inset env() variables.
- No hover-only affordances — every interaction needs a tap-accessible path.
- Free-response text inputs auto-grow with content, no fixed-height scroll box.
- New tabs (Workbook, Flashcards) must follow these from the start, not
  retrofit them later.

## Definitions of done

- **v1 / Phase 2 / Phase 3 / Phase 4:** shipped (see repo history). Phase 3's
  two follow-ups are both closed: lesson bubbles render Markdown
  (`react-markdown`), and the `dele_level_at_creation` pinning invariant is
  verified both statically (written once at creation in
  `createLessonThread`, no update path exists anywhere, `api/lesson-thread.ts`
  explicitly uses the fetched pinned value — never fresh settings — when
  generating a reply) and against real lesson_log data.
- **Phase 4 open follow-up (carried forward, not a Phase 5 blocker):** the
  **`known_structures` three-tier rule (§12) is unimplemented, not just
  unverified** — no settings column, no Settings UI, no prompt injection
  into Workbook's generation call exist yet (confirmed by grep during Phase
  5 planning; corrected from an earlier, inaccurate "just needs
  verification" framing). Building it is real, separate scope: a
  `settings.known_structures` column + migration, a Settings UI surface
  (none currently exists — only WritingTab's inline level `<select>`), the
  actual tiered prompt logic in `buildWorkbookGenerationSystemPrompt`, and
  the three synthetic verification tests originally scoped for Phase 4's DoD
  — (a) non-cloze Workbook type never uses an untaught structure outside the
  deliberate target; (b) cloze narrative, if it uses an untaught-but-
  essential structure, flags it inline, never silently; (c) a Writing prompt
  strictly avoids untaught structures with zero exception. Everything else
  in Phase 4 (exercise generation, session sourcing, objective/sentence-
  production grading, `source_tab` write-back, Anki read-path ingest, token
  metering, migrations) is built and shipped.
- **Phase 5 (current) — rebuilt to match `docs/ANKI_SCHEMA.md`:**
  - Card generation from two sources — Word Bank entries and Anki weak items
    — produces a card matching one of the two real note types (`Spanish
    Verb`, 13 fields; `Spanish General Word`, 4 fields), targeting one of
    the 11 real subdecks, via a Sonnet tool call using `docs/ANKI_SCHEMA.md`
    as embedded context (PRD §14).
  - `known_cards` dedup ledger, seeded from a real Anki export (not the
    Google Doc master list, not the app's own generation history). A
    selected term matching `known_cards` is flagged before generation, not
    generated then discarded.
  - Generation **stages, it doesn't commit**: cards land as
    `status='draft'` for review — `note_type`/`deck`/`tags` editable,
    generated content read-only with a per-card regenerate action. Confirm
    adds the card to `known_cards` and makes it export-eligible; reject
    discards it. This is curatorial review, not an in-app spaced-repetition
    *study* mode — Anki itself stays the review/study surface (PRD §10.5's
    "desktop as hub" framing); this review step only exists to catch
    misclassification before export, same problem the original ad hoc
    generation attempt ran into.
  - TSV export, one file per `(deck, note_type)` group, 5-line header
    format matching `docs/ANKI_SCHEMA.md` §3 exactly (field order is
    load-bearing — TSV import maps by column position, not header name).
  - New tabs follow the Mobile UI conventions above from the start, per the
    standing rule.
  - **Explicitly not built this phase:** entry regrade (PRD §13 —
    documented, deferred; needs its own per-entry History browse view
    first), a real `.apkg` binary export, the `OtrasFormas` tense-expansion
    field gap (`docs/ANKI_SCHEMA.md` §6 — not built unless explicitly
    asked), and any in-app flashcard *study* mode.
- **Phase 6:** parked (PRD §11).
