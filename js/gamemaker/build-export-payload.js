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

  const playsForExport =
    buildPlaysChron && buildPlaysChron.length
      ? buildPlaysChron.map((p) => {
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
        })
      : [];

  if (playsForExport.length !== wordCount) return null;

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
