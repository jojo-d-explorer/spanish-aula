import { useEffect, useState } from 'react';
import type { SettingsResponse } from '../../shared/settings/types';
import type { ErrorCategory } from '../../shared/grading/types';
import type { LessonMessage } from '../../shared/lessons/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';
import ThreadView from './ThreadView';
import LessonLogView from './LessonLogView';
import './Lessons.css';

interface UnsavedThread {
  messages: LessonMessage[];
  persistError: string;
}

interface LessonsTabProps {
  onPracticeCategory: (category: ErrorCategory) => void;
}

function LessonsTab({ onPracticeCategory }: LessonsTabProps) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [view, setView] = useState<'new' | 'thread' | 'log'>('new');
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [requestText, setRequestText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [unsavedThread, setUnsavedThread] = useState<UnsavedThread | null>(null);

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

  async function handleSubmit() {
    if (!settings || !requestText.trim()) return;
    setStatus('submitting');
    setErrorMessage('');
    setUnsavedThread(null);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestText: requestText.trim(),
          dialect: settings.dialect,
          deleLevel: settings.deleLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start lesson');
      setRequestText('');
      setStatus('idle');
      if (data.lessonId) {
        setActiveLessonId(data.lessonId as string);
        setView('thread');
      } else {
        // Persistence failed, but the reply was already generated — show it
        // read-only rather than losing the tokens already spent on it.
        setUnsavedThread({
          messages: data.messages as LessonMessage[],
          persistError: data.persistError ?? 'Lesson could not be saved.',
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  function handleOpenThread(lessonId: string) {
    setActiveLessonId(lessonId);
    setView('thread');
  }

  return (
    <section className="lessons-tab">
      <h2>Lessons</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setView('new')} disabled={view === 'new'}>
          New lesson
        </button>{' '}
        <button onClick={() => setView('log')} disabled={view === 'log'}>
          Past lessons
        </button>
      </div>

      {settingsError && <p role="alert">{settingsError}</p>}

      {view === 'log' && <LessonLogView onOpenThread={handleOpenThread} />}

      {view === 'thread' && activeLessonId && (
        <ThreadView lessonId={activeLessonId} onPracticeCategory={onPracticeCategory} />
      )}

      {view === 'new' && (
        <>
          <p>
            What would you like a lesson on? Ask about a grammar point, or a specific word or phrase you're stuck
            on.
          </p>
          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            onInput={(e) => autoGrowTextarea(e.currentTarget)}
            rows={3}
            style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
            placeholder="p. ej. Explícame cuándo usar el subjuntivo, o: no entiendo bien 'dejar'"
          />
          <button onClick={handleSubmit} disabled={!settings || status === 'submitting' || !requestText.trim()}>
            {status === 'submitting' ? 'Starting…' : 'Start lesson'}
          </button>

          {status === 'error' && <p role="alert">{errorMessage}</p>}

          {unsavedThread && (
            <div className="lesson-thread lesson-thread--unsaved">
              <p role="alert">{unsavedThread.persistError}</p>
              {unsavedThread.messages.map((message) => (
                <div key={message.id} className={`lesson-msg lesson-msg--${message.role}`}>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default LessonsTab;
