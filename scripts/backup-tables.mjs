// Read-only table export for the migration-safety rule (CLAUDE.md /
// PRD §8.5): back up real data before altering any existing table.
//
// Usage:
//   node --env-file=.env.local scripts/backup-tables.mjs <label> <table> [<table> ...]
//
// Writes backups/<table>_<label>_<date>.json, one JSON array of full rows
// per table, matching the naming convention already in backups/ (e.g.
// entries_pre_phase2_2026-07-07.json).
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [label, ...tables] = process.argv.slice(2);

if (!label || tables.length === 0) {
  console.error('Usage: node --env-file=.env.local scripts/backup-tables.mjs <label> <table> [<table> ...]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(url, key);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const backupsDir = join(repoRoot, 'backups');
mkdirSync(backupsDir, { recursive: true });

const date = new Date().toISOString().slice(0, 10);

for (const table of tables) {
  // Paginate — Supabase's default REST page size is 1000 rows, and entries/
  // error_observations will eventually exceed that.
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`Failed to read ${table}:`, error);
      process.exit(1);
    }
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const outPath = join(backupsDir, `${table}_${label}_${date}.json`);
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`${table}: ${rows.length} rows -> ${outPath}`);
}
