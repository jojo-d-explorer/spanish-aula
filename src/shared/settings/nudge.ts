import { DELE_LEVELS, type DeleLevelEstimate } from '../grading/types.js';
import type { DeleLevel } from '../prompts/writingPrompt';
import type { LevelNudge } from './types';

// Noise control, matching the History view's spirit: don't suggest advancing
// off a lucky entry or two.
export const MIN_ENTRIES_FOR_NUDGE = 5;

const LEVEL_PROGRESSION: Record<DeleLevel, DeleLevel | null> = {
  A2: 'B1',
  B1: 'B2',
  B2: null,
};

function nextLevel(current: DeleLevel): DeleLevel | null {
  return LEVEL_PROGRESSION[current];
}

export function computeNudge(currentLevel: DeleLevel, recentEstimates: string[]): LevelNudge | null {
  if (recentEstimates.length < MIN_ENTRIES_FOR_NUDGE) return null;

  const next = nextLevel(currentLevel);
  if (!next) return null;

  const nextIndex = DELE_LEVELS.indexOf(next);
  const allAtOrAboveNext = recentEstimates.every((estimate) => DELE_LEVELS.indexOf(estimate as DeleLevelEstimate) >= nextIndex);

  if (!allAtOrAboveNext) return null;

  return {
    suggestedLevel: next,
    reason: `Your last ${recentEstimates.length} entries all graded at ${next} or higher.`,
  };
}
