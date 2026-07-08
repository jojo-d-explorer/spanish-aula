import type { ErrorCategory } from '../grading/types';
import type { DeleLevel } from '../prompts/writingPrompt';

// App-layer validation for lesson_messages.role — no Postgres enum, matching
// how ERROR_CATEGORIES/DELE_LEVELS are handled (grading/types.ts).
export const LESSON_ROLES = ['user', 'assistant'] as const;
export type LessonRole = (typeof LESSON_ROLES)[number];

export interface LessonMessage {
  id: string;
  lessonId: string;
  role: LessonRole;
  content: string;
  createdAt: string;
}

export interface LessonLogEntry {
  id: string;
  topicCategory: ErrorCategory | null;
  topicFreeform: string | null;
  deleLevelAtCreation: DeleLevel;
  createdAt: string;
}

export interface LessonThread extends LessonLogEntry {
  messages: LessonMessage[]; // ordered ascending by createdAt
}

// Output of the classifier tool-use call in api/lessons.ts.
export interface LessonClassification {
  kind: 'macro' | 'micro';
  topicCategory: ErrorCategory | null; // set when kind === 'macro'
  topicFreeform: string | null; // set when kind === 'micro'
}
