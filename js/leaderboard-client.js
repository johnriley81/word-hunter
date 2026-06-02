import { leaderboardDebugWarn } from "./leaderboard-api.js";

const LEADERBOARD_FETCH_CACHE_MS = 30_000;

/** @type {Map<string, { fetchedAt: number; result: { ok: boolean; status: number; raw: unknown } }>} */
const leaderboardFetchCache = new Map();

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

function cacheKeyFor(puzzleId, method) {
  return `${String(puzzleId)}:${method}`;
}

function readCachedLeaderboardResult(puzzleId, method) {
  const entry = leaderboardFetchCache.get(cacheKeyFor(puzzleId, method));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt >= LEADERBOARD_FETCH_CACHE_MS) {
    leaderboardFetchCache.delete(cacheKeyFor(puzzleId, method));
    return null;
  }
  return entry.result;
}

function writeCachedLeaderboardResult(puzzleId, method, result) {
  leaderboardFetchCache.set(cacheKeyFor(puzzleId, method), {
    fetchedAt: Date.now(),
    result,
  });
}

export function resetLeaderboardFetchCacheForTests() {
  leaderboardFetchCache.clear();
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
 *   scoreValidationPayload: unknown;
 * }} p
 */
export async function fetchLiveLeaderboardNetworkResult(p) {
  const requestURL = `${p.leaderboardLink}${p.puzzleId}`;
  const method = p.canPost ? "POST" : "GET";

  if (!p.canPost) {
    const cached = readCachedLeaderboardResult(p.puzzleId, method);
    if (cached) return cached;
  }

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
      scoreValidation: p.scoreValidationPayload,
    };
    requestOptions.method = "POST";
    requestOptions.body = JSON.stringify(postBody);
  }

  const result = await fetchJsonLeaderboardRound(requestURL, requestOptions);
  writeCachedLeaderboardResult(p.puzzleId, method, result);
  if (p.canPost) {
    writeCachedLeaderboardResult(p.puzzleId, "GET", result);
  }
  return result;
}
