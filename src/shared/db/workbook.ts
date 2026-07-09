import { getSupabaseClient } from './client.js';
import type { ErrorCategory } from '../grading/types';

export interface WorkbookObservationInput {
  category: ErrorCategory;
  obligatoryContext: boolean;
  correct: boolean;
  excerpt: string;
  correction: string;
  note: string;
  portugueseInterference: boolean;
}

// Workbook attempts aren't Writing entries, so there's no parent row to
// point at (entry_id is null) or roll back on failure — a single batch
// insert is the whole operation, unlike entries.ts/lessons.ts's two-table
// parent-then-child pattern.
export async function persistWorkbookObservations(observations: WorkbookObservationInput[]): Promise<void> {
  if (observations.length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('error_observations').insert(
    observations.map((o) => ({
      entry_id: null,
      category: o.category,
      obligatory_context: o.obligatoryContext,
      correct: o.correct,
      excerpt: o.excerpt,
      correction: o.correction,
      note: o.note,
      portuguese_interference: o.portugueseInterference,
      source_tab: 'workbook',
    })),
  );

  if (error) throw error;
}
