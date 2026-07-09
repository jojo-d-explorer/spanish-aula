import type { HistoryTrends } from '../history/trends';

// Pure server-side category selection for Workbook's "auto" sourcing mode
// (PRD §10.3). Reuses computeTrends()'s output as-is — no duplicate
// escalation/avoidance logic, and zero new browsing UI (PRD §10.6 forbids a
// second "weak categories" widget). categories is already sorted by current
// exposure descending (see computeTrends in src/shared/history/trends.ts).
export function resolveAutoCategory(
  trends: HistoryTrends,
): { category: HistoryTrends['categories'][number]['category']; reason: string } | null {
  const escalated = trends.categories.find((c) => c.escalationFlag);
  if (escalated) return { category: escalated.category, reason: 'escalated' };

  const avoided = trends.categories.find((c) => c.avoidanceFlag);
  if (avoided) return { category: avoided.category, reason: 'avoidance' };

  const mostPracticed = trends.categories[0];
  if (mostPracticed) return { category: mostPracticed.category, reason: 'most-practiced' };

  return null;
}
