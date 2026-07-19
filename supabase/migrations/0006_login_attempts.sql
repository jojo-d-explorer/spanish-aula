-- login_attempts is a net-new table; no data-migration risk. See CLAUDE.md
-- "Migration safety" and the access-gate rate-limiting addition (accessGate.ts).
--
-- Backs rate limiting on api/auth-login.ts — the only endpoint that takes a
-- raw guess at APP_ACCESS_CODE. requireAccess() (every other route) only
-- validates an already-issued signed cookie, which isn't a brute-forceable
-- surface, so it doesn't read this table.
create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

-- Rate-limit check is "count failed attempts for this IP in the last N
-- minutes" — this index makes that a fast range scan instead of a table scan
-- as the table grows.
create index login_attempts_ip_created_at_idx on login_attempts(ip, created_at);
