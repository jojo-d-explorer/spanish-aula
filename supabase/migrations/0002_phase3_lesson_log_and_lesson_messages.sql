-- Phase 3 migration — see CLAUDE.md "Migration safety" and PRD §9.5.
-- Run this in the Supabase SQL Editor.
--
-- Backup note: unlike 0001 (which renamed/altered existing tables), this
-- migration only *creates* two new tables (lesson_log, lesson_messages).
-- It does not alter, rename, or drop entries, error_observations,
-- word_bank, or settings, so CLAUDE.md's "back up before altering an
-- existing table" rule does not apply here. A before/after row-count
-- check on the existing tables was done instead as a cheap sanity check.

create table lesson_log (
  id uuid primary key default gen_random_uuid(),
  topic_category text,                      -- set for macro/grammar lessons;
                                             -- matches the frozen taxonomy
                                             -- (src/shared/grading/types.ts)
                                             -- when applicable
  topic_freeform text,                      -- set for micro/lexical lessons
  dele_level_at_creation text not null,     -- snapshot of practice level at
                                             -- thread open time -- frozen,
                                             -- never updated (PRD §9.6)
  created_at timestamptz not null default now()
);

create table lesson_messages (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lesson_log(id),
  role text not null,                       -- 'user' | 'assistant' --
                                             -- validated at the app layer
                                             -- (src/shared/lessons/types.ts),
                                             -- no Postgres enum, matching
                                             -- existing conventions
  content text not null,
  created_at timestamptz not null default now()
);

create index lesson_messages_lesson_id_idx on lesson_messages(lesson_id);
