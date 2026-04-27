const DAY_MS = 1000 * 60 * 60 * 24;

function startOfLocalDayMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local calendar day 0 → `puzzles[0]`. Month is 0-based. */
const PUZZLE_ROTATION_EPOCH = new Date(2026, 3, 26);

const LEGACY_LEADERBOARD_EPOCH = new Date(2023, 4, 20);

export function puzzleDayIndexAt(now, epochDate) {
  return Math.floor((startOfLocalDayMs(now) - startOfLocalDayMs(epochDate)) / DAY_MS);
}

export function calculatePuzzleDayIndex() {
  return puzzleDayIndexAt(new Date(), PUZZLE_ROTATION_EPOCH);
}

export function calculateDiffDays() {
  const now = new Date();
  return Math.ceil(Math.abs(now - LEGACY_LEADERBOARD_EPOCH) / DAY_MS);
}

export function puzzleListIndex(puzzleCount) {
  const i = calculatePuzzleDayIndex();
  const n = Math.max(1, puzzleCount);
  return ((i % n) + n) % n;
}
