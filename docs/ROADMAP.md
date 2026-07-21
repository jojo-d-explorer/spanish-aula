# ROADMAP — Aula, Phases 7+

Companion to `docs/PRD.md`. This file is **forward-looking and not
authoritative** — Claude Code reads it for orientation, not as a work order.
Anything currently being built has a full detailed spec in `PRD.md` instead
(§9 for Phase 8, §10 for Phase 10). `CLAUDE.md` states which phase is current;
this file is everything around it.

Phases 0–5 are shipped. Phase 6 (multi-tenancy/monetization) stays parked on
purpose.

**Current status: Phase 8 (Revisión) is the active build. Phase 10 (Lectura)
is fast-tracked to follow it immediately. Phases 7 and 9 are deferred — not
cancelled — and summarized below.**

---

## Why 8 and 10 were fast-tracked ahead of 7 and 9

Phases 0–5 built a **written output correction engine** — one skill of four,
and, per the SLA literature, not the one that drives most acquisition on its
own. Of the four items originally proposed for this next block:

- **Phase 8 (revision cycle)** turns feedback from something read into
  something acted on — the point where uptake research says learning actually
  happens.
- **Phase 10 (input tab)** adds the input channel the app has never had at
  all, and is the largest single gap in Aula's coverage of the four skills.
- **Phase 7 (targeted elicitation)** and **Phase 9 (focused feedback)** are
  real improvements to the existing Writing loop, but they refine something
  that already works. 8 and 10 add capability that doesn't exist yet, which is
  the higher-leverage place to spend the next block of building.

Building 8 and 10 first creates no rework for 7 or 9 later — Phase 7 will seed
prompts from the same error-log queries already computed for trends, and
Phase 9 only touches the grading system prompt's explanation budget, not the
contract. Nothing in either deferred phase depends on schema Phase 8 or 10
introduces.

---

## Current — Phase 8: Revisión (see `PRD.md` §9 for full spec)

Written feedback becomes something acted on, not just read. Entry → feedback →
`Revisar` → indirect-feedback revision editor (location + category shown,
correction withheld until an explicit reveal) → second grading scored for
uptake (`fixed` / `still_wrong` / `avoided`) → both versions retained.

The critical correctness rule: revision observations are excluded from
accuracy/exposure trends, so History numbers before and after a revision must
be byte-identical. That isolation test is written before the feature.

Also retires the open "entry regrade" item — resubmitting an entry becomes a
deliberate revision instead of a duplicate-row workaround.

---

## Next — Phase 10: Lectura (see `PRD.md` §10 for full spec)

Starts only after Phase 8's definition of done is met.

Paste-in authentic text → tokenize and frequency-rank (plain code) → gloss
genuinely unknown items in context (one batched Haiku call, lemma returned
alongside the gloss to avoid adding a lemmatizer dependency) → diff against
the real Anki deck and Word Bank → highlight, optionally, where a
currently-flagged weak category is used *correctly* by the native writer →
comprehension questions → one-tap capture to Word Bank with a real date.

Never writes to `error_observations` — reading isn't a production error. No
new serverless functions, given the Hobby-plan ceiling already hit once.

---

## Deferred — Phase 7: Targeted prompt elicitation

**The problem.** Prompts rotate by topic, not by grammatical need. Obligatory
contexts for a flagged category currently appear by chance, which means the
denominator in the accuracy metric isn't under the learner's control and weak
categories can go weeks without new data.

**The fix.** Seed the prompt generator from the error log's weak-category
query (already computed for History) so prompts *structurally force* the
categories currently failing — e.g. a prompt shaped to require subjunctive
for a flagged `subjunctive_trigger`. An elicitation template library (2–4
prompt shapes per category, hand-written, not model-generated) composes with
the existing topic rotation. **Covert by default** — disclosing the target
category would let monitoring substitute for acquired competence, so a
`Mostrar objetivo` toggle exists but defaults off, and which mode was used is
recorded.

This item should ride along with `known_structures` wiring (below) when it's
picked up — don't elicit a structure that hasn't actually been taught yet.

Will get a full `PRD.md` section, in §9/§10's format, when promoted to current.

---

## Deferred — Phase 9: Focused feedback budget

**The problem.** The grader explains every error with equal weight. Focused
corrective feedback on a small number of targets outperforms unfocused
feedback in the literature — attention is finite, and fourteen equally-weighted
explanations dilute all fourteen.

**The fix.** The grading contract JSON does not change — every error is still
detected, tagged, and corrected in `corrected_text`, since the observation
stream is what all trends are built from. What changes is the *explanation*
depth: a `focus_categories` parameter (fed by Phase 7's targets, or the
current escalation flags for freeform entries) gets full "why" treatment;
everything else gets a terse one-line note. Small change, best done alongside
Phase 7 since they share the targeting signal.

Will get a full `PRD.md` section when promoted to current.

---

## Backlog (specced in more detail when picked up, not before)

**Spaced/interleaved Workbook scheduling.** Workbook generates on demand;
retrieval-practice research says the *schedule* matters more than the item.
Give each error category lightweight review state (last drilled, interval,
stability) and have Workbook propose a daily mix interleaved across 3–4
categories rather than blocked on one. Reuse the FSRS concept from the Anki
read-path parser, not the parser code itself.

**Lexical profiling — no API cost.** Run the full corpus of entries against
the Phase 10 frequency list: % of tokens outside top-1000/2000/5000,
type-token ratio, verb-form variety over time. Objective productive-vocabulary
curve; catches *lexical* avoidance the grammar taxonomy structurally can't
see. Plain Python — a genuine computational-linguistics artifact for the
portfolio, not another model call. Natural follow-on once Phase 10's frequency
list is already in the repo.

**DELE task-format mode.** Timed, exam-shaped writing tasks graded against
published DELE band descriptors instead of the internal sophistication score.
This is what converts general improvement into a pass.

**Speaking ingest.** Record a voice memo → transcribe → run the transcript
through the *same* grader with `source = 'speaking'`. Same taxonomy, same
trend math, excluded from written trends but comparable to them. The
written/spoken accuracy gap on identical categories is where the real B2 risk
lives.

**`known_structures`.** Documented as a standing rule since Phase 4, never
wired into any prompt. Needs a settings column, a Settings UI (none exists
yet), and threading into Workbook's, Flashcards', and eventually Phase 7's
generation prompts. Without it, "level-appropriate" means "what the CEFR says
an A2 knows" rather than "what Flavia has actually taught." Pick this up
alongside Phase 7.

**Mobile keyboard check in Lessons** — needs a real phone, not a simulator.

**Persona document.** `Persona.pdf` in the project still describes Buenos
Aires/Panama City, A1–A2, a six-month B2 timeline, and daily one-hour guides.
None of that is current — the live direction is Mexico City, Mexican Spanish,
DELE B2, with Flavia and Jorge as the live teachers. It's loaded as context in
every conversation in the project and actively pulls against the current
direction. Rewrite or retire it — not code work, but worth doing before it
causes a real mismatch in generated material.

---

## Standing rules for every phase in this document

1. **Migration safety** (`PRD.md` §8.5) applies to every schema change: back
   up, versioned migration file, tested against a copy of real production
   data.
2. **Every new column is nullable or defaulted** so all existing entries and
   observations remain valid and queryable without backfill.
3. **The grading contract JSON shape does not change** — extensions are
   additive top-level keys only.
4. **Anything deterministic gets no model call.** Frequency ranking,
   known-item diffing, answer matching, tokenizing — plain code.
5. **Haiku for volume, Sonnet for judgment.** Batch aggressively; cache the
   stable system + taxonomy + rubric prefix.
6. **Write the contract down before building.** The Flashcards rebuild on
   07-10 is the proof: `ANKI_SCHEMA.md` turned a plausible-looking but useless
   feature into one that imported cleanly on the first real try. Same
   discipline applies to Phase 7's elicitation template library and Phase 8's
   uptake-scoring contract.
