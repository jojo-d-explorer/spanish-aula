import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchHistoryData } from '../src/shared/db/history.js';
import { computeTrends } from '../src/shared/history/trends.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const { observations, sophisticationRecords } = await fetchHistoryData();
    const trends = computeTrends(observations, sophisticationRecords);
    res.status(200).json(trends);
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ error: 'Failed to load history. Check server logs.' });
  }
}
