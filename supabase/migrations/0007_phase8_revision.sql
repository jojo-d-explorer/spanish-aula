-- Phase 8 migration — Revisión (the revision cycle). See CLAUDE.md
-- "Migration safety" and PRD §9.4.
--
-- Before running: back up entries + error_observations (scripts/backup-tables.mjs
-- -> backups/entries_pre_phase8_<date>.json, backups/error_observations_pre_phase8_<date>.json)
-- and run scripts/verify-migration.mjs against the backup afterward to confirm
-- every pre-existing row is still intact and queryable.
--
-- Every new column is nullable or defaulted (PRD §9.4) — no backfill needed,
-- every existing Phase 1-5 entry and observation stays valid as-is.

alter table entries
  add column parent_entry_id uuid null references entries(id),
  add column revision_number int not null default 0,
  add column revealed_corrections boolean not null default false;

alter table error_observations
  add column is_revision boolean not null default false,
  add column resolves_observation_id uuid null references error_observations(id);

create table uptake_resolutions (
  id uuid primary key default gen_random_uuid(),
  revision_entry_id uuid not null references entries(id) on delete cascade,
  observation_id uuid not null references error_observations(id),
  category text not null,        -- frozen taxonomy (PRD §4/§8.1), denormalized for query speed
  outcome text not null,         -- 'fixed' | 'still_wrong' | 'avoided'
  note text,
  created_at timestamptz not null default now()
);

create index on uptake_resolutions (category, created_at);

-- Read-time trend queries filter is_revision = false (PRD §9.7) — this index
-- makes that filter (and the plain per-category window scans it composes
-- with) a fast lookup instead of a sequential scan as the table grows.
create index error_observations_is_revision_idx on error_observations(is_revision);
