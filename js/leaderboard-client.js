import { leaderboardDebugWarn } from "./leaderboard-api.js";

/**
 * @returns {{ ok: boolean; status: number; raw: unknown }}
 */
async function fetchJsonLeaderboardRound(requestURL, requestOptions) {
  try {
    const response = await fetch(requestURL, requestOptions);
    let raw = {};
    try {
      raw = await response.json();
    } catch {
      // empty body → treat as {}
    }
    return { ok: response.ok, status: response.status, raw };
  } catch (err) {
    leaderboardDebugWarn(err);
    return { ok: false, status: 0, raw: {} };
  }
}

/**
 * Live leaderboard GET/POST round-trip (`fetch` + JSON parse edge cases).
 *
 * @param {{
 *   leaderboardLink: string;
 *   puzzleId: number | string;
 *   canPost: boolean;
 *   playerNameTrim: string;
 *   score: number;
 *   trophyWord: string;
 *   attachScoreValidation: boolean;
 *   scoreValidationTurns: unknown;
 * }} p
 */
export async function fetchLiveLeaderboardNetworkResult(p) {
  const requestURL = `${p.leaderboardLink}${p.puzzleId}`;
  const requestOptions = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (p.canPost) {
    const postBody = {
      player: p.playerNameTrim,
      score: p.score,
      trophy: p.trophyWord,
    };
    if (p.attachScoreValidation) {
      postBody.scoreValidation = p.scoreValidationTurns;
    }
    requestOptions.method = "POST";
    requestOptions.body = JSON.stringify(postBody);
  }
  return fetchJsonLeaderboardRound(requestURL, requestOptions);
}
