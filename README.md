# Aula — Spanish Practice App

A single-user Spanish study tool built around one idea: every mistake I make
gets logged, categorized, and tracked over time, so "progress" is a number I
can actually see instead of a feeling I have to trust.

## About

I'm Joey Clark — VC/finance background, studying for the DELE exam (Mexican
Spanish, currently A2 heading toward B1/B2). I'm not a software engineer. This
is my second "learn to build software by building something I actually need"
project (the first, [ai-automation-portfolio](https://github.com/jojo-d-explorer/ai-automation-portfolio),
was a job-search automation platform). This time the goal is a full-stack web
app — a real frontend, a real backend, a real database — built with Claude
Code doing the implementation while I make the calls on what to build and why,
and learn the shape of the system as it comes together.

The whole point of the error log is something called **avoidance-proofing**.
A raw error *count* going down could just mean I've stopped attempting hard
grammar — subjunctive, `por`/`para`, the works — and started writing safer,
simpler sentences instead. That would look like "progress" and be the opposite
of it. So the app tracks **accuracy as correct ÷ attempts**, not just correct
count, and separately tracks how *often* I even attempt each category. Rising
accuracy with falling attempts gets flagged, not celebrated.

## What it does (so far)

- **Generate a writing prompt** — calibrated to my current DELE level, drawn
  from a rotating set of topics I actually care about (wine, cinema, tennis,
  jazz, art, fitness, venture capital, my kid).
- **Grade what I write** — in the voice of "Dra. Restrepo," a warm but
  rigorous tutor persona: every grammar/spelling error gets caught and
  explained, the content of what I wrote is never judged, and a separate
  "sophistication" score rewards reaching for harder structures even when I
  get them wrong.
- **Remember every entry** — the corrected text, every tagged error, and the
  scores persist to a database, forever, from entry #1.
- **Show me trends, not just a score** — a History view breaks accuracy and
  attempt-volume down by grammar category over time, hides a category
  entirely until there's enough data to mean anything, and flags possible
  avoidance.
- **Track my level for me** — my current DELE level is a stored setting that
  drives both the prompts I get and how I'm graded. The app nudges me to move
  up a level once my last several entries all grade out consistently higher —
  but I have to confirm it; nothing changes automatically off one lucky entry.
- **Catch a word anywhere, "+ Word" from any tab** — an app-level capture
  affordance, unstructured on purpose. No classification at capture time;
  that happens later, when I turn it into a flashcard.
- **Ask for a grammar explainer** — the Lessons tab is a threaded,
  conversational space for on-demand explanations, separate from graded
  writing. Each thread remembers my DELE level *at the time it was written*,
  so an old explanation never silently reinterprets itself as I improve.
- **Drill my actual weak spots** — the Workbook tab generates exercises
  (contextual cloze, conjugation recall, gap-fill, sentence production)
  targeting whatever category the error log flags, or whatever I ask for
  freeform. Objective grading matches instantly without an API call when
  possible; only genuine near-misses go to the model.
- **Pull my real Anki deck's weak cards in** — upload a `.colpkg` export and
  a plain-Python parser (no LLM) finds cards I'm forgetting by FSRS signal,
  usable as another Workbook targeting source.
- **Turn words into real Anki flashcards** — the Flashcards tab generates
  cards that match my actual deck: the right note type, the right subdeck,
  the right field order, deduped against what's already in Anki. Nothing
  gets exported until I review and confirm it; export is a TSV I import
  myself, one deck at a time.

## The stack, in plain terms

| Piece | What it is | Why |
|---|---|---|
| **React + Vite** | The frontend — what renders in the browser | Standard, fast, one build works on phone/laptop/tablet |
| **Vercel serverless functions** (`/api`) | Small backend functions that only run when called | My Anthropic API key needs to live *somewhere* that isn't the browser — this is that somewhere |
| **Anthropic API (Claude Sonnet)** | Does the actual grading | Reads what I wrote, returns corrected text + tagged errors + scores as structured data, not just prose |
| **Supabase (Postgres)** | The database | Every entry and every tagged error lives here, permanently |
| **Vercel** | Hosting/deployment | Push to GitHub, it deploys automatically |

## Environment variables

| Variable | Where it's used | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api` functions only, never the browser | Yes |
| `SUPABASE_URL` | `/api` functions only | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api` functions only, never the browser | Yes |
| `APP_ACCESS_CODE` | `/api` functions only — temporary access-code gate, see `src/shared/auth/accessGate.ts` | Yes |

Local dev: run `vercel link` once to connect this directory to the Vercel
project, then `vercel env pull .env.local` to download all four (gitignored,
never committed). Production: set the same variables in the Vercel dashboard
under Project → Settings → Environment Variables.

## Commands

- `npm run dev` — frontend only (plain Vite, fast reload, `/api` routes 404)
- `npm run dev:full` — frontend + `/api` functions together (`vercel dev`) —
  use this when testing anything that calls Claude or the database
- `npm run build` — production build
- `npm run deploy` — deploy to production (`vercel deploy --prod`)

## Repo structure

```
/src
  /features
    /writing           # prompt gen, free journal, feedback, history
    /word-bank         # app-level floating "+ Word" capture
    /lessons           # threaded conversational grammar explainers
    /workbook          # exercise generation, grading, Anki weak-item ingest UI
    /flashcards        # card generation, staged review, per-deck TSV export
  /shared
    /grading           # the error taxonomy + grading contract types — one source of truth
    /prompts           # writing-prompt templates, parameterized by dialect + level
    /flashcards        # Anki deck/note-type schema, generation tool + types
    /settings          # DELE-level nudge logic
    /auth              # temporary access-code gate (not real auth — see Hard Rules)
    /db                # Supabase client + queries (server-only, never imported by the frontend)
/api                   # Vercel serverless functions (proxy the Anthropic API + token metering)
/docs
  PRD.md               # full spec, phase-by-phase
  ANKI_SCHEMA.md        # the real Anki deck contract Flashcards generates against
/supabase/migrations    # versioned schema changes, applied manually via the SQL Editor
```

## Progress log

This is the honest version — including the parts that broke.

### 2026-07-05 — Planning
Wrote the PRD and the Claude Code project briefing. Scoped v1 down to just
the Writing tab, deployed, before touching the other three planned tabs
(Workbook, Flashcards, Lessons) — get one real thing working end to end
before building anything else.

**Learned:** writing down the scope *before* building is what stopped me from
trying to build all four tabs at once.

### 2026-07-06 — Phase 0: scaffold + first deploy
Set up the Vite + React app, a Vercel serverless function proxying the
Anthropic API, and got one real "hello world" round trip working — browser to
serverless function to Claude and back — deployed and tested on my phone.

Hit two real bugs immediately, before any feature code existed:
- `vercel dev` refuses to run if `package.json`'s `dev` script is itself
  `vercel dev` — it looks like infinite recursion to it. Fixed by splitting
  into a plain `vite` script and a separate `dev:full`.
- Vite ignores the port `vercel dev` assigns it and picks its own, so
  `vercel dev` timed out waiting 5 minutes for a port that was never going to
  open. Fixed by pinning Vite's port explicitly in `vercel.json`.

**Learned:** local dev tooling has its own real bugs, completely separate
from whatever you're actually trying to build. Also: account setup order
matters — link the Vercel project to GitHub *before* running local dev, or
you end up with two disconnected projects.

### 2026-07-06 — Prompt generation
Built the actual DELE-calibrated prompt generator — rotating topics, level
calibrated instructions, no AI call needed for this part (a good template
does the job and it's free).

### 2026-07-06 — Real grading
Wired up the entry box to real Claude grading: a rubric prompt with the full
error taxonomy, forced structured output (a "tool call" the model must use,
so the response is guaranteed-shape JSON instead of hoping it formats prose
correctly), Dra. Restrepo's persona, dual-axis scoring.

### 2026-07-06 — Persistence (and a genuinely tricky bug)
Added Supabase so entries actually survive a refresh. This is where things
got interesting:
- Marked the Supabase keys "Sensitive" in Vercel without realizing that makes
  them **write-only** — Vercel will never let you (or the CLI) read the value
  back out again, ever, by design.
- Pasted the wrong URL (grabbed the REST API example URL instead of the
  plain project URL).
- The real bug, once those were fixed: the deployed app crashed with
  `Cannot find module '.../grading/types'`. TypeScript's type-checker was
  completely happy with the code — it passed clean every time — but Node's
  actual runtime on Vercel requires relative imports to include the literal
  `.js` file extension, which TypeScript doesn't enforce. Passing type-check
  is not the same as working in production.

**Learned:** a green type-check is not proof of anything at runtime. Also:
when something that should be simple keeps failing, check whether you're
even looking at the right layer — I spent real time confused about Supabase
before realizing the crash was a Node.js module-resolution issue that had
nothing to do with the database at all.

### 2026-07-06 — History view
Built the per-category accuracy/exposure trend view. Every category stays
completely hidden until it has enough data to mean something (5+ attempts) —
otherwise early noise would look like a signal. Charts follow a real
data-visualization framework (one measure per chart, validated color
contrast for light and dark mode) rather than me eyeballing what "looks
right."

### 2026-07-06 — Persisted level + nudge
My DELE level was a hardcoded constant until this point. Now it's a real
setting stored in the database, and the app suggests moving up a level once
my last 5 entries all grade out consistently higher — but I have to confirm
it. Nothing advances automatically off one good entry, same avoidance-proofing
principle as the History view.

### 2026-07-07 — Phase 2: error-log spine + Word Bank
Hardened the error log into something with real trend math: a trailing
14-day window, accuracy and exposure computed at read time from raw
observations (no rollup/cache table — recomputed live so past data can never
go stale), plus escalation and avoidance flags. Added Word Bank — a single
unstructured "+ Word" capture affordance available from every tab, no
classification required at capture time.

### 2026-07-08 — Phase 3: Lessons tab
Added a threaded, conversational Lessons tab for on-demand grammar
explainers. Each thread pins `dele_level_at_creation` at creation time and
never touches it again — no staleness/regeneration machinery, so an old
lesson stays exactly as it was explained, even after my level changes.

### 2026-07-09 — Phase 4: Workbook, Anki read path, access gate
Built the Workbook tab (four exercise types generated against weak
categories), a plain-Python `.colpkg` parser that extracts weak items by
FSRS signals (read path only — no write-back), and proxy token metering on
every model call so real per-feature cost is visible from day one instead of
retrofitted later. Also added a temporary access-code gate once the repo
went public (one shared passphrase, one signed cookie — explicitly not real
auth), and documented a `known_structures` constraint (what grammar I've
actually been taught vs. what's merely level-appropriate) — though this
turned out to be spec-only for a while; see 07-10.

### 2026-07-10 — Mobile pass, a silent grading bug, and Flashcards (twice)
Busy day. Did a full mobile-readability pass — iOS zoom-on-focus fix, 44×44
touch targets, a bottom tab bar, safe-area insets, a minimal installable
PWA shell, auto-growing textareas — and turned the results into a standing
convention so every future tab follows it from the start instead of
retrofitting later.

Then found a real, silent bug in Writing's grader: on longer entries, the
model could get cut off by `max_tokens` mid-response. `corrected_text`
generates first in the schema and would come through fine, while
`feedback_prose` (generated last) got truncated — and nothing was checking
for it, so I'd see a correction with no feedback and no error at all. Fixed
with a bigger token budget, a `stop_reason` check, and a runtime
completeness guard instead of trusting the model's JSON blindly.

Built Phase 5 (Flashcards) — and rebuilt it the same day. The first pass
generated generic term/translation/example cards with zero knowledge of my
actual Anki collection. Wrote `docs/ANKI_SCHEMA.md`, the real contract: 11
real subdecks (including a genuine duplicate "06" numbering quirk in my
live deck — not a bug to silently fix), two note types with load-bearing
field order, a controlled tagging vocabulary, and a `known_cards` dedup
ledger. Rebuilt Flashcards against it: dedup happens *before* generation,
drafts stage for review before an explicit confirm, export is one TSV per
deck matching the real import format. Also hit Vercel's Hobby-plan
12-function ceiling and fixed it by consolidating routes instead of adding
files.

**Learned:** a feature that "generates correctly" by its own schema can
still be useless if it doesn't know the real target system's actual shape.
Writing the contract down first turned a plausible-looking but unusable
feature into one that imported cleanly into a real, years-old Anki
collection on the first try.

### 2026-07-11 — Got it running for real, and a fabricated-date bug
Getting local dev working for real surfaced a chain of environment issues,
not application bugs: the Vercel CLI wasn't installed, `.env.local` was
missing the access-code secret, and — the actual root cause — `vercel dev`
doesn't read `.env.local` at all. It live-fetches secrets from Vercel
scoped to the `development` environment, which had none of the four
required vars (they'd only ever been set for Preview/Production). Fixed by
registering all four under Development too.

The first real generation run caught another bug: the `leccion::` tag is
supposed to be dated to when I actually learned a term, but the model had
no access to that date and was inventing plausible-looking fake ones.
Fixed by threading the real Word Bank capture date through, with an
explicit instruction to omit the tag rather than guess when no real date
exists.

Then ran the whole thing for real: confirmed a batch of drafts, exported
the TSV, imported into Anki — correctly sorted into the right deck and note
type on the first real-world try.

**Learned:** local environment bugs (env var scoping, CLI config) eat just
as much time as application bugs, and "it works in my test" doesn't mean
much until it's run against production-shaped everything — real secrets,
real data, a real Anki import.

## What's next

Phases 2 through 5 are all shipped now — Writing, Word Bank, Lessons,
Workbook, and Flashcards are live and working end to end, including a real
Anki import. What's still genuinely open:

- **`known_structures`** is fully documented as a standing rule but was
  never actually wired into any prompt — still true today. Building it for
  real needs a settings column, a Settings UI (none exists yet), and
  threading into both Workbook's and Flashcards' generation prompts.
- **Entry regrade** — fixing an entry whose grading came back broken
  currently means resubmitting, which duplicates the row. Documented, not
  built; needs its own small "browse past entries" view in History first.
- A couple of small Phase 3 follow-ups (Markdown rendering in Lesson
  bubbles, live-verifying the level-pinning invariant) and a mobile
  keyboard-behavior check that genuinely needs a real phone, not a
  simulator.
- Phase 6 (multi-tenancy, monetization) stays parked on purpose — the
  token-metering groundwork is already in place for whenever that's worth
  revisiting.

---

*Part of the same portfolio as [ai-automation-portfolio](https://github.com/jojo-d-explorer/ai-automation-portfolio).*
