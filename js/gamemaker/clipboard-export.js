/**
 * Pretty-printed clipboard JSON for the published-puzzle dict
 * (`starting_grids`, `next_letters`, `perfect_hunt`).
 */

function formatJsonKeyValue(key, value, baseIndent) {
  const pad = " ".repeat(baseIndent);
  const inner = JSON.stringify(value, null, 2);
  const lines = inner.split("\n");
  const head = `${pad}"${key}": ${lines[0]}`;
  if (lines.length === 1) return head;
  return `${head}\n${lines
    .slice(1)
    .map((l) => pad + l)
    .join("\n")}`;
}

/**
 * @param {{ starting_grids: unknown, next_letters: unknown, perfect_hunt: unknown }} d
 */
export function stringifyGamemakerDictExport(d) {
  return (
    "{\n" +
    formatJsonKeyValue("starting_grids", d.starting_grids, 2) +
    ",\n" +
    formatJsonKeyValue("next_letters", d.next_letters, 2) +
    ",\n" +
    formatJsonKeyValue("perfect_hunt", d.perfect_hunt, 2) +
    "\n}"
  );
}
