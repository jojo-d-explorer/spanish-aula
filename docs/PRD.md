# PRD — Spanish Acquisition App ("working title: *Aula*")

A single-user (for now), research-backed Spanish practice web app that also
serves as a full-stack portfolio piece. Four interconnected tools around one
spine: a persistent, categorized error log that turns four tabs into one system.

---

## 1. Vision (the whole thing)

Four tabs, deployed as one responsive web app usable on phone, iPad, and desktop:

1. **Writing** — prompt generator (or free journaling) + dual-axis graded
   feedback.
2. **Workbook** — research-backed exercise generator (contextual cloze,
   conjugation recall, sentence production, isolated gap-fill), targeting
   *your* weak categories.
3. **Flashcards** — generate Anki-import cards in your exact note-type schema
   (with dedup against the master list); ingest an Anki export to detect weak
   items.
4. **Lessons** — on-demand, conversational e-lectures on a tense/topic; can
   seed from the error log.

**The spine.** Every tab reads from and writes to a persistent, categorized
**error log**. Writing and workbook mistakes are tagged by category; the log
drives lesson/workbook targeting and flashcard minting; a category crossing an
error threshold escalates to a targeted micro-lesson. Progress = that error
rate falling.

A second, sibling capture mechanism — the **Word Bank** — lets any word or
phrase be captured from anywhere in the app, independent of the error log, as
raw material for the Flashcard tab.

A third, lightweight signal — **known structures** (§2, §12) — constrains
what grammar generated content is allowed to use incidentally, so exercises
and prompts never spring an untaught structure on the learner.

---

## 2. Non-negotiable design principles

- **Research-backed, not busywork.** Every exercise type maps to a named
  principle (retrieval practice, generation effect, interleaving, cloze
  deletion, elaborative interrogation), surfaced in the README.
- **DELE-pegged.** Difficulty and rubrics calibrated to DELE descriptors.
  Level is a **parameter** (A2 → B1 → B2), not hardcoded.
- **Dialect-parameterized.** `dialect` is a single parameter injected into
  every prompt. Default = **Mexican**; note Rioplatense divergences where
  relevant.
- **Dual-axis feedback.** Accuracy and sophistication scored **independently**,
  so reaching for hard structures is rewarded even when imperfect. Warm about
  *content*, rigorous about *form*.
- **Avoidance-proof progress metric.** Accuracy = **correct ÷ obligatory
  contexts** per category, never raw error counts.
- **Raw data is the only source of truth.** No tab writes retroactive edits to
  `error_observations` to make a metric look better; the escalation flag clears
  only through the trailing window, never a manual reset.
- **Lean over clever.** Prefer extending an existing mechanism over building new
  infrastructure. The app should scale with the learner's rising level without
  accumulating complexity.
- **Explicit vs. implicit knowledge get different language treatment, going
  forward from Phase 4.** Input, examples, and prompts stay in Spanish;
  declarative "why" explanations and contrastive notes are delivered in
  English at lower levels, shifting toward Spanish as level rises. Applies to
  new Workbook rationale text; shipped Lessons is not being retrofitted.
- **Metered from the proxy, single-user today, multi-tenant-ready.** Every model
  call already flows through the serverless proxy; that proxy logs tokens-in /
  tokens-out per call from day one (§6.1). This costs nothing while single-user
  but is the load-bearing foundation for any future pricing, usage caps, or
  "know your own cost" feature (§11). Auth/billing/tiers are **not** built yet.
- **DELE level is a coarse proxy, not a syllabus.** `dele_level` alone does
  not guarantee a structure is one *this* learner has actually been taught. All
  generated content must additionally respect `known_structures` (§12) — see
  the three-tier rule there for exactly how strict this is per content type.

---

## 3. Writing tab (shipped)

Prompt-generated **or** free-journal entries go through one grading contract
(§4) and feed the same error log. See CLAUDE.md for the full shipped flow.
Prompt generation respects `known_structures` (§12) **strictly, with no
exception** — unlike Workbook's cloze narratives (§12.3), a Writing prompt has
no narrative-necessity carve-out.

---

## 4. The grading contract (grader → app JSON)

The grader **must** emit per-category obligatory-context accounting from entry
#1 — the one thing that can't be retrofitted without breaking trend
comparability. Applies identically to prompted and free-journal entries, and
(for accuracy tagging) to Workbook sentence-production answers.

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
      "syntactic_complexity": 3, "verbal_range": 4,
      "lexical_sophistication": 5, "cohesion": 4, "ambition": 6
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

**Note:** the error taxonomy (what gets tagged when a mistake happens) and
`known_structures` (what's fair game to use at all, §12) are related but
distinct axes — a taxonomy category can exist without the structure being in
`known_structures` yet (e.g. `subjunctive_trigger` is a taxonomy category the
learner has occasionally attempted, but subjunctive is not currently in
`known_structures` — see §12.1).

---

## 5. Progress metrics (the History view)

Per category, two trend lines over a **trailing 14-day window**: accuracy
(correct ÷ obligatory contexts) and exposure (obligatory contexts). Rising
exposure + rising accuracy = progress; rising accuracy + falling exposure =
avoidance (flagged). A trend shows only at ≥5 in-window obligatory contexts.
Escalation and avoidance flags per §8.3. **Workbook observations feed these
same trends** (§10.4) — so practice on a flagged category is what eventually
clears its flag.

---

## 6. Stack, hosting, cost

- **Frontend:** React + Vite, responsive.
- **Backend:** Vercel serverless functions **proxying the Anthropic API** so the
  key never reaches the browser.
- **Persistence:** Supabase (Postgres). Single-user; no login UI yet.
- **Runtime model routing:** Sonnet for grading + lessons; Haiku for
  workbook/flashcard generation; Anki parsing is plain Python (no LLM).
  Fable/Opus not used at runtime. **This routing is also the margin story for
  any future paid product (§11) — most calls are Haiku-cheap.**
- **Cost controls:** hard monthly spend cap in the Anthropic console; prompt
  caching on the stable system+rubric prefix; capped output tokens.

### 6.1 Token metering (added now, for a multi-tenant future)

The serverless proxy logs, per model call: timestamp, tab/feature, model used,
`input_tokens`, `output_tokens` (both returned by the API on every response),
and a `user_id` (a constant placeholder while single-user). Stored in a simple
`usage_log` table. **Purpose:** with zero present cost, this establishes the
real per-day/per-feature cost baseline needed to later price the product, show
users their own usage, and enforce tier caps (§11). Build it into the proxy
now; retrofitting metering after the fact means losing all the historical
baseline data.

```sql
usage_log (
  id, user_id text, tab text, model text,
  input_tokens int, output_tokens int,
  created_at
)
```

---

## 7. Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Scaffold: repo, stack, tabbed shell, serverless proxy, one live round-trip | Done |
| 1 | **Writing tab** — prompt gen + free journaling + dual-axis grading + trends | Done |
| 2 | Error-log spine hardened; taxonomy trends; **Word Bank** | Done |
| 3 | **Lessons tab** — conversational, mixed-language, seedable from error log | Done |
| 4 | **Workbook tab** — exercises targeting weak categories; **Anki ingest (read path)**; proxy token metering | Done |
| 5 | Flashcards tab — card generation + dedup + TSV export (§14); entry regrade for incomplete gradings (§13, deferred within this phase) | **Current build** |
| 6 | Multi-tenancy & monetization — auth, per-user metering surfaced, tiers/caps, onboarding | Parked — see §11 |

---

## 8. Phase 2 Spec (shipped): Error-Log Trends + Word Bank

### 8.1 Taxonomy — frozen
The 25-category enum in §4 is the literal, frozen source of truth. Defined once
in a shared module, imported by every tab.

### 8.2 Schema
```sql
error_observations (
  id, entry_id (FK), category (enum, frozen taxonomy),
  obligatory_context boolean, correct boolean,
  excerpt, correction, note, portuguese_interference boolean,
  source_tab text,          -- 'writing' | 'workbook' (added Phase 4, §10.4)
  created_at
)
word_bank (
  id, term text, context_sentence text nullable, note text nullable,
  source_tab text, dedup_status text default 'pending', created_at
)
```
No rollup/cache table. Trends computed at read time from raw observations.

### 8.3 Trend logic (read time)
- Window: trailing 14 days.
- Min data: trend shows only at ≥5 in-window obligatory contexts.
- Escalation (red): ≥3 in-window `obligatory_context AND NOT correct`. Clears
  only via trailing-window aging-out.
- Avoidance (yellow): current-window exposure < half of prior window's, while
  accuracy is flat or higher.

### 8.4 Word Bank
Single app-wide "+ Word" affordance; 3-field form (term, context_sentence,
note); unstructured at capture; dedup deferred to export/batch time.

### 8.5 Migration safety (every phase)
Back up Supabase data; versioned migration file (never a dashboard edit); test
against a copy of real production data.

---

## 9. Phase 3 Spec (shipped): Lessons Tab

Conversational threads (`lesson_log` + `lesson_messages`), model-decided
opening depth, recognition-only comprehension checks, `dele_level_at_creation`
stamped per thread (growth record; no staleness machinery). Lessons never
writes to `error_observations`. Shipped Spanish-first, with no mixed-language
weighting — that rule (§2) applies going forward, starting with Workbook, and
is not a retrofit item for Lessons. Full detail retained in repo history /
CLAUDE.md. **Fully exempt from `known_structures`** — any topic can be
requested regardless of what's "known" (§12.4).

---

## 10. Phase 4 Spec (shipped): Workbook Tab + Anki Ingest (read path)

### 10.1 Purpose

Turn the error log from a *diagnostic* into a *treatment*. Workbook generates
research-backed production exercises targeting the learner's weak categories,
and — crucially — its results feed back into the same error log, so practicing
a flagged category is the mechanism that eventually clears its escalation flag.

### 10.2 Exercise types (matching dropped)

Grounded in the learner's real teacher worksheets. Four types, each mapped to
a research principle; **matching is intentionally excluded** (weakest evidence;
recognition work belongs to Flashcards).

1. **Contextual cloze (connected narrative)** — centerpiece type. **The
   only exercise type eligible for the narrative-necessity exception (§12.3).**
2. **Conjugation recall (isolated cued sentences).** One sentence, target verb
   + person specified (e.g. "Nosotros ___ a Managua. (VOLAR)"). Maps to
   targeted retrieval practice. Good for a narrow weak-verb drill.
3. **Sentence production (open personal-response).** Free-form short answers to
   questions that elicit the target structure (e.g. "¿Prefieres té o café?").
   Maps to the generation effect — highest value, produces the richest error-log
   observations since it's real output.
4. **Gap-fill (isolated, non-narrative).** Single decontextualized cued blanks,
   for quick high-volume drilling of one form.

Any additional exercise type must be justified by a named research principle in
the PRD before being added (per §2).

### 10.3 Session sourcing (both, like Lessons' macro/micro)

A Workbook session gets its target category/topic from either:
- **Auto** — pulled from a currently escalated/weak category (the error log
  suggests what to drill), or
- **Freeform request** — the learner types "let's do some conjugation practice"
  or picks a structure themselves.

Plus the **connective-tissue links**: Lessons' existing "Want to practice this
further?" stub and Writing's feedback screen both deep-link into a pre-seeded
Workbook session on the relevant category (same mechanism reused, no new
infra). Writing's link is added this phase.

### 10.4 Grading + error-log write-back

- **Objective types (cloze, conjugation recall, gap-fill):** grade
  **auto-match first** (exact/normalized string match — instant, no API cost);
  fall back to an LLM check **only for near-misses** (accent-only differences,
  defensible alternates) to avoid false negatives. Objective items are scored
  boolean correct/incorrect; **no sophistication scoring** (that's Writing's
  job).
- **Sentence production:** LLM-graded for accuracy (free-form output);
  receives accuracy observations, and may optionally receive lightweight
  sophistication scoring since it resembles free writing.
- **All exercise attempts write real `error_observations`** with
  `source_tab = 'workbook'`, into the **same table** as Writing, contributing
  to the same 14-day trend/escalation/avoidance math (§5, §8.3). These are
  genuine observations, not synthetic/practice-only rows. This requires adding
  a `source_tab` column to `error_observations` (migration per §8.5).

### 10.5 Anki ingest — read path only (this phase)

- **Flow (desktop as hub):** learner syncs AnkiMobile → AnkiWeb → desktop;
  exports the full collection as `.colpkg` from **desktop**; uploads that file
  to the app. A **plain-Python parser** (no LLM) opens the `.colpkg`
  (SQLite-based) and extracts weak items by **FSRS signals** — low stability,
  high lapse count, retention below the learner's 90% target.
- **Output:** a list of weak cards/verbs that Workbook can use as an additional
  targeting source alongside the error log.
- **Read path only.** Card *generation*, TSV/`.apkg` export, and dedup against
  the master word list are **Phase 5 (Flashcards)** — explicitly out of scope
  here to keep Phase 4 focused. (Feasibility confirmed: AnkiMobile/desktop
  `.colpkg` includes cards + statistics; FSRS runs natively on both.)

### 10.6 What Workbook must NOT do (this phase)

- Must not build the Anki **write-back** path (Phase 5).
- Must not build matching exercises.
- Must not duplicate the History view's badges to browse weak categories.
- Must not introduce auth, billing, or tiers (§11 is parked).

### 10.7 Definition of done for Phase 4

- All four exercise types generate correctly, calibrated to `dialect` +
  `dele_level`, in the learner's worksheet-style format.
- Session sourcing works both ways (auto from a flagged category; freeform
  request). Writing's feedback screen deep-links into a seeded Workbook session.
- Objective grading is auto-match-first with LLM near-miss fallback; sentence
  production is LLM-graded.
- Workbook attempts write `error_observations` with `source_tab='workbook'`;
  a synthetic drill on a flagged category is shown to add to that category's
  in-window counts (and, with enough correct answers over time, is the path by
  which its escalation flag ages out).
- `.colpkg` upload → Python parser returns a weak-item list by FSRS
  stability/lapses; this list is usable as a Workbook targeting source.
- Proxy token metering (§6.1) is live: every model call logs input/output
  tokens to `usage_log`.
- `source_tab` column migration on `error_observations` follows §8.5; all prior
  Writing/Lessons data intact.
- **`known_structures` three-tier rule (§12) verified**: (a) a synthetic
  conjugation-recall/gap-fill/sentence-production request confirms no structure
  outside the list appears at all, except the deliberate target; (b) a
  synthetic contextual-cloze request confirms an untaught-but-essential
  structure, if used, is explicitly flagged inline, not silent; (c) a synthetic
  Writing prompt confirms strict avoidance with **no** narrative exception.

---

## 11. Phase 6 (parked): Multi-tenancy & Monetization

**Not built now. Captured so the product future is not accidentally designed
out.** The single thing built early to enable all of this is proxy token
metering (§6.1) — everything below is deferred.

### 11.1 The core sustainability problem
The app currently runs on the owner's Anthropic key (Vercel env var). That is
correct for single-user but unsustainable the moment a stranger uses it: a
"super user" spends the owner's money with no ceiling. Three resolutions, each
a known AI-wrapper pattern:
1. **BYO-key** — each user supplies their own Anthropic key; they pay Anthropic
   directly. Trivial to build, zero per-user cost to the owner, good
   developer/portfolio story — but brutal consumer onboarding (few language
   learners will create an Anthropic account). Caps the audience to technical
   users.
2. **Owner-pays + subscription** — owner eats API cost, covers it with a monthly
   fee. Real consumer model, but now a margin business: needs usage caps +
   tiers so a heavy user can't cost more than they pay.
3. **Hybrid** — free tier BYO-key, paid tier owner-handled. Two auth paths.

### 11.2 Why the existing architecture already supports this
- **Model routing (§6) is the margin story.** High-volume tabs already run on
  Haiku (pennies); only low-volume grading/lessons use Sonnet. A frontier-only
  app couldn't survive a ~$10–20/mo price; this one can.
- **Metering (§6.1) is the control surface.** Per-call token logging enables:
  a running "usage this month" number per user, hard per-tier caps that degrade
  gracefully ("limit reached, resets on the 1st, or upgrade"), and a real
  cost-per-active-day figure to price against.

### 11.3 Pricing follows measured cost — not a guess
Run the app personally for a month with metering on to get a real
cost-per-active-day. Typical SaaS covers COGS ~5–10×; if a heavy user costs
~$2–4/mo in tokens, a ~$12–20/mo price has healthy margin. Set price *after*
data exists, not before.

### 11.4 Onboarding / "how do I explain this"
The four-tab error-log-spine concept is elegant but not self-evident to a
stranger. A guided first-run and a one-screen "here's the loop" explainer are a
genuine product-design + copywriting effort — deferred until the tabs all
exist. Worth a dedicated session, not a footnote.

### 11.5 Portfolio value regardless
Even if never sold: "architected for multi-tenancy with per-user cost metering,
here's the pricing model I'd use" is exactly the systems-thinking a
Chief-of-Staff/operator role wants to see. This thinking pays off either way.

---

## 12. Known-structures constraint — cross-tab, three-tier rule

**Problem this solves:** `dele_level` is a coarse proxy for what a *typical*
learner at that level knows — it doesn't track what *this* learner has
actually been taught. A structure can be nominally level-appropriate while
still being new to him, and generated content can spring it on him unannounced.

### 12.1 Current known_structures (seed value, learner-editable)

Present tense — regular (AR/ER/IR) **and** irregular yo-forms (-go verbs)
**and** stem-changing (o→ue, e→ie, e→i) · preterite indefinido · present
perfect (haber + participle) · direct object pronouns · indirect object
pronouns · ser/estar · **ir a + infinitive** (periphrastic near future —
**not** the synthetic future, e.g. `hablaré` counts as untaught) ·
gustar-family verbs · demonstratives.

This is deliberately a **narrower, more conservative baseline** than the
learner's full exposure history (which also includes imperfect, conditional,
emerging subjunctive, stem-changing beyond present tense, impersonal se,
etc.) — those are things he's touched but isn't ready to have sprung on him in
a worksheet without warning.

### 12.2 Schema

```sql
learner_profile (
  id, dialect text default 'mx', dele_level text,
  known_structures text,   -- free text, learner-maintained, unstructured
  updated_at
)
```

**UI:** a simple editable text area in Settings, alongside dialect and level.

### 12.3 The three-tier rule

1. **Within `known_structures`** → free use anywhere, no flagging needed.
2. **The deliberate target** of a Workbook session (including a
   just-escalated or explicitly-requested category) or a Lesson topic →
   exempt. That's the point of practicing or teaching it.
3. **Narratively necessary but untaught** → allowed **only** in Workbook's
   **contextual cloze narrative** type, and **only if explicitly called out
   inline** — never silently blended in. This exception does not apply
   anywhere else: isolated cued sentences, conjugation recall, gap-fill,
   sentence-production questions, and Writing prompts must avoid untaught
   structures entirely, with no narrative-necessity carve-out (§3).
4. **Everything else untaught and non-essential** → avoided; the generator
   rewrites around it.

### 12.4 Lessons are fully exempt

The Lessons tab (§9) ignores `known_structures` entirely. That's how the list
is meant to grow — learn something in a Lesson, then (§12.5) add it once solid.

### 12.5 Growth path (documented now, not built this phase)

Intended mechanism: periodic worksheet upload, with a short learner-typed tag
alongside it ("this covers imperfect + preterite irregulars") appended to
`known_structures`. Deliberately manual/asserted by the learner, not
auto-extracted by an LLM. Not built in Phase 4 — the manual Settings text-area
edit (§12.2) is the complete Phase 4 mechanism.

---

## 13. Entry regrade (Phase 5, not built)

### 13.1 Problem

`persistGradedEntry` (`src/shared/db/entries.ts`) always does a plain
`INSERT` — there's no way to fix an entry whose grading came back incomplete
except resubmitting the same text, which creates a **second** `entries` row
and a **second** batch of `error_observations` rows tied to it. That's not
cosmetic: `fetchHistoryData` reads every `entries` row (sophistication trend)
and every `error_observations` row (category accuracy/exposure trend)
unfiltered, and the 14-day trend window (§5, §8.3) keys off
`error_observations.created_at` directly. A duplicate observation batch
double-counts exposure and skews accuracy for whatever categories the entry
touched — directly against this app's avoidance-proofing design principle
(§2): accuracy is correct ÷ **genuine** attempts.

### 13.2 Current status of the failure mode

As of the `isCompleteGradingContract` guard (added alongside the mobile pass,
same session as this spec), a truncated/incomplete grading now returns a 502
and is **never persisted** — `api/grade.ts` returns before calling
`persistGradedEntry`. So this is not an active failure mode for *new*
entries; it only applies to rows written **before** that guard shipped, when
a blind `as GradingContract` cast let partial data (empty `feedback_prose`)
through silently. Phase 5 should decide whether to backfill-detect those old
rows (a read-time check: `feedback_prose = ''`) or treat this as closed now
that the write path is guarded — don't assume it's still live without
checking.

### 13.3 Design

An explicit "Regrade" action tied to a known `entryId` — not inferred from
text-matching, matching this codebase's preference for explicit signals over
inference (e.g. `source_tab` tagging, §10.4). Server-side: `UPDATE entries`
in place (corrected_text/feedback/sophistication/dele_level_estimate) +
delete-then-reinsert the `error_observations` rows for that `entry_id`, as
one logical operation. Reuse the existing compensating-action pattern already
in `persistGradedEntry` (which rolls back the `entries` insert if the
observations insert fails) rather than inventing a new transaction pattern.

**Trigger condition**: only offered when the stored entry's grading is
flagged incomplete (empty/missing `feedback_prose` — the truncation bug's
exact signature). Not a general "resubmit any past entry" button.

**Explicit non-goal**: general redo/resubmit of a legitimately-graded past
entry. Workbook has a hard rule that observations are forward-only — never
edited or deleted — specifically to prevent gaming the avoidance-proofing
flags (CLAUDE.md Hard rules; §10.4). A general regrade-anything feature would
cross that same line for Writing. Regrade here is scoped strictly to "fix a
technically-broken result," not "re-roll for a better outcome."

**Audit column**: `entries.last_regraded_at timestamptz null`, so a regraded
row is visibly distinguishable from a first-pass grading. Deliberately
minimal — no full history/versioning table (§2's "lean and adaptable").

**Migration safety**: any new column follows §8.5 — versioned migration
file, backup first, same as every prior phase's schema change.

---

## 14. Phase 5 Spec: Flashcards Tab (card generation + dedup + TSV export)

### 14.1 Purpose

Recognition-focused review, complementing Workbook's production-focused
drilling (§10.2: "recognition work belongs to Flashcards"). Generates
Anki-importable cards from two sources — Word Bank captures and Anki weak
items — dedups them against the existing card set, and exports as TSV for
the learner to import into Anki manually. **Anki remains the review surface**
(§10.5's "desktop as hub" framing) — this tab generates and curates, it does
not build a competing in-app spaced-repetition study mode.

### 14.2 Sources

- **Word Bank** (§8.4) — every captured term is eligible. `word_bank` is the
  "master word list" §10.5/§8.4 refer to; its `dedup_status` column
  (currently always `'pending'` since Phase 2) is what this phase activates.
- **Anki weak items** — reuses `api/anki-ingest.py`'s existing FSRS-based
  weak-item output (lapses ≥ 4 OR retrievability < 0.85) as an input source.
  No new weak-item detection logic; this phase only adds it as a second
  generation source alongside Word Bank.

### 14.3 Generation

One Haiku call per batch (model routing, Hard Rules), forced tool call
producing `{ term, translation, example_sentence, category? }` per input
item, calibrated to `dialect` + `dele_level` like every other generation
path. Example-sentence generation follows the same `known_structures`
three-tier rule (§12) as Workbook's generated content, since it's the same
kind of LLM-generated free text the rule already governs.

### 14.4 Dedup

Before persisting a generated candidate, its term is normalized
(`normalizeForMatch`, `src/shared/workbook/matching.ts` — reused, not
reimplemented) and compared against existing `flashcards.term` values. A
match is stored anyway with `dedup_status = 'duplicate'` (visible in the
browse view, so the learner can see what was skipped and why) rather than
silently dropped, and is excluded from export.

### 14.5 Export

TSV only this phase — no `.apkg` binary (would require hand-rolling Anki's
SQLite collection/notetype format, or a new dependency; out of scope for the
"lean and adaptable" principle, §2). Three tab-separated columns
(`term`, `translation`, `example_sentence`), no header row, one line per
`dedup_status = 'pending'` card. Export marks those cards — and their source
`word_bank` row, where traceable — `dedup_status = 'exported'`.

### 14.6 Explicit non-goals this phase

- **No in-app flashcard review/study UI.** Anki is the review surface.
- **Flashcard review never writes to `error_observations`.** That table is
  for genuine graded production attempts (§10.4); a flip-card
  self-assessment isn't a graded obligatory-context attempt and mixing it in
  would pollute the avoidance-proofing trend math the same way an unguarded
  duplicate Writing entry would (§13).
- **Entry regrade (§13) stays deferred** — it needs its own per-entry
  History browse view first (History currently only shows aggregated trend
  cards), which is orthogonal scope to Flashcards.
- **No real `.apkg` write-back to the learner's Anki collection.** The
  Phase 4 read path (`api/anki-ingest.py`) stays read-only; TSV export is a
  separate, one-way, manually-imported artifact.

### 14.7 Schema

```sql
flashcards (
  id, term, translation, example_sentence,
  category text nullable,        -- best-effort LLM tag, ErrorCategory enum — NOT fed into error_observations
  dialect, dele_level_at_creation,
  source text,                   -- 'word_bank' | 'anki_weak_item'
  source_word_bank_id uuid references word_bank(id) nullable,
  source_note text,              -- raw originating term/noteText
  dedup_status text default 'pending',  -- 'pending' | 'duplicate' | 'exported'
  created_at, exported_at nullable
)
```

### 14.8 Definition of done for Phase 5

- Cards generate from both Word Bank entries and Anki weak items, calibrated
  to `dialect` + `dele_level`, via a forced-tool Haiku call.
- A repeated/near-duplicate term generates a second row flagged
  `dedup_status='duplicate'`, not a second `'pending'` row.
- TSV export contains only `'pending'` cards, in the three-column format
  above, and flips exported rows (and their source Word Bank row, where
  traceable) to `'exported'`.
- Flashcards tab follows the Mobile UI conventions (CLAUDE.md) from the
  start — no retrofit.
- Migration (`flashcards` table) follows §8.5; all prior data intact.
