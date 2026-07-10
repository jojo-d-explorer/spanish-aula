import { getSupabaseClient } from './client.js';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';
import type { AnkiNoteType } from '../flashcards/ankiSchema';
import type { FlashcardRecord, FlashcardSource, FlashcardStatus, KnownCardRecord } from '../flashcards/types';

export interface FlashcardDraftInput {
  outOfScope: boolean;
  outOfScopeReason: string | null;
  noteType: AnkiNoteType | null;
  deck: string | null;
  term: string;
  fields: Record<string, string> | null;
  tags: string[];
  dialect: DialectCode;
  deleLevel: DeleLevel;
  source: FlashcardSource;
  sourceWordBankId: string | null;
  sourceNote: string;
}

function toRecord(row: {
  id: unknown;
  status: unknown;
  note_type: unknown;
  deck: unknown;
  term: unknown;
  fields: unknown;
  tags: unknown;
  out_of_scope: unknown;
  out_of_scope_reason: unknown;
  dialect: unknown;
  dele_level_at_creation: unknown;
  source: unknown;
  source_word_bank_id: unknown;
  source_note: unknown;
  created_at: unknown;
  confirmed_at: unknown;
  exported_at: unknown;
}): FlashcardRecord {
  return {
    id: row.id as string,
    status: row.status as FlashcardStatus,
    noteType: row.note_type as AnkiNoteType | null,
    deck: row.deck as string | null,
    term: row.term as string,
    fields: row.fields as Record<string, string> | null,
    tags: (row.tags as string[]) ?? [],
    outOfScope: row.out_of_scope as boolean,
    outOfScopeReason: row.out_of_scope_reason as string | null,
    dialect: row.dialect as DialectCode,
    deleLevelAtCreation: row.dele_level_at_creation as DeleLevel,
    source: row.source as FlashcardSource,
    sourceWordBankId: row.source_word_bank_id as string | null,
    sourceNote: row.source_note as string,
    createdAt: row.created_at as string,
    confirmedAt: row.confirmed_at as string | null,
    exportedAt: row.exported_at as string | null,
  };
}

export async function persistDraftFlashcards(inputs: FlashcardDraftInput[]): Promise<FlashcardRecord[]> {
  if (inputs.length === 0) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('flashcards')
    .insert(
      inputs.map((input) => ({
        status: 'draft',
        note_type: input.noteType,
        deck: input.deck,
        term: input.term,
        fields: input.fields,
        tags: input.tags,
        out_of_scope: input.outOfScope,
        out_of_scope_reason: input.outOfScopeReason,
        dialect: input.dialect,
        dele_level_at_creation: input.deleLevel,
        source: input.source,
        source_word_bank_id: input.sourceWordBankId,
        source_note: input.sourceNote,
      })),
    )
    .select();

  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function listFlashcards(status?: FlashcardStatus): Promise<FlashcardRecord[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from('flashcards').select().order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function updateFlashcard(
  id: string,
  updates: { noteType?: AnkiNoteType; deck?: string; tags?: string[] },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.noteType !== undefined) patch.note_type = updates.noteType;
  if (updates.deck !== undefined) patch.deck = updates.deck;
  if (updates.tags !== undefined) patch.tags = updates.tags;
  if (Object.keys(patch).length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('flashcards').update(patch).eq('id', id);
  if (error) throw error;
}

// Ledger insert happens BEFORE the status flip — a partial failure here
// never leaves a card marked confirmed without being deduped against (same
// ordering discipline as persistGradedEntry's compensating delete).
export async function confirmFlashcards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabaseClient();

  const { data: cards, error: fetchError } = await supabase
    .from('flashcards')
    .select('id, term, deck, note_type')
    .in('id', ids);
  if (fetchError) throw fetchError;

  const knownCardRows = (cards ?? []).map((card) => ({
    term: card.term as string,
    deck: card.deck as string | null,
    note_type: card.note_type as string | null,
    source: 'generated',
    flashcard_id: card.id as string,
  }));

  if (knownCardRows.length > 0) {
    const { error: knownCardsError } = await supabase.from('known_cards').insert(knownCardRows);
    if (knownCardsError) throw knownCardsError;
  }

  const { error: updateError } = await supabase
    .from('flashcards')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .in('id', ids);
  if (updateError) throw updateError;
}

export async function rejectFlashcards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('flashcards').update({ status: 'rejected' }).in('id', ids);
  if (error) throw error;
}

export async function markFlashcardsExported(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('flashcards')
    .update({ exported_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

// Fetched once per generation call and compared in memory via
// normalizeForMatch (src/shared/workbook/matching.ts) — single-user scale,
// no need for a DB-side fuzzy query.
export async function listKnownCardTerms(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('known_cards').select('term');
  if (error) throw error;
  return (data ?? []).map((row) => row.term as string);
}

export async function listKnownCards(): Promise<KnownCardRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('known_cards').select().order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    term: row.term as string,
    deck: row.deck as string | null,
    noteType: row.note_type as AnkiNoteType | null,
    source: row.source as 'seed_import' | 'generated',
    flashcardId: row.flashcard_id as string | null,
    createdAt: row.created_at as string,
  }));
}

// Idempotent — safe to re-run against a re-exported .colpkg later. Skips
// any term that already normalized-matches an existing known_cards row
// (docs/ANKI_SCHEMA.md §7: the deck itself is the source of truth, not the
// sometimes-stale Google Doc master list).
export async function seedKnownCards(
  items: { term: string; deck: string }[],
  normalize: (s: string) => string,
): Promise<{ seededCount: number; skippedCount: number }> {
  if (items.length === 0) return { seededCount: 0, skippedCount: 0 };

  const existingTerms = new Set((await listKnownCardTerms()).map(normalize));
  const toInsert: { term: string; deck: string; note_type: null; source: string; flashcard_id: null }[] = [];
  let skippedCount = 0;

  for (const item of items) {
    const normalized = normalize(item.term);
    if (existingTerms.has(normalized)) {
      skippedCount++;
      continue;
    }
    existingTerms.add(normalized);
    toInsert.push({ term: item.term, deck: item.deck, note_type: null, source: 'seed_import', flashcard_id: null });
  }

  if (toInsert.length > 0) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('known_cards').insert(toInsert);
    if (error) throw error;
  }

  return { seededCount: toInsert.length, skippedCount };
}
