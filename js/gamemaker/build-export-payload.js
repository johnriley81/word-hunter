import { GRID_SIZE } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  normalizedOrthoNeighborsAtFlat,
} from "../board-logic.js";
import {
  buildNextLettersFromCoveredInBuildOrder,
  stripTrailingEmptyNextLetters,
  computePerfectHuntStarterHints,
  isGridAllNormalizedEmpty,
} from "../puzzle-export-sim.js";
import {
  comparePoolWordEntriesAscForwardExport,
  comparePoolWordEntriesDescSackRefillOrder,
} from "./pool-order.js";

/**
 * Build publishable dict payload from gamemaker session state (no DOM).
 *
 * Stacks `covered` via descending sack order (`comparePoolWordEntriesDescSackRefillOrder`) so the
 * lowest-score forward play is iterated last — see `buildNextLettersFromCoveredInBuildOrder`.
 *
 * @param {{
 *   gameBoard: string[][];
 *   openingGridForExport: string[][] | null;
 *   buildPlaysChron: Array<{ word: string; pathFlat: number[]; min_tiles?: number; covered: string[] }>;
 *   currentWords: Array<{ word?: string; wordTotal?: number }>;
 *   wordCount: number;
 * }} input
 * @returns {{ starting_grids: string[][][]; next_letters: string[]; perfect_hunt: string[] } & Record<string, unknown> | null}
 */
export function buildGamemakerDictExportPayload(input) {
  const { gameBoard, openingGridForExport, buildPlaysChron, currentWords, wordCount } =
    input;

  const gEndL = gameBoard.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const gridOpening =
    openingGridForExport &&
    openingGridForExport.length === GRID_SIZE &&
    openingGridForExport[0]?.length === GRID_SIZE
      ? openingGridForExport.map((row) => row.map((c) => String(c || "").toLowerCase()))
      : null;

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
  const nextLettersRaw = stripTrailingEmptyNextLetters(nextLetters.slice());
  const gridForReplay = gridOpening ?? gEndL;
  const pathsAsc = playsAsc.map((p) =>
    Array.isArray(p.pathFlat) ? p.pathFlat.slice() : []
  );
  const replayGridAllEmpty = isGridAllNormalizedEmpty(gridForReplay);
  const starterHints = computePerfectHuntStarterHints(
    gridForReplay,
    nextLettersRaw,
    wordsAsc,
    pathsAsc,
    { fillEmptyPathCells: replayGridAllEmpty }
  );

  let starterPack = /** @type {Record<string, unknown>} */ ({});
  if (starterHints) {
    const flats = starterHints.perfect_hunt_starter_flats;
    const sigsFromTerminalGrid = flats.map((flat) => ({
      ...normalizedOrthoNeighborsAtFlat(gEndL, flat, GRID_SIZE),
    }));
    starterPack = {
      perfect_hunt_starter_flats: flats,
      perfect_hunt_starter_neighbor_sigs: sigsFromTerminalGrid,
    };
  }

  return {
    starting_grids: [gEndL],
    next_letters: stripTrailingEmptyNextLetters(nextLetters),
    perfect_hunt: wordsAsc,
    ...starterPack,
  };
}
