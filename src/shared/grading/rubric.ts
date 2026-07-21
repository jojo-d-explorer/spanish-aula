import type Anthropic from '@anthropic-ai/sdk';
import { ERROR_CATEGORIES, DELE_LEVELS, SUBSCORE_KEYS, UPTAKE_OUTCOMES } from './types.js';
import { buildRestrepoPersonaPreamble } from '../persona/restrepo.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

const CATEGORY_SUMMARY_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    obligatory_contexts: { type: 'integer' },
    correct: { type: 'integer' },
  },
  required: ['obligatory_contexts', 'correct'],
};

// The grading contract's JSON Schema mirror — shared, not copied, since
// Workbook's sentence-production grading (PRD §10.4) reuses this exact
// schema alongside Writing's grader.
export const GRADING_TOOL: Anthropic.Tool = {
  name: 'submit_grading',
  description: "Submit the complete grading assessment of the learner's Spanish entry.",
  input_schema: {
    type: 'object',
    properties: {
      corrected_text: { type: 'string' },
      accuracy: {
        type: 'object',
        properties: {
          observations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
                obligatory_context: { type: 'boolean' },
                correct: { type: 'boolean' },
                excerpt: { type: 'string' },
                correction: { type: 'string' },
                note: { type: 'string' },
                portuguese_interference: { type: 'boolean' },
              },
              required: [
                'category',
                'obligatory_context',
                'correct',
                'excerpt',
                'correction',
                'note',
                'portuguese_interference',
              ],
            },
          },
          category_summary: {
            type: 'object',
            description: 'Keyed by error category; include only categories that had at least one obligatory context in this entry.',
            additionalProperties: CATEGORY_SUMMARY_ENTRY_SCHEMA,
          },
        },
        required: ['observations', 'category_summary'],
      },
      sophistication: {
        type: 'object',
        properties: {
          overall: { type: 'integer', minimum: 1, maximum: 10 },
          subscores: {
            type: 'object',
            properties: Object.fromEntries(
              SUBSCORE_KEYS.map((key) => [key, { type: 'integer', minimum: 1, maximum: 10 }]),
            ),
            required: SUBSCORE_KEYS as unknown as string[],
          },
          notes: { type: 'string' },
        },
        required: ['overall', 'subscores', 'notes'],
      },
      feedback_prose: { type: 'string' },
      dele_level_estimate: { type: 'string', enum: DELE_LEVELS as unknown as string[] },
    },
    required: ['corrected_text', 'accuracy', 'sophistication', 'feedback_prose', 'dele_level_estimate'],
  },
};

// Phase 8 (PRD §9.6) — the base contract above, plus one additive top-level
// `uptake` key. Used only for revision grading calls; a fresh (non-revision)
// entry always uses GRADING_TOOL unchanged.
export const REVISION_GRADING_TOOL: Anthropic.Tool = {
  name: 'submit_grading',
  description: GRADING_TOOL.description,
  input_schema: {
    type: 'object',
    properties: {
      ...(GRADING_TOOL.input_schema.properties as Record<string, unknown>),
      uptake: {
        type: 'object',
        description:
          'Uptake resolution for every parent observation supplied in the system prompt — exactly one per parent observation, in the same order, echoing its observation_id verbatim.',
        properties: {
          resolutions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                observation_id: { type: 'string', description: 'Echoed verbatim from the supplied parent observation — never invented.' },
                category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
                outcome: { type: 'string', enum: UPTAKE_OUTCOMES as unknown as string[] },
                note: { type: 'string' },
              },
              required: ['observation_id', 'category', 'outcome', 'note'],
            },
          },
          summary: {
            type: 'object',
            properties: {
              flagged: { type: 'integer' },
              fixed: { type: 'integer' },
              still_wrong: { type: 'integer' },
              avoided: { type: 'integer' },
              new_errors_introduced: { type: 'integer' },
            },
            required: ['flagged', 'fixed', 'still_wrong', 'avoided', 'new_errors_introduced'],
          },
        },
        required: ['resolutions', 'summary'],
      },
    },
    required: [...(GRADING_TOOL.input_schema.required as string[]), 'uptake'],
  },
};

// Stable prefix — cached via cache_control in api/grade.ts. Keep dialect/level
// injection isolated to the top (inside buildRestrepoPersonaPreamble) so the
// bulk of the prompt stays byte-identical across requests at the same
// dialect+level.
export function buildGradingSystemPrompt(dialect: DialectCode, deleLevel: DeleLevel): string {
  return `${buildRestrepoPersonaPreamble(dialect, deleLevel)}

Correct every error of form you find. Portuguese-Spanish false friends are a
first-class error category here — tag them \`false_friend_portuguese\`.

## Error taxonomy

Tag every error with exactly one of these categories:
${ERROR_CATEGORIES.join(', ')}

## What you must do with the learner's entry

1. Produce a corrected version of the full text.
2. Walk the text for every **obligatory context** for each grammatical category
   (e.g. every place a subjunctive was required, every place gender agreement
   was required) — not just the places where the learner made an error. Record
   whether the learner got each one right. This obligatory-context accounting
   is required even for categories the learner got entirely correct.
3. Score sophistication (1-10 overall, plus subscores for syntactic_complexity,
   verbal_range, lexical_sophistication, cohesion, and ambition) independently
   of accuracy — reward reaching for harder structures even when imperfect.
4. Write a warm, form-focused debrief in the Dra. Restrepo voice.
5. Estimate the entry's overall DELE level as exactly one of: ${DELE_LEVELS.join(', ')}.
   Put any finer nuance ("solidly A2", "A2 leaning B1") in the debrief prose or
   sophistication notes, not in this field — it must be one of the four labels
   above so progress tracking can compare it consistently over time.

Call the \`submit_grading\` tool exactly once with your complete assessment.`;
}

export interface ParentFlaggedObservation {
  id: string;
  category: string;
  excerpt: string;
  correction: string;
  note: string;
}

// Deliberately NOT part of the cached system block in buildGradingSystemPrompt:
// this list is different on every revision call, so caching it would just be
// a guaranteed cache miss on the one part of the prompt that actually varies.
// Appended as a second, uncached system content block in api/grade.ts.
export function buildUptakeInstructionsBlock(parentFlagged: ParentFlaggedObservation[]): string {
  const list = parentFlagged
    .map((o) => `- observation_id: ${o.id}\n  category: ${o.category}\n  original excerpt: "${o.excerpt}"\n  correction given: "${o.correction}"\n  note: ${o.note}`)
    .join('\n');

  return `## This is a revision — also score uptake

This text is a revision of an earlier entry. Below are the ${parentFlagged.length} error(s)
from that earlier entry that were both obligatory and wrong. Grade this revision
exactly as you would any entry (full obligatory-context accounting, sophistication,
corrected text, debrief, DELE estimate) — that part of your assessment is unaffected
by anything below.

In addition, call \`submit_grading\`'s \`uptake\` field with exactly one resolution per
item listed below, in the same order, echoing its \`observation_id\` **verbatim** —
never invent an id, never skip one, never add an extra one.

${parentFlagged.length === 0 ? '(No flagged observations — the parent entry had none. Submit uptake with an empty resolutions array and a summary of all zeros.)' : list}

For each, decide the outcome:
- **fixed** — the same obligatory context is still present in this revision and the
  form is now correct.
- **still_wrong** — the same obligatory context is still present and the form is
  still wrong (whether or not it improved).
- **avoided** — the obligatory context is gone; the sentence was rewritten around
  it rather than through it. Report this whenever the context genuinely
  disappeared, even if you suspect it was unintentional — do not try to guess
  intent, only whether the context is still there.

Also count \`new_errors_introduced\`: obligatory-context errors in this revision that
do not correspond to any item in the list above (overcorrection / new mistakes).`;
}
