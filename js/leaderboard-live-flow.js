import {
  parsedFetchPayload,
  normalizeLeaderboardRows,
  padNormalizedLeaderboardToTop10,
  leaderboardRowsFromResponse,
  leaderboardPostTreatAsCommitted,
} from "./leaderboard-api.js";
import { applyLiveLeaderboardPreviewMerge } from "./leaderboard-lifecycle.js";
import {
  isLeaderboardNameAcceptable,
  isProhibitedLeaderboardName,
} from "./leaderboard-name-policy.js";

/** True after a successful submit or a prohibited-name submit (lost turn). */
export function liveLeaderboardTurnSpent({
  liveLeaderboardSubmitUsed,
  liveLeaderboardNameRejected,
}) {
  return Boolean(liveLeaderboardSubmitUsed || liveLeaderboardNameRejected);
}

export function isProhibitedLeaderboardSubmitClick(clicked, nameTrim) {
  return Boolean(clicked && isProhibitedLeaderboardName(nameTrim));
}

export function leaderboardCanPostLive(clicked, score, nameTrim, scoreThreshold) {
  return (
    clicked && Number(score) > scoreThreshold && isLeaderboardNameAcceptable(nameTrim)
  );
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
    liveNameRejected = false,
  } = input;

  const trimmedName = String(nameTrim || "").trim();
  const canPost = leaderboardCanPostLive(clicked, score, trimmedName, scoreThreshold);
  const turnSpent = liveLeaderboardTurnSpent({
    liveLeaderboardSubmitUsed: liveSubmitUsed,
    liveLeaderboardNameRejected: liveNameRejected,
  });
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
      liveSubmitUsed: turnSpent,
    });

  if (!useDemoData && !canPost && !turnSpent) {
    tableRows = runPreviewMerge(normalizeLeaderboardRows(tableRows));
  }

  if (!useDemoData && !turnSpent && tableRows.length === 0 && !(canPost && ok)) {
    tableRows = runPreviewMerge(normalizeLeaderboardRows([]));
  }

  const committed = leaderboardPostTreatAsCommitted(ok, payload, canPost);

  if (!useDemoData && tableRows.length > 0) {
    tableRows = padNormalizedLeaderboardToTop10(tableRows);
  }

  return { tableRows, committed, canPost, eligibilityRows };
}
