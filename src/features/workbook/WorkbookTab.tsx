import { useCallback, useEffect, useState } from 'react';
import type { SettingsResponse } from '../../shared/settings/types';
import type { ErrorCategory } from '../../shared/grading/types';
import type { WorkbookSession, WorkbookGradeResponse } from '../../shared/workbook/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';
import ExerciseSession from './ExerciseSession';
import ResultsView from './ResultsView';
import AnkiUpload from './AnkiUpload';
import './Workbook.css';

interface WorkbookTabProps {
  seed: { category: ErrorCategory } | null;
  onSeedConsumed: () => void;
}

function WorkbookTab({ seed, onSeedConsumed }: WorkbookTabProps) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [view, setView] = useState<'source' | 'session' | 'results' | 'anki'>('source');
  const [requestText, setRequestText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<WorkbookSession | null>(null);
  const [gradeResponse, setGradeResponse] = useState<WorkbookGradeResponse | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load settings');
        setSettings(data as SettingsResponse);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        setSettingsError('Could not load your level settings — try reloading the page.');
      });
  }, []);

  const generateSession = useCallback(
    async (source: { kind: 'auto'; categoryOverride?: ErrorCategory } | { kind: 'freeform'; requestText: string }) => {
      if (!settings) return;
      setStatus('submitting');
      setErrorMessage('');
      try {
        const res = await fetch('/api/workbook-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dialect: settings.dialect, deleLevel: settings.deleLevel, source }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to generate a session');
        setSession(data.session as WorkbookSession);
        setGradeResponse(null);
        setStatus('idle');
        setView('session');
      } catch (err) {
        console.error(err);
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
        setStatus('error');
      }
    },
    [settings],
  );

  // Consume the deep-link seed exactly once: fire an auto session targeting
  // the seeded category, then clear it so navigating away and back doesn't
  // re-trigger generation.
  useEffect(() => {
    if (!seed || !settings) return;
    generateSession({ kind: 'auto', categoryOverride: seed.category });
    onSeedConsumed();
  }, [seed, settings, generateSession, onSeedConsumed]);

  function handleFreeformSubmit() {
    if (!requestText.trim()) return;
    generateSession({ kind: 'freeform', requestText: requestText.trim() });
    setRequestText('');
  }

  function handlePracticeWeakItems(freeformText: string) {
    generateSession({ kind: 'freeform', requestText: freeformText });
  }

  function handleGraded(response: WorkbookGradeResponse) {
    setGradeResponse(response);
    setView('results');
  }

  function handleNewSession() {
    setSession(null);
    setGradeResponse(null);
    setView('source');
  }

  return (
    <section className="workbook-tab">
      <h2>Workbook</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setView('source')} disabled={view === 'source'}>
          New session
        </button>{' '}
        <button onClick={() => setView('anki')} disabled={view === 'anki'}>
          Anki upload
        </button>
      </div>

      {settingsError && <p role="alert">{settingsError}</p>}

      {view === 'anki' && <AnkiUpload onPracticeWeakItems={handlePracticeWeakItems} />}

      {view === 'session' && session && <ExerciseSession session={session} onGraded={handleGraded} />}

      {view === 'results' && gradeResponse && session && (
        <ResultsView response={gradeResponse} session={session} onNewSession={handleNewSession} />
      )}

      {view === 'source' && (
        <>
          <p>Practice exercises targeting your weak categories, or ask for something specific.</p>
          <button onClick={() => generateSession({ kind: 'auto' })} disabled={!settings || status === 'submitting'}>
            {status === 'submitting' ? 'Starting…' : 'Auto (from a weak category)'}
          </button>

          <p style={{ marginTop: 16 }}>Or describe what you want to practice:</p>
          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            onInput={(e) => autoGrowTextarea(e.currentTarget)}
            rows={3}
            style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
            placeholder="p. ej. Quiero practicar el pretérito, o: ayúdame con ser y estar"
          />
          <button
            onClick={handleFreeformSubmit}
            disabled={!settings || status === 'submitting' || !requestText.trim()}
          >
            {status === 'submitting' ? 'Starting…' : 'Start session'}
          </button>

          {status === 'error' && <p role="alert">{errorMessage}</p>}
        </>
      )}
    </section>
  );
}

export default WorkbookTab;
