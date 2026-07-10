-- Phase 5 migration — see CLAUDE.md "Migration safety" and PRD §8.5, §14.8.
-- Run this in the Supabase SQL Editor. Back up entries/error_observations/
-- lesson_log/lesson_messages/word_bank/usage_log first, per prior-phase
-- precedent (0001, 0003). Rewritten in place (not layered as 0005) because
-- the original shape of this migration was never applied to the live DB —
-- see docs/ANKI_SCHEMA.md for why the shape changed.

-- Flashcards (PRD §14) — generated from Word Bank entries and Anki weak
-- items, targeting the real Anki deck's note types and subdecks. Staged:
-- generation produces 'draft' rows for review before an explicit confirm/
-- reject. Never written into error_observations — see CLAUDE.md Hard Rules.
create table flashcards (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',   -- 'draft' | 'confirmed' | 'rejected'
  note_type text,                          -- 'Spanish Verb' | 'Spanish General Word'; null if out_of_scope
  deck text,                               -- one of the 11 real subdecks (docs/ANKI_SCHEMA.md §1); null if out_of_scope
  term text not null,                      -- denormalized from fields->>'Word', indexed for dedup lookups
  fields jsonb,                            -- named object keyed by field name, matches note_type's field layout (docs/ANKI_SCHEMA.md §2); null if out_of_scope
  tags text[] not null default '{}',
  out_of_scope boolean not null default false,  -- flagged per docs/ANKI_SCHEMA.md §5 (grammar pattern, not vocabulary)
  out_of_scope_reason text,
  dialect text not null,
  dele_level_at_creation text not null,
  source text not null,                    -- 'word_bank' | 'anki_weak_item'
  source_word_bank_id uuid references word_bank(id),
  source_note text not null,               -- raw originating term/noteText
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  exported_at timestamptz
);

create index flashcards_status_idx on flashcards(status);
create index flashcards_term_idx on flashcards(term);
create index flashcards_deck_idx on flashcards(deck);

-- Dedup ledger (docs/ANKI_SCHEMA.md §7) — seeded from a real Anki export
-- (not the Google Doc master list, not this app's own generation history),
-- grown by confirmed generations. Checked BEFORE generation, not after.
create table known_cards (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  deck text,
  note_type text,
  source text not null,                    -- 'seed_import' | 'generated'
  flashcard_id uuid references flashcards(id),  -- set only when source = 'generated'
  created_at timestamptz not null default now()
);

create index known_cards_term_idx on known_cards(term);
