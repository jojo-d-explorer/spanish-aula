import type { ErrorCategory, SubscoreKey } from './types';

// Human-readable labels for the frozen error taxonomy (types.ts) — one
// place, imported everywhere a category gets shown to the learner, instead
// of rendering the raw enum value (which reads as "ser_estar", underscores
// and all).
export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  ser_estar: 'Ser vs. Estar',
  preterite_vs_imperfect: 'Preterite vs. Imperfect',
  subjunctive_trigger: 'Subjunctive Trigger',
  subjunctive_form: 'Subjunctive Form',
  conditional: 'Conditional',
  future_tense: 'Future Tense',
  present_perfect: 'Present Perfect',
  gender_agreement: 'Gender Agreement',
  number_agreement: 'Number Agreement',
  article_use: 'Article Use',
  por_para: 'Por vs. Para',
  preposition_directional_vs_stationary: 'Prepositions (Direction vs. Location)',
  preposition_other: 'Prepositions (Other)',
  pronoun_placement: 'Pronoun Placement',
  pronoun_choice_le_lo_la: 'Pronoun Choice (le/lo/la)',
  se_impersonal_reflexive: 'Se (Impersonal/Reflexive)',
  gustar_type_construction: 'Gustar-Type Construction',
  verb_conjugation_regular: 'Verb Conjugation (Regular)',
  verb_conjugation_irregular: 'Verb Conjugation (Irregular)',
  stem_change: 'Stem-Changing Verbs',
  word_order: 'Word Order',
  lexical_choice: 'Word Choice',
  false_friend_portuguese: 'False Friend (Portuguese)',
  accent_orthography: 'Accents & Spelling',
  register_formality: 'Register/Formality',
  other: 'Other',
};

export function formatCategoryLabel(category: ErrorCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

// Moved from HistoryView.tsx, which had this defined locally — Writing's
// feedback view needs the exact same labels now, so it's shared, not copied.
export const SUBSCORE_LABELS: Record<SubscoreKey, string> = {
  syntactic_complexity: 'Syntax',
  verbal_range: 'Verbal range',
  lexical_sophistication: 'Lexicon',
  cohesion: 'Cohesion',
  ambition: 'Ambition',
};

export function formatSubscoreLabel(key: SubscoreKey): string {
  return SUBSCORE_LABELS[key] ?? key;
}
