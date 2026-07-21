import { describe, it, expect } from 'vitest';
import { locateExcerpts } from './excerptLocator';
import type { AccuracyObservation } from '../../shared/grading/types';

function obs(excerpt: string, category: AccuracyObservation['category'] = 'subjunctive_trigger'): AccuracyObservation {
  return {
    category,
    obligatory_context: true,
    correct: false,
    excerpt,
    correction: '',
    note: '',
    portuguese_interference: false,
  };
}

describe('locateExcerpts', () => {
  it('locates a simple excerpt', () => {
    const { located, unlocated } = locateExcerpts('quiero que vas al parque', [obs('quiero que vas')]);
    expect(unlocated).toHaveLength(0);
    expect(located[0].start).toBe(0);
    expect(located[0].end).toBe('quiero que vas'.length);
  });

  it('does not double-claim a duplicate excerpt', () => {
    const text = 'era bueno. era bueno otra vez.';
    const { located } = locateExcerpts(text, [obs('era bueno'), obs('era bueno')]);
    expect(located).toHaveLength(2);
    expect(located[0].start).not.toBe(located[1].start);
  });

  it('falls back to unlocated for an excerpt not present in the text', () => {
    const { located, unlocated } = locateExcerpts('hola mundo', [obs('no existe aquí')]);
    expect(located).toHaveLength(0);
    expect(unlocated).toHaveLength(1);
  });

  it('tolerates whitespace differences via the flexible fallback', () => {
    const { located } = locateExcerpts('quiero  que\nvas al parque', [obs('quiero que vas')]);
    expect(located).toHaveLength(1);
    expect(located[0].start).toBe(0);
  });
});
