import { useState, type ReactNode } from 'react';
import type { ChainEntry, AccuracyObservation } from '../../shared/grading/types';
import type { DialectCode, DeleLevel } from '../../shared/prompts/writingPrompt';
import { formatCategoryLabel } from '../../shared/grading/categoryLabels';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';
import { locateExcerpts } from './excerptLocator';
import './Revision.css';

// PRD §9.3 — indirect feedback is the load-bearing design decision here:
// category only, never the correction, until an explicit reveal.
function MarkedOriginalText({
  text,
  observations,
  revealVisible,
}: {
  text: string;
  observations: AccuracyObservation[];
  revealVisible: boolean;
}) {
  const { located, unlocated } = locateExcerpts(text, observations);

  const pieces: ReactNode[] = [];
  let cursor = 0;
  located.forEach((m, i) => {
    if (m.start > cursor) pieces.push(text.slice(cursor, m.start));
    pieces.push(
      <mark key={i} className="revision-marker">
        <span className="revision-marker__text">{text.slice(m.start, m.end)}</span>
        <span className="revision-marker__category">{formatCategoryLabel(m.observation.category)}</span>
        {revealVisible && (
          <span className="revision-marker__reveal">
            → {m.observation.correction}
            {m.observation.note && <em> — {m.observation.note}</em>}
          </span>
        )}
      </mark>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) pieces.push(text.slice(cursor));

  return (
    <div className="revision-original">
      <p className="revision-original__text">{pieces}</p>
      {unlocated.length > 0 && (
        <ul className="revision-original__unlocated">
          {unlocated.map((o, i) => (
            <li key={i}>
              <span className="revision-marker__category">{formatCategoryLabel(o.category)}</span>
              {revealVisible && (
                <span className="revision-marker__reveal">
                  {' '}
                  → {o.correction}
                  {o.note && <em> — {o.note}</em>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RevisionEditorProps {
  parent: ChainEntry;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  onSaved: (revised: ChainEntry) => void;
  onCancel: () => void;
}

function RevisionEditor({ parent, dialect, deleLevel, onSaved, onCancel }: RevisionEditorProps) {
  const flagged = parent.accuracy.observations.filter((o) => o.obligatory_context && !o.correct);
  const [revisionText, setRevisionText] = useState(parent.text);
  const [revealVisible, setRevealVisible] = useState(false);
  // Sticky true once toggled on — PRD §9.3: what's recorded is *whether* the
  // reveal was used during this revision, not its on/off state at submit time.
  const [everRevealed, setEverRevealed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'grading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function toggleReveal() {
    setRevealVisible((v) => !v);
    setEverRevealed(true);
  }

  async function handleSubmit() {
    if (!parent.entryId) {
      setErrorMessage('This entry was not saved, so it cannot be revised.');
      setStatus('error');
      return;
    }
    setStatus('grading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryText: revisionText,
          parentEntryId: parent.entryId,
          dialect,
          deleLevel,
          revealedCorrections: everRevealed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Revision grading failed');
      onSaved({ ...data, text: revisionText } as ChainEntry);
      setStatus('idle');
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <div className="revision-editor">
      <h3>Revisar</h3>
      <p className="revision-editor__hint">
        Fix the flagged errors below by rewriting — the corrections stay hidden until you ask for them.
      </p>

      <MarkedOriginalText text={parent.text} observations={flagged} revealVisible={revealVisible} />

      <button type="button" className="revision-reveal-toggle" onClick={toggleReveal}>
        {revealVisible ? 'Ocultar correcciones' : 'Ver correcciones'}
      </button>

      <textarea
        value={revisionText}
        onChange={(e) => setRevisionText(e.target.value)}
        onInput={(e) => autoGrowTextarea(e.currentTarget)}
        rows={6}
        style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
      />

      <div className="revision-editor__actions">
        <button onClick={handleSubmit} disabled={status === 'grading' || !revisionText.trim()}>
          {status === 'grading' ? 'Grading…' : 'Submit revision'}
        </button>{' '}
        <button onClick={onCancel} disabled={status === 'grading'}>
          Cancel
        </button>
      </div>

      {status === 'error' && <p role="alert">{errorMessage}</p>}
    </div>
  );
}

export default RevisionEditor;
