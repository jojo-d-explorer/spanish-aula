import { getSupabaseClient } from './client.js';
import type { ErrorCategory } from '../grading/types';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';
import type { FlashcardRecord, FlashcardSource, FlashcardDedupStatus } from '../flashcards/types';

export interface FlashcardInput {
  term: string;
  translation: string;
  exampleSentence: string;
  category: ErrorCategory | null;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  source: FlashcardSource;
  sourceWordBankId: string | null;
  sourceNote: string;
  dedupStatus: FlashcardDedupStatus;
}

function toRecord(row: {
  id: unknown;
  term: unknown;
  translation: unknown;
  example_sentence: unknown;
  category: unknown;
  dialect: unknown;
  dele_level_at_creation: unknown;
  source: unknown;
  source_word_bank_id: unknown;
  source_note: unknown;
  dedup_status: unknown;
  created_at: unknown;
  exported_at: unknown;
}): FlashcardRecord {
  return {
    id: row.id as string,
    term: row.term as string,
    translation: row.translation as string,
    exampleSentence: row.example_sentence as string,
    category: row.category as ErrorCategory | null,
    dialect: row.dialect as DialectCode,
    deleLevelAtCreation: row.dele_level_at_creation as DeleLevel,
    source: row.source as FlashcardSource,
    sourceWordBankId: row.source_word_bank_id as string | null,
    sourceNote: row.source_note as string | null,
    dedupStatus: row.dedup_status as FlashcardDedupStatus,
    createdAt: row.created_at as string,
    exportedAt: row.exported_at as string | null,
  };
}

// Fetched once per generation call and compared in memory via
// normalizeForMatch (src/shared/workbook/matching.ts) — single-user scale,
// no need for a DB-side fuzzy query.
export async function listFlashcardTerms(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('flashcards').select('term');
  if (error) throw error;
  return (data ?? []).map((row) => row.term as string);
}

export async function persistFlashcards(inputs: FlashcardInput[]): Promise<FlashcardRecord[]> {
  if (inputs.length === 0) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('flashcards')
    .insert(
      inputs.map((input) => ({
        term: input.term,
        translation: input.translation,
        example_sentence: input.exampleSentence,
        category: input.category,
        dialect: input.dialect,
        dele_level_at_creation: input.deleLevel,
        source: input.source,
        source_word_bank_id: input.sourceWordBankId,
        source_note: input.sourceNote,
        dedup_status: input.dedupStatus,
      })),
    )
    .select();

  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function listFlashcards(): Promise<FlashcardRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('flashcards').select().order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

// Called at export time (PRD §14.5) — marks exported cards, and their
// traceable Word Bank source rows, so word_bank.dedup_status (unused since
// Phase 2) finally reflects reality instead of always reading 'pending'.
export async function markFlashcardsExported(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('flashcards')
    .update({ dedup_status: 'exported', exported_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function markWordBankExported(wordBankIds: string[]): Promise<void> {
  if (wordBankIds.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('word_bank').update({ dedup_status: 'exported' }).in('id', wordBankIds);
  if (error) throw error;
}
