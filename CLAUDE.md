# CLAUDE.md

Project briefing for Claude Code. Read `PRD.md` for the full spec; this file is
the always-loaded context.

## What we're building

A single-user, research-backed Spanish practice web app (working title *Aula*)
that is also a full-stack portfolio piece. Four interconnected tabs around a
persistent categorized **error log**. **We are building v1 = the Writing tab
only**, deployed, before any other tab. Do not build Workbook, Flashcards, or
Lessons yet, even if it seems helpful.

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

## Suggested structure (adjust as needed, keep feature-first)

```
/src
  /features
    /writing        # v1: prompt gen, entry box, feedback view, history
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

## Definition of done for v1

Deployed URL, works on his phone: generate a DELE-calibrated prompt → write →
receive dual-axis feedback in the Dra. Restrepo voice → entry + tagged
observations persist → History shows per-category accuracy and exposure trends
with noise-controlled trailing windows.
