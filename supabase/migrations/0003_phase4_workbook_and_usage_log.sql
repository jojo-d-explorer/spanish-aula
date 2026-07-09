-- Phase 4 migration — see CLAUDE.md "Migration safety" and PRD §8.5, §10.4, §6.1.
-- Run this in the Supabase SQL Editor.
--
-- Backup note: this migration alters the existing error_observations table
-- (adds source_tab, drops entry_id's NOT NULL), so per 0001's precedent a
-- backup was taken first: backups/error_observations_2026-07-09.json
-- (+ entries/lesson_log/lesson_messages/word_bank, same session, same date).
-- usage_log is a net-new table; no data-migration risk there.

-- 1. source_tab (PRD §8.2/§10.4). Postgres backfills every existing row's
--    default in the same statement when adding a NOT NULL + DEFAULT column
--    (no separate `update` needed) -- every pre-Phase-4 row is a Writing
--    entry, so 'writing' is correct for all of them without inspection.
alter table error_observations add column source_tab text not null default 'writing';

-- 2. Workbook attempts aren't Writing entries, so they have no entries row
--    to point at. Writing's insert path (persistGradedEntry) is untouched
--    and keeps supplying entry_id for every row it writes.
alter table error_observations alter column entry_id drop not null;

create index error_observations_source_tab_idx on error_observations(source_tab);

-- 3. Token metering (PRD §6.1) — proxy logs every model call from here on.
create table usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'owner',   -- constant placeholder, single-user (§11)
  tab text not null,                        -- call-site label (finer than the 4 UI
                                             -- tabs, e.g. 'workbook_session_gen') --
                                             -- for per-feature cost visibility (§11.2)
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  created_at timestamptz not null default now()
);

create index usage_log_created_at_idx on usage_log(created_at);
