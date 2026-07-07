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
