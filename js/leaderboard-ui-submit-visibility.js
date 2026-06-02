import { LEADERBOARD_FETCH_CACHE_MS } from "./leaderboard-client.js";
import { leaderboardNameHasLetters } from "./leaderboard-lifecycle.js";
import { isLeaderboardNameAcceptable } from "./leaderboard-name-policy.js";

export const LEADERBOARD_SUBMIT_COOLDOWN_MS = LEADERBOARD_FETCH_CACHE_MS;

export function leaderboardSubmitCooldownRemainingMs(
  lastSubmitAtMs,
  nowMs = Date.now()
) {
  if (lastSubmitAtMs == null || !Number.isFinite(lastSubmitAtMs)) return 0;
  return Math.max(0, LEADERBOARD_SUBMIT_COOLDOWN_MS - (nowMs - lastSubmitAtMs));
}

export function clearLiveLeaderboardSubmitCooldown(st) {
  if (st.liveLeaderboardSubmitCooldownTimer !== null) {
    globalThis.clearTimeout(st.liveLeaderboardSubmitCooldownTimer);
    st.liveLeaderboardSubmitCooldownTimer = null;
  }
  st.liveLeaderboardSubmitCooldownAt = null;
}

/**
 * Live submit / demo-add visibility (score threshold vs board eligibility).
 */
export function applyLeaderboardSubmitButtonVisibility({
  leaderboardUseDemoData,
  refs,
  qualifiesForBoardSlot,
  score,
  scoreSubmitThreshold,
  liveSubmitUsed,
  demoSubmitUsed,
  submitCooldownRemainingMs = 0,
}) {
  const { leaderboardButton, leaderboardDemoAdd, playerName } = refs;
  const nameReady = leaderboardNameHasLetters(playerName?.value);
  const namePolicyBlocksSubmit =
    nameReady && !isLeaderboardNameAcceptable(playerName?.value);

  if (leaderboardUseDemoData) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    if (leaderboardDemoAdd) {
      if (demoSubmitUsed) {
        leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
        leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
        leaderboardDemoAdd.disabled = true;
        leaderboardDemoAdd.classList.add("hiddenDisplay");
        leaderboardDemoAdd.classList.add("leaderboard-action--concealed");
        return;
      }

      leaderboardDemoAdd.classList.remove("hiddenDisplay");
      leaderboardDemoAdd.classList.remove("leaderboard-action--concealed");
      leaderboardDemoAdd.disabled = !nameReady;
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");

      if (qualifiesForBoardSlot && nameReady) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            leaderboardDemoAdd.classList.add("leaderboard-demo-add--eligible");
          });
        });
      }
    }
    return;
  }

  if (leaderboardDemoAdd) {
    leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
    leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
    leaderboardDemoAdd.disabled = false;
    leaderboardDemoAdd.classList.add("hiddenDisplay");
  }

  const runScore = Number(score);
  const meetsSubmitScoreMinimum =
    Number.isFinite(runScore) && runScore > scoreSubmitThreshold;
  if (namePolicyBlocksSubmit) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    leaderboardButton.disabled = true;
    leaderboardButton.style.removeProperty("background-color");
    return;
  }
  if (!meetsSubmitScoreMinimum) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    leaderboardButton.disabled = true;
    leaderboardButton.style.removeProperty("background-color");
    return;
  }

  leaderboardButton.classList.remove("hiddenDisplay");
  leaderboardButton.classList.toggle(
    "leaderboard-action--concealed",
    !qualifiesForBoardSlot
  );
  const submitCooldownActive = submitCooldownRemainingMs > 0;
  leaderboardButton.disabled = liveSubmitUsed || !nameReady || submitCooldownActive;
  if (liveSubmitUsed || submitCooldownActive) {
    leaderboardButton.style.backgroundColor = "rgba(95, 95, 95, 0.92)";
  } else {
    leaderboardButton.style.removeProperty("background-color");
  }
}
