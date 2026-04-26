import { dictExportToCanonicalRow, serializePuzzleRow } from "../puzzle-row-format.js";

export function stringifyGamemakerDictExport(d) {
  return serializePuzzleRow(dictExportToCanonicalRow(d));
}
