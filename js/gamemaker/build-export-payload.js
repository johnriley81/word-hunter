import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  normalizeTileText,
} from "../board-logic.js";
import {
  buildNextLettersFromCoveredInBuildOrder,
  stripTrailingEmptyNextLetters,
} from "../puzzle-export-sim.js";
import {
  comparePoolWordEntriesAscForwardExport,
  comparePoolWordEntriesDescSackRefillOrder,
} from "./pool-order.js";

/**
 * Gamemaker publishable puzzle row (`starting_grids` → `starting_grid`).
 * Covered stack iteration uses sack order (`comparePoolWordEntriesDescSackRefillOrder`);
 * exported hunt order ascending (`comparePoolWordEntriesAscForwardExport`).
 * Indices: `buildPlaysChron[i]` matches `currentWords[i]` after each commit.
 *
 * @param {{
 *   gameBoard: string[][];
 *   buildPlaysChron: Array<{
 *     word: string;
 *     pathFlat: number[];
 *     min_tiles?: number;
 *     covered: string[];
 *     starter_tor_neighbor_quad?: string[];
 *   }>;
 *   currentWords: Array<{ word?: string; wordTotal?: number }>;
 *   wordCount: number;
 * }} input
 * @returns {{ starting_grids: string[][][]; next_letters: string[]; perfect_hunt: string[]; perfect_hunt_starter_tor_neighbors: string[] } | null}
 */
export function buildGamemakerDictExportPayload(input) {
  const { gameBoard, buildPlaysChron, currentWords, wordCount } = input;

  if (!Array.isArray(currentWords) || currentWords.length !== wordCount) {
    return null;
  }

  const coerceStarterTorNeighborQuadExport = (/** @type {unknown} */ raw) => {
    const a = Array.isArray(raw) ? /** @type {unknown[]} */ (raw).slice(0, 4) : [];
    while (a.length < 4) a.push("0");
    return a.map((tok) => {
      const lc = String(tok ?? "")
        .trim()
        .toLowerCase();
      if (lc === "" || lc === "0") return "0";
      return normalizeTileText(String(tok ?? ""));
    });
  };

  const gEndL = gameBoard.map((r) => r.map((c) => String(c || "").toLowerCase()));

  if (!Array.isArray(buildPlaysChron) || buildPlaysChron.length < wordCount) {
    return null;
  }
  for (let i = 0; i < wordCount; i++) {
    const slot = buildPlaysChron[i];
    if (slot == null || typeof slot.word !== "string") return null;
    const expectedLc = String(currentWords[i]?.word || "").toLowerCase();
    if (!expectedLc || String(slot.word || "").toLowerCase() !== expectedLc) {
      return null;
    }
  }

  const playsForExport = buildPlaysChron.slice(0, wordCount).map((p) => {
    const w = String(p.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    return {
      word: w,
      pathFlat: p.pathFlat ? p.pathFlat.slice() : [],
      min_tiles:
        typeof p.min_tiles === "number"
          ? p.min_tiles
          : minUniqueTilesForReuseRule(glyphs),
      covered: (p.covered || []).map((ch) => String(ch || "").toLowerCase()),
      starter_tor_neighbor_quad: coerceStarterTorNeighborQuadExport(
        /** @type {{ starter_tor_neighbor_quad?: unknown }} */ (p)
          .starter_tor_neighbor_quad
      ),
    };
  });

  const order = currentWords
    .map((w, i) => ({ w, i }))
    .sort((a, b) => comparePoolWordEntriesAscForwardExport(a.w, b.w));
  const wordsAsc = order.map((x) => String(x.w.word || "").toLowerCase());

  const orderDescForSack = currentWords
    .map((w, i) => ({ w, i }))
    .sort((a, b) => comparePoolWordEntriesDescSackRefillOrder(a.w, b.w));
  const playsDescForSack = orderDescForSack.map((x) => playsForExport[x.i]);

  const nextLetters = buildNextLettersFromCoveredInBuildOrder(playsDescForSack, {
    fillEmpty: "",
  });
  const playsAsc = order.map((x) => playsForExport[x.i]);
  const perfect_hunt_starter_tor_neighbors = playsAsc.flatMap(
    (p) => p.starter_tor_neighbor_quad
  );

  return {
    starting_grids: [gEndL],
    next_letters: stripTrailingEmptyNextLetters(nextLetters),
    perfect_hunt: wordsAsc,
    perfect_hunt_starter_tor_neighbors,
  };
}
