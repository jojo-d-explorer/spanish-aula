import { SUBSCORE_KEYS, type ErrorCategory, type SophisticationSubscores } from '../grading/types.js';

// Noise control (PRD §5): a category's trend stays hidden until it has
// accumulated at least this many obligatory contexts.
export const MIN_OBLIGATORY_CONTEXTS = 5;

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

export interface CategoryTrend {
  category: ErrorCategory;
  totalExposure: number;
  weeks: WeeklyPoint[];
  // True when accuracy rose while exposure fell between the earlier and
  // later half of this category's weeks-with-data — PRD §5: "possible
  // avoidance -> flagged, not celebrated." Only computed with >= 2
  // weeks-with-data; otherwise there's no trend direction to assess.
  avoidanceFlag: boolean;
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

function computeAvoidanceFlag(weeksWithData: WeeklyPoint[]): boolean {
  if (weeksWithData.length < 2) return false;

  const mid = Math.floor(weeksWithData.length / 2);
  const earlier = weeksWithData.slice(0, mid);
  const later = weeksWithData.slice(mid);

  const earlierAccuracy = average(earlier.map((w) => w.accuracy ?? 0));
  const laterAccuracy = average(later.map((w) => w.accuracy ?? 0));
  const earlierExposure = earlier.reduce((sum, w) => sum + w.exposure, 0);
  const laterExposure = later.reduce((sum, w) => sum + w.exposure, 0);

  return laterAccuracy > earlierAccuracy && laterExposure < earlierExposure;
}

export function computeTrends(
  observations: ObservationRecord[],
  sophisticationRecords: EntrySophisticationRecord[],
): HistoryTrends {
  const obligatory = observations.filter((o) => o.obligatoryContext);

  const byCategory = new Map<ErrorCategory, Map<string, { exposure: number; correct: number }>>();
  for (const obs of obligatory) {
    const week = weekStartISO(obs.createdAt);
    if (week === null) {
      console.error('Skipping observation with unparseable createdAt:', obs.createdAt);
      continue;
    }
    if (!byCategory.has(obs.category)) byCategory.set(obs.category, new Map());
    const weeks = byCategory.get(obs.category)!;
    const bucket = weeks.get(week) ?? { exposure: 0, correct: 0 };
    bucket.exposure += 1;
    bucket.correct += obs.correct ? 1 : 0;
    weeks.set(week, bucket);
  }

  const categories: CategoryTrend[] = [];
  for (const [category, weekMap] of byCategory.entries()) {
    const totalExposure = Array.from(weekMap.values()).reduce((sum, b) => sum + b.exposure, 0);
    if (totalExposure < MIN_OBLIGATORY_CONTEXTS) continue;

    const weeks: WeeklyPoint[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, b]) => ({
        weekStart,
        exposure: b.exposure,
        correct: b.correct,
        accuracy: b.exposure > 0 ? b.correct / b.exposure : null,
      }));

    categories.push({
      category,
      totalExposure,
      weeks,
      avoidanceFlag: computeAvoidanceFlag(weeks),
    });
  }

  categories.sort((a, b) => b.totalExposure - a.totalExposure);

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
