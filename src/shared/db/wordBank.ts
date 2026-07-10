import { getSupabaseClient } from './client.js';

export interface WordBankEntryInput {
  term: string;
  contextSentence?: string;
  note?: string;
  sourceTab: string;
}

export interface WordBankEntry {
  id: string;
  term: string;
  contextSentence: string | null;
  note: string | null;
  sourceTab: string;
  dedupStatus: string;
  createdAt: string;
}

export async function persistWordBankEntry(input: WordBankEntryInput): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('word_bank')
    .insert({
      term: input.term,
      context_sentence: input.contextSentence ?? null,
      note: input.note ?? null,
      source_tab: input.sourceTab,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Insert returned no row.');
  return data.id as string;
}

// Phase 5 (§14) — the Flashcards tab's "generate from Word Bank" source
// picker reads this list; Word Bank itself has no browse view.
export async function listWordBankEntries(): Promise<WordBankEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('word_bank').select().order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    term: row.term as string,
    contextSentence: row.context_sentence as string | null,
    note: row.note as string | null,
    sourceTab: row.source_tab as string,
    dedupStatus: row.dedup_status as string,
    createdAt: row.created_at as string,
  }));
}
