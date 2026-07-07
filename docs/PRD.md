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
4. **Lessons** — on-demand e-lectures on a tense/topic; can seed from the error log.

**The spine.** Every tab reads from and writes to a persistent, categorized
**error log**. Writing and workbook mistakes are tagged by category; the log
drives lesson/workbook targeting and flashcard minting; a category crossing an
error threshold escalates to a targeted micro-lesson (per the Persona doc's
"3 repeats → micro-lesson" commitment). Progress = that error rate falling.

A second, sibling capture mechanism — the **Word Bank** (§8) — lets any word or
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

---

## 3. v1 scope — Writing tab only, deployed, on your phone

v1 is a genuinely usable daily study tool *and* a legitimate portfolio slice.
Ship and deploy this **before** building tabs 2–4, so the app returns Spanish
practice within a week or two and the rest is built around a working tool.

**Status: shipped.**

### v1 user flow
1. Open app → **Writing** tab → tap **Generate prompt**.
2. Prompt appears, calibrated to current DELE level, drawn from your interest
   rotation (wine, cinema, tennis, jazz, art, fitness, VC/finance) + parenting.
3. Write a Spanish entry in the box. Submit.
4. Grader returns, in the **Dra. Restrepo** voice:
   - corrected text,
   - per-category accuracy observations (with obligatory-context accounting),
   - sophistication score + subscores,
   - a warm, form-focused debrief,
   - an estimated DELE level for the entry.
5. Entry, scores, and tagged observations persist. **History** view shows
   per-category accuracy and attempt-volume trends over a rolling window.

### v1 explicitly out of scope (but architected for)
Workbook, Flashcards, Lessons tabs · Anki export ingestion · conversation mode ·
multi-user auth (single-user shortcut for now; see §6).

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

### Error taxonomy (extensive; shared enum across tabs; frozen — see §8)
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

Per category, two trend lines over a **trailing 14-day window** (see §8 for the
exact formulas):
- **Accuracy** = correct ÷ obligatory contexts, within the window.
- **Exposure** = obligatory contexts (attempt volume), within the window.

Rising exposure + rising accuracy = real progress. Rising accuracy + falling
exposure = possible avoidance → **flagged**, not celebrated (exact rule in §8).
A trend is only shown once a category reaches **5 obligatory contexts within
the current 14-day window** (noise control). Sophistication overall +
subscores tracked as a secondary series; a persistently low subscore
(e.g. `verbal_range`) is a targeting hook for the Lessons/Workbook tabs later.

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

> **Open decision:** stack assumes a React SPA, which follows from the confirmed
> responsive multi-device + tabbed + portfolio requirements. Streamlit remains a
> faster-but-less-showpiece alternative; flag if you want to reconsider.

---

## 7. Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Scaffold: repo, stack, tabbed shell, serverless proxy, one live API round-trip | Done |
| 1 | **Writing tab** — prompt gen + dual-axis grading + history/trends → **deploy (v1)** | Done |
| 2 | Error-log spine hardened; taxonomy trends powering targeting; **Word Bank** added | **Next — see §8** |
| 3 | Lessons tab — on-demand e-lecture, seedable from error log | Not started |
| 4 | Workbook tab — exercises targeting weak categories; **Anki export ingestion** | Not started |
| 5 | Flashcards tab — TSV export in your note-type schema; weak-item detection | Not started |

---

## 8. Phase 2 Detailed Spec: Error-Log Trends + Word Bank

### 8.1 Taxonomy — frozen

The 25-category enum in §4 is the literal, frozen source of truth for Phase 2
onward. Defined once in a shared module, imported by every tab — never
redefined per-tab, never renamed without a migration.

### 8.2 Schema

No rollup/cache table. At single-user, low-daily-volume scale, computing
14-day-window trends on the fly from raw observations is trivial, and skipping
a cache table removes an entire class of cache-vs-source-of-truth consistency
bugs. Raw observations are the only source of truth; trends are queries.

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
  id, term text,                -- word OR phrase, unconstrained, whatever
                                 -- form it was encountered in
  context_sentence text nullable,
  note text nullable,
  source_tab text,
  dedup_status text default 'pending',  -- checked later, at export/batch time,
                                         -- against the external master word list
  created_at
)
```

### 8.3 Trend logic (computed at read time)

- **Window:** trailing 14 days from now.
- **Minimum data:** a category's trend displays only if its count of
  `obligatory_context = true` observations **within the current 14-day window**
  is ≥ 5. Below that, show "not enough recent data" rather than a trend.
- **Escalation (3-repeats rule):** a category is flagged for a targeted
  micro-lesson when its count of `obligatory_context = true AND correct = false`
  observations **within the current 14-day window** is ≥ 3.
- **Avoidance flag:** compare the current 14-day window to the *prior* 14-day
  window (days 15–28 ago). Flag a category when exposure (obligatory-context
  count) in the current window is less than half of the prior window's
  exposure, while accuracy in the current window is flat or higher than the
  prior window's accuracy. This requires querying two window-periods of
  history at read time — no separate storage needed since raw data holds it all.

### 8.4 Word Bank

- **Capture UI:** a single persistent "+ Word" affordance, available on every
  tab (small floating control). Opens a lightweight 3-field form:
  - `term` (required) — a word or a phrase, free text, no length constraint,
    no forced grammatical classification (no verb/tense/category tagging at
    capture time — that's deferred entirely to the export/batch step, matching
    the existing master-word-list workflow of raw entry → later marked
    ✓ In Deck / ADD).
  - `context_sentence` (optional)
  - `note` (optional)
  - Auto-stamped: `source_tab`, `created_at`.
- **Explicitly out of scope this phase:** search, filter, edit views, and any
  dedup-checking UI. The bank is being *filled*, not yet *managed* — that
  comes later, at flashcard-generation time (Phase 5).

### 8.5 Migration safety

Before altering any existing table: back up current Supabase data (real Phase 1
entries/observations already exist and must not be lost); write schema changes
as a versioned migration file, not a manual dashboard edit; test the migration
against a copy of real production data, not an empty dev database.

### 8.6 Definition of done for Phase 2

- Taxonomy is a single frozen enum, imported everywhere, matching the 25
  categories in §4 exactly.
- A category with 4 in-window obligatory contexts shows no trend; one with 5 does.
- A synthetic case with 3 in-window incorrect-and-obligatory observations
  triggers the escalation flag.
- A synthetic case with a current-window exposure drop to less than half of
  the prior window, with flat-or-rising accuracy, triggers the avoidance flag.
- A Word Bank entry — tested with both a single word and a multi-word phrase —
  saves correctly from at least two different tabs and persists across a
  page refresh.
- All existing Phase 1 entries and observations are intact and queryable after
  the migration runs.
