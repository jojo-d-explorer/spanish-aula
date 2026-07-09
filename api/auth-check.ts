import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAccess } from '../src/shared/auth/accessGate.js';

// The frontend's "am I already logged in" probe on page load.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }
  if (!requireAccess(req, res)) return;
  res.status(200).json({ authorized: true });
}
