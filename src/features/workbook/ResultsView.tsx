import type { WorkbookSession, WorkbookGradeResponse, ExerciseItem } from '../../shared/workbook/types';

interface ResultsViewProps {
  response: WorkbookGradeResponse;
  session: WorkbookSession;
  onNewSession: () => void;
}

function blankCue(item: ExerciseItem | undefined, blankId: string | undefined): string | null {
  if (!item || item.type !== 'contextual_cloze' || !blankId) return null;
  return item.blanks.find((b) => b.id === blankId)?.cue ?? null;
}

function ResultsView({ response, session, onNewSession }: ResultsViewProps) {
  const itemsById = new Map(session.items.map((item) => [item.id, item]));

  return (
    <div className="workbook-results">
      {response.persistError && <p role="alert">{response.persistError}</p>}

      {response.objective.length > 0 && (
        <div className="workbook-results__section">
          <h3>Objective items</h3>
          <ul>
            {response.objective.map((r, i) => {
              const item = itemsById.get(r.itemId);
              const cue = blankCue(item, r.blankId);
              return (
                <li key={`${r.itemId}-${r.blankId ?? i}`} className={r.correct ? 'workbook-result--correct' : 'workbook-result--incorrect'}>
                  {cue && <strong>({cue}) </strong>}
                  <span>your answer: {r.submitted || '(blank)'}</span>
                  {!r.correct && <span> — correct: {r.correctAnswer}</span>}
                  <span> {r.correct ? '✓' : '✗'}</span>
                  {r.note && <p className="workbook-result__note">{r.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {response.sentenceProduction.length > 0 && (
        <div className="workbook-results__section">
          <h3>Sentence production</h3>
          {response.sentenceProduction.map((r) => (
            <div key={r.itemId} className="workbook-results__sentence">
              <p>
                <strong>Your answer:</strong> {r.submitted}
              </p>
              <p>
                <strong>Corrected:</strong> {r.grading.corrected_text}
              </p>
              <p>{r.grading.feedback_prose}</p>
              <ul>
                {Object.entries(r.grading.accuracy.category_summary).map(([category, summary]) => (
                  <li key={category}>
                    {category}: {summary!.correct}/{summary!.obligatory_contexts}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button onClick={onNewSession}>New session</button>
    </div>
  );
}

export default ResultsView;
