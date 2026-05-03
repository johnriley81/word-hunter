import { DEMO_LEADERBOARD_NAME_MAX, SCORE_SUBMIT_THRESHOLD } from "./config.js";
import { LEADERBOARD_META_LIVE_PREVIEW } from "./leaderboard-api.js";
import { leaderboardNumericScore } from "./leaderboard-ui-helpers.js";

export function sanitizeDemoLeaderboardName(raw) {
  return String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, DEMO_LEADERBOARD_NAME_MAX);
}

/** Empty #player-name matches display YOU. */
export function leaderboardPreviewNameKey(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return "YOU";
  return sanitizeDemoLeaderboardName(t) || t;
}

export function leaderboardLiveSelfRowIndex(
  rows,
  playerNameValue,
  runScore,
  trophyWord
) {
  if (!rows?.length) return -1;
  const trophy = String(trophyWord ?? "").trim();
  const want = Number(runScore);
  const previewKey = leaderboardPreviewNameKey(playerNameValue);
  let untagged = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (
      leaderboardNumericScore(r) !== want ||
      String(r[3] || "").trim() !== trophy ||
      leaderboardPreviewNameKey(r[0]) !== previewKey
    ) {
      continue;
    }
    if (r[4] === LEADERBOARD_META_LIVE_PREVIEW) return i;
    if (untagged < 0) untagged = i;
  }
  return untagged;
}

export function leaderboardLiveSubmitNameFallbackRaw(
  rows,
  playerNameValue,
  runScore,
  trophyWord
) {
  if (!rows?.length) return "";
  const trophy = String(trophyWord ?? "").trim();
  const want = Number(runScore);
  const matches = [];
  for (const r of rows) {
    if (leaderboardNumericScore(r) === want && String(r[3] || "").trim() === trophy) {
      matches.push(r);
    }
  }
  if (!matches.length) return "";
  const previewKey = leaderboardPreviewNameKey(playerNameValue);
  const keyedTagged = matches.find(
    (r) =>
      r[4] === LEADERBOARD_META_LIVE_PREVIEW &&
      leaderboardPreviewNameKey(r[0]) === previewKey
  );
  if (keyedTagged) {
    const raw = String(keyedTagged[0] ?? "").trim();
    return raw || "YOU";
  }
  const keyed = matches.find((r) => leaderboardPreviewNameKey(r[0]) === previewKey);
  if (keyed) {
    const raw = String(keyed[0] ?? "").trim();
    return raw || "YOU";
  }
  if (matches.length === 1) {
    const raw = String(matches[0][0] ?? "").trim();
    if (raw) return raw;
    const n = leaderboardNumericScore(matches[0]);
    if (n != null && Number.isFinite(n) && n > 0) return "YOU";
    return "";
  }
  return "";
}

export function buildDemoLeaderboardRows() {
  const rows = [];
  rows.push(["TOOHIGH", 0, 9999, "HOW??"]);
  rows.push(["Johnny", 0, 1000, "WORDHUNTER"]);
  rows.push(["Alex", 0, 820, "QUARTZWORKS"]);
  rows.push(["Ashleigh", 0, 650, "STARGAZERS"]);
  rows.push(["Rae", 0, 480, "LETTERPRESS"]);
  for (let i = 0; i < 5; i++) {
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

export function applyLiveLeaderboardPreviewMerge(
  normalizedApiRows,
  trimmedPlayerName,
  runScore,
  trophyWord,
  { useDemoData, liveSubmitUsed }
) {
  if (useDemoData || liveSubmitUsed) return normalizedApiRows;
  const run = Number(runScore);
  if (
    !(Number.isFinite(run) && run > SCORE_SUBMIT_THRESHOLD) ||
    !demoRunQualifiesForLeaderboard(normalizedApiRows, run)
  ) {
    return normalizedApiRows;
  }
  return mergeDemoRunIntoTop10(
    normalizedApiRows,
    trimmedPlayerName || "YOU",
    run,
    String(trophyWord || "").trim(),
    { dedupeNameScoreTrophy: false, tagLiveRunPreview: true }
  );
}

export function mergeDemoRunIntoTop10(baseRows, name, runScore, trophy, mergeOpts) {
  const dedupeNameScoreTrophy = !mergeOpts || mergeOpts.dedupeNameScoreTrophy !== false;
  const tagLiveRunPreview = Boolean(mergeOpts?.tagLiveRunPreview);
  const filled = baseRows.map((r, idx) => {
    return [
      String(r[0] || ""),
      Number(r[1]) === 1 ? 1 : 0,
      r[2] === "" || r[2] === null || r[2] === undefined ? "" : Number(r[2]),
      String(r[3] || ""),
      idx,
    ];
  });
  const dataRows = filled.filter(
    (r) => (r[0] && String(r[0]).trim()) || (r[2] !== "" && !Number.isNaN(Number(r[2])))
  );
  const nameKey = sanitizeDemoLeaderboardName(name);
  const trophyKey = String(trophy || "")
    .trim()
    .toUpperCase();
  const scoreNum = Number(runScore);
  let deduped = dataRows;
  if (dedupeNameScoreTrophy) {
    deduped = dataRows.filter((r) => {
      const sameScore = Number(r[2]) === scoreNum;
      const sameTrophy =
        String(r[3] || "")
          .trim()
          .toUpperCase() === trophyKey;
      const sameName = sanitizeDemoLeaderboardName(r[0]) === nameKey;
      return !(sameScore && sameTrophy && sameName);
    });
  }
  const maxOrder = deduped.length === 0 ? -1 : Math.max(...deduped.map((r) => r[4]));
  const previewTieOrder = maxOrder + 1;
  const newRow = [name, 0, runScore, String(trophy || ""), previewTieOrder];
  deduped.push(newRow);
  deduped.sort((a, b) => {
    const byScore = Number(b[2]) - Number(a[2]);
    if (byScore !== 0) return byScore;
    return Number(a[4]) - Number(b[4]);
  });
  const next = deduped.slice(0, 10).map((r) => {
    const four = [r[0], r[1], r[2], r[3]];
    if (tagLiveRunPreview && Number(r[4]) === previewTieOrder) {
      four.push(LEADERBOARD_META_LIVE_PREVIEW);
    }
    return four;
  });
  while (next.length < 10) {
    next.push(["", 0, "", ""]);
  }
  return next;
}
