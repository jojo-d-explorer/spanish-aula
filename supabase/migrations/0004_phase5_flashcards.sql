-- Phase 5 migration — see CLAUDE.md "Migration safety" and PRD §8.5, §14.7.
-- Run this in the Supabase SQL Editor. Back up entries/error_observations/
-- lesson_log/lesson_messages/word_bank/usage_log first, per prior-phase
-- precedent (0001, 0003).

-- Flashcards (PRD §14) — generated from Word Bank entries and Anki weak
-- items, deduped by normalized term, exported as TSV (never written into
-- error_observations — see CLAUDE.md Hard Rules).
create table flashcards (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  translation text not null,
  example_sentence text not null,
  category text,                          -- ErrorCategory, best-effort LLM tag, nullable
  dialect text not null,
  dele_level_at_creation text not null,
  source text not null,                   -- 'word_bank' | 'anki_weak_item'
  source_word_bank_id uuid references word_bank(id),
  source_note text,                       -- raw originating term/noteText
  dedup_status text not null default 'pending',  -- 'pending' | 'duplicate' | 'exported'
  created_at timestamptz not null default now(),
  exported_at timestamptz
);

create index flashcards_dedup_status_idx on flashcards(dedup_status);
create index flashcards_term_idx on flashcards(term);
