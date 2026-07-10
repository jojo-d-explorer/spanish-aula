import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFlashcards } from '../src/shared/db/flashcards.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const flashcards = await listFlashcards();
    res.status(200).json({ flashcards });
  } catch (err) {
    console.error('Flashcard list error:', err);
    res.status(500).json({ error: 'Failed to load flashcards. Check server logs.' });
  }
}
