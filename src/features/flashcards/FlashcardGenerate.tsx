import { useEffect, useState, type ChangeEvent } from 'react';
import type { DialectCode, DeleLevel } from '../../shared/prompts/writingPrompt';
import type { FlashcardGenerateResponse, FlashcardSourceItem } from '../../shared/flashcards/types';

interface WordBankEntry {
  id: string;
  term: string;
  contextSentence: string | null;
  createdAt: string;
}

interface AnkiItem {
  noteText: string;
  deckName: string;
  weak: boolean;
}

interface GenerateSummary {
  generatedCount: number;
  outOfScopeCount: number;
  alreadyKnownCount: number;
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

  // Kept unfiltered — seeding known_cards needs every card, not just weak
  // ones (docs/ANKI_SCHEMA.md §7).
  const [ankiAllItems, setAnkiAllItems] = useState<AnkiItem[]>([]);
  const [ankiUploadStatus, setAnkiUploadStatus] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [ankiErrorMessage, setAnkiErrorMessage] = useState('');
  const [selectedAnkiTerms, setSelectedAnkiTerms] = useState<Set<string>>(new Set());

  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'error'>('idle');
  const [seedMessage, setSeedMessage] = useState('');

  const [genStatus, setGenStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [genErrorMessage, setGenErrorMessage] = useState('');
  const [genSummary, setGenSummary] = useState<GenerateSummary | null>(null);

  const ankiWeakItems = ankiAllItems.filter((item) => item.weak);

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
    setSeedMessage('');

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
        setAnkiAllItems(data.items as AnkiItem[]);
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

  async function handleSeed() {
    if (ankiAllItems.length === 0) return;
    setSeedStatus('seeding');
    setSeedMessage('');
    try {
      const res = await fetch('/api/flashcards?seed=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ankiAllItems.map((item) => ({ noteText: item.noteText, deckName: item.deckName })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to seed dedup ledger');
      setSeedMessage(`Seeded ${data.seededCount} new terms (${data.skippedCount} already known).`);
      setSeedStatus('idle');
    } catch (err) {
      console.error(err);
      setSeedMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setSeedStatus('error');
    }
  }

  async function generate(source: 'word_bank' | 'anki_weak_item', items: FlashcardSourceItem[]) {
    if (items.length === 0) return;
    setGenStatus('generating');
    setGenErrorMessage('');
    setGenSummary(null);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, items, dialect, deleLevel }),
      });
      const data: FlashcardGenerateResponse = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? 'Failed to generate flashcards');

      const outOfScopeCount = data.drafts.filter((d) => d.outOfScope).length;
      setGenSummary({
        generatedCount: data.drafts.length - outOfScopeCount,
        outOfScopeCount,
        alreadyKnownCount: data.alreadyKnown.length,
      });
      setGenStatus('idle');
    } catch (err) {
      console.error(err);
      setGenErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setGenStatus('error');
    }
  }

  function handleGenerateFromWordBank() {
    const items: FlashcardSourceItem[] = wordBankEntries
      .filter((entry) => selectedWordBankIds.has(entry.id))
      .map((entry) => ({
        sourceNote: entry.term,
        sourceWordBankId: entry.id,
        // Real capture date for the leccion:: tag (docs/ANKI_SCHEMA.md §4)
        // — never invent one for terms where this isn't available.
        sourceDate: entry.createdAt.slice(0, 10),
      }));
    generate('word_bank', items);
  }

  function handleGenerateFromAnki() {
    // No per-card date available from Anki's weak-item output — the
    // generator omits the leccion:: tag rather than guessing.
    const items: FlashcardSourceItem[] = ankiWeakItems
      .filter((item) => selectedAnkiTerms.has(item.noteText))
      .map((item) => ({ sourceNote: item.noteText, sourceWordBankId: null, sourceDate: null }));
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
          unchecked). Use it to find weak cards to turn into flashcards, and/or to seed the dedup ledger from your
          full deck so Aula knows what you already have.
        </p>
        <input
          type="file"
          accept=".colpkg"
          onChange={handleAnkiFileChange}
          disabled={ankiUploadStatus === 'uploading'}
        />
        {ankiUploadStatus === 'uploading' && <p>Parsing…</p>}
        {ankiUploadStatus === 'error' && <p role="alert">{ankiErrorMessage}</p>}
        {ankiUploadStatus === 'ready' && (
          <>
            <p>
              {ankiAllItems.length} cards found, {ankiWeakItems.length} flagged weak.{' '}
              <button onClick={handleSeed} disabled={seedStatus === 'seeding'}>
                {seedStatus === 'seeding' ? 'Seeding…' : 'Seed dedup ledger from this export'}
              </button>
            </p>
            {seedMessage && <p role={seedStatus === 'error' ? 'alert' : 'status'}>{seedMessage}</p>}
          </>
        )}
        {ankiUploadStatus === 'ready' && ankiWeakItems.length === 0 && <p>No weak items found in this deck.</p>}
        {ankiUploadStatus === 'ready' && ankiWeakItems.length > 0 && (
          <>
            <ul className="flashcards-source-list">
              {ankiWeakItems.map((item) => (
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

      {genSummary && (
        <div className="flashcards-gen-summary" role="status">
          <p>
            {genSummary.generatedCount} card{genSummary.generatedCount === 1 ? '' : 's'} generated
            {genSummary.outOfScopeCount > 0 && `, ${genSummary.outOfScopeCount} flagged as grammar (not vocabulary)`}
            {genSummary.alreadyKnownCount > 0 && `, ${genSummary.alreadyKnownCount} already in your deck (skipped)`}.
          </p>
          <button onClick={onGenerated}>Review drafts →</button>
        </div>
      )}
    </div>
  );
}

export default FlashcardGenerate;
