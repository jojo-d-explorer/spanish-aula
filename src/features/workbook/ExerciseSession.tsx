import { useState } from 'react';
import type {
  WorkbookSession,
  WorkbookGradeResponse,
  ObjectiveAnswer,
  SentenceProductionAnswer,
} from '../../shared/workbook/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';

interface ExerciseSessionProps {
  session: WorkbookSession;
  onGraded: (response: WorkbookGradeResponse) => void;
}

function answerKey(itemId: string, blankId?: string): string {
  return blankId ? `${itemId}::${blankId}` : itemId;
}

function ExerciseSession({ session, onGraded }: ExerciseSessionProps) {
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, string>>({});
  const [sentenceAnswers, setSentenceAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function setObjectiveAnswer(itemId: string, value: string, blankId?: string) {
    setObjectiveAnswers((prev) => ({ ...prev, [answerKey(itemId, blankId)]: value }));
  }

  async function handleSubmit() {
    setStatus('submitting');
    setErrorMessage('');

    const answers: ObjectiveAnswer[] = [];
    for (const item of session.items) {
      if (item.type === 'contextual_cloze') {
        for (const blank of item.blanks) {
          const submitted = objectiveAnswers[answerKey(item.id, blank.id)] ?? '';
          answers.push({ itemId: item.id, blankId: blank.id, submitted });
        }
      } else if (item.type === 'conjugation_recall' || item.type === 'gap_fill') {
        const submitted = objectiveAnswers[answerKey(item.id)] ?? '';
        answers.push({ itemId: item.id, submitted });
      }
    }

    const sentenceProductionAnswers: SentenceProductionAnswer[] = session.items
      .filter((item) => item.type === 'sentence_production')
      .map((item) => ({ itemId: item.id, submitted: sentenceAnswers[item.id] ?? '' }));

    try {
      const res = await fetch('/api/workbook-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialect: session.dialect,
          deleLevel: session.deleLevel,
          items: session.items,
          answers,
          sentenceProductionAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Grading failed');
      setStatus('idle');
      onGraded(data as WorkbookGradeResponse);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <div className="workbook-session">
      <p className="workbook-session__source">
        Target: {session.source.category} ({session.source.reason})
      </p>

      {session.items.map((item) => (
        <div className="workbook-item" key={item.id}>
          <p className="workbook-item__prompt">{item.prompt}</p>

          {item.type === 'contextual_cloze' && (
            <>
              <p className="workbook-item__passage">{item.passage}</p>
              <ol className="workbook-item__blanks">
                {item.blanks.map((blank, i) => (
                  <li key={blank.id}>
                    ({blank.cue}){' '}
                    <input
                      type="text"
                      value={objectiveAnswers[answerKey(item.id, blank.id)] ?? ''}
                      onChange={(e) => setObjectiveAnswer(item.id, e.target.value, blank.id)}
                      aria-label={`Blank ${i + 1}`}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}

          {(item.type === 'conjugation_recall' || item.type === 'gap_fill') && (
            <p>
              {item.sentence}{' '}
              <input
                type="text"
                value={objectiveAnswers[answerKey(item.id)] ?? ''}
                onChange={(e) => setObjectiveAnswer(item.id, e.target.value)}
                aria-label="Your answer"
              />
            </p>
          )}

          {item.type === 'sentence_production' && (
            <>
              {/* The model sometimes makes item.prompt a generic instruction
                  ("Responde con una oración completa:") with the real
                  question in item.question, and sometimes makes them the
                  same text. Only render question separately when it adds
                  information prompt didn't already show. */}
              {item.question.trim() !== item.prompt.trim() && <p>{item.question}</p>}
              <textarea
                value={sentenceAnswers[item.id] ?? ''}
                onChange={(e) => setSentenceAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))}
                onInput={(e) => autoGrowTextarea(e.currentTarget)}
                rows={2}
                style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
              />
            </>
          )}
        </div>
      ))}

      <button onClick={handleSubmit} disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Grading…' : 'Submit'}
      </button>
      {status === 'error' && <p role="alert">{errorMessage}</p>}
    </div>
  );
}

export default ExerciseSession;
