import { LEADERBOARD_FETCH_CACHE_MS } from "./leaderboard-client.js";
import { leaderboardNameHasLetters } from "./leaderboard-lifecycle.js";

export const LEADERBOARD_SUBMIT_COOLDOWN_MS = LEADERBOARD_FETCH_CACHE_MS;
export const LEADERBOARD_SUBMIT_COOLDOWN_STORAGE_PREFIX = "wordhunter:lb-submit-at:";

export function leaderboardSubmitCooldownStorageKey(puzzleId) {
  return `${LEADERBOARD_SUBMIT_COOLDOWN_STORAGE_PREFIX}${String(puzzleId)}`;
}

export function leaderboardSubmitCooldownRemainingMs(
  lastSubmitAtMs,
  nowMs = Date.now(),
  windowMs = LEADERBOARD_SUBMIT_COOLDOWN_MS
) {
  if (lastSubmitAtMs == null || !Number.isFinite(lastSubmitAtMs)) return 0;
  return Math.max(0, windowMs - (nowMs - lastSubmitAtMs));
}

export function readPersistedLeaderboardSubmitAt(
  puzzleId,
  nowMs = Date.now(),
  storage = globalThis.localStorage
) {
  if (puzzleId == null || storage == null) return null;
  let raw;
  try {
    raw = storage.getItem(leaderboardSubmitCooldownStorageKey(puzzleId));
  } catch {
    return null;
  }
  if (raw == null || raw === "") return null;
  const lastSubmitAtMs = Number(raw);
  if (!Number.isFinite(lastSubmitAtMs)) {
    try {
      storage.removeItem(leaderboardSubmitCooldownStorageKey(puzzleId));
    } catch {
      /* ignore */
    }
    return null;
  }
  if (leaderboardSubmitCooldownRemainingMs(lastSubmitAtMs, nowMs) <= 0) {
    try {
      storage.removeItem(leaderboardSubmitCooldownStorageKey(puzzleId));
    } catch {
      /* ignore */
    }
    return null;
  }
  return lastSubmitAtMs;
}

export function writePersistedLeaderboardSubmitAt(
  puzzleId,
  lastSubmitAtMs,
  storage = globalThis.localStorage
) {
  if (puzzleId == null || storage == null) return;
  if (lastSubmitAtMs == null || !Number.isFinite(lastSubmitAtMs)) return;
  try {
    storage.setItem(
      leaderboardSubmitCooldownStorageKey(puzzleId),
      String(lastSubmitAtMs)
    );
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function clearPersistedLeaderboardSubmitAt(
  puzzleId,
  storage = globalThis.localStorage
) {
  if (puzzleId == null || storage == null) return;
  try {
    storage.removeItem(leaderboardSubmitCooldownStorageKey(puzzleId));
  } catch {
    /* ignore */
  }
}

export function clearLiveLeaderboardSubmitCooldown(
  st,
  puzzleId = null,
  storage = globalThis.localStorage
) {
  if (st.liveLeaderboardSubmitCooldownTimer !== null) {
    globalThis.clearTimeout(st.liveLeaderboardSubmitCooldownTimer);
    st.liveLeaderboardSubmitCooldownTimer = null;
  }
  st.liveLeaderboardSubmitCooldownAt = null;
  if (puzzleId != null) {
    clearPersistedLeaderboardSubmitAt(puzzleId, storage);
  }
}

export function syncLiveLeaderboardSubmitCooldown(
  st,
  puzzleId,
  nowMs = Date.now(),
  storage = globalThis.localStorage
) {
  const persisted = readPersistedLeaderboardSubmitAt(puzzleId, nowMs, storage);
  st.liveLeaderboardSubmitCooldownAt = persisted;
  return persisted;
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
  liveNameRejected = false,
  demoSubmitUsed,
  submitCooldownRemainingMs = 0,
}) {
  const { leaderboardButton, leaderboardDemoAdd, playerName } = refs;
  const nameReady = leaderboardNameHasLetters(playerName?.value);
  const turnSpent = liveSubmitUsed || liveNameRejected;

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

  if (turnSpent) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    leaderboardButton.disabled = true;
    leaderboardButton.style.removeProperty("background-color");
    return;
  }

  const runScore = Number(score);
  const meetsSubmitScoreMinimum =
    Number.isFinite(runScore) && runScore > scoreSubmitThreshold;
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
  leaderboardButton.disabled = !nameReady || submitCooldownActive;
  if (submitCooldownActive) {
    leaderboardButton.style.backgroundColor = "rgba(95, 95, 95, 0.92)";
  } else {
    leaderboardButton.style.removeProperty("background-color");
  }
}
