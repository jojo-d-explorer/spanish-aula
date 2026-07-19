import { useState } from 'react';
import './WordBankCapture.css';

interface WordBankCaptureProps {
  sourceTab: string;
}

function WordBankCapture({ sourceTab }: WordBankCaptureProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [contextSentence, setContextSentence] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function reset() {
    setTerm('');
    setContextSentence('');
    setNote('');
    setStatus('idle');
    setErrorMessage('');
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  async function handleSave() {
    if (!term.trim()) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const res = await fetch('/api/word-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: term.trim(),
          contextSentence: contextSentence.trim(),
          note: note.trim(),
          sourceTab,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save word');
      setStatus('saved');
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 800);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  if (!open) {
    return (
      <button className="word-bank-fab" onClick={() => setOpen(true)} aria-label="Add word to Word Bank">
        + Word
      </button>
    );
  }

  return (
    <div className="word-bank-panel" role="dialog" aria-label="Add to Word Bank">
      <div className="word-bank-panel__header">
        <strong>Add to Word Bank</strong>
        <button className="word-bank-panel__close" onClick={handleClose} aria-label="Close">
          ×
        </button>
      </div>
      <label className="word-bank-field">
        Word or phrase
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="p. ej. madrugar"
          autoFocus
        />
      </label>
      <label className="word-bank-field">
        Context sentence (optional)
        <input
          type="text"
          value={contextSentence}
          onChange={(e) => setContextSentence(e.target.value)}
          placeholder="Tuve que madrugar para llegar a tiempo."
        />
      </label>
      <label className="word-bank-field">
        Note (optional)
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {status === 'error' && <p role="alert">{errorMessage}</p>}
      {status === 'saved' && <p role="status">Saved!</p>}
      <button onClick={handleSave} disabled={status === 'saving' || !term.trim()}>
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default WordBankCapture;
