import {
  parsedFetchPayload,
  normalizeLeaderboardRows,
  padNormalizedLeaderboardToTop10,
  leaderboardRowsFromResponse,
  leaderboardPostTreatAsCommitted,
} from "./leaderboard-api.js";
import {
  applyLiveLeaderboardPreviewMerge,
  leaderboardRunAtOrBelowSessionBest,
} from "./leaderboard-lifecycle.js";
import { isLeaderboardNameAcceptable } from "./leaderboard-name-policy.js";

export function leaderboardCanPostLive(
  clicked,
  score,
  nameTrim,
  scoreThreshold,
  eligibilityRows
) {
  if (
    !clicked ||
    Number(score) <= scoreThreshold ||
    !isLeaderboardNameAcceptable(nameTrim)
  ) {
    return false;
  }
  if (
    eligibilityRows &&
    leaderboardRunAtOrBelowSessionBest(eligibilityRows, nameTrim, score)
  ) {
    return false;
  }
  return true;
}

export function deriveLiveLeaderboardAfterFetch(network, input) {
  const { ok, raw, status } = network;
  const {
    clicked,
    score,
    nameTrim,
    trophyWord,
    scoreThreshold,
    useDemoData,
    liveSubmitUsed,
    priorEligibilityRows,
  } = input;

  const trimmedName = String(nameTrim || "").trim();
  const canPost = leaderboardCanPostLive(
    clicked,
    score,
    trimmedName,
    scoreThreshold,
    priorEligibilityRows
  );
  const payload = parsedFetchPayload(raw);
  const response = { ok, status: status ?? (ok ? 200 : 400) };

  const fromNetwork = leaderboardRowsFromResponse(response, payload, canPost);
  let tableRows = Array.isArray(fromNetwork) ? fromNetwork : [];

  const eligibilityRows = useDemoData
    ? null
    : padNormalizedLeaderboardToTop10(normalizeLeaderboardRows(tableRows));

  const runPreviewMerge = (norm) =>
    applyLiveLeaderboardPreviewMerge(norm, trimmedName, score, trophyWord, {
      useDemoData,
      liveSubmitUsed,
    });

  if (!useDemoData && !canPost && !liveSubmitUsed) {
    tableRows = runPreviewMerge(normalizeLeaderboardRows(tableRows));
  }

  if (!useDemoData && !liveSubmitUsed && tableRows.length === 0 && !(canPost && ok)) {
    tableRows = runPreviewMerge(normalizeLeaderboardRows([]));
  }

  const committed = leaderboardPostTreatAsCommitted(ok, payload, canPost);

  if (!useDemoData && tableRows.length > 0) {
    tableRows = padNormalizedLeaderboardToTop10(tableRows);
  }

  return { tableRows, committed, canPost, eligibilityRows };
}
