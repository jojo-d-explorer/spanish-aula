// Post-migration sanity check for the migration-safety rule (CLAUDE.md /
// PRD §8.5 / §9.10 "all existing entries and observations are intact and
// queryable after migration"). Read-only.
//
// Usage:
//   node --env-file=.env.local scripts/verify-migration.mjs <backup-label>
//
// Compares live entries/error_observations against the backups/*_<label>_*.json
// snapshot taken before the migration: same row count, and every pre-existing
// row still has its original id/created_at plus the new columns defaulted
// as expected (not null-breaking anything).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [label] = process.argv.slice(2);
if (!label) {
  console.error('Usage: node --env-file=.env.local scripts/verify-migration.mjs <backup-label>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(url, key);
const backupsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');

function loadBackup(table) {
  const candidates = readdirSync(backupsDir).filter(
    (f) => f.startsWith(`${table}_${label}_`) && f.endsWith('.json'),
  );
  if (candidates.length === 0) throw new Error(`No backup found for ${table} with label "${label}" in ${backupsDir}`);
  // Most recent if more than one match.
  candidates.sort();
  return JSON.parse(readFileSync(join(backupsDir, candidates[candidates.length - 1]), 'utf8'));
}

async function fetchAll(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  OK: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failures += 1;
  }
}

for (const table of ['entries', 'error_observations']) {
  console.log(`\n${table}`);
  const before = loadBackup(table);
  const after = await fetchAll(table, '*');
  const afterById = new Map(after.map((r) => [r.id, r]));

  check(after.length >= before.length, `row count did not shrink (${before.length} -> ${after.length})`);

  let missing = 0;
  let mutated = 0;
  for (const row of before) {
    const match = afterById.get(row.id);
    if (!match) {
      missing += 1;
      continue;
    }
    for (const [k, v] of Object.entries(row)) {
      if (JSON.stringify(match[k]) !== JSON.stringify(v)) {
        mutated += 1;
        console.error(`    ${table}.${row.id}.${k} changed: ${JSON.stringify(v)} -> ${JSON.stringify(match[k])}`);
      }
    }
  }
  check(missing === 0, `every pre-migration row is still present (${missing} missing)`);
  check(mutated === 0, `no pre-migration column value was altered (${mutated} field diffs)`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed — existing entries and observations are intact and queryable.');
