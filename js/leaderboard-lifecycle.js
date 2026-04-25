import { DEMO_LEADERBOARD_NAME_MAX } from "./config.js";

export function buildDemoLeaderboardRows() {
  const rows = [];
  rows.push(["Johnny", 0, 1000, "WORDHUNTER"]);
  rows.push(["Alex", 0, 820, "QUARTZWORKS"]);
  rows.push(["Ashleigh", 0, 650, "STARGAZERS"]);
  rows.push(["Rae", 0, 480, "LETTERPRESS"]);
  for (let i = 0; i < 6; i++) {
    rows.push(["", 0, "", ""]);
  }
  return rows;
}

export function demoRunQualifiesForLeaderboard(baseRows, runScore) {
  const s = Number(runScore);
  if (!Number.isFinite(s) || s <= 0) return false;
  if (!baseRows || baseRows.length < 10) return true;
  const raw = baseRows[9][2];
  const tenthNum = Number(raw);
  const tenthSlotOccupied =
    raw !== "" &&
    raw !== null &&
    raw !== undefined &&
    !Number.isNaN(tenthNum) &&
    tenthNum > 0;
  if (!tenthSlotOccupied) return true;
  return s > tenthNum;
}

export function mergeDemoRunIntoTop10(baseRows, name, runScore, trophy) {
  const filled = baseRows.map((r) => {
    return [
      String(r[0] || ""),
      Number(r[1]) === 1 ? 1 : 0,
      r[2] === "" || r[2] === null || r[2] === undefined ? "" : Number(r[2]),
      String(r[3] || ""),
    ];
  });
  /** @type {[string, number, number, string]} */
  const newRow = [name, 0, runScore, String(trophy || "")];
  const dataRows = filled.filter(
    (r) => (r[0] && String(r[0]).trim()) || (r[2] !== "" && !Number.isNaN(Number(r[2])))
  );
  dataRows.push(newRow);
  dataRows.sort((a, b) => Number(b[2]) - Number(a[2]));
  const next = dataRows.slice(0, 10);
  while (next.length < 10) {
    next.push(["", 0, "", ""]);
  }
  return next;
}

export function sanitizeDemoLeaderboardName(raw) {
  return String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, DEMO_LEADERBOARD_NAME_MAX);
}
