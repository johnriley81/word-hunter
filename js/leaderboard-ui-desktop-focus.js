import { leaderboardNameHasLetters } from "./leaderboard-lifecycle.js";

/** Desktop/laptop with mouse or trackpad — not typical phones/tablets. */
export function isDesktopFinePointerForAutofocus(matchMedia = globalThis.matchMedia) {
  if (typeof matchMedia !== "function") return false;
  return matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** True when focus is on an interactive control outside the leaderboard panel. */
export function userHasMeaningfulFocusOutside(
  activeElement,
  withinSelector = "#leaderboard-elements"
) {
  const el = activeElement;
  const doc = globalThis.document;
  if (!el || (doc && (el === doc.body || el === doc.documentElement))) {
    return false;
  }
  if (withinSelector && el.closest?.(withinSelector)) return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
    return true;
  }
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Whether post-game leaderboard name entry should receive desktop autofocus.
 * Mobile/coarse pointers are excluded: iOS Safari blocks programmatic focus
 * outside a direct user gesture, and unwanted keyboard popups hurt UX.
 */
export function shouldAutofocusLeaderboardNameEntry({
  leaderboardUseDemoData,
  liveTurnSpent,
  liveNameRejected = false,
  postgameSequenceActive = true,
  playerNameValue,
  submitCooldownRemainingMs = 0,
  runScore,
  scoreSubmitThreshold,
  activeElement = globalThis.document?.activeElement,
  matchMedia = globalThis.matchMedia,
}) {
  if (leaderboardUseDemoData) return false;
  if (!postgameSequenceActive) return false;
  if (liveTurnSpent || liveNameRejected) return false;
  if (!isDesktopFinePointerForAutofocus(matchMedia)) return false;

  const runScoreNum = Number(runScore);
  const meetsSubmitScoreMinimum =
    Number.isFinite(runScoreNum) && runScoreNum > scoreSubmitThreshold;
  if (!meetsSubmitScoreMinimum) return false;

  const nameEmpty = !leaderboardNameHasLetters(playerNameValue);
  if (submitCooldownRemainingMs > 0 && nameEmpty) return false;

  if (userHasMeaningfulFocusOutside(activeElement)) return false;

  return true;
}
