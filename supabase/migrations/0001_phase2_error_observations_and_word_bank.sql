-- Phase 2 migration — see CLAUDE.md "Migration safety" and PRD §8.2/§8.4.
-- Run this in the Supabase SQL Editor. Data was backed up locally first
-- (backups/entries_pre_phase2_2026-07-07.json, observations_pre_phase2_2026-07-07.json).

-- 1. Rename observations -> error_observations (frozen taxonomy, PRD §8.1).
--    Existing indexes (observations_entry_id_idx, observations_category_idx)
--    keep their old names after the rename -- cosmetic only, still functional.
alter table observations rename to error_observations;

-- 2. Give each observation its own created_at instead of inferring it via a
--    join to entries (PRD §8.2 schema, needed for the 14-day-window queries
--    in §8.3). Backfill existing rows from their parent entry's created_at.
alter table error_observations add column created_at timestamptz;

update error_observations eo
set created_at = e.created_at
from entries e
where eo.entry_id = e.id;

alter table error_observations alter column created_at set not null;
alter table error_observations alter column created_at set default now();

create index error_observations_created_at_idx on error_observations(created_at);

-- 3. Word Bank (PRD §8.4) — open capture, no classification at insert time.
create table word_bank (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  context_sentence text,
  note text,
  source_tab text not null,
  dedup_status text not null default 'pending',
  created_at timestamptz not null default now()
);
