import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSettings, updateDeleLevel, getRecentDeleLevelEstimates } from '../src/shared/db/settings.js';
import { computeNudge, MIN_ENTRIES_FOR_NUDGE } from '../src/shared/settings/nudge.js';
import type { DeleLevel } from '../src/shared/prompts/writingPrompt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      const recentEstimates = await getRecentDeleLevelEstimates(MIN_ENTRIES_FOR_NUDGE);
      const nudge = computeNudge(settings.deleLevel, recentEstimates);
      res.status(200).json({ ...settings, nudge });
    } catch (err) {
      console.error('Settings fetch error:', err);
      res.status(500).json({ error: 'Failed to load settings. Check server logs.' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const deleLevel: DeleLevel | undefined = ['A2', 'B1', 'B2'].includes(req.body?.deleLevel)
      ? req.body.deleLevel
      : undefined;
    if (!deleLevel) {
      res.status(400).json({ error: 'deleLevel must be one of A2, B1, B2.' });
      return;
    }
    try {
      await updateDeleLevel(deleLevel);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Settings update error:', err);
      res.status(500).json({ error: 'Failed to update settings. Check server logs.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
}
