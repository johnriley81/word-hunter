/**
 * Puzzle builder: single pre-generated pool (see scripts/generate-puzzle-pool.mjs).
 */

const PUZZLE_POOL_URL = "text/gamemaker/pregen/puzzle-pool.json";

export async function loadGamemakerListsData() {
  try {
    const res = await fetch(PUZZLE_POOL_URL);
    if (!res.ok) {
      return { lists: [] };
    }
    const j = await res.json();
    const puzzles = Array.isArray(j.puzzles) ? j.puzzles : [];
    return { lists: puzzles };
  } catch (_) {
    return { lists: [] };
  }
}
