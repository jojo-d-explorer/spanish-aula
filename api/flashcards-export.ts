import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFlashcards, markFlashcardsExported, markWordBankExported } from '../src/shared/db/flashcards.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

// TSV-only this phase (PRD §14.5) — no header row, so it matches Anki's
// plain "Notes in Plain Text (.txt)" import expectations directly. Tabs and
// newlines inside a field would break the format, so they're stripped —
// none of term/translation/example_sentence should legitimately contain
// either, but a stray one from generation shouldn't corrupt the file.
function tsvField(value: string): string {
  return value.replace(/[\t\n\r]+/g, ' ').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const all = await listFlashcards();
    const pending = all.filter((card) => card.dedupStatus === 'pending');

    if (pending.length === 0) {
      res.status(422).json({ error: 'No pending flashcards to export — generate some first.' });
      return;
    }

    const tsv = pending
      .map((card) => [tsvField(card.term), tsvField(card.translation), tsvField(card.exampleSentence)].join('\t'))
      .join('\n');

    const wordBankIds = pending
      .map((card) => card.sourceWordBankId)
      .filter((id): id is string => id !== null);

    await markFlashcardsExported(pending.map((card) => card.id));
    await markWordBankExported(wordBankIds);

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aula-flashcards.tsv"');
    res.status(200).send(tsv);
  } catch (err) {
    console.error('Flashcard export error:', err);
    res.status(500).json({ error: 'Failed to export flashcards. Check server logs.' });
  }
}
