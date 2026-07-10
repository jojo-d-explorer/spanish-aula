import { useEffect, useState, type ChangeEvent } from 'react';
import type { DialectCode, DeleLevel } from '../../shared/prompts/writingPrompt';

interface WordBankEntry {
  id: string;
  term: string;
  contextSentence: string | null;
}

interface AnkiWeakItem {
  noteText: string;
  deckName: string;
  weak: boolean;
}

interface FlashcardGenerateProps {
  dialect: DialectCode;
  deleLevel: DeleLevel;
  onGenerated: () => void;
}

function FlashcardGenerate({ dialect, deleLevel, onGenerated }: FlashcardGenerateProps) {
  const [wordBankEntries, setWordBankEntries] = useState<WordBankEntry[]>([]);
  const [wordBankStatus, setWordBankStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedWordBankIds, setSelectedWordBankIds] = useState<Set<string>>(new Set());

  const [ankiItems, setAnkiItems] = useState<AnkiWeakItem[]>([]);
  const [ankiUploadStatus, setAnkiUploadStatus] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [ankiErrorMessage, setAnkiErrorMessage] = useState('');
  const [selectedAnkiTerms, setSelectedAnkiTerms] = useState<Set<string>>(new Set());

  const [genStatus, setGenStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [genErrorMessage, setGenErrorMessage] = useState('');

  useEffect(() => {
    fetch('/api/word-bank')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load Word Bank');
        setWordBankEntries(data.entries as WordBankEntry[]);
        setWordBankStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        setWordBankStatus('error');
      });
  }, []);

  function toggleWordBank(id: string) {
    setSelectedWordBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAnkiTerm(noteText: string) {
    setSelectedAnkiTerms((prev) => {
      const next = new Set(prev);
      if (next.has(noteText)) next.delete(noteText);
      else next.add(noteText);
      return next;
    });
  }

  function handleAnkiFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnkiUploadStatus('uploading');
    setAnkiErrorMessage('');

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
        setAnkiItems((data.items as AnkiWeakItem[]).filter((item) => item.weak));
        setAnkiUploadStatus('ready');
      } catch (err) {
        console.error(err);
        setAnkiErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
        setAnkiUploadStatus('error');
      }
    };
    reader.onerror = () => {
      setAnkiErrorMessage('Could not read the file.');
      setAnkiUploadStatus('error');
    };
    reader.readAsDataURL(file);
  }

  async function generate(
    source: 'word_bank' | 'anki_weak_item',
    items: { sourceNote: string; sourceWordBankId: string | null }[],
  ) {
    if (items.length === 0) return;
    setGenStatus('generating');
    setGenErrorMessage('');
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, items, dialect, deleLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate flashcards');
      setGenStatus('idle');
      onGenerated();
    } catch (err) {
      console.error(err);
      setGenErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setGenStatus('error');
    }
  }

  function handleGenerateFromWordBank() {
    const items = wordBankEntries
      .filter((entry) => selectedWordBankIds.has(entry.id))
      .map((entry) => ({ sourceNote: entry.term, sourceWordBankId: entry.id }));
    generate('word_bank', items);
  }

  function handleGenerateFromAnki() {
    const items = ankiItems
      .filter((item) => selectedAnkiTerms.has(item.noteText))
      .map((item) => ({ sourceNote: item.noteText, sourceWordBankId: null }));
    generate('anki_weak_item', items);
  }

  return (
    <div className="flashcards-generate">
      <div className="flashcards-generate__section">
        <h3>From Word Bank</h3>
        {wordBankStatus === 'loading' && <p>Loading Word Bank…</p>}
        {wordBankStatus === 'error' && <p role="alert">Could not load Word Bank.</p>}
        {wordBankStatus === 'ready' && wordBankEntries.length === 0 && <p>No Word Bank entries yet.</p>}
        {wordBankStatus === 'ready' && wordBankEntries.length > 0 && (
          <>
            <ul className="flashcards-source-list">
              {wordBankEntries.map((entry) => (
                <li key={entry.id}>
                  <label className="flashcards-source-item">
                    <input
                      type="checkbox"
                      checked={selectedWordBankIds.has(entry.id)}
                      onChange={() => toggleWordBank(entry.id)}
                    />
                    <span>
                      <strong>{entry.term}</strong>
                      {entry.contextSentence && (
                        <span className="flashcards-source-item__meta"> — {entry.contextSentence}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              onClick={handleGenerateFromWordBank}
              disabled={selectedWordBankIds.size === 0 || genStatus === 'generating'}
            >
              {genStatus === 'generating' ? 'Generating…' : `Generate from ${selectedWordBankIds.size} selected`}
            </button>
          </>
        )}
      </div>

      <div className="flashcards-generate__section">
        <h3>From Anki weak items</h3>
        <p>
          Upload an Anki <code>.colpkg</code> export (from desktop, without media — Anki's "Include media" checkbox
          unchecked) to find weak cards to turn into flashcards.
        </p>
        <input
          type="file"
          accept=".colpkg"
          onChange={handleAnkiFileChange}
          disabled={ankiUploadStatus === 'uploading'}
        />
        {ankiUploadStatus === 'uploading' && <p>Parsing…</p>}
        {ankiUploadStatus === 'error' && <p role="alert">{ankiErrorMessage}</p>}
        {ankiUploadStatus === 'ready' && ankiItems.length === 0 && <p>No weak items found in this deck.</p>}
        {ankiUploadStatus === 'ready' && ankiItems.length > 0 && (
          <>
            <ul className="flashcards-source-list">
              {ankiItems.map((item) => (
                <li key={item.noteText}>
                  <label className="flashcards-source-item">
                    <input
                      type="checkbox"
                      checked={selectedAnkiTerms.has(item.noteText)}
                      onChange={() => toggleAnkiTerm(item.noteText)}
                    />
                    <span>
                      <strong>{item.noteText}</strong>
                      <span className="flashcards-source-item__meta"> — {item.deckName}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              onClick={handleGenerateFromAnki}
              disabled={selectedAnkiTerms.size === 0 || genStatus === 'generating'}
            >
              {genStatus === 'generating' ? 'Generating…' : `Generate from ${selectedAnkiTerms.size} selected`}
            </button>
          </>
        )}
      </div>

      {genStatus === 'error' && <p role="alert">{genErrorMessage}</p>}
    </div>
  );
}

export default FlashcardGenerate;
