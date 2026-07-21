import type { AccuracyObservation } from '../../shared/grading/types';

// PRD §9.2/§9.3 — the revision editor marks each flagged error's location in
// the original text. AccuracyObservation only carries the excerpt's literal
// text, not a character offset, so this locates it by search. Grader
// excerpts don't always match verbatim (whitespace/punctuation), and the
// same excerpt can appear more than once — handle both without crashing;
// anything genuinely unfindable falls back to an unpositioned list rather
// than being dropped silently.
export interface LocatedMarker {
  observation: AccuracyObservation;
  start: number;
  end: number;
}

export interface LocateResult {
  located: LocatedMarker[];
  unlocated: AccuracyObservation[];
}

function overlapsClaimed(start: number, end: number, claimed: Array<[number, number]>): boolean {
  return claimed.some(([s, e]) => start < e && end > s);
}

function findNonOverlapping(text: string, needle: string, claimed: Array<[number, number]>): [number, number] | null {
  if (!needle) return null;
  let searchFrom = 0;
  for (;;) {
    const found = text.indexOf(needle, searchFrom);
    if (found === -1) return null;
    const end = found + needle.length;
    if (!overlapsClaimed(found, end, claimed)) return [found, end];
    searchFrom = found + 1;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches directly against the original (unmodified) text, allowing
// flexible whitespace between the excerpt's own tokens — unlike matching
// against a whitespace-collapsed copy, this keeps offsets valid for the
// real text.
function findWhitespaceFlexible(text: string, needle: string, claimed: Array<[number, number]>): [number, number] | null {
  const tokens = needle.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExp).join('\\s+');
  const re = new RegExp(pattern, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlapsClaimed(start, end, claimed)) return [start, end];
    re.lastIndex = start + 1;
  }
  return null;
}

export function locateExcerpts(text: string, observations: AccuracyObservation[]): LocateResult {
  const claimed: Array<[number, number]> = [];
  const located: LocatedMarker[] = [];
  const unlocated: AccuracyObservation[] = [];

  for (const observation of observations) {
    const excerpt = observation.excerpt?.trim() ?? '';
    const match = excerpt
      ? (findNonOverlapping(text, excerpt, claimed) ?? findWhitespaceFlexible(text, excerpt, claimed))
      : null;

    if (!match) {
      unlocated.push(observation);
      continue;
    }

    const [start, end] = match;
    claimed.push([start, end]);
    located.push({ observation, start, end });
  }

  located.sort((a, b) => a.start - b.start);
  return { located, unlocated };
}
