import { createClient } from '@supabase/supabase-js';

// Server-only — uses the service_role key, which bypasses RLS. Never import
// this from src/features or any code that ends up in the browser bundle.
export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, key);
}
