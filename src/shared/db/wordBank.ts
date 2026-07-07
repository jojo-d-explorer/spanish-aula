import { getSupabaseClient } from './client.js';

export interface WordBankEntryInput {
  term: string;
  contextSentence?: string;
  note?: string;
  sourceTab: string;
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
