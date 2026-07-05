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

### Error taxonomy (extensive; shared enum across tabs)
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

Per category, two trend lines over a **trailing window**:
- **Accuracy** = correct ÷ obligatory contexts.
- **Exposure** = obligatory contexts (attempt volume).

Rising exposure + rising accuracy = real progress. Rising accuracy + falling
exposure = possible avoidance → **flagged**, not celebrated. Trends stay hidden
until a category has minimum data (noise control). Sophistication overall +
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

| Phase | Deliverable |
|---|---|
| 0 | Scaffold: repo, stack, tabbed shell, serverless proxy, one live API round-trip |
| 1 | **Writing tab** — prompt gen + dual-axis grading + history/trends → **deploy (v1)** |
| 2 | Error-log spine hardened; taxonomy trends powering targeting |
| 3 | Lessons tab — on-demand e-lecture, seedable from error log |
| 4 | Workbook tab — exercises targeting weak categories; **Anki export ingestion** |
| 5 | Flashcards tab — TSV export in your note-type schema; weak-item detection |
