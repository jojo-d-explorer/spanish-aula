// TEMPORARY access-code gate — NOT Phase 6 auth (PRD §11, parked). This
// exists only to keep the now-public repo's live deployment from being wide
// open to strangers: one shared passphrase (APP_ACCESS_CODE), one signed
// HTTP-only cookie, no accounts, no per-user anything, no session store.
// Every route calls requireAccess() independently — the frontend gate
// (src/AccessGate.tsx) alone is not enough, since API routes are directly
// callable. Rip this file + api/auth-login.ts + api/auth-check.ts + the
// requireAccess call in every other route + AccessGate.tsx out later; none
// of it touches any Phase 0-5 feature code.
//
// api/anki-ingest.py re-implements this same check in Python (can't import
// this module across runtimes) — keep the two in sync if this scheme changes.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const ACCESS_COOKIE_NAME = 'aula_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signingKey(): Buffer {
  const accessCode = process.env.APP_ACCESS_CODE ?? '';
  return createHash('sha256').update(`${accessCode}:aula-session-signing`).digest();
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('hex');
}

// Constant-time compare of two possibly-different-length strings — returns
// false (not a thrown error) on length mismatch, since timingSafeEqual
// requires equal-length buffers.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifyAccessCode(submitted: string): boolean {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return false; // fail closed if the env var isn't set
  return safeEqual(submitted, expected);
}

function isHttps(req: VercelRequest): boolean {
  // Vercel sets this on every real deployment (preview and production);
  // it's absent under local `vite`/`vercel dev` over plain http://localhost.
  return req.headers['x-forwarded-proto'] === 'https';
}

// Vercel sets x-forwarded-for to "client, proxy1, proxy2, ..."; the first
// entry is the real client. Used to key login-attempt rate limiting
// (api/auth-login.ts) — falls back to a constant so a missing header still
// rate-limits (as one shared bucket) instead of silently skipping the check.
export function getClientIp(req: VercelRequest): string {
  const header = req.headers['x-forwarded-for'];
  const value = Array.isArray(header) ? header[0] : header;
  const first = value?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function buildSessionCookieHeader(req: VercelRequest): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const value = `${payload}.${sign(payload)}`;
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isHttps(req) ? '; Secure' : '';
  return `${ACCESS_COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function isValidSessionCookie(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  return Date.now() < Number(payload);
}

// Call as the first line of every API handler:
//   if (!requireAccess(req, res)) return;
// Sends 401 itself and returns false when unauthorized.
export function requireAccess(req: VercelRequest, res: VercelResponse): boolean {
  if (isValidSessionCookie(req.cookies[ACCESS_COOKIE_NAME])) return true;
  res.status(401).json({ error: 'Unauthorized.' });
  return false;
}
