const PUZZLE_POOL_URL = "text/gamemaker/pregen/puzzle-pool.json";

export async function loadGamemakerPuzzlePool() {
  try {
    const res = await fetch(PUZZLE_POOL_URL);
    if (!res.ok) return { lists: [] };
    const j = await res.json();
    const puzzles = Array.isArray(j.puzzles) ? j.puzzles : [];
    return { lists: puzzles };
  } catch {
    return { lists: [] };
  }
}
