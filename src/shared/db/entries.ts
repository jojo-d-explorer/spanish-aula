import { getSupabaseClient } from './client.js';
import type { GradingContract } from '../grading/types';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

interface PersistEntryInput {
  dialect: DialectCode;
  deleLevel: DeleLevel;
  promptText: string;
  entryText: string;
  grading: GradingContract;
}

export async function persistGradedEntry(input: PersistEntryInput): Promise<string> {
  const supabase = getSupabaseClient();

  const { data: entry, error: entryError } = await supabase
    .from('entries')
    .insert({
      dialect: input.dialect,
      dele_level: input.deleLevel,
      prompt_text: input.promptText,
      entry_text: input.entryText,
      corrected_text: input.grading.corrected_text,
      sophistication_overall: input.grading.sophistication.overall,
      sophistication_subscores: input.grading.sophistication.subscores,
      sophistication_notes: input.grading.sophistication.notes,
      feedback_prose: input.grading.feedback_prose,
      dele_level_estimate: input.grading.dele_level_estimate,
    })
    .select('id')
    .single();

  if (entryError || !entry) {
    throw entryError ?? new Error('Insert returned no entry.');
  }

  const observations = input.grading.accuracy.observations.map((obs) => ({
    entry_id: entry.id as string,
    category: obs.category,
    obligatory_context: obs.obligatory_context,
    correct: obs.correct,
    excerpt: obs.excerpt,
    correction: obs.correction,
    note: obs.note,
    portuguese_interference: obs.portuguese_interference,
  }));

  if (observations.length > 0) {
    const { error: obsError } = await supabase.from('observations').insert(observations);
    if (obsError) {
      // Don't leave an orphaned entries row with no observations behind —
      // it would silently skew History's accuracy/exposure aggregation.
      await supabase.from('entries').delete().eq('id', entry.id);
      throw obsError;
    }
  }

  return entry.id as string;
}
