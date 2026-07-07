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

Local dev: run `vercel link` once to connect this directory to the Vercel
project, then `vercel env pull .env.local` to download all three (gitignored,
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
    /writing          # the only tab that exists yet, on purpose (see roadmap)
      /history         # per-category trend charts, sophistication trend
  /shared
    /grading           # the error taxonomy + grading contract types — one source of truth
    /prompts           # writing-prompt templates, parameterized by dialect + level
    /settings          # DELE-level nudge logic
    /db                # Supabase client + queries (server-only, never imported by the frontend)
/api                   # Vercel serverless functions — grade.ts, history.ts, settings.ts, hello.ts
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

## What's next

Per the PRD, v1 is the Writing tab only, and that's now functionally
complete and deployed: prompt generation, grading, persistence, History
trends, and level tracking all work end to end. Later phases (not started,
deliberately): a Workbook tab with generated exercises targeting my weak
categories, a Flashcards tab exporting to Anki, and a Lessons tab for
on-demand grammar explainers — each one seeded by the same error log this
phase built.

---

*Part of the same portfolio as [ai-automation-portfolio](https://github.com/jojo-d-explorer/ai-automation-portfolio).*
