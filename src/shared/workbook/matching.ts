// Auto-match-first grading for objective exercise types (PRD §10.4).
// Case/whitespace-insensitive, deliberately accent-SENSITIVE — Spanish
// accents are grammatically meaningful (está vs esta are different words).

export function normalizeForMatch(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Used only by the near-miss gate below, never by the auto-match itself.
// U+0300-U+036F is the Unicode "Combining Diacritical Marks" block, written
// as an explicit escape range rather than literal combining characters,
// which are unsafe to store verbatim in source.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '');
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[rows - 1][cols - 1];
}

// false if already an exact normalized match (not a miss at all — the caller
// should treat that as auto-correct and never reach this function); true if
// the diacritic-stripped forms match (accent-only diff) or edit distance is
// small (defensible-alternate territory); false otherwise (clearly wrong —
// skip the LLM entirely, zero cost).
export function isNearMissCandidate(submitted: string, correct: string): boolean {
  const normSubmitted = normalizeForMatch(submitted);
  const normCorrect = normalizeForMatch(correct);

  if (normSubmitted === normCorrect) return false;
  if (stripDiacritics(normSubmitted) === stripDiacritics(normCorrect)) return true;

  return levenshtein(normSubmitted, normCorrect) <= 2;
}
