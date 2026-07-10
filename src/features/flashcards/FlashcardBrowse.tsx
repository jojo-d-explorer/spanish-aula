import { useCallback, useEffect, useState } from 'react';
import type { FlashcardRecord } from '../../shared/flashcards/types';

interface FlashcardBrowseProps {
  refreshKey: number;
}

function FlashcardBrowse({ refreshKey }: FlashcardBrowseProps) {
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'error'>('idle');
  const [exportError, setExportError] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    fetch('/api/flashcards')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load flashcards');
        setFlashcards(data.flashcards as FlashcardRecord[]);
        setStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [refreshKey, load]);

  async function handleExport() {
    setExportStatus('exporting');
    setExportError('');
    try {
      const res = await fetch('/api/flashcards-export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to export flashcards');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aula-flashcards.tsv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus('idle');
      load();
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : 'Something went wrong.');
      setExportStatus('error');
    }
  }

  if (status === 'loading') return <p>Loading flashcards…</p>;
  if (status === 'error') return <p role="alert">Could not load flashcards.</p>;

  const pendingCount = flashcards.filter((card) => card.dedupStatus === 'pending').length;

  return (
    <div className="flashcards-browse">
      {flashcards.length === 0 && <p>No flashcards yet — generate some above.</p>}

      {flashcards.length > 0 && (
        <>
          <button onClick={handleExport} disabled={pendingCount === 0 || exportStatus === 'exporting'}>
            {exportStatus === 'exporting' ? 'Exporting…' : `Export ${pendingCount} pending as TSV`}
          </button>
          {exportStatus === 'error' && <p role="alert">{exportError}</p>}

          <ul className="flashcards-list">
            {flashcards.map((card) => (
              <li key={card.id} className={`flashcards-card flashcards-card--${card.dedupStatus}`}>
                <div className="flashcards-card__term">{card.term}</div>
                <div className="flashcards-card__translation">{card.translation}</div>
                <div className="flashcards-card__example">{card.exampleSentence}</div>
                <div className="flashcards-card__meta">
                  {card.dedupStatus} · {card.source === 'word_bank' ? 'Word Bank' : 'Anki weak item'}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default FlashcardBrowse;
