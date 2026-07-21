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
comparability. **This contract shape does not change in any phase through at
least Phase 10** — extensions (e.g. the Phase 8 `uptake` block) are additive
top-level keys only.

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

As of Phase 8, a second family of series exists alongside accuracy/exposure:
**uptake rate** and **avoidance-on-revision rate**, computed only from revision
attempts (§9.8). These are never blended into the accuracy/exposure trends
above — see §9.7 for why that separation is load-bearing.

---

## 6. Stack, hosting, cost

- **Frontend:** React + Vite, responsive (one build serves phone/iPad/desktop).
- **Backend:** Vercel serverless functions **proxying the Anthropic API** so the
  key never reaches the browser. **Hobby-plan 12-function ceiling is binding** —
  consolidate routes rather than add new function files (hit and fixed once
  already, in Flashcards; do not re-hit it in Lectura).
- **Persistence:** Supabase (Postgres). **v1 shortcut:** single-user, no login UI
  — real auth deferred until/unless the app is shared. A temporary access-code
  gate (one shared passphrase, one signed cookie) protects the now-public repo's
  deployed instance; this is explicitly not real auth.
- **Runtime model routing:** Sonnet for grading (low volume, nuance) and lessons;
  Haiku for workbook/flashcard/lectura generation (structured, higher volume);
  Anki parsing is plain Python (no LLM). Fable/Opus are **not** used at runtime.
- **Cost controls (day one):** hard monthly spend cap in the Anthropic console;
  prompt caching on the stable system+rubric prefix; capped output tokens;
  per-call token metering to a `usage_log` table so real per-feature cost is
  visible, not retrofitted.

> **Open decision:** stack assumes a React SPA, which follows from the confirmed
> responsive multi-device + tabbed + portfolio requirements. Streamlit remains a
> faster-but-less-showpiece alternative; flag if you want to reconsider.

---

## 7. Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Scaffold: repo, stack, tabbed shell, serverless proxy, one live API round-trip | Done |
| 1 | **Writing tab** — prompt gen + dual-axis grading + history/trends → **deploy (v1)** | Done |
| 2 | Error-log spine hardened; taxonomy trends powering targeting; **Word Bank** added | Done |
| 3 | **Lessons tab** — on-demand threaded e-lecture, pinned to DELE level at creation | Done |
| 4 | **Workbook tab** — exercises targeting weak categories; Anki `.colpkg` read-path ingestion (FSRS signal, no write-back); token metering | Done |
| 5 | **Flashcards tab** — TSV export matching real Anki note-type schema (`docs/ANKI_SCHEMA.md`); dedup against `known_cards` before generation | Done |
| 6 | Multi-tenancy / monetization | **Parked on purpose** |
| 7 | Targeted prompt elicitation — seed prompts from the error log's weak categories | Deferred — see `docs/ROADMAP.md` |
| **8** | **Revisión — the revision cycle** | **Current — see §9** |
| 9 | Focused feedback budget — deep explanation on target categories, terse elsewhere | Deferred — see `docs/ROADMAP.md` |
| **10** | **Lectura — the input tab** | **Fast-tracked, builds after Phase 8 ships — see §10** |

Detailed specs for Phases 3–5 live in the shipped code and `README.md`'s
progress log, not retroactively written here. §8 (Phase 2) is the last
fully-specced legacy phase in this document; §9 and §10 (Phases 8 and 10) are
the current build-ready specs.

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

**This rule is standing, not Phase-2-specific.** It applies to every migration
in every phase, including §9 and §10 below.

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

---

## 9. Phase 8 Detailed Spec: Revisión (the revision cycle)

**Status: current target.** Sequencing: build and ship this before starting
§10 (Lectura). They share no code and no schema, but this phase modifies the
existing grading path — the highest-risk surface in the app — and should not
be in flight at the same time as a new tab.

### 9.1 Rationale

Feedback is currently terminal: the grader returns corrections, they get read,
the entry closes. The written-corrective-feedback literature converges on the
finding that uptake happens during **re-production** — regenerating the
corrected form under retrieval conditions — not during the reading of a
correction. Aula produces high-quality feedback and then never asks for
anything to be done with it.

This phase supersedes the open **entry regrade** item from the README's "What's
next" section. The reason to resubmit an entry stops being "the grading came
back broken" and becomes "I'm fixing it deliberately," which is a feature
rather than a repair.

### 9.2 The flow

1. Entry is written and graded (unchanged — §4 contract).
2. Feedback view gains a **`Revisar`** action.
3. Revision editor opens with:
   - the **original text**, unmodified,
   - inline markers at each error location showing **category only**,
   - **no corrections shown**,
   - a `Ver correcciones` reveal, always available, never default.
4. The revision is written and submitted.
5. A second grading pass runs with the parent entry's observations as input,
   returning both a standard grading of the new text **and** an uptake
   resolution per originally-flagged error.
6. Both versions persist and are viewable side by side.

### 9.3 Indirect feedback — the load-bearing design decision

The revision editor shows *where* and *what category*, never *what the correct
form is*. Showing the corrected text turns revision into transcription, which
generates no retrieval and teaches nothing. Withholding it forces reconstruction
of the form, which is the entire mechanism.

The reveal exists because a genuinely unknown structure cannot be retrieved
from nothing, and staring at it is worse than looking. Its use is recorded
(`revealed_corrections`) so the rate is visible over time — a rising reveal
rate on a category is itself a signal that the category needs a *lesson*, not
a drill.

### 9.4 Schema

```sql
ALTER TABLE entries
  ADD COLUMN parent_entry_id uuid NULL REFERENCES entries(id),
  ADD COLUMN revision_number int NOT NULL DEFAULT 0,
  ADD COLUMN revealed_corrections boolean NOT NULL DEFAULT false;

ALTER TABLE error_observations
  ADD COLUMN is_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN resolves_observation_id uuid NULL REFERENCES error_observations(id);

CREATE TABLE uptake_resolutions (
  id uuid PRIMARY KEY,
  revision_entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES error_observations(id),
  category text NOT NULL,        -- frozen taxonomy, denormalized for query speed
  outcome text NOT NULL,         -- 'fixed' | 'still_wrong' | 'avoided'
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON uptake_resolutions (category, created_at);
```

All additions are nullable or defaulted. Every existing Phase 1–5 entry and
observation remains valid with no backfill required.

### 9.5 The three outcomes — and why `avoided` matters

| Outcome | Meaning |
|---|---|
| `fixed` | The obligatory context is still present and the form is now correct. |
| `still_wrong` | The obligatory context is still present and the form is still wrong. |
| `avoided` | The obligatory context is **gone** — the sentence was rewritten around it. |

`avoided` is the outcome that matters and the one a naive implementation will
miss. If `quiero que vas` is flagged and the revision reads `voy a ir`, a
two-outcome scorer records a fix. Nothing was learned; the structure was
dodged. That is the exact failure mode this app was built to catch,
reappearing one level down.

The grader cannot reliably distinguish deliberate avoidance from ordinary
editing, and should not try. It reports only that the context is gone. A
category with a high `avoided` rate across many revisions is escalation
material regardless of intent.

### 9.6 Uptake grading contract

The revision grading call returns the standard grading contract (§4,
**unchanged**) plus one additional top-level key:

```json
{
  "corrected_text": "…",
  "accuracy": { "observations": [ "…" ], "category_summary": { "…": "…" } },
  "sophistication": { "…": "…" },
  "feedback_prose": "…",
  "dele_level_estimate": "B1",

  "uptake": {
    "resolutions": [
      {
        "observation_id": "uuid-of-parent-observation",
        "category": "subjunctive_trigger",
        "outcome": "avoided",
        "note": "Original 'quiero que vas' was replaced with 'voy a ir' — the subject-change trigger is no longer present."
      }
    ],
    "summary": {
      "flagged": 7,
      "fixed": 4,
      "still_wrong": 2,
      "avoided": 1,
      "new_errors_introduced": 2
    }
  }
}
```

**Implementation rules:**

- `resolutions` must contain exactly one entry per parent observation where
  `obligatory_context = true AND correct = false`. Not more, not fewer.
  Validate this in code before writing rows — a mismatch means the model
  dropped or invented a resolution, and the write must fail loudly rather than
  silently persist a partial set.
- `observation_id` values are supplied to the model in the request. The model
  echoes them back; it never generates them.
- `new_errors_introduced` counts errors in the revision that have no parent
  observation. Overcorrection is real and worth watching — a revision that
  fixes four things and breaks three is not progress.
- Model: **Sonnet**. This is judgment work, not volume.
- The truncation guard added 07-10 applies here too, and matters more: this
  response is longer than a standard grading, and `uptake` generates last.
  Extend the completeness check to require a well-formed `uptake` block with
  the expected resolution count.

### 9.7 Trend isolation — critical

**Revision observations are excluded from accuracy and exposure trends.**

A revision is a second attempt at the same obligatory contexts with the
errors already located. Counting it inflates accuracy and double-counts
exposure, which would corrupt every trend line built since Phase 1 —
silently, and retroactively.

- All History trend queries filter `is_revision = false`.
- Escalation flags (3-repeats rule, §8.3) and the avoidance flag both compute
  on non-revision observations only.
- The DELE-level nudge ("last 5 entries grading consistently higher") counts
  original entries only. A revision is not an entry for nudge purposes.
- Uptake is its own separate series, never blended into accuracy.

**Write the test before the feature.** A fixture that grades an entry,
records the trend state, saves a revision, and asserts the trend state is
byte-identical.

### 9.8 Uptake metrics (new History series)

Per category, over the trailing 14-day window:

- **Uptake rate** = `fixed ÷ (fixed + still_wrong + avoided)`
- **Avoidance-on-revision rate** = `avoided ÷ (fixed + still_wrong + avoided)`

Same noise control as everything else: display only once the denominator
reaches **5 within the window**. Below that, "not enough recent data."

Interpretation to surface in the UI:

- High uptake + low avoidance → the correction is landing, the rule is learnable.
- Low uptake + low avoidance → the rule isn't understood; escalate to a
  Lesson, not a Workbook drill.
- High avoidance → the structure is being dodged; escalate regardless of what
  the accuracy trend says.

### 9.9 Edge cases

- **Revision of a revision.** Allowed. `revision_number` increments;
  `parent_entry_id` points at the immediate parent, not the root. Uptake for
  revision 2 scores against revision 1's observations.
- **Parent grading was truncated.** If the parent entry failed the
  completeness guard, `Revisar` is disabled with an explanation. Do not
  attempt uptake scoring against a partial observation set.
- **Revision is unrelated text.** Every resolution comes back `avoided` and
  `new_errors_introduced` is high. This is correct behavior, not a bug — no
  special handling.
- **Parent entry deleted.** `ON DELETE` on `uptake_resolutions` cascades from
  the revision entry, not the parent. Deleting a parent that has revisions
  should be blocked in the UI.

### 9.10 Definition of done for Phase 8

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

---

## 10. Phase 10 Detailed Spec: Lectura (the input tab)

**Status: fast-tracked.** Do not begin implementation until §9 (Phase 8) has
shipped — see §9's sequencing note.

### 10.1 Rationale

Aula has no input channel. Correcting output is remediation; comprehensible
input at volume is what builds the implicit system being remediated. This is
the largest single gap in the app.

The distinguishing feature is not glossing — every reader app glosses. It is
**input enhancement**: surfacing, inside authentic text, the exact structures
the error log says are currently weak, so reading doubles as targeted
noticing practice on the same categories being tracked everywhere else. That
is the thing only this app can do, because only this app knows the error log.

### 10.2 Scope — v1

**Input: pasted text only.** No URL fetching, no scraping, no paywall
handling. Paste from BBC Mundo, Bloomberg Línea, El País, or whatever Flavia
sends.

**Pipeline:**

1. **Tokenize + frequency-rank** — plain code, no model call.
2. **Coarse known-item filter** — plain code. Tokens above a frequency-rank
   threshold are assumed known and skipped.
3. **Single batched model call** on the remainder, returning `{surface, lemma,
   gloss}` per item, glossed **in context**.
4. **Exact known-item diff** — plain code, on lemma, against the
   `known_cards` ledger and `word_bank`. Only genuinely unknown items render
   as glossed.
5. **Input enhancement** — highlight instances where a currently-flagged
   category appears *correctly used by a native writer*, with a one-line
   noticing prompt on tap. Toggleable, **off by default**.
6. **Comprehension questions** — 4–6, in Spanish, at the stored DELE level.
7. **Capture** — one tap to Word Bank with the real context sentence and the
   real capture date.

### 10.3 The lemmatization decision

Known-item diffing has to work across inflection: the deck holds `superar`,
the article contains `superó`. That needs lemmas.

**Do not add a lemmatizer dependency.** spaCy plus `es_core_news_sm` is a
heavy addition to a Vercel serverless function for one job, and the repo
already hit the Hobby-plan function ceiling on 07-10.

Instead, **have the model return the lemma alongside the gloss** in the same
batched call. The trade-off is real and worth naming: it means glossing a
small number of items that turn out to be known, since the exact diff happens
after the call rather than before. The frequency filter in step 2 keeps that
waste small, and it costs one Haiku call rather than a dependency, a
cold-start penalty, and a deploy-size problem.

### 10.4 Frequency list

Check a Spanish frequency list into the repo — the top 5000 is sufficient.
Two viable sources:

- the `wordfreq` Python package, or
- an OpenSubtitles-derived list such as `hermitdave/FrequencyWords` on GitHub.

**Verify the license before committing it**, since the repo is public and
MIT-licensed. Do not use a list extracted from a commercial frequency
dictionary.

Set the coarse filter threshold at **rank ≤ 2000** initially and tune it
against real articles: too low and the model call gets expensive, too high
and known words slip past the filter into the gloss request. This is a config
constant, not a hardcoded number.

### 10.5 Hard rules

- **Lectura never writes to `error_observations`.** Reading comprehension is
  not a production error. Input is input. If comprehension tracking is
  wanted later it gets its own table.
- **Anything deterministic gets no model call.** Tokenizing, frequency
  ranking, known-item diffing, and threshold filtering are plain code.
- **Model: Haiku**, one batched call for glosses and lemmas, a second for
  comprehension questions. Never per-token calls.
- **Never let a model invent a date.** Reuse the date-threading fix from
  07-11 — Word Bank captures from Lectura carry the real capture date, and
  the `leccion::` tag is omitted rather than guessed.
- **Do not add new serverless functions.** Consolidate Lectura's endpoints
  into an existing route; the Hobby-plan 12-function ceiling is already binding.
- **Portuguese interference applies here more than anywhere.** A gloss for a
  false friend must flag it explicitly — this is the moment of first
  encounter, where the wrong inference gets fossilized.

### 10.6 Schema

```sql
CREATE TABLE input_texts (
  id uuid PRIMARY KEY,
  title text,
  source text,                    -- free text: 'BBC Mundo', 'Flavia', etc.
  body text NOT NULL,
  word_count int,
  unknown_token_count int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE input_lexis (
  id uuid PRIMARY KEY,
  input_text_id uuid NOT NULL REFERENCES input_texts(id) ON DELETE CASCADE,
  surface text NOT NULL,
  lemma text,
  frequency_rank int,
  context_sentence text,
  gloss text,
  false_friend_flag boolean DEFAULT false,
  known_at_encounter boolean,
  captured_to_word_bank boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON input_lexis (lemma);
```

`known_at_encounter` is worth storing rather than recomputing: it captures
what was known *at the time of reading*, which is what makes a retrospective
"vocabulary growth over time" view possible later.

### 10.7 Input enhancement detail

For each category currently carrying an escalation flag, find instances in
the text where that structure appears **correctly**. Highlight them subtly
(an underline, not a block color — this must not wreck readability), and on
tap show a single line: what structure this is and why it takes that form
here.

This is a positive-evidence mechanism, and it's the opposite of what the rest
of the app does. Everywhere else the learner sees their own errors. Here they
see the target form used correctly, in context, by a native writer, on
exactly the structure they're getting wrong. Both are needed.

Off by default. Reading with every subjunctive underlined is not reading.

### 10.8 Definition of done for Phase 10

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
- Total model cost for one article is visible in `usage_log`, and is under
  one cent for a typical news article.
- No new serverless functions were added.

---

## 11. Deferred phases (specced separately, not cancelled)

**Phase 7 — Targeted prompt elicitation** and **Phase 9 — Focused feedback
budget** are fully described in `docs/ROADMAP.md` at summary level. They will
be promoted into this PRD with full detailed specs (matching §9/§10's depth)
when they become the current target. Building Phase 8 and Phase 10 first does
not block or complicate either — Phase 7 seeds the prompt generator from the
same error-log queries §8.3 already computes, and Phase 9 only changes the
grading system prompt's explanation budget, not the contract in §4.

See `docs/ROADMAP.md` for the full backlog (spaced/interleaved Workbook
scheduling, lexical profiling, DELE task-format mode, speaking ingest,
`known_structures` wiring) and for weekly sequencing guidance.
