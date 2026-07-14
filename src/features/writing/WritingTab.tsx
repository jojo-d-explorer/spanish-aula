import { useEffect, useState } from 'react';
import { generateWritingPrompt, type WritingPrompt, type DeleLevel, DELE_LEVEL_OPTIONS } from '../../shared/prompts/writingPrompt';
import type { GradingContract, ErrorCategory, AccuracyObservation, CategorySummaryEntry } from '../../shared/grading/types';
import type { SettingsResponse } from '../../shared/settings/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';
import { formatCategoryLabel, formatSubscoreLabel } from '../../shared/grading/categoryLabels';
import HistoryView from './history/HistoryView';
import './Writing.css';

interface WritingTabProps {
  onPracticeCategory: (category: ErrorCategory) => void;
}

interface CategoryDiagnosis {
  category: ErrorCategory;
  summary: CategorySummaryEntry;
  mistakes: AccuracyObservation[];
}

// category_summary is already curated to "only categories with an
// obligatory context in this entry" (rubric.ts) — group the individual
// observations under those same keys rather than re-deriving anything.
function buildDiagnosis(feedback: GradingContract): { withMistakes: CategoryDiagnosis[]; allCorrect: CategoryDiagnosis[] } {
  const observationsByCategory = new Map<string, AccuracyObservation[]>();
  for (const obs of feedback.accuracy.observations) {
    const list = observationsByCategory.get(obs.category) ?? [];
    list.push(obs);
    observationsByCategory.set(obs.category, list);
  }

  const diagnoses: CategoryDiagnosis[] = Object.entries(feedback.accuracy.category_summary).map(
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

function WritingTab({ onPracticeCategory }: WritingTabProps) {
  const [view, setView] = useState<'write' | 'history'>('write');
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [levelUpdateError, setLevelUpdateError] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [entryText, setEntryText] = useState('');
  const [feedback, setFeedback] = useState<GradingContract | null>(null);
  const [status, setStatus] = useState<'idle' | 'grading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [saveWarning, setSaveWarning] = useState('');

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load settings');
      setSettings(data as SettingsResponse);
      setSettingsError('');
    } catch (err) {
      console.error('Failed to load settings', err);
      setSettingsError('Could not load your level settings — try reloading the page.');
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function updateLevel(deleLevel: DeleLevel) {
    setLevelUpdateError('');
    setNudgeDismissed(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleLevel }),
      });
      if (!res.ok) throw new Error('Failed to update level');
      // Refetch rather than optimistically patch local state — this also
      // picks up the server's freshly-recomputed nudge (or its absence, if
      // this update was accepting the nudge) instead of showing a stale one.
      await loadSettings();
    } catch (err) {
      console.error(err);
      setLevelUpdateError('Could not update your level — please try again.');
    }
  }

  function handleGeneratePrompt() {
    if (!settings) return;
    setPrompt(generateWritingPrompt(settings.dialect, settings.deleLevel));
    setEntryText('');
    setFeedback(null);
    setStatus('idle');
  }

  async function handleSubmit() {
    if (!settings) return;
    setStatus('grading');
    setErrorMessage('');
    setSaveWarning('');
    setFeedback(null);
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryText,
          promptText: prompt?.text ?? '',
          dialect: settings.dialect,
          deleLevel: settings.deleLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Grading failed');
      setFeedback(data as GradingContract);
      if (data.persistError) setSaveWarning(data.persistError);
      setStatus('idle');
      // A fresh entry may have just crossed the nudge threshold.
      loadSettings();
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <section>
      <h2>Writing</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setView('write')} disabled={view === 'write'}>
          Write
        </button>{' '}
        <button onClick={() => setView('history')} disabled={view === 'history'}>
          History
        </button>
      </div>

      {settingsError && <p role="alert">{settingsError}</p>}

      {settings && (
        <p>
          Level:{' '}
          <select value={settings.deleLevel} onChange={(e) => updateLevel(e.target.value as DeleLevel)}>
            {DELE_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </p>
      )}

      {levelUpdateError && <p role="alert">{levelUpdateError}</p>}

      {settings?.nudge && !nudgeDismissed && (
        <div role="status">
          <p>
            {settings.nudge.reason} Move up to <strong>{settings.nudge.suggestedLevel}</strong>?
          </p>
          <button onClick={() => updateLevel(settings.nudge!.suggestedLevel)}>
            Update to {settings.nudge.suggestedLevel}
          </button>{' '}
          <button onClick={() => setNudgeDismissed(true)}>Not yet</button>
        </div>
      )}

      {view === 'history' && <HistoryView />}

      {view === 'write' && (
        <>
          <button onClick={handleGeneratePrompt} disabled={!settings}>
            Generate prompt
          </button>

          {!prompt && <p>Tap the button for a DELE-calibrated writing prompt.</p>}

          {prompt && (
            <>
              <p>
                <strong>Prompt:</strong> {prompt.text}
              </p>
              <textarea
                value={entryText}
                onChange={(e) => setEntryText(e.target.value)}
                onInput={(e) => autoGrowTextarea(e.currentTarget)}
                rows={6}
                style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
                placeholder="Escribe tu respuesta aquí..."
              />
              <button onClick={handleSubmit} disabled={status === 'grading' || !entryText.trim()}>
                {status === 'grading' ? 'Grading…' : 'Submit'}
              </button>
            </>
          )}

          {status === 'error' && <p role="alert">{errorMessage}</p>}

          {feedback && (
            <div className="writing-feedback">
              <div className="writing-feedback__prose">
                <h3>Feedback (Dra. Restrepo)</h3>
                <p>{feedback.feedback_prose}</p>
              </div>

              <div className="writing-feedback__corrected">
                <h4>Corrected text</h4>
                <p>{feedback.corrected_text}</p>
              </div>

              <div className="writing-diagnosis">
                <h4 className="writing-diagnosis__heading">Diagnosis by category</h4>
                {(() => {
                  const { withMistakes, allCorrect } = buildDiagnosis(feedback);
                  return (
                    <>
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
                    </>
                  );
                })()}
              </div>

              <div className="writing-feedback__stats">
                <div className="writing-stat">
                  <div className="writing-stat__label">Sophistication</div>
                  <div className="writing-stat__value">{feedback.sophistication.overall}/10</div>
                  <ul className="writing-stat__subscores">
                    {Object.entries(feedback.sophistication.subscores).map(([key, value]) => (
                      <li key={key}>
                        {formatSubscoreLabel(key as keyof typeof feedback.sophistication.subscores)}: {value}/10
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="writing-stat">
                  <div className="writing-stat__label">Estimated DELE level</div>
                  <div className="writing-stat__value">{feedback.dele_level_estimate}</div>
                </div>
              </div>

              {saveWarning && <p role="alert">{saveWarning}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default WritingTab;
