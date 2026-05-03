/** Client-only row tag for the current-run preview (never from the API). */
export const LEADERBOARD_META_LIVE_PREVIEW = "live-preview";

export function normalizeLeaderboardRow(row) {
  if (!Array.isArray(row)) return ["", 0, "", ""];
  if (row.length >= 4) {
    const out = [
      String(row[0] ?? ""),
      Number(row[1]) === 1 ? 1 : 0,
      row[2],
      String(row[3] ?? ""),
    ];
    if (row[4] === LEADERBOARD_META_LIVE_PREVIEW) {
      out.push(LEADERBOARD_META_LIVE_PREVIEW);
    }
    return out;
  }
  if (row.length >= 3) {
    return [String(row[0] ?? ""), 0, row[1], String(row[2] ?? "")];
  }
  return ["", 0, "", ""];
}

export function normalizeLeaderboardRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLeaderboardRow);
}

function shouldLogLeaderboardDebug() {
  if (
    typeof process !== "undefined" &&
    process.env?.WORDHUNTER_DEBUG_LEADERBOARD === "1"
  ) {
    return true;
  }
  try {
    if (typeof globalThis.localStorage === "undefined") return false;
    return globalThis.localStorage.getItem("WORDHUNTER_DEBUG_LEADERBOARD") === "1";
  } catch {
    return false;
  }
}

/** Logs only when `WORDHUNTER_DEBUG_LEADERBOARD=1` (Node) or `localStorage` same key (browser). */
export function leaderboardDebugWarn(...args) {
  if (!shouldLogLeaderboardDebug()) return;
  const norm = args.map((a) => (a instanceof Error ? a.message : a));
  console.warn("[leaderboard]", ...norm);
}

/** Pads with empty placeholder rows so the live top-10 table always shows 10 slots (after submit or GET). */
export function padNormalizedLeaderboardToTop10(rows) {
  const out = normalizeLeaderboardRows(Array.isArray(rows) ? rows : []).slice(0, 10);
  while (out.length < 10) {
    out.push(["", 0, "", ""]);
  }
  return out;
}

export function parsedFetchPayload(raw) {
  if (raw == null || typeof raw !== "object" || !("body" in raw)) return raw;
  const b = raw.body;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b ?? {};
}

/**
 * Leaderboard rows from a GET or successful POST body. Same wire format:
 * - a JSON array of [player, score, trophy] tuples (typical GET), or
 * - an object with `top_10`, `top10`, or `leaderboard` array (often POST with `message`).
 */
export function top10RowsFromPayload(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object") {
    if (Array.isArray(payload.top_10)) return payload.top_10;
    if (Array.isArray(payload.top10)) return payload.top10;
    if (Array.isArray(payload.leaderboard)) return payload.leaderboard;
  }
  return [];
}

const LEADERBOARD_POST_COMMIT_MARKERS = Object.freeze([
  "record inserted successfully",
  "this record already exists",
]);

function leaderboardPayloadIndicatesSoftReject(payload) {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const message = String(payload.message ?? "")
    .trim()
    .toLowerCase();
  if (message.includes("profanity")) return true;
  if (
    message.includes("reject") &&
    !LEADERBOARD_POST_COMMIT_MARKERS.some((s) => message.includes(s))
  ) {
    return true;
  }
  return false;
}

function leaderboardPayloadIndicatesHardErrorField(payload) {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const err = payload.error ?? payload.errors;
  if (err == null || err === false) return false;
  if (typeof err === "string") return err.trim().length > 0;
  if (typeof err === "object" && Object.keys(err).length > 0) return true;
  return Boolean(err);
}

export function leaderboardPostMessageIndicatesCommit(payload) {
  const m = String(payload?.message ?? "").toLowerCase();
  return LEADERBOARD_POST_COMMIT_MARKERS.some((s) => m.includes(s));
}

/**
 * Whether a successful score POST should lock live submit (no second post this run).
 */
export function leaderboardPostTreatAsCommitted(ok, payload, didSubmit) {
  if (!didSubmit || !ok) return false;
  if (payload == null) return true;
  if (Array.isArray(payload)) {
    return true;
  }
  if (typeof payload !== "object") return true;
  if (leaderboardPayloadIndicatesHardErrorField(payload)) return false;
  if (leaderboardPayloadIndicatesSoftReject(payload)) return false;
  const message = String(payload.message ?? "").trim();
  const lower = message.toLowerCase();
  if (leaderboardPostMessageIndicatesCommit(payload)) return true;
  if (top10RowsFromPayload(payload).length > 0) return true;
  if (!message) return true;
  if (
    lower.includes("success") ||
    lower.includes("saved") ||
    lower.includes("recorded") ||
    lower.includes("accepted") ||
    lower.includes("added") ||
    lower.includes("updated") ||
    lower.includes("thank")
  ) {
    return true;
  }
  return false;
}

export function leaderboardRowsFromResponse(response, payload, didSubmit) {
  if (!response.ok) {
    if (didSubmit) {
      const fromBody = top10RowsFromPayload(payload);
      const hasBoardKey =
        payload &&
        typeof payload === "object" &&
        ("top_10" in payload || "top10" in payload || "leaderboard" in payload);
      if (fromBody.length > 0 || hasBoardKey) {
        return fromBody;
      }
    }
    leaderboardDebugWarn("Leaderboard request failed", response.status, payload);
    return [];
  }
  return top10RowsFromPayload(payload);
}
