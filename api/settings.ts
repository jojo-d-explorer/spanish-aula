import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSettings, updateDeleLevel, getRecentDeleLevelEstimates } from '../src/shared/db/settings.js';
import { computeNudge, MIN_ENTRIES_FOR_NUDGE } from '../src/shared/settings/nudge.js';
import { isDeleLevel, DELE_LEVEL_OPTIONS } from '../src/shared/prompts/writingPrompt.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Independent reads — run in parallel, but isolate failures: settings
    // is load-bearing, the nudge is a nice-to-have on top of it (mirrors the
    // persistence-failure pattern in api/grade.ts).
    const [settingsResult, estimatesResult] = await Promise.allSettled([
      getSettings(),
      getRecentDeleLevelEstimates(MIN_ENTRIES_FOR_NUDGE),
    ]);

    if (settingsResult.status === 'rejected') {
      console.error('Settings fetch error:', settingsResult.reason);
      res.status(500).json({ error: 'Failed to load settings. Check server logs.' });
      return;
    }

    let nudge = null;
    if (estimatesResult.status === 'fulfilled') {
      nudge = computeNudge(settingsResult.value.deleLevel, estimatesResult.value);
    } else {
      console.error('Nudge computation error:', estimatesResult.reason);
    }

    res.status(200).json({ ...settingsResult.value, nudge });
    return;
  }

  if (req.method === 'PATCH') {
    const deleLevel = isDeleLevel(req.body?.deleLevel) ? req.body.deleLevel : undefined;
    if (!deleLevel) {
      res.status(400).json({ error: `deleLevel must be one of ${DELE_LEVEL_OPTIONS.join(', ')}.` });
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
