import type { ErrorCategory, GradingContract } from '../grading/types';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

export const EXERCISE_TYPES = [
  'contextual_cloze',
  'conjugation_recall',
  'sentence_production',
  'gap_fill',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const SESSION_SOURCE_KINDS = ['auto', 'freeform'] as const;
export type SessionSourceKind = (typeof SESSION_SOURCE_KINDS)[number];

// Unlike LessonClassification (src/shared/lessons/types.ts), Workbook has no
// macro/micro-null split — every item needs a frozen-taxonomy category
// because grading write-back (PRD §10.4) always tags an error_observations
// row by category. category is therefore required, never null.
export interface WorkbookSessionSource {
  kind: SessionSourceKind;
  category: ErrorCategory;
  reason: string; // 'escalated' | 'avoidance' | 'most-practiced' | 'deep-link' | the learner's own freeform text
}

interface ExerciseItemBase {
  id: string; // randomUUID() assigned server-side at generation time; ephemeral, not a DB id
  type: ExerciseType;
  category: ErrorCategory;
  prompt: string; // instruction line shown above the item
  rationale: string; // mixed-language explanatory note — see workbook/rubric.ts
}

export interface ClozeBlank {
  id: string;
  cue: string;
  answer: string;
}

export interface ContextualClozeItem extends ExerciseItemBase {
  type: 'contextual_cloze';
  passage: string;
  blanks: ClozeBlank[];
}

export interface ConjugationRecallItem extends ExerciseItemBase {
  type: 'conjugation_recall';
  sentence: string;
  verbInfinitive: string;
  person: string;
  answer: string;
}

export interface GapFillItem extends ExerciseItemBase {
  type: 'gap_fill';
  sentence: string;
  cue: string;
  answer: string;
}

export interface SentenceProductionItem extends ExerciseItemBase {
  type: 'sentence_production';
  question: string; // no fixed answer — LLM-graded only
}

export type ExerciseItem = ContextualClozeItem | ConjugationRecallItem | GapFillItem | SentenceProductionItem;

export interface WorkbookSession {
  source: WorkbookSessionSource;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  items: ExerciseItem[];
}

export interface ObjectiveAnswer {
  itemId: string;
  blankId?: string; // present only for contextual_cloze sub-answers
  submitted: string;
}

export interface ObjectiveGradeResult extends ObjectiveAnswer {
  correct: boolean;
  correctAnswer: string;
  matchMethod: 'auto' | 'llm_near_miss';
  note?: string; // present only when matchMethod === 'llm_near_miss'
}

export interface SentenceProductionAnswer {
  itemId: string;
  submitted: string;
}

export interface SentenceProductionGradeResult {
  itemId: string;
  submitted: string;
  grading: GradingContract; // reused verbatim from grading/types.ts — same shape as Writing
}

export interface WorkbookGradeResponse {
  objective: ObjectiveGradeResult[];
  sentenceProduction: SentenceProductionGradeResult[];
  persistError?: string;
}
