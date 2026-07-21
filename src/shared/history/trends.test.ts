import { describe, it, expect } from 'vitest';
import { computeTrends, type ObservationRecord, type EntrySophisticationRecord } from './trends';

// PRD §9.7 / §9.10 — the actual spec for "revisions don't leak into trends":
// grade an entry, record the trend state, save a revision, assert the trend
// state is byte-identical. Written before any revision feature code exists.
describe('Phase 8 trend isolation (PRD §9.7)', () => {
  it('a saved revision never changes History accuracy/exposure trends', () => {
    const now = new Date('2026-07-20T12:00:00Z');

    // 1. Grade an entry — five obligatory-context observations, enough to
    // clear the §8.3 noise-control minimum (MIN_OBLIGATORY_CONTEXTS = 5).
    const parentObservations: ObservationRecord[] = Array.from({ length: 5 }, (_, i) => ({
      // Strictly before `now` — computeTrends' window end is exclusive at
      // `now`, so anything at exactly `now` would be dropped by the window
      // filter itself rather than by whatever is under test here.
      createdAt: new Date(now.getTime() - (10 - i) * 60_000).toISOString(),
      category: 'subjunctive_trigger',
      obligatoryContext: true,
      correct: i % 2 === 0,
      isRevision: false,
    }));
    const parentSoph: EntrySophisticationRecord[] = [
      {
        createdAt: now.toISOString(),
        overall: 4,
        subscores: { syntactic_complexity: 3, verbal_range: 4, lexical_sophistication: 5, cohesion: 4, ambition: 6 },
        isRevision: false,
      },
    ];

    const before = computeTrends(parentObservations, parentSoph, now);

    // 2. Save a revision — a second grading pass over the same category,
    // persisted with is_revision = true exactly as the Phase 8 schema (§9.4)
    // requires. Deliberately scored all-correct: if this leaks into the
    // trend, accuracy visibly jumps and the test catches it.
    const revisionObservations: ObservationRecord[] = Array.from({ length: 5 }, (_, i) => ({
      createdAt: new Date(now.getTime() - (5 - i) * 60_000).toISOString(),
      category: 'subjunctive_trigger',
      obligatoryContext: true,
      correct: true,
      isRevision: true,
    }));
    const revisionSoph: EntrySophisticationRecord = {
      createdAt: new Date(now.getTime() - 30_000).toISOString(),
      overall: 9,
      subscores: { syntactic_complexity: 9, verbal_range: 9, lexical_sophistication: 9, cohesion: 9, ambition: 9 },
      isRevision: true,
    };

    // 3. Recompute against the full union — what computeTrends receives if
    // the is_revision filter (wherever it lives) is missing or broken.
    const after = computeTrends(
      [...parentObservations, ...revisionObservations],
      [...parentSoph, revisionSoph],
      now,
    );

    expect(after).toEqual(before);
  });
});
