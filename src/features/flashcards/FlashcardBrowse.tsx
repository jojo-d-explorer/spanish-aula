import { useCallback, useEffect, useState } from 'react';
import type { FlashcardRecord } from '../../shared/flashcards/types';
import { NOTE_TYPES, DECK_LABELS, type AnkiNoteType } from '../../shared/flashcards/ankiSchema';

type ViewFilter = 'draft' | 'confirmed' | 'rejected';

interface ConfirmedGroup {
  deck: string;
  noteType: string;
  cards: FlashcardRecord[];
}

function groupConfirmed(cards: FlashcardRecord[]): ConfirmedGroup[] {
  const groups = new Map<string, ConfirmedGroup>();
  for (const card of cards) {
    if (!card.deck || !card.noteType) continue;
    const key = `${card.deck}::${card.noteType}`;
    const existing = groups.get(key);
    if (existing) existing.cards.push(card);
    else groups.set(key, { deck: card.deck, noteType: card.noteType, cards: [card] });
  }
  return [...groups.values()];
}

// Conjugation fields use literal "<br>" per docs/ANKI_SCHEMA.md §2.1 (Anki's
// own #html:true import expects it) — rendered as a real line break here via
// CSS white-space, not dangerouslySetInnerHTML, since this is LLM-generated
// text, not markup we should trust blindly.
function fieldDisplayText(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n');
}

function FlashcardBrowse() {
  const [filter, setFilter] = useState<ViewFilter>('draft');
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionError, setActionError] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'error'>('idle');
  const [exportError, setExportError] = useState('');

  const load = useCallback((f: ViewFilter) => {
    setStatus('loading');
    fetch(`/api/flashcards?status=${f}`)
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
    load(filter);
  }, [filter, load]);

  function markBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleConfirm(id: string) {
    markBusy(id, true);
    setActionError('');
    try {
      const res = await fetch('/api/flashcards?confirm=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to confirm');
      load(filter);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      markBusy(id, false);
    }
  }

  async function handleReject(id: string) {
    markBusy(id, true);
    setActionError('');
    try {
      const res = await fetch('/api/flashcards?reject=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to reject');
      load(filter);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      markBusy(id, false);
    }
  }

  async function handleUpdate(id: string, updates: { noteType?: AnkiNoteType; deck?: string }) {
    markBusy(id, true);
    setActionError('');
    try {
      const res = await fetch(`/api/flashcards?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update');
      load(filter);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      markBusy(id, false);
    }
  }

  async function handleRegenerate(card: FlashcardRecord) {
    markBusy(card.id, true);
    setActionError('');
    try {
      const rejectRes = await fetch('/api/flashcards?reject=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [card.id] }),
      });
      if (!rejectRes.ok) throw new Error('Failed to clear the old draft before regenerating');

      const genRes = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: card.source,
          // sourceDate is null here since the original capture date isn't
          // persisted on flashcards rows — a regenerated card's leccion::
          // tag will be omitted rather than guessed. Known gap: worth a
          // source_date column later if this turns out to matter.
          items: [{ sourceNote: card.sourceNote, sourceWordBankId: card.sourceWordBankId, sourceDate: null }],
          dialect: card.dialect,
          deleLevel: card.deleLevelAtCreation,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? 'Failed to regenerate');
      load(filter);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      markBusy(card.id, false);
    }
  }

  async function handleExportGroup(deck: string, noteType: string) {
    setExportStatus('exporting');
    setExportError('');
    try {
      const res = await fetch(`/api/flashcards?export=1&deck=${encodeURIComponent(deck)}&noteType=${encodeURIComponent(noteType)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to export');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${deck.replace(/[^a-z0-9]+/gi, '_')}_${noteType.replace(/[^a-z0-9]+/gi, '_')}.tsv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus('idle');
      load(filter);
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : 'Something went wrong.');
      setExportStatus('error');
    }
  }

  const confirmedGroups = filter === 'confirmed' ? groupConfirmed(flashcards) : [];

  return (
    <div className="flashcards-browse">
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setFilter('draft')} disabled={filter === 'draft'}>
          Draft
        </button>{' '}
        <button onClick={() => setFilter('confirmed')} disabled={filter === 'confirmed'}>
          Confirmed
        </button>{' '}
        <button onClick={() => setFilter('rejected')} disabled={filter === 'rejected'}>
          Rejected
        </button>
      </div>

      {actionError && <p role="alert">{actionError}</p>}
      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p role="alert">Could not load flashcards.</p>}
      {status === 'ready' && flashcards.length === 0 && <p>Nothing here yet.</p>}

      {status === 'ready' && filter === 'draft' && (
        <ul className="flashcards-list">
          {flashcards.map((card) => (
            <li key={card.id} className={`flashcards-card ${card.outOfScope ? 'flashcards-card--out-of-scope' : ''}`}>
              <div className="flashcards-card__term">{card.term}</div>

              {card.outOfScope ? (
                <>
                  <p className="flashcards-card__meta">Flagged — not vocabulary: {card.outOfScopeReason}</p>
                  <button onClick={() => handleReject(card.id)} disabled={busyIds.has(card.id)}>
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <div className="flashcards-card__editrow">
                    <label>
                      Note type
                      <select
                        value={card.noteType ?? ''}
                        onChange={(e) => handleUpdate(card.id, { noteType: e.target.value as AnkiNoteType })}
                        disabled={busyIds.has(card.id)}
                      >
                        {NOTE_TYPES.map((nt) => (
                          <option key={nt} value={nt}>
                            {nt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Deck
                      <select
                        value={card.deck ?? ''}
                        onChange={(e) => handleUpdate(card.id, { deck: e.target.value })}
                        disabled={busyIds.has(card.id)}
                      >
                        {DECK_LABELS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flashcards-card__fields">
                    {card.fields &&
                      Object.entries(card.fields)
                        .filter(([, value]) => value)
                        .map(([key, value]) => (
                          <div key={key} className="flashcards-card__field">
                            <strong>{key}:</strong> <span className="flashcards-card__fieldvalue">{fieldDisplayText(value)}</span>
                          </div>
                        ))}
                  </div>

                  <p className="flashcards-card__meta">Tags: {card.tags.length > 0 ? card.tags.join(', ') : '(none)'}</p>

                  <button onClick={() => handleConfirm(card.id)} disabled={busyIds.has(card.id)}>
                    Confirm
                  </button>{' '}
                  <button onClick={() => handleReject(card.id)} disabled={busyIds.has(card.id)}>
                    Reject
                  </button>{' '}
                  <button onClick={() => handleRegenerate(card)} disabled={busyIds.has(card.id)}>
                    {busyIds.has(card.id) ? 'Working…' : 'Regenerate'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && filter === 'confirmed' && (
        <>
          {exportError && <p role="alert">{exportError}</p>}
          <ul className="flashcards-list">
            {confirmedGroups.map((group) => (
              <li key={`${group.deck}::${group.noteType}`} className="flashcards-card">
                <div className="flashcards-card__term">
                  {group.deck} — {group.noteType}
                </div>
                <p className="flashcards-card__meta">
                  {group.cards.length} card{group.cards.length === 1 ? '' : 's'}
                </p>
                <button
                  onClick={() => handleExportGroup(group.deck, group.noteType)}
                  disabled={exportStatus === 'exporting'}
                >
                  {exportStatus === 'exporting' ? 'Exporting…' : `Export this deck (${group.cards.length})`}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {status === 'ready' && filter === 'rejected' && (
        <ul className="flashcards-list">
          {flashcards.map((card) => (
            <li key={card.id} className="flashcards-card flashcards-card--rejected">
              <div className="flashcards-card__term">{card.term}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default FlashcardBrowse;
