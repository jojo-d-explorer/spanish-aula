import { getSupabaseClient } from './client.js';

// Rate limiting for api/auth-login.ts — the only endpoint that takes a raw
// guess at APP_ACCESS_CODE. See supabase/migrations/0006_login_attempts.sql.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

// Same "always await, internal .catch" contract as logUsage (src/shared/db/usage.ts) —
// a logging failure must never surface to the user or block the login response.
export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('login_attempts').insert({ ip, success });
  if (error) throw error;
}

// Fails open (returns false — not rate-limited) on a DB error. This endpoint
// is the front door; if Supabase is unreachable, the underlying
// verifyAccessCode() check still gates access, so failing open here doesn't
// bypass auth — it just means this one request skips throttling.
export async function isRateLimited(ip: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('created_at', since);

  if (error) {
    console.error('isRateLimited check failed, failing open', error);
    return false;
  }
  return (count ?? 0) >= MAX_FAILED_ATTEMPTS;
}
