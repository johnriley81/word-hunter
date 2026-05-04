/** Shared leaderboard table utilities (no `rt` / fetch). */

export function leaderboardNumericScore(row) {
  const raw = row[2];
  if (raw === "" || raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    return null;
  }
  return Number(raw);
}

export function rowPerfectOverFlags(perfectTarget, row) {
  const scoreNum = leaderboardNumericScore(row);
  const hasScore = scoreNum !== null;
  return {
    isPerfectHuntScore: perfectTarget != null && hasScore && scoreNum === perfectTarget,
    isAbovePerfectHunt: perfectTarget != null && hasScore && scoreNum > perfectTarget,
  };
}

export function setLeaderboardCellFlash(td, text, kind) {
  const cls =
    kind === "perfect"
      ? "leaderboard-perfect-hunt-flash"
      : kind === "over"
        ? "leaderboard-over-perfect-glow"
        : null;
  if (cls) {
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    td.appendChild(span);
    return;
  }
  td.textContent = text;
}

export function syncLeaderboardNameCellSubPerfect(td, subPerfect) {
  td.classList.toggle(
    "leaderboard-name-cell--you-pseudo-select--sub-perfect",
    subPerfect
  );
}
