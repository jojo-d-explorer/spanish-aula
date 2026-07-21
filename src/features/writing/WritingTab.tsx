import { useEffect, useState } from 'react';
import { generateWritingPrompt, type WritingPrompt, type DeleLevel, DELE_LEVEL_OPTIONS } from '../../shared/prompts/writingPrompt';
import type { ErrorCategory, ChainEntry } from '../../shared/grading/types';
import type { SettingsResponse } from '../../shared/settings/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';
import GradedEntryView from './GradedEntryView';
import RevisionEditor from '../revision/RevisionEditor';
import HistoryView from './history/HistoryView';
import './Writing.css';

interface WritingTabProps {
  onPracticeCategory: (category: ErrorCategory) => void;
}

function hasFlaggedErrors(entry: ChainEntry): boolean {
  return entry.accuracy.observations.some((o) => o.obligatory_context && !o.correct);
}

function chainHeading(index: number): string {
  return index === 0 ? 'Original' : `Revision ${index}`;
}

function WritingTab({ onPracticeCategory }: WritingTabProps) {
  const [view, setView] = useState<'write' | 'history'>('write');
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [levelUpdateError, setLevelUpdateError] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [entryText, setEntryText] = useState('');
  // index 0 = the original graded entry, index n = revision n — this single
  // chain is what makes "revision of a revision" and "both versions viewable
  // side by side" (PRD §9.2/§9.9) work without a fetch-by-id endpoint.
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [revising, setRevising] = useState(false);
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
    setChain([]);
    setRevising(false);
    setStatus('idle');
  }

  async function handleSubmit() {
    if (!settings) return;
    const textAtSubmit = entryText.trim();
    setStatus('grading');
    setErrorMessage('');
    setSaveWarning('');
    setChain([]);
    setRevising(false);
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryText: textAtSubmit,
          promptText: prompt?.text ?? '',
          dialect: settings.dialect,
          deleLevel: settings.deleLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Grading failed');
      setChain([{ ...data, text: textAtSubmit } as ChainEntry]);
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

  const latest = chain.length > 0 ? chain[chain.length - 1] : null;
  const canRevise = !!latest && latest.entryId != null && hasFlaggedErrors(latest);

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

          {chain.map((entry, i) => (
            <GradedEntryView key={i} entry={entry} heading={chainHeading(i)} onPracticeCategory={onPracticeCategory} />
          ))}

          {saveWarning && <p role="alert">{saveWarning}</p>}

          {latest && !revising && (
            <>
              {canRevise && <button onClick={() => setRevising(true)}>Revisar →</button>}
              {latest.entryId == null && <p role="alert">This entry wasn't saved, so it can't be revised.</p>}
            </>
          )}

          {revising && latest && settings && (
            <RevisionEditor
              parent={latest}
              dialect={settings.dialect}
              deleLevel={settings.deleLevel}
              onSaved={(revised) => {
                setChain((c) => [...c, revised]);
                setRevising(false);
              }}
              onCancel={() => setRevising(false)}
            />
          )}
        </>
      )}
    </section>
  );
}

export default WritingTab;
