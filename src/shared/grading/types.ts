// Shared across every tab that grades or targets errors (Writing now; Workbook/Lessons later).
// Do not copy this enum elsewhere — import it.
export const ERROR_CATEGORIES = [
  'ser_estar',
  'preterite_vs_imperfect',
  'subjunctive_trigger',
  'subjunctive_form',
  'conditional',
  'future_tense',
  'present_perfect',
  'gender_agreement',
  'number_agreement',
  'article_use',
  'por_para',
  'preposition_directional_vs_stationary',
  'preposition_other',
  'pronoun_placement',
  'pronoun_choice_le_lo_la',
  'se_impersonal_reflexive',
  'gustar_type_construction',
  'verb_conjugation_regular',
  'verb_conjugation_irregular',
  'stem_change',
  'word_order',
  'lexical_choice',
  'false_friend_portuguese',
  'accent_orthography',
  'register_formality',
  'other',
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

// Ordinal — index order matters for level-nudge comparisons in src/shared/settings.
export const DELE_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type DeleLevelEstimate = (typeof DELE_LEVELS)[number];

export interface AccuracyObservation {
  category: ErrorCategory;
  obligatory_context: boolean;
  correct: boolean;
  excerpt: string;
  correction: string;
  note: string;
  portuguese_interference: boolean;
}

export interface CategorySummaryEntry {
  obligatory_contexts: number;
  correct: number;
}

export const SUBSCORE_KEYS = [
  'syntactic_complexity',
  'verbal_range',
  'lexical_sophistication',
  'cohesion',
  'ambition',
] as const;
export type SubscoreKey = (typeof SUBSCORE_KEYS)[number];
export type SophisticationSubscores = Record<SubscoreKey, number>;

// The grading contract — see PRD §4. Load-bearing for progress trends;
// do not simplify to a flat error list.
export interface GradingContract {
  corrected_text: string;
  accuracy: {
    observations: AccuracyObservation[];
    category_summary: Partial<Record<ErrorCategory, CategorySummaryEntry>>;
  };
  sophistication: {
    overall: number;
    subscores: SophisticationSubscores;
    notes: string;
  };
  feedback_prose: string;
  dele_level_estimate: DeleLevelEstimate;
}

// Guards against a tool call truncated by max_tokens: corrected_text and
// accuracy.observations are generated first and can come through intact
// while feedback_prose/dele_level_estimate (generated last) are cut off —
// a blind `as GradingContract` cast would silently pass that through.
export function isCompleteGradingContract(value: unknown): value is GradingContract {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GradingContract>;
  return (
    typeof v.corrected_text === 'string' &&
    typeof v.feedback_prose === 'string' &&
    v.feedback_prose.trim().length > 0 &&
    typeof v.dele_level_estimate === 'string' &&
    (DELE_LEVELS as readonly string[]).includes(v.dele_level_estimate) &&
    !!v.accuracy &&
    Array.isArray(v.accuracy.observations) &&
    !!v.accuracy.category_summary &&
    !!v.sophistication &&
    typeof v.sophistication.overall === 'number' &&
    !!v.sophistication.subscores
  );
}

// Phase 8 (PRD §9.6) — additive top-level key on a revision grading call
// only. The base contract above never changes shape.
export const UPTAKE_OUTCOMES = ['fixed', 'still_wrong', 'avoided'] as const;
export type UptakeOutcome = (typeof UPTAKE_OUTCOMES)[number];

export interface UptakeResolution {
  observation_id: string;
  category: ErrorCategory;
  outcome: UptakeOutcome;
  note: string;
}

export interface UptakeSummary {
  flagged: number;
  fixed: number;
  still_wrong: number;
  avoided: number;
  new_errors_introduced: number;
}

export interface UptakeBlock {
  resolutions: UptakeResolution[];
  summary: UptakeSummary;
}

export interface RevisionGradingContract extends GradingContract {
  uptake: UptakeBlock;
}

// Client-side only — the wire contract itself never carries `entryId`/
// `text`/`persistError` (see isCompleteGradingContract above), but every UI
// consumer needs them threaded alongside the grading result. `uptake` is
// present only for a revision entry.
export interface ChainEntry extends GradingContract {
  entryId: string | null;
  text: string;
  persistError?: string;
  uptake?: UptakeBlock;
}

// PRD §9.6 — `uptake` generates last in the response and is the most
// truncation-prone part. `expectedResolutionCount` is the count of parent
// observations with obligatory_context=true && correct=false, computed
// server-side before the call — resolutions must match it exactly (§9.6:
// "not more, not fewer").
export function isCompleteUptakeBlock(value: unknown, expectedResolutionCount: number): value is UptakeBlock {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<UptakeBlock>;
  return (
    Array.isArray(v.resolutions) &&
    v.resolutions.length === expectedResolutionCount &&
    v.resolutions.every(
      (r) =>
        r &&
        typeof r.observation_id === 'string' &&
        typeof r.category === 'string' &&
        (UPTAKE_OUTCOMES as readonly string[]).includes(r.outcome) &&
        typeof r.note === 'string',
    ) &&
    !!v.summary &&
    typeof v.summary.flagged === 'number' &&
    typeof v.summary.fixed === 'number' &&
    typeof v.summary.still_wrong === 'number' &&
    typeof v.summary.avoided === 'number' &&
    typeof v.summary.new_errors_introduced === 'number'
  );
}
