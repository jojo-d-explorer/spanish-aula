import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAccessCode, buildSessionCookieHeader, getClientIp } from '../src/shared/auth/accessGate.js';
import { isRateLimited, recordLoginAttempt } from '../src/shared/db/loginAttempts.js';

// Deliberately NOT gated by requireAccess — this is the endpoint that issues
// the cookie in the first place. This is also the only endpoint that takes a
// raw guess at APP_ACCESS_CODE, so it's the one that needs rate limiting —
// requireAccess() (every other route) only validates an already-issued
// signed cookie, which isn't a brute-forceable surface.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const ok = verifyAccessCode(code);

  try {
    await recordLoginAttempt(ip, ok);
  } catch (err) {
    // Never let attempt-logging failure block a real login or mask the
    // real error behind a 500 — same contract as logUsage.
    console.error('recordLoginAttempt failed', err);
  }

  if (!ok) {
    res.status(401).json({ error: 'Incorrect access code.' });
    return;
  }

  res.setHeader('Set-Cookie', buildSessionCookieHeader(req));
  res.status(200).json({ ok: true });
}
