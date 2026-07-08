import { ERROR_CATEGORIES, DELE_LEVELS } from './types.js';
import { buildRestrepoPersonaPreamble } from '../persona/restrepo.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

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
