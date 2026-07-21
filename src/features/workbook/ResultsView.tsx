import type { WorkbookSession, WorkbookGradeResponse, ExerciseItem, ObjectiveGradeResult } from '../../shared/workbook/types';
import type { ErrorCategory } from '../../shared/grading/types';
import { formatCategoryLabel } from '../../shared/grading/categoryLabels';

interface ResultsViewProps {
  response: WorkbookGradeResponse;
  session: WorkbookSession;
  onNewSession: () => void;
}

// The passage/sentence the blank(s) came from — shown once per item, not
// once per blank, so a multi-blank cloze doesn't repeat the same paragraph.
function itemContext(item: ExerciseItem | undefined): string | null {
  if (!item) return null;
  if (item.type === 'contextual_cloze') return item.passage;
  if (item.type === 'conjugation_recall' || item.type === 'gap_fill') return item.sentence;
  return null;
}

// Always pulled from the structured field, never from `sentence`/`passage`
// text — the model doesn't reliably embed the cue inline (ExerciseSession.tsx
// has the same fix), so this is the one place the cue is read from.
function blankCue(item: ExerciseItem | undefined, blankId: string | undefined): string | null {
  if (!item) return null;
  if (item.type === 'contextual_cloze') return blankId ? (item.blanks.find((b) => b.id === blankId)?.cue ?? null) : null;
  if (item.type === 'conjugation_recall') return item.verbInfinitive;
  if (item.type === 'gap_fill') return item.cue;
  return null;
}

interface ObjectiveGroup {
  itemId: string;
  results: ObjectiveGradeResult[];
}

// contextual_cloze items produce multiple results (one per blank) sharing
// one itemId; conjugation_recall/gap_fill produce exactly one. Grouping
// handles both the same way — a group of one is just a group of one.
function groupByItem(results: ObjectiveGradeResult[]): ObjectiveGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ObjectiveGradeResult[]>();
  for (const r of results) {
    if (!groups.has(r.itemId)) {
      groups.set(r.itemId, []);
      order.push(r.itemId);
    }
    groups.get(r.itemId)!.push(r);
  }
  return order.map((itemId) => ({ itemId, results: groups.get(itemId)! }));
}

function ResultsView({ response, session, onNewSession }: ResultsViewProps) {
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const groupedObjective = groupByItem(response.objective);

  return (
    <div className="workbook-results">
      {response.persistError && <p role="alert">{response.persistError}</p>}

      {response.objective.length > 0 && (
        <div className="workbook-results__section">
          <h3>Objective items</h3>
          {groupedObjective.map((group) => {
            const item = itemsById.get(group.itemId);
            const context = itemContext(item);
            const allCorrect = group.results.every((r) => r.correct);
            return (
              <div
                key={group.itemId}
                className={`workbook-results__item${allCorrect ? ' workbook-results__item--all-correct' : ''}`}
              >
                {item && <span className="workbook-category-badge">{formatCategoryLabel(item.category)}</span>}
                {item?.rationale && <p className="workbook-item__rationale">{item.rationale}</p>}
                {context && <p className="workbook-results__context">{context}</p>}
                <ul className="workbook-results__answers">
                  {group.results.map((r, i) => {
                    const cue = blankCue(item, r.blankId);
                    return (
                      <li key={`${r.itemId}-${r.blankId ?? i}`} className="workbook-answer-row">
                        {cue && <span className="workbook-answer__cue">({cue}) </span>}
                        {r.correct ? (
                          <span className="workbook-answer__submitted--correct">{r.submitted} ✓</span>
                        ) : (
                          <>
                            <span
                              className={
                                r.submitted
                                  ? 'workbook-answer__submitted--wrong'
                                  : 'workbook-answer__submitted--blank'
                              }
                            >
                              {r.submitted || '(no answer)'}
                            </span>
                            <span className="workbook-answer__arrow"> → </span>
                            <span className="workbook-answer__correct">{r.correctAnswer}</span>
                          </>
                        )}
                        {r.note && <p className="workbook-result__note">{r.note}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {response.sentenceProduction.length > 0 && (
        <div className="workbook-results__section">
          <h3>Sentence production</h3>
          {response.sentenceProduction.map((r) => {
            const item = itemsById.get(r.itemId);
            return (
              <div key={r.itemId} className="workbook-results__sentence">
                {item?.rationale && <p className="workbook-item__rationale">{item.rationale}</p>}
                <p>
                  <strong>Your answer:</strong> {r.submitted}
                </p>
                <p>
                  <strong>Corrected:</strong> {r.grading.corrected_text}
                </p>
                <p>{r.grading.feedback_prose}</p>
                <div className="workbook-results__category-summary">
                  {Object.entries(r.grading.accuracy.category_summary).map(([category, summary]) => (
                    <span key={category} className="workbook-category-badge">
                      {formatCategoryLabel(category as ErrorCategory)}: {summary!.correct}/{summary!.obligatory_contexts}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={onNewSession}>New session</button>
    </div>
  );
}

export default ResultsView;
