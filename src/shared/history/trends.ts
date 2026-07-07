import { SUBSCORE_KEYS, type ErrorCategory, type SophisticationSubscores } from '../grading/types.js';

// PRD §8.3 — Phase 2 trend logic, computed at read time from raw observations.
// No rollup/cache table (PRD §8.2): these are queries over error_observations,
// not a stored aggregate.
export const WINDOW_DAYS = 14;
export const MIN_OBLIGATORY_CONTEXTS = 5; // in the current window — noise control
export const ESCALATION_THRESHOLD = 3; // incorrect-and-obligatory, in the current window

export interface ObservationRecord {
  createdAt: string;
  category: ErrorCategory;
  obligatoryContext: boolean;
  correct: boolean;
}

export interface EntrySophisticationRecord {
  createdAt: string;
  overall: number;
  subscores: SophisticationSubscores;
}

export interface WeeklyPoint {
  weekStart: string;
  exposure: number;
  correct: number;
  accuracy: number | null;
}

export interface WindowStats {
  exposure: number;
  correct: number;
  accuracy: number | null;
}

export interface CategoryTrend {
  category: ErrorCategory;
  current: WindowStats;
  prior: WindowStats;
  // Full weekly-bucketed history, for the sparkline visual only — not part of
  // the noise-control gate or the flag formulas below, which look only at the
  // current/prior 14-day windows per PRD §8.3.
  weeks: WeeklyPoint[];
  // Current exposure < half of prior exposure, with flat-or-rising accuracy —
  // PRD §8.3. Needs a nonzero prior window to mean anything.
  avoidanceFlag: boolean;
  // >= 3 incorrect-and-obligatory observations in the current window —
  // PRD §8.3 / the Persona doc's "3 repeats -> micro-lesson" commitment.
  escalationFlag: boolean;
}

export interface SophisticationWeeklyPoint {
  weekStart: string;
  overall: number;
  subscores: SophisticationSubscores;
  entryCount: number;
}

export interface HistoryTrends {
  categories: CategoryTrend[];
  sophistication: SophisticationWeeklyPoint[];
}

// Returns null (rather than throwing) on an unparseable timestamp, so one
// bad row can't take down the whole trends computation.
function weekStartISO(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

function average(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function windowStats(obs: ObservationRecord[], start: Date, end: Date): WindowStats {
  const inWindow = obs.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  const exposure = inWindow.length;
  const correct = inWindow.filter((o) => o.correct).length;
  return { exposure, correct, accuracy: exposure > 0 ? correct / exposure : null };
}

export function computeTrends(
  observations: ObservationRecord[],
  sophisticationRecords: EntrySophisticationRecord[],
  now: Date = new Date(),
): HistoryTrends {
  const obligatory = observations.filter((o) => o.obligatoryContext);

  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - windowMs);
  const priorStart = new Date(now.getTime() - 2 * windowMs);

  const byCategory = new Map<ErrorCategory, ObservationRecord[]>();
  for (const obs of obligatory) {
    if (!byCategory.has(obs.category)) byCategory.set(obs.category, []);
    byCategory.get(obs.category)!.push(obs);
  }

  const categories: CategoryTrend[] = [];
  for (const [category, obsForCategory] of byCategory.entries()) {
    const current = windowStats(obsForCategory, currentStart, now);
    if (current.exposure < MIN_OBLIGATORY_CONTEXTS) continue;

    const prior = windowStats(obsForCategory, priorStart, currentStart);

    const escalationFlag =
      obsForCategory.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= currentStart.getTime() && t < now.getTime() && !o.correct;
      }).length >= ESCALATION_THRESHOLD;

    const avoidanceFlag =
      prior.exposure > 0 &&
      current.exposure < prior.exposure / 2 &&
      (current.accuracy ?? 0) >= (prior.accuracy ?? 0);

    const weekMap = new Map<string, { exposure: number; correct: number }>();
    for (const obs of obsForCategory) {
      const week = weekStartISO(obs.createdAt);
      if (week === null) {
        console.error('Skipping observation with unparseable createdAt:', obs.createdAt);
        continue;
      }
      const bucket = weekMap.get(week) ?? { exposure: 0, correct: 0 };
      bucket.exposure += 1;
      bucket.correct += obs.correct ? 1 : 0;
      weekMap.set(week, bucket);
    }
    const weeks: WeeklyPoint[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, b]) => ({
        weekStart,
        exposure: b.exposure,
        correct: b.correct,
        accuracy: b.exposure > 0 ? b.correct / b.exposure : null,
      }));

    categories.push({ category, current, prior, weeks, avoidanceFlag, escalationFlag });
  }

  categories.sort((a, b) => b.current.exposure - a.current.exposure);

  const sophWeekMap = new Map<string, EntrySophisticationRecord[]>();
  for (const rec of sophisticationRecords) {
    const week = weekStartISO(rec.createdAt);
    if (week === null) {
      console.error('Skipping sophistication record with unparseable createdAt:', rec.createdAt);
      continue;
    }
    if (!sophWeekMap.has(week)) sophWeekMap.set(week, []);
    sophWeekMap.get(week)!.push(rec);
  }

  const sophistication: SophisticationWeeklyPoint[] = Array.from(sophWeekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, recs]) => ({
      weekStart,
      overall: average(recs.map((r) => r.overall)),
      subscores: Object.fromEntries(
        SUBSCORE_KEYS.map((key) => [key, average(recs.map((r) => r.subscores[key]))]),
      ) as unknown as SophisticationSubscores,
      entryCount: recs.length,
    }));

  return { categories, sophistication };
}
