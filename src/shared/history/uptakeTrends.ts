import { WINDOW_DAYS, MIN_OBLIGATORY_CONTEXTS } from './trends.js';
import type { ErrorCategory, UptakeOutcome } from '../grading/types.js';

// PRD §9.8 — a separate series from accuracy/exposure (trends.ts), computed
// only from revision attempts. Same trailing window and noise-control
// minimum as everything else (WINDOW_DAYS / MIN_OBLIGATORY_CONTEXTS,
// reused rather than redefined).
export interface UptakeResolutionRecord {
  createdAt: string;
  category: ErrorCategory;
  outcome: UptakeOutcome;
}

// Only present at all once its denominator reaches MIN_OBLIGATORY_CONTEXTS —
// same noise-control gate as trends.ts's CategoryTrend.
export interface UptakeCategoryTrend {
  category: ErrorCategory;
  denominator: number; // fixed + still_wrong + avoided, in the current window
  fixed: number;
  stillWrong: number;
  avoided: number;
  uptakeRate: number;
  avoidanceRate: number;
}

export function computeUptakeTrends(
  resolutions: UptakeResolutionRecord[],
  now: Date = new Date(),
): UptakeCategoryTrend[] {
  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - windowMs);

  const inWindow = resolutions.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= currentStart.getTime() && t < now.getTime();
  });

  const byCategory = new Map<ErrorCategory, UptakeResolutionRecord[]>();
  for (const r of inWindow) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  const trends: UptakeCategoryTrend[] = [];
  for (const [category, recs] of byCategory.entries()) {
    const fixed = recs.filter((r) => r.outcome === 'fixed').length;
    const stillWrong = recs.filter((r) => r.outcome === 'still_wrong').length;
    const avoided = recs.filter((r) => r.outcome === 'avoided').length;
    const denominator = fixed + stillWrong + avoided;
    // Same noise-control gate as trends.ts's category omission (not a
    // null-rate placeholder) — below threshold, the category doesn't appear
    // at all; the UI shows "not enough recent data" from its absence.
    if (denominator < MIN_OBLIGATORY_CONTEXTS) continue;

    trends.push({
      category,
      denominator,
      fixed,
      stillWrong,
      avoided,
      uptakeRate: fixed / denominator,
      avoidanceRate: avoided / denominator,
    });
  }

  trends.sort((a, b) => b.denominator - a.denominator);
  return trends;
}
