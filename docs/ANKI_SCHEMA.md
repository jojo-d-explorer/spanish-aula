# ANKI_SCHEMA.md

Reference doc for the Flashcards tab (Phase 5). This is the contract between
Aula and Joey's real Anki collection — decks, note types, tagging, and dedup —
so generated cards look and behave like the ones already in the deck instead
of a generic flat export. Read alongside `PRD.md` and `CLAUDE.md`.

**Why this file exists:** card generation was producing context-free
term/translation/example cards with no relationship to Joey's actual deck
structure — wrong note type, no classification into his real categories, no
dedup against what's already there. This file is the fix: it's the schema
Claude (or Aula's generation prompt) needs in context to produce output that
slots directly into the existing system.

---

## 1. Deck structure

All cards live under one parent deck, `Spanish Frequency`, in 11 subdecks.
Deck choice is **not** the same axis as note type — a deck is a topic/category
grouping; a note type is a card-shape/template choice. Every card gets both.

| # | Subdeck | What goes here |
|---|---|---|
| 01 | Verbs - Irregular | Any verb with stem-change, irregular yo-form, orthographic-only irregularity, or irregular preterite/participle. Reflexive-only or reflexive-dominant verbs (e.g. *divertirse*) still go here if the base verb is irregular. |
| 02 | Verbs - Regular | Fully regular -ar/-er/-ir verbs, including ones with a purely orthographic spelling change (c→qu, g→gu, z→c) that doesn't affect pronunciation or count as a stem change. |
| 03 | Nouns | Any noun, including multi-word fixed nouns (e.g. "obra de arte," "carros alegóricos"). |
| 04 | Connectors | Conjunctions and linking words (e.g. "aunque," "sin embargo," "por lo tanto"). |
| 05 | Positional | Prepositions and spatial/positional vocabulary (e.g. "adelante," "detrás," "encima de"). |
| 06 | Adjectives | Single adjectives and adjective pairs/near-synonyms taught together. |
| 06 | Directions | **Note the duplicate deck number** — this is a real quirk in Joey's live Anki collection, not a typo to silently correct. Directional/orientation vocabulary (e.g. "izquierda," "derecha," "recto"). Don't merge it into deck 05 (Positional) without asking; they may be intentionally distinct (static position vs. movement/direction). |
| 07 | Possessives | Possessive adjectives/pronouns and related vocabulary (mi, tu, su, nuestro, etc. and words built around ownership). |
| 08 | Interaction Phrases | Social/courtesy exchanges — greetings, thanks, well-wishes, small talk formulas ("¿Cómo sigue tu mamá?", "Nada que agradecer"). |
| 09 | Question Words | Interrogatives (qué, cuándo, dónde, cómo, quién, cuál, por qué) and question-formation vocabulary. |
| 10 | Quantities | Numbers, amounts, measurement vocabulary (e.g. "suficientemente," "menos de," "mil setecientos"). |
| 11 | Conversational Phrases | Idiomatic constructions and fixed expressions that function as **vocabulary** — single retrievable chunks of meaning you'd look up like a word (e.g. "Cada vez es peor," "¿Quién sabe?," "Que asco," "De la vieja escuela"). Does **not** include grammar-pattern cards — see §5, out of scope entirely per Joey's standing instruction. Test: would you drill this as one chunk of meaning, or is it teaching a pattern that generalizes to other sentences? First → deck 11. Second → not a flashcard at all.

**Confirmed against Joey's real Anki Desktop deck list (screenshot,
2026-07-10).** Note on reading that screenshot: the blue/red/green numbers
are Anki's new/learning/review **due-today** counts, not total cards per
deck — a deck showing all zeros means everything in it is well-mastered and
not currently due, not that the deck is empty. Don't assume 07/09/10 have
little content just because they weren't due the day of the screenshot.

---

## 2. Note types

Two note types, fixed field order, matching the existing Anki collection.
**Field order is load-bearing** — a TSV import maps by column position, not
by header name, so getting the order wrong silently corrupts cards on import.

### 2.1 `Spanish Verb` (13 fields)

| # | Field | Content |
|---|---|---|
| 1 | Word | Infinitive |
| 2 | ExampleSentence | One natural sentence using the verb, ideally sourced from the actual lesson/context that introduced it |
| 3 | Definitions | English definition(s). Include participle irregularity here if relevant (e.g. "— participio: resuelto") until a dedicated participle field exists (see §6) |
| 4 | ConjPresenteFormula | Short label describing the presente pattern (e.g. "e→ie (excepto nosotros)", "Regular -ar") |
| 5 | ConjPresente | Six-person conjugation, `<br>`-joined, format `Yo: X<br>Tú: X<br>Él/Ella: X<br>Nosotros: X<br>Ustedes: X<br>Ellos: X` |
| 6 | ConjPreteritoFormula | Same pattern-label convention as field 4, for preterite |
| 7 | ConjPreterito | Six-person preterite, same `<br>` format |
| 8 | ConjFuturoFormula | Same pattern-label convention, for simple future |
| 9 | ConjFuturo | Six-person future, same `<br>` format |
| 10 | ConjIrA | Six-person *ir a* + infinitive periphrastic future, same `<br>` format. Use "No aplica..." text instead of a conjugation for verbs that don't take this construction (e.g. impersonal verbs like *llover*) |
| 11 | Collocations | Common fixed phrases / set expressions using the verb, semicolon-separated |
| 12 | ReflexiveNote | Reflexive form + meaning if it exists and differs from the base verb (e.g. *acordarse* vs *acordar*); otherwise literally the string "(no se usa en forma reflexiva)" |
| 13 | Tags | Space-separated tags (see §4) |

### 2.2 `Spanish General Word` (4 fields)

Used for every non-verb: nouns, adjectives, phrases.

| # | Field | Content |
|---|---|---|
| 1 | Word | The term or phrase, as encountered |
| 2 | ExampleSentence | One natural sentence, ideally from the actual lesson context |
| 3 | Definitions | English definition(s); include a usage/register note inline if relevant (e.g. regional variant, false-cognate warning) |
| 4 | Tags | Space-separated tags (see §4) |

### 2.3 Classification rule (note type selection)

**If it has a conjugation table → `Spanish Verb`. Everything else →
`Spanish General Word`.** This is the only test that matters — don't infer
note type from deck number or from whether the word "feels" verb-like.

---

## 3. Import file format

Each deck gets its own file. Five fixed header lines, then one row per card,
tab-separated:

```
#separator:tab
#html:true
#notetype:Spanish Verb
#deck:Spanish Frequency::01 Verbs-Irregular
#tags column:13
```

(`#tags column:4` for `Spanish General Word` files.) Field count per row must
match the note type exactly (13 or 4) — validate this before ever presenting
a file, the same way every batch in this project has been checked. A single
malformed row is worse than a missing card, because it can silently fail or
misalign the whole import.

---

## 4. Tagging conventions

- `leccion::YYYY-MM-DD` — every card gets exactly one, dated to the lesson
  or source it came from.
- `prioridad` — Flavia starred it (`*` in her chat), or it's independently
  high-value for Joey's career/relocation context.
- `vc` — finance/VC/operator-register vocabulary.
- `stem-change::[pattern]` — only on cards from a systematic stem-change
  batch (e.g. `stem-change::e-ie-ar`), not on organically-taught verbs.
- `reflexive-pair` — card consolidates a base verb + its reflexive form
  rather than creating two cards.
- `par-confuso` — flagged as a near-homophone/near-homograph pair worth
  distinguishing (e.g. *sonar/soñar*, *sentar/sentir*).
- `nota-clasificacion` — used once, for a verb whose master-list category
  was wrong (irregular filed as regular). Not a long-term tag; resolve at
  master-list cleanup and drop it.
- `fuente::worksheet-practica` — sourced from a written worksheet rather
  than a live lesson transcript.

Grammar/construction tags (`grammar-gap`, `subjuntivo`, `grammar-rule`) are
**deprecated** per Joey's standing instruction (see §5) — don't apply them to
new cards going forward, even though earlier batches in this project used
them before that instruction was given.

---

## 5. Out of scope: grammar cards

**Flashcards are a vocabulary builder, full stop.** Do not generate cards for
tense contrasts, subjunctive triggers, construction patterns (dar miedo vs.
tener miedo, muy vs. mucho, tener calor vs. hacer calor), or any other
grammar-pattern teaching point — even if it's clearly useful and even if it
showed up starred in a lesson. Grammar belongs to the tense-expansion work on
the note type itself (§6) and/or a future Lessons-tab treatment, not to
individual flashcards. If something is genuinely a *word* (e.g. "todavía,"
"ya," "que asco") it's in scope; if it's a *pattern* (e.g. "hay vs. había vs.
hubo"), it's not.

---

## 6. Known gaps (not blocking Phase 5, but relevant context)

- The `Spanish Verb` note type has no field for copretérito, pretérito
  perfecto, or subjunctive — only presente/pretérito/futuro/ir-a. These
  tenses keep appearing in real lessons. Open decision, not yet made: add a
  single flexible `OtrasFormas` free-text field rather than one rigid field
  per tense. Do not build this as part of Phase 5 unless Joey explicitly
  asks — flagging it here so Claude Code has context if it comes up.
- Master word list (Google Drive doc, dedup source of truth today) has a
  handful of known misclassifications: `mantener`, `construir`, `pedir` are
  filed as "Regular" but are grammatically irregular. Not yet corrected.
  Aula's dedup ledger (§7) should be seeded from the list *as-is*, including
  these errors, since the goal is matching what's actually in the deck, not
  silently re-deciding classification during a data migration.

---

## 7. Dedup — how Aula should think about it

Today, dedup happens because a human (or Claude, in a chat) cross-references
new terms against the master word list before building any card. Aula has no
equivalent — it can't cheaply keep a live read on the Google Doc, and
shouldn't try to.

**Proposed approach for Phase 5:**

- Seed a `known_cards` table in Supabase once, from a **real Anki export**
  (`.colpkg` or `.apkg`, parsed via the same Python/SQLite approach as the
  Workbook's weak-item ingest — no LLM needed) — not from the Google Doc
  master word list. As of this writing the live deck has **864 cards**; the
  Google Doc has lagged behind actual imports before (it showed ~469 at one
  point while the real deck was already larger), so the deck itself is the
  more reliable dedup source of truth.
- Every card Aula generates and Joey confirms gets appended to this table —
  it becomes the always-current dedup source going forward.
- The Google Doc remains useful as Joey's own working reference (✓ In Deck /
  ADD triage), but is not what Aula should dedup against. Periodically
  reconciling the Doc against `known_cards` is a manual check Joey can do,
  not something Aula needs to manage.
- Dedup check happens **before** generation is shown to Joey, not after —
  a Word Bank term that resolves to something already in `known_cards`
  should be flagged or silently skipped, not generated and then discarded
  post-hoc.

---

## 8. Generation → review → export flow (not generate → done)

Given the review Joey has done on generated cards in the past (catching
misclassified verbs, catching a wrong direct/indirect object pronoun
distinction, etc.), Flashcard generation should **stage**, not commit:

1. Joey selects terms from the Word Bank → taps Generate.
2. Aula checks each term against `known_cards` (§7); already-known terms are
   flagged, not silently generated.
3. For new terms, Aula generates a full card per the note-type schema (§2),
   using this file as system context — Sonnet, not Haiku, for this call
   specifically (quality/consistency matters more than volume here, same
   logic as grading/lessons routing in `CLAUDE.md`).
4. Staged cards are shown to Joey for review — edit or reject per card —
   before anything is finalized.
5. On confirm, cards are (a) added to `known_cards`, and (b) included in the
   next export.
6. **Export**, not push: a TSV file per affected deck, matching §3 exactly.
   There is no mechanism to write directly into Anki or onto Joey's phone —
   import stays a manual step: Anki Desktop → File → Import → AnkiWeb sync
   carries it to mobile from there. This is a deliberate, permanent part of
   the design, not a gap to be closed later.
