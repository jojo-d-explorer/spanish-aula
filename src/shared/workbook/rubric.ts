import type Anthropic from '@anthropic-ai/sdk';
import { ERROR_CATEGORIES } from '../grading/types.js';
import { buildRestrepoPersonaPreamble } from '../persona/restrepo.js';
import { EXERCISE_TYPES } from './types.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

// Stable prefix — cached via cache_control in api/workbook-session.ts. Keep
// dialect/level injection isolated to the top (inside
// buildRestrepoPersonaPreamble) so the bulk of the prompt stays
// byte-identical across requests at the same dialect+level. Target
// category/item counts go in the user message built by the caller, not here.
export function buildWorkbookGenerationSystemPrompt(dialect: DialectCode, deleLevel: DeleLevel): string {
  return `${buildRestrepoPersonaPreamble(dialect, deleLevel)}

You generate Workbook practice exercises in the learner's real teacher's
worksheet style — research-backed retrieval practice, not busywork. You will
be told a target grammar category and how many items of each type to produce
in the user message.

## Exercise types

- **contextual_cloze** — a coherent multi-sentence passage with blanks, each
  blank's cue verb/word given in parentheses. Context forces meaning-tracking,
  not mechanical conjugation. This is the centerpiece type.
- **conjugation_recall** — one sentence, target verb + person specified
  (e.g. "Nosotros ___ a Managua. (VOLAR)").
- **gap_fill** — a single decontextualized cued blank, for quick high-volume
  drilling of one form.
- **sentence_production** — an open personal-response question that elicits
  the target structure (e.g. "¿Prefieres té o café?"). Has no fixed answer —
  it will be graded separately by a human-review-style grader, not matched.

Never generate a matching-type exercise — it is explicitly out of scope.

## Language rule for the \`rationale\` field only

Every item's \`rationale\` (a short note on why this drills the target
category) is mixed-language, weighted by the learner's level: mostly English
at A2 (core rule stated in English, with English/Portuguese contrastive notes
where relevant), roughly even English/Spanish at B1, mostly Spanish with
occasional English nuance at B2. This applies ONLY to \`rationale\` —
\`prompt\`, \`passage\`, \`sentence\`, \`question\`, and every answer field stay
in Spanish at every level, exactly like Writing and Lessons.

## Output

Call the \`generate_workbook_session\` tool exactly once. Populate every field
relevant to an item's type; leave irrelevant fields as an empty string (or
empty array for \`blanks\`) rather than omitting them.`;
}

// Classifies a freeform Workbook request into exactly one frozen taxonomy
// category — simpler than Lessons' classifier since Workbook has no
// macro/micro split (every item needs a category for write-back). Stateless.
export function buildWorkbookClassifierSystemPrompt(): string {
  return `You classify a Spanish learner's freeform Workbook practice request
into exactly one of these frozen grammar categories, whichever the request
most closely matches:
${ERROR_CATEGORIES.join(', ')}

If the request doesn't obviously name a grammar point, infer the closest
match from context rather than refusing — every Workbook session needs
exactly one target category.

Call the \`classify_workbook_request\` tool exactly once with your decision.`;
}

// Judges near-misses only (accent-only diffs, defensible dialect/lexical
// alternates) — never called for exact matches or clearly-wrong answers,
// which are resolved locally without an API call (src/shared/workbook/matching.ts).
export function buildNearMissJudgeSystemPrompt(dialect: DialectCode): string {
  const dialectName = dialect === 'rio' ? 'Rioplatense Spanish' : 'Mexican Spanish';
  return `You judge a batch of near-miss Spanish answers against their
canonical correct answer. The learner's target variety is ${dialectName}.

Mark an answer correct ONLY if it differs from the canonical answer by:
- an accent/diacritic-only difference (e.g. missing a written accent), or
- a defensible dialect or lexical alternate that a careful native speaker
  would accept as equally correct in context.

Mark it incorrect for any real grammatical or lexical error, even a small
one. Always give a one-line note explaining the verdict.

Call the \`judge_near_misses\` tool exactly once with a verdict for every item
in the batch.`;
}

export const WORKBOOK_GENERATION_TOOL: Anthropic.Tool = {
  name: 'generate_workbook_session',
  description: 'Generate a set of Workbook practice exercise items for the requested category.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: EXERCISE_TYPES as unknown as string[] },
            category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
            prompt: { type: 'string', description: 'Instruction line shown above the item, in Spanish.' },
            rationale: { type: 'string', description: 'Mixed-language note per the language rule above.' },
            passage: { type: 'string', description: "contextual_cloze only; empty string otherwise." },
            blanks: {
              type: 'array',
              description: 'contextual_cloze only; empty array otherwise.',
              items: {
                type: 'object',
                properties: {
                  cue: { type: 'string' },
                  answer: { type: 'string' },
                },
                required: ['cue', 'answer'],
              },
            },
            sentence: { type: 'string', description: 'conjugation_recall / gap_fill only; empty string otherwise.' },
            verb_infinitive: { type: 'string', description: 'conjugation_recall only; empty string otherwise.' },
            person: { type: 'string', description: 'conjugation_recall only (e.g. "nosotros"); empty string otherwise.' },
            cue: { type: 'string', description: 'gap_fill only; empty string otherwise.' },
            answer: { type: 'string', description: 'conjugation_recall / gap_fill only; empty string otherwise.' },
            question: { type: 'string', description: 'sentence_production only; empty string otherwise.' },
          },
          required: [
            'type',
            'category',
            'prompt',
            'rationale',
            'passage',
            'blanks',
            'sentence',
            'verb_infinitive',
            'person',
            'cue',
            'answer',
            'question',
          ],
        },
      },
    },
    required: ['items'],
  },
};

export const WORKBOOK_CLASSIFIER_TOOL: Anthropic.Tool = {
  name: 'classify_workbook_request',
  description: "Classify the learner's freeform Workbook request into exactly one taxonomy category.",
  input_schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
    },
    required: ['category'],
  },
};

export const WORKBOOK_NEAR_MISS_TOOL: Anthropic.Tool = {
  name: 'judge_near_misses',
  description: 'Judge a batch of near-miss objective answers as correct or incorrect.',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Echo the batch item id exactly as given.' },
            correct: { type: 'boolean' },
            note: { type: 'string' },
          },
          required: ['id', 'correct', 'note'],
        },
      },
    },
    required: ['verdicts'],
  },
};
