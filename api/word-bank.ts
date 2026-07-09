import type { VercelRequest, VercelResponse } from '@vercel/node';
import { persistWordBankEntry } from '../src/shared/db/wordBank.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const term = typeof req.body?.term === 'string' ? req.body.term.trim() : '';
  const contextSentence = typeof req.body?.contextSentence === 'string' ? req.body.contextSentence.trim() : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const sourceTab = typeof req.body?.sourceTab === 'string' ? req.body.sourceTab.trim() : 'unknown';

  if (!term) {
    res.status(400).json({ error: 'term is required.' });
    return;
  }

  try {
    const id = await persistWordBankEntry({
      term,
      contextSentence: contextSentence || undefined,
      note: note || undefined,
      sourceTab,
    });
    res.status(200).json({ id });
  } catch (err) {
    console.error('Word Bank persistence error:', err);
    res.status(500).json({ error: 'Failed to save word. Check server logs.' });
  }
}
