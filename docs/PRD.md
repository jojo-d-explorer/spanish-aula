# PRD — Spanish Acquisition App ("working title: *Aula*")

A single-user, research-backed Spanish practice web app that also serves as a
full-stack portfolio piece. Four interconnected tools around one spine: a
persistent, categorized error log that turns four tabs into one system.

---

## 1. Vision (the whole thing)

Four tabs, deployed as one responsive web app usable on phone, iPad, and desktop:

1. **Writing** — prompt generator + dual-axis graded feedback (v1 target).
2. **Workbook** — research-backed exercise generator (cloze, conjugation recall,
   sentence production, matching), targeting *your* weak categories.
3. **Flashcards** — generate Anki-import TSV in your exact note-type schema;
   ingest an Anki export to detect weak items.
4. **Lessons** — on-demand, conversational e-lectures on a tense/topic; can seed
   from the error log.

**The spine.** Every tab reads from and writes to a persistent, categorized
**error log**. Writing and workbook mistakes are tagged by category; the log
drives lesson/workbook targeting and flashcard minting; a category crossing an
error threshold escalates to a targeted micro-lesson (per the Persona doc's
"3 repeats → micro-lesson" commitment). Progress = that error rate falling.

A second, sibling capture mechanism — the **Word Bank** — lets any word or
phrase be captured from anywhere in the app, independent of the error log, as
raw material for the Flashcard tab.

---

## 2. Non-negotiable design principles

- **Research-backed, not busywork.** Every exercise type maps to a named
  principle (retrieval practice, generation effect, interleaving, cloze deletion,
  elaborative interrogation). Surfaced in the README as the piece's point of view.
- **DELE-pegged.** Difficulty and rubrics calibrated to DELE descriptors.
  Current level is a **parameter** (A2 now → B1 → B2), not hardcoded.
- **Dialect-parameterized.** `dialect` is a single parameter injected into every
  prompt. Default = **Mexican**; grader notes Rioplatense divergences where
  relevant. Future dialect-switching is a config change, not a rewrite.
- **Dual-axis feedback.** Accuracy (every error corrected) and sophistication
  (1–10 linguistic ambition) are scored **independently**, so reaching for hard
  structures is rewarded even when the attempt is imperfect. Feedback tone is
  warm and non-critical about *content*, rigorous about *form*.
- **Avoidance-proof progress metric.** Accuracy is measured as
  **correct ÷ obligatory contexts** per category, never raw error counts.
- **Raw data is the only source of truth.** No tab writes retroactive edits to
  `error_observations` to make a metric look better. Signals like the
  escalation flag clear only through genuine new data (the trailing window),
  never through a manual reset.
- **Lean over clever.** When a feature could be built as either new
  infrastructure or a natural extension of an existing mechanism (freeform
  request, conversation thread, existing badge view), prefer the extension.
  The app should stay easy to carry forward as the learner's level rises,
  not accumulate staleness-management or level-migration machinery.

---

## 3. v1 scope — Writing tab only, deployed, on your phone

**Status: shipped.** See CLAUDE.md for full v1 flow and grading contract.

---

## 4. The grading contract (grader → app JSON)

The grader **must** emit per-category obligatory-context accounting from entry #1
— this is the one thing that can't be retrofitted without breaking trend
comparability.

```json
{
  "corrected_text": "…with corrections inline…",
  "accuracy": {
    "observations": [
      {
        "category": "subjunctive_trigger",
        "obligatory_context": true,
        "correct": false,
        "excerpt": "quiero que vas",
        "correction": "quiero que vayas",
        "note": "Subjunctive required after 'querer que' with subject change",
        "portuguese_interference": false
      }
    ],
    "category_summary": {
      "subjunctive_trigger": { "obligatory_contexts": 3, "correct": 1 },
      "ser_estar":          { "obligatory_contexts": 5, "correct": 5 }
    }
  },
  "sophistication": {
    "overall": 4,
    "subscores": {
      "syntactic_complexity": 3,
      "verbal_range": 4,
      "lexical_sophistication": 5,
      "cohesion": 4,
      "ambition": 6
    },
    "notes": "…"
  },
  "feedback_prose": "warm, non-critical debrief, form-focused",
  "dele_level_estimate": "A2+"
}
```

### Error taxonomy (extensive; shared enum across tabs; frozen — see §8.1)
`ser_estar` · `preterite_vs_imperfect` · `subjunctive_trigger` ·
`subjunctive_form` · `conditional` · `future_tense` · `present_perfect` ·
`gender_agreement` · `number_agreement` · `article_use` · `por_para` ·
`preposition_directional_vs_stationary` · `preposition_other` ·
`pronoun_placement` · `pronoun_choice_le_lo_la` · `se_impersonal_reflexive` ·
`gustar_type_construction` · `verb_conjugation_regular` ·
`verb_conjugation_irregular` · `stem_change` · `word_order` ·
`lexical_choice` · `false_friend_portuguese` · `accent_orthography` ·
`register_formality` · `other`

`false_friend_portuguese` flags known traps (familiar, grave, collar,
emocionado, embarazada, exquisito, …) as a first-class interference signal.

---

## 5. Progress metrics (the History view)

Per category, two trend lines over a **trailing 14-day window**:
- **Accuracy** = correct ÷ obligatory contexts, within the window.
- **Exposure** = obligatory contexts (attempt volume), within the window.

Rising exposure + rising accuracy = real progress. Rising accuracy + falling
exposure = possible avoidance → **flagged**, not celebrated (exact rule in §8.3).
A trend is only shown once a category reaches **5 obligatory contexts within
the current 14-day window** (noise control). Escalation flag (red badge) fires
per §8.3. This is the surface the learner references when browsing for lesson
topics — **Lessons does not duplicate this view** (see §9.3).

---

## 6. Stack, hosting, cost

- **Frontend:** React + Vite, responsive (one build serves phone/iPad/desktop).
- **Backend:** Vercel serverless functions **proxying the Anthropic API** so the
  key never reaches the browser.
- **Persistence:** Supabase (Postgres). **v1 shortcut:** single-user, no login UI
  — real auth deferred until/unless the app is shared.
- **Runtime model routing:** Sonnet for grading (low volume, nuance) and lessons;
  Haiku for workbook/flashcard generation (structured, higher volume); Anki
  parsing is plain Python (no LLM). Fable/Opus are **not** used at runtime.
- **Cost controls (day one):** hard monthly spend cap in the Anthropic console;
  prompt caching on the stable system+rubric prefix; capped output tokens.
  Expected solo cost: low single-digit dollars/month.

---

## 7. Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Scaffold: repo, stack, tabbed shell, serverless proxy, one live API round-trip | Done |
| 1 | **Writing tab** — prompt gen + dual-axis grading + history/trends → **deploy (v1)** | Done |
| 2 | Error-log spine hardened; taxonomy trends powering targeting; **Word Bank** added | Done |
| 3 | **Lessons tab** — conversational, on-demand e-lecture, seedable from error log | **Next — see §9** |
| 4 | Workbook tab — exercises targeting weak categories; **Anki export ingestion** | Not started |
| 5 | Flashcards tab — TSV export in your note-type schema; weak-item detection | Not started |

---

## 8. Phase 2 Spec (shipped): Error-Log Trends + Word Bank

### 8.1 Taxonomy — frozen

The 25-category enum in §4 is the literal, frozen source of truth. Defined
once in a shared module, imported by every tab — never redefined per-tab,
never renamed without a migration.

### 8.2 Schema

```sql
-- source of truth, one row per graded observation
error_observations (
  id, entry_id (FK), category (enum, frozen taxonomy per §8.1),
  obligatory_context boolean, correct boolean,
  excerpt, correction, note, portuguese_interference boolean,
  created_at
)

-- open capture, no classification at insert time
word_bank (
  id, term text,                -- word OR phrase, unconstrained
  context_sentence text nullable,
  note text nullable,
  source_tab text,
  dedup_status text default 'pending',  -- checked later, at export/batch time
  created_at
)
```

No rollup/cache table. Trends computed at read time from raw observations.

### 8.3 Trend logic (computed at read time)

- **Window:** trailing 14 days from now.
- **Minimum data:** a category's trend displays only if its count of
  `obligatory_context = true` observations **within the current 14-day window**
  is ≥ 5.
- **Escalation (3-repeats rule):** a category is flagged (red badge) when its
  count of `obligatory_context = true AND correct = false` observations
  **within the current 14-day window** is ≥ 3. **This flag clears only through
  the natural aging-out of the trailing window — no tab or feature manually
  resets it.**
- **Avoidance flag:** (yellow badge) fires when exposure in the current window
  is less than half of the prior 14-day window's exposure, while accuracy is
  flat or higher than the prior window's.

### 8.4 Word Bank

- **Capture UI:** a single persistent "+ Word" affordance, available on
  **every tab app-wide** (small floating control) — this is a shared,
  app-level feature, not tab-specific. 3-field form: `term` (required, word
  or phrase, no forced classification), `context_sentence` (optional), `note`
  (optional). Auto-stamped `source_tab`, `created_at`.
- Dedup against the external master word list happens later, at export/batch
  time — not at capture.

### 8.5 Migration safety (applies to every phase)

Before altering any existing table: back up current Supabase data; write
schema changes as a versioned migration file, not a manual dashboard edit;
test the migration against a copy of real production data, not an empty dev
database.

---

## 9. Phase 3 Spec: Lessons Tab (conversational)

### 9.1 Purpose (two-fold)

1. **Proactive gap-closing.** The learner can request a lesson on any category
   the app's error log has flagged as weak (escalation/avoidance badges, per
   §8.3), closing the loop between "the app noticed a pattern" and "the
   learner understands why."
2. **On-demand, learner-initiated.** The learner can request a lesson at any
   time, at two levels:
   - **Macro** — a grammar/structure topic, typically mapped to a taxonomy
     category (e.g., "let's talk about direct object pronouns").
   - **Micro** — a specific lexical item or narrow point (e.g., "I'm having a
     hard time with `dejar` and its different meanings").

### 9.2 Request UI

A single freeform text input opens a lesson thread. No menu of categories, no
separate macro/micro mode toggle — the learner types the request naturally,
macro or micro, and the backend classifies it.

### 9.3 No duplicate "flagged categories" browsing UI in Lessons

**Explicitly out of scope.** The existing History view (§5, shipped in Phase
2) already surfaces escalation (red) and avoidance (yellow) badges per
category. The learner references that view, then opens Lessons and types a
request. Do not build a second dashboard of weak categories inside the
Lessons tab.

### 9.4 Lesson format — conversational thread, not a single generated block

A lesson is a **short chat thread**, not a one-shot document. This single
mechanism covers three needs that would otherwise require separate features:

- **Opening depth.** The model decides the depth of its first reply — some
  topics warrant a short, direct answer; others warrant explanation +
  examples + a lightweight comprehension check. The learner does not select
  depth explicitly.
- **Going deeper.** If the opening reply is too brief (e.g., "quick answer:
  why X and not Y?"), the learner simply replies asking for more — normal
  conversation, no special UI.
- **Veering into a related subtopic.** If a tangent comes up mid-explanation,
  it's just the next message in the same thread. No separate lesson entry,
  no special "branch" mechanism.

Constraints that still apply regardless of how deep or long a thread gets:
- Any comprehension check offered is **recognition-based** (e.g. "which
  sentence uses *ser* correctly?"), not production. Production practice is
  explicitly Workbook's job (§9.8).
- Every message in the thread respects the same `dialect` and `dele_level`
  parameters as the rest of the app (§2).
- Runtime model: **Sonnet**.

### 9.5 Persistence — the thread is stored; nothing is regenerated

```sql
lesson_log (
  id,
  topic_category text nullable,      -- set for macro/grammar lessons; matches
                                      -- the frozen taxonomy enum (§8.1) when
                                      -- applicable
  topic_freeform text nullable,      -- set for micro/lexical lessons (e.g. "dejar")
  dele_level_at_creation text,       -- snapshot of the learner's level when the
                                      -- thread was opened — see §9.6
  created_at
)

lesson_messages (
  id,
  lesson_id (FK -> lesson_log.id),
  role enum('user','assistant'),
  content text,
  created_at
)
```

Revisiting a past `lesson_log` entry reopens the **exact original thread** —
messages are never regenerated. "Completed" for tally purposes = the entry
exists in the log (opening a thread = viewing it; no separate completion
state or pass/fail gating).

### 9.6 Staying lean as the learner's level rises — no staleness machinery

The app does **not** attempt to detect or update stale lesson content as the
learner's DELE level increases. There is no "regenerate for my current
level" feature and no staleness flag. Instead:

- Each `lesson_log` entry is timestamped with `dele_level_at_creation`, so an
  old A2-level `ser_estar` thread and a later B1-level `ser_estar` thread
  coexist in the log as distinct entries, not as one entry needing an update.
- If a topic needs revisiting at a higher level, the learner just opens a
  **new** thread via the same freeform request UI (§9.2) — this requires zero
  additional engineering, since new-thread creation already exists.
- The resulting log doubles as a visible growth record (e.g. "ser_estar — A2
  — March" next to "ser_estar — B1 — July"), which is a feature, not a gap.

### 9.7 The log/tally view

A simple browsable list of past lesson threads, groupable/countable by
category, showing `dele_level_at_creation` per entry so growth over time is
visible at a glance. Optionally overlay lesson timestamps on the existing
per-category accuracy trend chart (§5) so the learner can visually correlate
lesson timing with subsequent accuracy movement.

### 9.8 Relationship to Workbook (Phase 4, not built yet)

Lessons builds **declarative** knowledge (understanding, via conversation);
Workbook (Phase 4) builds **procedural** knowledge (production, under
retrieval-practice conditions). Every lesson thread should offer an optional
prompt — e.g. "Want to practice this further?" — that will deep-link to a
pre-seeded Workbook session on the same topic once Workbook exists. This link
is a **stub/TODO for Phase 4**, not built now; do not build any Workbook
functionality in Phase 3.

### 9.9 Word Bank — no new work required

The global "+ Word" affordance (§8.4) already appears on every tab, including
Lessons, by design. No lesson-specific auto-offer or integration is needed;
this is a regression check (confirm it still works inside the Lessons view),
not new feature work.

### 9.10 What Lessons must NOT do

- Must not write to `error_observations` or otherwise affect the escalation
  or avoidance flags. Those clear only via the trailing-window mechanism
  (§8.3). A lesson is an intervention, not a data edit.
- Must not build any staleness-detection or "regenerate at current level"
  machinery (§9.6) — new threads are the mechanism for revisiting a topic.
- Must not build any Workbook exercise functionality (§9.8 is a stub only).
- Must not duplicate the History view's flagged-category display (§9.3).

### 9.11 Definition of done for Phase 3

- Freeform request input opens a new lesson thread; accepts both macro
  (grammar/category) and micro (lexical) requests; backend classifies and
  populates `topic_category` or `topic_freeform` accordingly.
- The model decides opening depth (short vs. explanation + examples + check)
  without a user-facing depth selector.
- The learner can reply within a thread to go deeper or pivot to a related
  subtopic; this requires no UI beyond a normal chat input — verified with at
  least one thread that includes a follow-up message.
- Comprehension checks, when present, are recognition-based, not production.
- Generated content respects `dialect` and `dele_level` parameters; each
  thread stores `dele_level_at_creation`.
- Full thread (all messages) is persisted in `lesson_messages`; revisiting a
  `lesson_log` entry shows the original thread unchanged, not a regeneration.
- Log/tally view lists past lesson threads, countable by category, showing
  the level at which each was created.
- A synthetic test confirms taking a lesson on an escalated category does not
  clear the escalation flag — only the trailing window does.
- The global Word Bank "+ Word" affordance is confirmed working inside the
  Lessons tab (regression test, not new build).
- Migration for the new `lesson_log` and `lesson_messages` tables follows
  §8.5 (backed up, versioned, tested against a copy of real data).
