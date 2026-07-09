import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAccessCode, buildSessionCookieHeader } from '../src/shared/auth/accessGate.js';

// Deliberately NOT gated by requireAccess — this is the endpoint that issues
// the cookie in the first place.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!verifyAccessCode(code)) {
    res.status(401).json({ error: 'Incorrect access code.' });
    return;
  }

  res.setHeader('Set-Cookie', buildSessionCookieHeader(req));
  res.status(200).json({ ok: true });
}
