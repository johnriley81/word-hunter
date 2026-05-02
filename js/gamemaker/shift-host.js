import { GRID_SIZE } from "../config.js";
import { applyColumnShiftInPlace, applyRowShiftInPlace } from "../board-logic.js";

/**
 * @param {{
 *   ctx: ReturnType<typeof import("../game-context.js").createGameContext>;
 *   getGameBoard: () => string[][];
 *   syncDomFromBoard: () => void;
 *   syncLineOverlaySize: () => void;
 *   lockGridSizeForSwipe: () => void;
 *   unlockGridSizeAfterSwipe: () => void;
 *   getIsGameActive: () => boolean;
 *   getIsMouseDown: () => boolean;
 * }} deps
 */
export function createGamemakerShiftHost(deps) {
  const {
    ctx,
    getGameBoard,
    syncDomFromBoard,
    syncLineOverlaySize,
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
    getIsGameActive,
    getIsMouseDown,
  } = deps;

  function endGame() {}

  const uiState = {
    get gameActive() {
      return getIsGameActive();
    },
    get paused() {
      return false;
    },
  };

  const shiftState = {
    get pointerId() {
      return ctx.state.shift.pointerId;
    },
    get animating() {
      return ctx.state.shift.animating;
    },
  };

  const shiftHost = {
    shiftState,
    uiState,
    getIsGameActive,
    getIsPaused: () => false,
    getIsMouseDown,
    getShiftsAllowed: () => !getIsMouseDown(),
    getIsMuted: () => true,
    endGame,
    syncDomFromBoard,
    applyColumnShift: (signedSteps) => {
      applyColumnShiftInPlace(getGameBoard(), signedSteps, GRID_SIZE);
      shiftHost.syncDomFromBoard();
    },
    applyRowShift: (signedSteps) => {
      applyRowShiftInPlace(getGameBoard(), signedSteps, GRID_SIZE);
      shiftHost.syncDomFromBoard();
    },
    syncLineOverlaySize,
    clearTapStreak: () => {
      ctx.state.shift.doubleTapPrevAt = 0;
    },
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
  };

  return { shiftHost, uiState, shiftState, endGame };
}
