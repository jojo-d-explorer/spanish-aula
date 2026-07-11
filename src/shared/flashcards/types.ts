import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';
import type { AnkiNoteType } from './ankiSchema';

export const FLASHCARD_SOURCES = ['word_bank', 'anki_weak_item'] as const;
export type FlashcardSource = (typeof FLASHCARD_SOURCES)[number];

export const FLASHCARD_STATUSES = ['draft', 'confirmed', 'rejected'] as const;
export type FlashcardStatus = (typeof FLASHCARD_STATUSES)[number];

export const KNOWN_CARD_SOURCES = ['seed_import', 'generated'] as const;
export type KnownCardSource = (typeof KNOWN_CARD_SOURCES)[number];

// Frontend-safe — imported by both the Flashcards feature components and the
// api/flashcards handler. Never import src/shared/db/* from here (excluded
// from the browser bundle, tsconfig.app.json) — db/flashcards.ts imports
// FROM this file instead, not the other way around.
export interface FlashcardRecord {
  id: string;
  status: FlashcardStatus;
  noteType: AnkiNoteType | null; // null only when outOfScope
  deck: string | null; // null only when outOfScope
  term: string;
  fields: Record<string, string> | null; // null only when outOfScope
  tags: string[];
  outOfScope: boolean;
  outOfScopeReason: string | null;
  dialect: DialectCode;
  deleLevelAtCreation: DeleLevel;
  source: FlashcardSource;
  sourceWordBankId: string | null;
  sourceNote: string;
  createdAt: string;
  confirmedAt: string | null;
  exportedAt: string | null;
}

export interface KnownCardRecord {
  id: string;
  term: string;
  deck: string | null;
  noteType: AnkiNoteType | null;
  source: KnownCardSource;
  flashcardId: string | null;
  createdAt: string;
}

// One generation input item — either a Word Bank entry or an Anki weak item,
// normalized to the same shape before being sent to the generator.
export interface FlashcardSourceItem {
  sourceNote: string; // the term (Word Bank) or noteText (Anki)
  sourceWordBankId: string | null; // set only when source === 'word_bank'
  // Word Bank's real capture date (YYYY-MM-DD), for the leccion:: tag
  // (docs/ANKI_SCHEMA.md §4 — "dated to the lesson or source it came
  // from"). Anki weak items have no equivalent per-card date, so this is
  // null for that source — the generator must omit the tag rather than
  // invent a date, never fabricate one.
  sourceDate: string | null;
}

export interface FlashcardGenerateRequest {
  source: FlashcardSource;
  items: FlashcardSourceItem[];
  dialect: DialectCode;
  deleLevel: DeleLevel;
}

export interface FlashcardGenerateResponse {
  drafts: FlashcardRecord[]; // includes out_of_scope rows, flagged not silently dropped
  alreadyKnown: string[]; // source terms skipped pre-generation — matched known_cards
}

export interface FlashcardListResponse {
  flashcards: FlashcardRecord[];
}

// Seeding known_cards reuses /api/anki-ingest's response shape directly —
// the *unfiltered* items list (every card, not just weak ones).
export interface FlashcardSeedItem {
  noteText: string;
  deckName: string;
}

export interface FlashcardSeedRequest {
  items: FlashcardSeedItem[];
}

export interface FlashcardSeedResponse {
  seededCount: number;
  skippedCount: number; // already present in known_cards, normalized-match
}

export interface FlashcardUpdateRequest {
  noteType?: AnkiNoteType;
  deck?: string;
  tags?: string[];
}
