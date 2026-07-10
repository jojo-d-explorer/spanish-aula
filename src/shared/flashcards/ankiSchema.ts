// Embedded copy of docs/ANKI_SCHEMA.md's generation-relevant rules — the
// contract between Aula and the owner's real Anki collection. Source of
// truth is docs/ANKI_SCHEMA.md; this file is hand-transcribed from it
// (chosen over a runtime file read to match every other prompt in this
// codebase — see CLAUDE.md Hard Rules). If docs/ANKI_SCHEMA.md changes
// (a deck renamed, a field added), this file needs a matching edit — it
// will NOT pick up changes automatically.

export interface AnkiDeck {
  number: string;
  name: string;
  description: string;
}

// 11 subdecks under the parent deck "Spanish Frequency". Note the real
// duplicate "06" numbering (Adjectives / Directions) — a genuine quirk in
// the live collection, not a typo to silently correct (docs/ANKI_SCHEMA.md
// §1). Deck choice is not the same axis as note type — every card gets both.
export const ANKI_DECKS: AnkiDeck[] = [
  {
    number: '01',
    name: 'Verbs - Irregular',
    description:
      'Any verb with stem-change, irregular yo-form, orthographic-only irregularity, or irregular preterite/participle. Reflexive-only or reflexive-dominant verbs still go here if the base verb is irregular.',
  },
  {
    number: '02',
    name: 'Verbs - Regular',
    description:
      'Fully regular -ar/-er/-ir verbs, including ones with a purely orthographic spelling change (c→qu, g→gu, z→c) that does not affect pronunciation or count as a stem change.',
  },
  {
    number: '03',
    name: 'Nouns',
    description: 'Any noun, including multi-word fixed nouns.',
  },
  {
    number: '04',
    name: 'Connectors',
    description: 'Conjunctions and linking words (e.g. "aunque", "sin embargo", "por lo tanto").',
  },
  {
    number: '05',
    name: 'Positional',
    description: 'Prepositions and spatial/positional vocabulary (e.g. "adelante", "detrás", "encima de").',
  },
  {
    number: '06',
    name: 'Adjectives',
    description: 'Single adjectives and adjective pairs/near-synonyms taught together.',
  },
  {
    number: '06',
    name: 'Directions',
    description:
      'Directional/orientation vocabulary (e.g. "izquierda", "derecha", "recto"). Distinct from deck 05 (Positional, static position) — do not merge without asking.',
  },
  {
    number: '07',
    name: 'Possessives',
    description: 'Possessive adjectives/pronouns and related vocabulary (mi, tu, su, nuestro, etc).',
  },
  {
    number: '08',
    name: 'Interaction Phrases',
    description: 'Social/courtesy exchanges — greetings, thanks, well-wishes, small talk formulas.',
  },
  {
    number: '09',
    name: 'Question Words',
    description: 'Interrogatives (qué, cuándo, dónde, cómo, quién, cuál, por qué) and question-formation vocabulary.',
  },
  {
    number: '10',
    name: 'Quantities',
    description: 'Numbers, amounts, measurement vocabulary.',
  },
  {
    number: '11',
    name: 'Conversational Phrases',
    description:
      'Idiomatic constructions and fixed expressions that function as vocabulary — single retrievable chunks of meaning, not grammar patterns. Test: would you drill this as one chunk of meaning, or is it teaching a pattern that generalizes to other sentences? First → this deck. Second → not a flashcard at all (out_of_scope).',
  },
];

// "01 Verbs - Irregular", "06 Adjectives", "06 Directions", etc. — the
// duplicate "06" number is still a distinct, valid label once paired with
// its name. Used as both the generation tool's deck enum and the export
// path builder ("Spanish Frequency::" + label).
export const DECK_LABELS = ANKI_DECKS.map((d) => `${d.number} ${d.name}`);

// Field order is load-bearing — TSV import maps by column position, not
// header name (docs/ANKI_SCHEMA.md §2, §3). Tags is always the final field
// for both note types but is stored/generated as its own array, not part
// of `fields`.
export const SPANISH_VERB_FIELDS = [
  'Word',
  'ExampleSentence',
  'Definitions',
  'ConjPresenteFormula',
  'ConjPresente',
  'ConjPreteritoFormula',
  'ConjPreterito',
  'ConjFuturoFormula',
  'ConjFuturo',
  'ConjIrA',
  'Collocations',
  'ReflexiveNote',
] as const;

export const GENERAL_WORD_FIELDS = ['Word', 'ExampleSentence', 'Definitions'] as const;

export const NOTE_TYPES = ['Spanish Verb', 'Spanish General Word'] as const;
export type AnkiNoteType = (typeof NOTE_TYPES)[number];

// Six-person conjugation format (docs/ANKI_SCHEMA.md §2.1, fields 5/7/9/10).
export const CONJUGATION_PERSON_FORMAT = 'Yo: X<br>Tú: X<br>Él/Ella: X<br>Nosotros: X<br>Ustedes: X<br>Ellos: X';

// Controlled tagging vocabulary (docs/ANKI_SCHEMA.md §4). Parameterized tags
// use "::" (e.g. leccion::2026-07-10, stem-change::e-ie-ar) — the LLM should
// fill in the bracketed part, not invent new tag names.
export const TAG_VOCABULARY = [
  'leccion::YYYY-MM-DD — every card gets exactly one, dated to the lesson/source it came from',
  'prioridad — starred by the tutor, or independently high-value for career/relocation context',
  'vc — finance/VC/operator-register vocabulary',
  'stem-change::[pattern] — only on cards from a systematic stem-change batch (e.g. stem-change::e-ie-ar), not on organically-taught verbs',
  'reflexive-pair — card consolidates a base verb + its reflexive form rather than creating two cards',
  'par-confuso — flagged as a near-homophone/near-homograph pair worth distinguishing',
  'fuente::worksheet-practica — sourced from a written worksheet rather than a live lesson transcript',
];

export const DEPRECATED_TAGS = ['grammar-gap', 'subjuntivo', 'grammar-rule'];

export function buildAnkiSchemaContext(): string {
  const deckList = ANKI_DECKS.map((d) => `- ${d.number} ${d.name}: ${d.description}`).join('\n');
  const tagList = TAG_VOCABULARY.map((t) => `- ${t}`).join('\n');

  return `## Real Anki deck structure

All cards live under one parent deck, "Spanish Frequency", in these 11 subdecks:
${deckList}

Deck choice is not the same axis as note type — a deck is a topic/category
grouping, note type is a card-shape/template choice. Every card needs both,
chosen independently.

## Note types (exactly two, fixed field order)

**Classification rule — the only test that matters:** if the term has a
conjugation table → "Spanish Verb". Everything else → "Spanish General
Word". Do not infer note type from deck number or from whether the word
"feels" verb-like.

"Spanish Verb" fields, in this exact order: ${SPANISH_VERB_FIELDS.join(', ')}, Tags.
Conjugation fields (ConjPresente, ConjPreterito, ConjFuturo, ConjIrA) use this
exact six-person format: "${CONJUGATION_PERSON_FORMAT}". Use "No aplica..."
text instead of a conjugation for verbs that don't take that construction
(e.g. impersonal verbs like "llover" for ConjIrA). ReflexiveNote: the
reflexive form + meaning if it exists and differs from the base verb,
otherwise the literal string "(no se usa en forma reflexiva)".

"Spanish General Word" fields, in this exact order: ${GENERAL_WORD_FIELDS.join(', ')}, Tags.
Used for every non-verb: nouns, adjectives, phrases.

Field order is load-bearing — output is imported by column position, not
field name.

## Tagging (controlled vocabulary — do not invent new tag names)
${tagList}

Deprecated, never apply to new cards: ${DEPRECATED_TAGS.join(', ')}.

## Scope: vocabulary only, not grammar

Flashcards are a vocabulary builder. Do NOT generate a card for tense
contrasts, subjunctive triggers, or construction patterns (e.g. "dar miedo"
vs "tener miedo", "muy" vs "mucho") — even if clearly useful. If a term is
genuinely a *word or fixed phrase* (e.g. "todavía", "que asco"), it's in
scope. If it's a *pattern* that generalizes to other sentences (e.g. "hay vs
había vs hubo"), it is out of scope — set out_of_scope=true with a one-line
reason instead of generating a card.`;
}
