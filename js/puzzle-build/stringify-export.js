import { dictExportToCanonicalRow, serializePuzzleRow } from "../puzzle-row-format.js";

/** Serialize a `buildGamemakerDictExportPayload` result as one `text/puzzles.txt` line. */
export function stringifyGamemakerDictExport(d) {
  return serializePuzzleRow(dictExportToCanonicalRow(d));
}
