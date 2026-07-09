import { useState, type ChangeEvent } from 'react';

interface AnkiWeakItem {
  noteText: string;
  deckName: string;
  lapses: number;
  stability: number | null;
  retrievability: number | null;
  weak: boolean;
}

interface AnkiUploadProps {
  onPracticeWeakItems: (freeformText: string) => void;
}

function AnkiUpload({ onPracticeWeakItems }: AnkiUploadProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<AnkiWeakItem[]>([]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = reader.result as string;
        const dataBase64 = result.includes(',') ? result.split(',', 2)[1] : result;

        const res = await fetch('/api/anki-ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataBase64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to parse Anki export');
        setItems(data.items as AnkiWeakItem[]);
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
        setStatus('error');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Could not read the file.');
      setStatus('error');
    };
    reader.readAsDataURL(file);
  }

  function handlePracticeWeakItems() {
    const weakItems = items.filter((item) => item.weak);
    const terms = weakItems.map((item) => item.noteText).join(', ');
    onPracticeWeakItems(`Practice these weak Anki items: ${terms}`);
  }

  const weakCount = items.filter((item) => item.weak).length;

  return (
    <div className="workbook-anki-upload">
      <p>
        Upload an Anki <code>.colpkg</code> export (from desktop, without media — Anki's "Include media" checkbox
        unchecked) to find your weakest cards.
      </p>
      <input type="file" accept=".colpkg" onChange={handleFileChange} disabled={status === 'uploading'} />
      {status === 'uploading' && <p>Parsing…</p>}
      {status === 'error' && <p role="alert">{errorMessage}</p>}

      {status === 'ready' && (
        <>
          <p>
            {weakCount} weak item{weakCount === 1 ? '' : 's'} out of {items.length} total.
          </p>
          {weakCount > 0 && (
            <button onClick={handlePracticeWeakItems}>Practice this deck's weak items</button>
          )}
          <ul className="workbook-anki-upload__list">
            {items.map((item, i) => (
              <li key={i} className={item.weak ? 'workbook-anki-item--weak' : ''}>
                <span>{item.noteText}</span>
                <span className="workbook-anki-item__meta">
                  {item.deckName} · lapses: {item.lapses}
                  {item.retrievability !== null && ` · retrievability: ${Math.round(item.retrievability * 100)}%`}
                  {item.weak && ' · weak'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default AnkiUpload;
