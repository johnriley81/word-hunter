import { PRE_START_WORDMARK, currentWordNeutralTextColor } from "./config.js";
import { resetGameOverAudio } from "./audio.js";
import { bumpWordReplaceEpoch, clearWordSubmitFeedbackTimer } from "./word-drag.js";
import { clearWordLineTimers } from "./ui-word-line.js";

/**
 * Reset round UI/state to pregame. Caller supplies closures for game-specific wiring.
 */
export function resetRoundToPregame(deps, options = {}) {
  const { forImmediateStart = false, skipLeaderboardOverlayTeardown = false } = options;

  const {
    grid,
    gridLineContainer,
    leaderboardRtState,
    lbCtl,
    gameEndgame,
    clearTapStreak,
    resetShiftDragVisualHard,
    resetSelectionState,
    generateGrid,
    generateNextLetters,
    updateNextLetters,
    updateScore,
    setRulesOverlayVisible,
    syncLineOverlaySize,
    scheduleSyncLineOverlaySize,
    getGridButtonElements,
    refs,
    setGameActive,
    setPaused,
    setMouseDown,
    clearStartUiTransitionTimer,
    clearTilePaletteTransitionTimer,
    ctx,
    setScore,
    setTrophyWord,
    setTrophyWordScore,
  } = deps;

  const {
    rulesButton,
    muteButton,
    doneButton,
    buttonContainer,
    retryButton,
    boardShiftZone,
    startButton,
    currentWordElement,
    playerName,
    leaderboardButton,
    leaderboardDemoAdd,
  } = refs;

  grid.classList.remove("grid--awaiting-retry-fade-in");
  grid.classList.remove("grid--endgame-final-fade");
  grid.style.removeProperty("--endgame-grid-batch-fade-ms");
  setGameActive(false);
  setPaused(false);
  setMouseDown(false);
  clearTapStreak();

  gameEndgame.clearInternalEndgameTimers();

  if (leaderboardRtState.postgameCopyScoreTimer !== null) {
    globalThis.clearTimeout(leaderboardRtState.postgameCopyScoreTimer);
    leaderboardRtState.postgameCopyScoreTimer = null;
  }
  if (
    !skipLeaderboardOverlayTeardown &&
    leaderboardRtState.leaderboardFadeOutTimer !== null
  ) {
    globalThis.clearTimeout(leaderboardRtState.leaderboardFadeOutTimer);
    leaderboardRtState.leaderboardFadeOutTimer = null;
  }
  leaderboardRtState.postgameSequenceStarted = false;
  leaderboardRtState.demoLeaderboardRows = null;
  leaderboardRtState.liveLeaderboardPreviewRows = null;
  leaderboardRtState.liveLeaderboardEligibilityRows = null;
  leaderboardRtState.demoLeaderboardSubmitUsed = false;
  leaderboardRtState.liveLeaderboardSubmitUsed = false;
  leaderboardRtState.liveLeaderboardNameRejected = false;
  leaderboardRtState.liveLeaderboardRateLimitAt = null;
  if (!skipLeaderboardOverlayTeardown) {
    lbCtl.hidePostgameLeaderboardOverlay();
  }
  clearTilePaletteTransitionTimer();
  clearWordSubmitFeedbackTimer(ctx);
  bumpWordReplaceEpoch(ctx);
  clearStartUiTransitionTimer();
  clearWordLineTimers(ctx);

  resetGameOverAudio();

  leaderboardRtState.endgamePostUiReady = false;
  leaderboardRtState.endgameUiShown = false;
  leaderboardRtState.copyScoreLineUsed = false;
  leaderboardRtState.deferRetryUntilCopyScoreVisible = false;

  ctx.state.shift.animating = false;
  ctx.state.shift.pointerId = null;
  ctx.state.shift.dragLockedHorizontal = null;
  leaderboardRtState.playerPosition = undefined;

  setScore(0);
  setTrophyWord("");
  setTrophyWordScore(Number.NEGATIVE_INFINITY);

  resetShiftDragVisualHard();
  grid.style.width = "";
  grid.style.maxWidth = "";
  grid.style.height = "";

  while (gridLineContainer.firstChild) {
    gridLineContainer.firstChild.remove();
  }
  resetSelectionState();

  generateGrid();
  generateNextLetters();
  updateNextLetters();
  updateScore();

  setRulesOverlayVisible(false);

  rulesButton.classList.remove("hiddenDisplay", "hidden");
  muteButton.classList.remove("hiddenDisplay", "hidden");

  doneButton.classList.add("hiddenDisplay");
  doneButton.classList.remove("visibleDisplay");

  buttonContainer.classList.remove("hiddenDisplay");
  retryButton.classList.add("hiddenDisplay");
  retryButton.classList.remove("visibleDisplay", "dock-fade-in");

  if (forImmediateStart) {
    boardShiftZone.classList.remove("dock-fade-in");
    boardShiftZone.classList.add("hiddenDisplay");
    boardShiftZone.classList.remove("visibleDisplay");
    startButton.classList.add("hiddenDisplay");
    startButton.classList.remove("visibleDisplay");
    startButton.classList.remove("dock-fade-out");
    startButton.disabled = true;
  } else {
    boardShiftZone.classList.add("hiddenDisplay");
    boardShiftZone.classList.remove("visibleDisplay", "dock-fade-in");
    startButton.classList.remove("hiddenDisplay");
    startButton.classList.add("visibleDisplay");
    startButton.disabled = false;
    startButton.classList.remove("dock-fade-out");
  }

  currentWordElement.classList.remove(
    "current-word--soft-hidden",
    "current-word--valid-solve",
    "current-word--hunt-pace-line"
  );
  currentWordElement.style.color = currentWordNeutralTextColor();
  if (!forImmediateStart) {
    currentWordElement.textContent = PRE_START_WORDMARK;
  }

  playerName.classList.add("hiddenDisplay");
  playerName.disabled = false;
  leaderboardButton.classList.add("hiddenDisplay");
  leaderboardButton.classList.add("leaderboard-action--concealed");
  leaderboardButton.disabled = false;
  leaderboardButton.style.backgroundColor = "";
  if (leaderboardDemoAdd) {
    leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
    leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
    leaderboardDemoAdd.disabled = false;
    leaderboardDemoAdd.classList.add("hiddenDisplay");
  }

  const gridButtonElements = getGridButtonElements();
  for (let i = 0; i < gridButtonElements.length; i++) {
    gridButtonElements[i].classList.remove(
      "grid-button--palette-to-active",
      "grid-button--palette-to-inactive",
      "grid-button--palette-to-active-fade-in",
      "grid-button--selected-enter",
      "grid-button--invalid-shake",
      "grid-button--word-success",
      "grid-button--word-release-green",
      "grid-button--word-release-hunt-pace",
      "grid-button--letter-flip",
      "grid-button--letter-swap-in",
      "grid-button--slot-consumed",
      "grid-button--slot-consumed-hunt-pace",
      "grid-button--slot-consumed-instant",
      "grid-button--perfect-hunt-hint"
    );
  }

  if (forImmediateStart && skipLeaderboardOverlayTeardown) {
    grid.classList.add("grid--awaiting-retry-fade-in");
  }

  syncLineOverlaySize();
  scheduleSyncLineOverlaySize();
}
