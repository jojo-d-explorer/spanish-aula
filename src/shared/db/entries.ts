import { getSupabaseClient } from './client.js';
import type { ErrorCategory, GradingContract, RevisionGradingContract } from '../grading/types';
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
    // The tool schema requires this on every observation, but the model
    // doesn't always comply — a bare pass-through of `undefined` here means
    // one omitted boolean fails the DB's NOT NULL constraint, and since a
    // failed insert deletes the whole `entries` row above (no orphans),
    // that would silently discard the entire graded entry. `false` is the
    // safe default in the absence of evidence otherwise.
    portuguese_interference: obs.portuguese_interference ?? false,
  }));

  if (observations.length > 0) {
    const { error: obsError } = await supabase.from('error_observations').insert(observations);
    if (obsError) {
      // Don't leave an orphaned entries row with no observations behind —
      // it would silently skew History's accuracy/exposure aggregation.
      await supabase.from('entries').delete().eq('id', entry.id);
      throw obsError;
    }
  }

  return entry.id as string;
}

// Phase 8 (PRD §9) — revision cycle. -------------------------------------

export interface ParentEntryForRevision {
  entryId: string;
  entryText: string;
  promptText: string;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  revisionNumber: number;
}

export async function getEntryForRevision(entryId: string): Promise<ParentEntryForRevision | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('entries')
    .select('id, entry_text, prompt_text, dialect, dele_level, revision_number')
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    entryId: data.id as string,
    entryText: data.entry_text as string,
    promptText: data.prompt_text as string,
    dialect: data.dialect as DialectCode,
    deleLevel: data.dele_level as DeleLevel,
    revisionNumber: data.revision_number as number,
  };
}

export interface FlaggedObservation {
  id: string;
  category: ErrorCategory;
  excerpt: string;
  correction: string;
  note: string;
}

// PRD §9.6 — the parent observations a revision's uptake grading is scored
// against: obligatory context, wrong, and not itself a revision observation
// (a revision-of-a-revision scores against its immediate parent's flagged
// set, per §9.9, never the root entry's).
export async function getFlaggedObservationsForRevision(entryId: string): Promise<FlaggedObservation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('error_observations')
    .select('id, category, excerpt, correction, note')
    .eq('entry_id', entryId)
    .eq('obligatory_context', true)
    .eq('correct', false)
    .eq('is_revision', false);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as ErrorCategory,
    excerpt: row.excerpt as string,
    correction: row.correction as string,
    note: row.note as string,
  }));
}

interface PersistRevisionInput {
  parentEntryId: string;
  parentRevisionNumber: number;
  promptText: string;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  entryText: string;
  revealedCorrections: boolean;
  grading: RevisionGradingContract;
}

// Resolution-count validation (PRD §9.6) happens in the caller, before this
// is ever invoked — this function assumes grading.uptake is already known-
// good and only handles persistence + compensating cleanup on partial
// DB failure, mirroring persistGradedEntry's orphan-avoidance above.
export async function persistRevisionEntry(input: PersistRevisionInput): Promise<string> {
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
      parent_entry_id: input.parentEntryId,
      revision_number: input.parentRevisionNumber + 1,
      revealed_corrections: input.revealedCorrections,
    })
    .select('id')
    .single();

  if (entryError || !entry) {
    throw entryError ?? new Error('Insert returned no revision entry.');
  }
  const revisionEntryId = entry.id as string;

  const observations = input.grading.accuracy.observations.map((obs) => ({
    entry_id: revisionEntryId,
    category: obs.category,
    obligatory_context: obs.obligatory_context,
    correct: obs.correct,
    excerpt: obs.excerpt,
    correction: obs.correction,
    note: obs.note,
    portuguese_interference: obs.portuguese_interference ?? false,
    is_revision: true,
  }));

  if (observations.length > 0) {
    const { error: obsError } = await supabase.from('error_observations').insert(observations);
    if (obsError) {
      await supabase.from('entries').delete().eq('id', revisionEntryId);
      throw obsError;
    }
  }

  const resolutions = input.grading.uptake.resolutions.map((r) => ({
    revision_entry_id: revisionEntryId,
    observation_id: r.observation_id,
    category: r.category,
    outcome: r.outcome,
    note: r.note,
  }));

  if (resolutions.length > 0) {
    const { error: resError } = await supabase.from('uptake_resolutions').insert(resolutions);
    if (resError) {
      // Same orphan-avoidance as above, one level deeper: don't leave a
      // revision entry + observations behind with no uptake resolutions —
      // that would silently understate the uptake denominator in History.
      await supabase.from('error_observations').delete().eq('entry_id', revisionEntryId);
      await supabase.from('entries').delete().eq('id', revisionEntryId);
      throw resError;
    }
  }

  return revisionEntryId;
}
