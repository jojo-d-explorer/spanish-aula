import type { ChainEntry, ErrorCategory, AccuracyObservation, CategorySummaryEntry } from '../../shared/grading/types';
import { formatCategoryLabel, formatSubscoreLabel } from '../../shared/grading/categoryLabels';

interface CategoryDiagnosis {
  category: ErrorCategory;
  summary: CategorySummaryEntry;
  mistakes: AccuracyObservation[];
}

// category_summary is already curated to "only categories with an
// obligatory context in this entry" (rubric.ts) — group the individual
// observations under those same keys rather than re-deriving anything.
function buildDiagnosis(entry: ChainEntry): { withMistakes: CategoryDiagnosis[]; allCorrect: CategoryDiagnosis[] } {
  const observationsByCategory = new Map<string, AccuracyObservation[]>();
  for (const obs of entry.accuracy.observations) {
    const list = observationsByCategory.get(obs.category) ?? [];
    list.push(obs);
    observationsByCategory.set(obs.category, list);
  }

  const diagnoses: CategoryDiagnosis[] = Object.entries(entry.accuracy.category_summary).map(
    ([category, summary]) => ({
      category: category as ErrorCategory,
      summary: summary!,
      // Only the mistakes are individually interesting here — the ratio in
      // the header already accounts for what the learner got right.
      mistakes: (observationsByCategory.get(category) ?? []).filter((obs) => !obs.correct),
    }),
  );

  return {
    withMistakes: diagnoses.filter((d) => d.mistakes.length > 0),
    allCorrect: diagnoses.filter((d) => d.mistakes.length === 0),
  };
}

const UPTAKE_OUTCOME_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  still_wrong: 'Still wrong',
  avoided: 'Avoided',
};

interface GradedEntryViewProps {
  entry: ChainEntry;
  heading: string;
  onPracticeCategory: (category: ErrorCategory) => void;
}

function GradedEntryView({ entry, heading, onPracticeCategory }: GradedEntryViewProps) {
  const { withMistakes, allCorrect } = buildDiagnosis(entry);

  return (
    <div className="writing-feedback">
      <h3 className="writing-feedback__heading">{heading}</h3>

      <div className="writing-feedback__prose">
        <h4>Feedback (Dra. Restrepo)</h4>
        <p>{entry.feedback_prose}</p>
      </div>

      <div className="writing-feedback__corrected">
        <h4>Corrected text</h4>
        <p>{entry.corrected_text}</p>
      </div>

      <div className="writing-diagnosis">
        <h4 className="writing-diagnosis__heading">Diagnosis by category</h4>
        {withMistakes.map((d) => (
          <div key={d.category} className="writing-category-card">
            <div className="writing-category-card__header">
              <span className="writing-category-card__label">{formatCategoryLabel(d.category)}</span>
              <span className="writing-category-card__ratio">
                {d.summary.correct}/{d.summary.obligatory_contexts}
              </span>
            </div>
            <ul className="writing-category-card__mistakes">
              {d.mistakes.map((m, i) => (
                <li key={i} className="writing-mistake">
                  <span className="writing-mistake__excerpt">{m.excerpt}</span>
                  <span className="writing-mistake__arrow"> → </span>
                  <span className="writing-mistake__correction">{m.correction}</span>
                  {m.note && <p className="writing-mistake__note">{m.note}</p>}
                </li>
              ))}
            </ul>
            <button onClick={() => onPracticeCategory(d.category)}>Practice in Workbook →</button>
          </div>
        ))}
        {allCorrect.length > 0 && (
          <p className="writing-feedback__all-correct">
            ✓ Also solid: {allCorrect.map((d) => formatCategoryLabel(d.category)).join(', ')}
          </p>
        )}
      </div>

      <div className="writing-feedback__stats">
        <div className="writing-stat">
          <div className="writing-stat__label">Sophistication</div>
          <div className="writing-stat__value">{entry.sophistication.overall}/10</div>
          <ul className="writing-stat__subscores">
            {Object.entries(entry.sophistication.subscores).map(([key, value]) => (
              <li key={key}>
                {formatSubscoreLabel(key as keyof typeof entry.sophistication.subscores)}: {value}/10
              </li>
            ))}
          </ul>
        </div>
        <div className="writing-stat">
          <div className="writing-stat__label">Estimated DELE level</div>
          <div className="writing-stat__value">{entry.dele_level_estimate}</div>
        </div>
      </div>

      {/* PRD §9.8 — uptake is its own series, shown here per-revision but
          never merged into the accuracy/exposure diagnosis above. */}
      {entry.uptake && (
        <div className="writing-uptake">
          <h4>Uptake on the {entry.uptake.summary.flagged} flagged error(s)</h4>
          <p className="writing-uptake__summary">
            {entry.uptake.summary.fixed} fixed · {entry.uptake.summary.still_wrong} still wrong ·{' '}
            {entry.uptake.summary.avoided} avoided
            {entry.uptake.summary.new_errors_introduced > 0 &&
              ` · ${entry.uptake.summary.new_errors_introduced} new error(s) introduced`}
          </p>
          <ul className="writing-uptake__resolutions">
            {entry.uptake.resolutions.map((r, i) => (
              <li key={i} className={`writing-uptake__resolution writing-uptake__resolution--${r.outcome}`}>
                <span className="writing-uptake__outcome">{UPTAKE_OUTCOME_LABELS[r.outcome]}</span>
                <span className="writing-uptake__category">{formatCategoryLabel(r.category)}</span>
                {r.note && <p className="writing-uptake__note">{r.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.persistError && <p role="alert">{entry.persistError}</p>}
    </div>
  );
}

export default GradedEntryView;
