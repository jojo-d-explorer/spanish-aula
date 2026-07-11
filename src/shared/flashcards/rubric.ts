import type Anthropic from '@anthropic-ai/sdk';
import { buildAnkiSchemaContext, SPANISH_VERB_FIELDS, NOTE_TYPES, DECK_LABELS } from './ankiSchema.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

const DIALECT_NAMES: Record<DialectCode, string> = {
  mx: 'Mexican Spanish',
  rio: 'Rioplatense Spanish',
};

// Deliberately does NOT use buildRestrepoPersonaPreamble (src/shared/persona/
// restrepo.ts) — flashcard generation is a lookup/classification task against
// a fixed deck schema, not feedback on the learner's own output, so the Dra.
// Restrepo persona framing doesn't apply here. known_structures (PRD §12) is
// NOT applied — confirmed unimplemented anywhere in this codebase.
//
// Model routing: Sonnet, not Haiku — a deliberate exception to the workbook/
// flashcard-generation-is-Haiku rule (CLAUDE.md Hard Rules), per
// docs/ANKI_SCHEMA.md §8: getting the note type/deck/fields right matters
// more than generation volume here.
export function buildFlashcardGenerationSystemPrompt(dialect: DialectCode, deleLevel: DeleLevel): string {
  const dialectName = DIALECT_NAMES[dialect];

  return `You generate Anki flashcards for a Spanish learner preparing for
the DELE exam (currently targeting level ${deleLevel}), whose target variety
is ${dialectName}. You will be given a batch of Spanish terms or phrases,
each tagged with a batch id — these came from the learner's own Word Bank
captures or from Anki cards flagged as weak, so treat every term as
something the learner already encountered and wants reinforced, not new
vocabulary you're introducing. Some items include the real date the term
was captured; others don't (Anki weak items have no per-card date).

Every card you produce must slot directly into the learner's real, existing
Anki collection — wrong note type, wrong deck, or a malformed conjugation
table is worse than not generating a card at all.

${buildAnkiSchemaContext()}

## Per-term decision

For each term, first decide: is this in scope (a word or fixed phrase) or
out of scope (a grammar pattern)? If out of scope, set out_of_scope=true,
give a one-line out_of_scope_reason, and leave note_type/deck/every field
empty and tags an empty array — do not also produce a card for it.

If in scope: choose note_type and deck per the rules above, produce an
example sentence in ${dialectName} at a level-appropriate register, an
English definition, and (for Spanish Verb only) the conjugation fields in
the exact format specified. Populate only the fields relevant to the chosen
note_type; leave every other field as an empty string rather than omitting
it. Assign tags from the controlled vocabulary only — omit tags that don't
clearly apply rather than forcing one.

**leccion:: tag — never invent a date.** If the item's batch line includes
a captured date, use that exact date verbatim for the leccion:: tag. If no
date is given, omit the leccion:: tag entirely for that card — a missing
tag is correct; a fabricated date is not.

## Output

Call the \`generate_flashcards\` tool exactly once. Echo each item's batch id
exactly as given, and produce exactly one entry per input item — never
merge, skip, or add items.`;
}

export const FLASHCARD_GENERATION_TOOL: Anthropic.Tool = {
  name: 'generate_flashcards',
  description: 'Generate an Anki-ready flashcard, or an out-of-scope flag, for each term in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Echo the batch item id exactly as given.' },
            out_of_scope: {
              type: 'boolean',
              description: 'True if this term is a grammar pattern, not vocabulary.',
            },
            out_of_scope_reason: {
              type: 'string',
              description: 'One-line reason if out_of_scope is true, else empty string.',
            },
            note_type: {
              type: 'string',
              enum: [...NOTE_TYPES, ''] as unknown as string[],
              description: 'Empty string if out_of_scope.',
            },
            deck: {
              type: 'string',
              enum: [...DECK_LABELS, ''],
              description: 'One of the 11 real subdecks. Empty string if out_of_scope.',
            },
            ...Object.fromEntries(
              SPANISH_VERB_FIELDS.map((field) => [
                field,
                { type: 'string', description: `Field "${field}" — empty string if not applicable to this note_type.` },
              ]),
            ),
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'From the controlled tagging vocabulary only. Empty array if out_of_scope or none apply.',
            },
          },
          required: [
            'id',
            'out_of_scope',
            'out_of_scope_reason',
            'note_type',
            'deck',
            ...SPANISH_VERB_FIELDS,
            'tags',
          ],
        },
      },
    },
    required: ['cards'],
  },
};
