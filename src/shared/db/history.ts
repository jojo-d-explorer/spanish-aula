import { getSupabaseClient } from './client.js';
import type { ObservationRecord, EntrySophisticationRecord } from '../history/trends';
import type { ErrorCategory, SophisticationSubscores } from '../grading/types';

export async function fetchHistoryData(): Promise<{
  observations: ObservationRecord[];
  sophisticationRecords: EntrySophisticationRecord[];
}> {
  const supabase = getSupabaseClient();

  // Independent reads (different tables, no shared input) — run in parallel.
  const [obsResult, entryResult] = await Promise.all([
    supabase.from('observations').select('category, obligatory_context, correct, entries(created_at)'),
    supabase.from('entries').select('created_at, sophistication_overall, sophistication_subscores'),
  ]);

  const { data: obsRows, error: obsError } = obsResult;
  if (obsError) throw obsError;

  const observations: ObservationRecord[] = (obsRows ?? []).map((row) => ({
    createdAt: (row.entries as unknown as { created_at: string }).created_at,
    category: row.category as ErrorCategory,
    obligatoryContext: row.obligatory_context,
    correct: row.correct,
  }));

  const { data: entryRows, error: entryError } = entryResult;
  if (entryError) throw entryError;

  const sophisticationRecords: EntrySophisticationRecord[] = (entryRows ?? []).map((row) => ({
    createdAt: row.created_at,
    overall: row.sophistication_overall,
    subscores: row.sophistication_subscores as SophisticationSubscores,
  }));

  return { observations, sophisticationRecords };
}
