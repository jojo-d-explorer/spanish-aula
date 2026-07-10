import type Anthropic from '@anthropic-ai/sdk';
import { ERROR_CATEGORIES } from '../grading/types.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

const DIALECT_NAMES: Record<DialectCode, string> = {
  mx: 'Mexican Spanish',
  rio: 'Rioplatense Spanish',
};

// Deliberately does NOT use buildRestrepoPersonaPreamble (src/shared/persona/
// restrepo.ts) — flashcard generation is a plain lookup/example-sentence
// task, not feedback on the learner's own output, so the Dra. Restrepo
// persona framing (grading tone, false-friend flagging) doesn't apply here.
// known_structures (PRD §12) is NOT applied — confirmed unimplemented
// anywhere in this codebase during Phase 5 planning; see PRD §14.3.
export function buildFlashcardGenerationSystemPrompt(dialect: DialectCode, deleLevel: DeleLevel): string {
  const dialectName = DIALECT_NAMES[dialect];

  return `You generate flashcard content for a Spanish learner preparing for
the DELE exam (currently targeting level ${deleLevel}), whose target variety
is ${dialectName}. You will be given a batch of Spanish terms or phrases,
each tagged with a batch id — these came from the learner's own Word Bank
captures or from Anki cards flagged as weak, so treat every term as
something the learner already encountered and wants reinforced, not new
vocabulary you're introducing.

For each term, produce:
- A concise, accurate English translation or definition (a few words, not a
  full sentence) — the "back" of the card.
- One natural example sentence in ${dialectName}, using the term in a
  realistic, level-appropriate context. This is a recognition aid, not a
  test — keep it simple enough that the sentence itself doesn't need its own
  gloss.
- A best-effort grammar-category tag from the frozen taxonomy below, only if
  the term clearly illustrates one (e.g. an irregular verb, a stem-changer).
  Use "other" if it doesn't map cleanly to any category. This tag is for the
  learner's own browsing/filtering only — it is never treated as a graded
  observation.

## Category taxonomy
${ERROR_CATEGORIES.join(', ')}

## Output
Call the \`generate_flashcards\` tool exactly once. Echo each item's batch id
exactly as given, and produce exactly one card per input item — never merge,
skip, or add items.`;
}

export const FLASHCARD_GENERATION_TOOL: Anthropic.Tool = {
  name: 'generate_flashcards',
  description: 'Generate a translation, example sentence, and category tag for each term in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Echo the batch item id exactly as given.' },
            translation: { type: 'string', description: 'Concise English translation or definition.' },
            example_sentence: { type: 'string', description: 'One natural example sentence using the term.' },
            category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
          },
          required: ['id', 'translation', 'example_sentence', 'category'],
        },
      },
    },
    required: ['cards'],
  },
};
