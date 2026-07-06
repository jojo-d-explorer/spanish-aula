import { useState } from 'react';
import { generateWritingPrompt, type WritingPrompt } from '../../shared/prompts/writingPrompt';
import type { GradingContract } from '../../shared/grading/types';

// Hardcoded until a settings/profile UI exists to change them.
const DIALECT = 'mx';
const DELE_LEVEL = 'A2';

function WritingTab() {
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [entryText, setEntryText] = useState('');
  const [feedback, setFeedback] = useState<GradingContract | null>(null);
  const [status, setStatus] = useState<'idle' | 'grading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [saveWarning, setSaveWarning] = useState('');

  function handleGeneratePrompt() {
    setPrompt(generateWritingPrompt(DIALECT, DELE_LEVEL));
    setEntryText('');
    setFeedback(null);
    setStatus('idle');
  }

  async function handleSubmit() {
    setStatus('grading');
    setErrorMessage('');
    setSaveWarning('');
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryText,
          promptText: prompt?.text ?? '',
          dialect: DIALECT,
          deleLevel: DELE_LEVEL,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Grading failed');
      setFeedback(data as GradingContract);
      if (data.persistError) setSaveWarning(data.persistError);
      setStatus('idle');
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <section>
      <h2>Writing</h2>
      <button onClick={handleGeneratePrompt}>Generate prompt</button>

      {!prompt && <p>Tap the button for a DELE-calibrated writing prompt.</p>}

      {prompt && (
        <>
          <p>
            <strong>Prompt:</strong> {prompt.text}
          </p>
          <textarea
            value={entryText}
            onChange={(e) => setEntryText(e.target.value)}
            rows={6}
            style={{ width: '100%' }}
            placeholder="Escribe tu respuesta aquí..."
          />
          <button onClick={handleSubmit} disabled={status === 'grading' || !entryText.trim()}>
            {status === 'grading' ? 'Grading…' : 'Submit'}
          </button>
        </>
      )}

      {status === 'error' && <p role="alert">{errorMessage}</p>}

      {feedback && (
        <div>
          <h3>Feedback (Dra. Restrepo)</h3>
          <p>{feedback.feedback_prose}</p>

          <h4>Corrected text</h4>
          <p>{feedback.corrected_text}</p>

          <h4>Sophistication: {feedback.sophistication.overall}/10</h4>
          <ul>
            {Object.entries(feedback.sophistication.subscores).map(([key, value]) => (
              <li key={key}>
                {key}: {value}/10
              </li>
            ))}
          </ul>

          <h4>Accuracy by category</h4>
          <ul>
            {Object.entries(feedback.accuracy.category_summary).map(([category, summary]) => (
              <li key={category}>
                {category}: {summary!.correct}/{summary!.obligatory_contexts}
              </li>
            ))}
          </ul>

          <h4>Estimated DELE level: {feedback.dele_level_estimate}</h4>
          {saveWarning && <p role="alert">{saveWarning}</p>}
        </div>
      )}
    </section>
  );
}

export default WritingTab;
