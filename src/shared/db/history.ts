import { getSupabaseClient } from './client.js';
import type { ObservationRecord, EntrySophisticationRecord } from '../history/trends';
import type { UptakeResolutionRecord } from '../history/uptakeTrends';
import type { ErrorCategory, SophisticationSubscores, UptakeOutcome } from '../grading/types';

export async function fetchHistoryData(): Promise<{
  observations: ObservationRecord[];
  sophisticationRecords: EntrySophisticationRecord[];
}> {
  const supabase = getSupabaseClient();

  // Independent reads (different tables, no shared input) — run in parallel.
  // error_observations carries its own created_at (PRD §8.2) — no join needed.
  // is_revision = false is applied here (PRD §9.7) and again inside
  // computeTrends itself, which is the actual isolation boundary (see
  // trends.test.ts) — this query-side filter is an efficiency measure, not
  // the only line of defense.
  const [obsResult, entryResult] = await Promise.all([
    supabase
      .from('error_observations')
      .select('category, obligatory_context, correct, created_at, is_revision')
      .eq('is_revision', false),
    supabase
      .from('entries')
      .select('created_at, sophistication_overall, sophistication_subscores, parent_entry_id')
      .is('parent_entry_id', null),
  ]);

  const { data: obsRows, error: obsError } = obsResult;
  if (obsError) throw obsError;

  const observations: ObservationRecord[] = (obsRows ?? []).map((row) => ({
    createdAt: row.created_at,
    category: row.category as ErrorCategory,
    obligatoryContext: row.obligatory_context,
    correct: row.correct,
    isRevision: row.is_revision,
  }));

  const { data: entryRows, error: entryError } = entryResult;
  if (entryError) throw entryError;

  const sophisticationRecords: EntrySophisticationRecord[] = (entryRows ?? []).map((row) => ({
    createdAt: row.created_at,
    overall: row.sophistication_overall,
    subscores: row.sophistication_subscores as SophisticationSubscores,
    isRevision: false, // query already excludes rows with a parent_entry_id
  }));

  return { observations, sophisticationRecords };
}

// PRD §9.8 — its own series, never blended into fetchHistoryData above.
export async function fetchUptakeResolutions(): Promise<UptakeResolutionRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('uptake_resolutions').select('category, outcome, created_at');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    createdAt: row.created_at as string,
    category: row.category as ErrorCategory,
    outcome: row.outcome as UptakeOutcome,
  }));
}
