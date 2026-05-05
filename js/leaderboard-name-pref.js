import { sanitizeDemoLeaderboardName } from "./leaderboard-lifecycle.js";

export const LEADERBOARD_NAME_STORAGE_KEY = "wordhunter_leaderboard_name";

/** @returns {string} Uppercase A–Z only, empty if unset or unreadable. */
export function readStoredLeaderboardName() {
  try {
    const raw = globalThis.localStorage?.getItem(LEADERBOARD_NAME_STORAGE_KEY);
    return sanitizeDemoLeaderboardName(raw);
  } catch {
    return "";
  }
}

/** Persists the last submitted leaderboard name; clears storage when empty after sanitize. */
export function persistLeaderboardSubmitName(raw) {
  try {
    const t = sanitizeDemoLeaderboardName(raw);
    if (!t) {
      globalThis.localStorage?.removeItem(LEADERBOARD_NAME_STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(LEADERBOARD_NAME_STORAGE_KEY, t);
  } catch {
    /* localStorage unavailable */
  }
}
