import { describe, it, expect } from 'vitest';
import { computeUptakeTrends, type UptakeResolutionRecord } from './uptakeTrends';

describe('computeUptakeTrends (PRD §9.8)', () => {
  it('withholds the rate until the denominator reaches 5 in-window', () => {
    const now = new Date('2026-07-20T12:00:00Z');
    const four: UptakeResolutionRecord[] = Array.from({ length: 4 }, (_, i) => ({
      createdAt: new Date(now.getTime() - (i + 1) * 60_000).toISOString(),
      category: 'subjunctive_trigger',
      outcome: 'fixed',
    }));

    expect(computeUptakeTrends(four, now)).toEqual([]);

    const five = [
      ...four,
      { createdAt: new Date(now.getTime() - 5 * 60_000).toISOString(), category: 'subjunctive_trigger' as const, outcome: 'avoided' as const },
    ];
    const [trend] = computeUptakeTrends(five, now);
    expect(trend.denominator).toBe(5);
    expect(trend.uptakeRate).toBeCloseTo(4 / 5);
    expect(trend.avoidanceRate).toBeCloseTo(1 / 5);
  });
});
