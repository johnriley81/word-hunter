import { sanitizeLeaderboardName } from "./leaderboard-lifecycle.js";

/** Keep in sync with server-side `_PROHIBITED_LEADERBOARD_NAMES`. */
const PROHIBITED_LEADERBOARD_NAMES = new Set([
  "FUCK",
  "SHIT",
  "CUNT",
  "NIGGER",
  "NIGGA",
  "FAGGOT",
  "FAG",
  "RETARD",
  "WHORE",
  "SLUT",
  "BITCH",
  "ASSHOLE",
  "DICK",
  "COCK",
  "PENIS",
  "VAGINA",
  "NAZI",
  "KKK",
]);

export function isProhibitedLeaderboardName(raw) {
  const canonical = sanitizeLeaderboardName(raw);
  if (!canonical) return false;
  return PROHIBITED_LEADERBOARD_NAMES.has(canonical);
}

export function isLeaderboardNameAllowed(raw) {
  const canonical = sanitizeLeaderboardName(raw);
  if (!canonical) return false;
  return !isProhibitedLeaderboardName(canonical);
}

export const isLeaderboardNameAcceptable = isLeaderboardNameAllowed;
