import type { ErrorCategory } from '../grading/types';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

export const FLASHCARD_SOURCES = ['word_bank', 'anki_weak_item'] as const;
export type FlashcardSource = (typeof FLASHCARD_SOURCES)[number];

export const FLASHCARD_DEDUP_STATUSES = ['pending', 'duplicate', 'exported'] as const;
export type FlashcardDedupStatus = (typeof FLASHCARD_DEDUP_STATUSES)[number];

// Frontend-safe — imported by both FlashcardsTab.tsx and the api/flashcards*
// handlers. Never import src/shared/db/* from here (excluded from the
// browser bundle, tsconfig.app.json) — db/flashcards.ts imports FROM this
// file instead, not the other way around.
export interface FlashcardRecord {
  id: string;
  term: string;
  translation: string;
  exampleSentence: string;
  category: ErrorCategory | null;
  dialect: DialectCode;
  deleLevelAtCreation: DeleLevel;
  source: FlashcardSource;
  sourceWordBankId: string | null;
  sourceNote: string | null;
  dedupStatus: FlashcardDedupStatus;
  createdAt: string;
  exportedAt: string | null;
}

// One generation input item — either a Word Bank entry or an Anki weak item,
// normalized to the same shape before being sent to the generator.
export interface FlashcardSourceItem {
  sourceNote: string; // the term (Word Bank) or noteText (Anki)
  sourceWordBankId: string | null; // set only when source === 'word_bank'
}

export interface FlashcardGenerateRequest {
  source: FlashcardSource;
  items: FlashcardSourceItem[];
  dialect: DialectCode;
  deleLevel: DeleLevel;
}

export interface FlashcardGenerateResponse {
  flashcards: FlashcardRecord[];
}

export interface FlashcardListResponse {
  flashcards: FlashcardRecord[];
}
