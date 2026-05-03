import {
  GRID_SIZE,
  SHIFT_AXIS_LOCK_PX,
  SHIFT_SLIDE_SENSITIVITY,
  SHIFT_SETTLE_MS,
  SHIFT_SETTLE_EASE,
  SHIFT_COMMIT_SNAP_MS,
  SHIFT_COMMIT_SNAP_EASE,
  SHIFT_COMMIT_SNAP_END_GRACE_MS,
  SHIFT_REJOIN_SNAP_MS,
  SHIFT_GESTURE_FALLBACK_MS,
  SHIFT_TAP_MAX_TRAVEL_PX,
  SHIFT_TAP_MAX_PRESS_MS,
  SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_TOUCH,
  SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_MOUSE,
} from "./config.js";
import {
  shiftCommitStepsFromAxisMag,
  shiftMaxStepsPerGesture,
  quantizeShiftVisualAxis,
  computeShiftSnapPlan,
  computeShiftStageTransformString,
  gridInverseCompensateTranslateString,
  computePerfectHuntStarterFlatWithRowHints,
} from "./board-logic.js";
import { getTileText, setTileText, syncConsumedEmptySlotVisual } from "./grid-tiles.js";
import { unlockGameAudio, playSound } from "./audio.js";

const SHIFT_PREVIEW_HUNT_HINT_CLASS = "shift-preview-tile--hunt-hint";

export function ensureShiftPreviewElements(ctx) {
  const { shiftPreviewStrip } = ctx.refs;
  if (!shiftPreviewStrip) return;
  let inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "shift-preview-inner";
    shiftPreviewStrip.appendChild(inner);
  }
  const cap = GRID_SIZE * GRID_SIZE;
  while (inner.querySelectorAll(".shift-preview-tile").length < cap) {
    const d = document.createElement("div");
    d.className = "grid-button grid-button--active shift-preview-tile";
    d.setAttribute("aria-hidden", "true");
    inner.appendChild(d);
  }
  inner.querySelectorAll(".shift-preview-tile").forEach((el) => {
    el.classList.add("grid-button--active");
    el.classList.remove("grid-button--inactive");
  });
}

export function attachShiftGestures(ctx, host) {
  const {
    grid,
    gridPan,
    gridStage,
    shiftPreviewStrip,
    gridLineWrapper,
    boardShiftZone,
    boardShiftHints,
    boardShiftDismissButton,
  } = ctx.refs;

  function resetShiftVisualState() {
    ctx.state.shift.visualTx = 0;
    ctx.state.shift.visualTy = 0;
    ctx.state.shift.visualStripCount = 0;
  }

  function getGridCellMetrics() {
    const tile = grid.querySelector(".grid-button");
    const gap =
      parseFloat(getComputedStyle(grid).columnGap) ||
      parseFloat(getComputedStyle(grid).gap) ||
      20;
    if (!tile) {
      return { tw: 72, th: 72, gap };
    }
    const br = tile.getBoundingClientRect();
    return { tw: br.width, th: br.height, gap };
  }

  function clearShiftPreview() {
    if (gridStage) {
      gridStage.classList.remove("grid-stage--col", "grid-stage--strip-end");
    }
    if (shiftPreviewStrip) {
      shiftPreviewStrip.classList.add("shift-preview-strip--hidden");
      shiftPreviewStrip.style.width = "";
      shiftPreviewStrip.style.height = "";
      shiftPreviewStrip.style.opacity = "";
      shiftPreviewStrip.style.transition = "";
      shiftPreviewStrip.style.overflow = "";
      const inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
      if (inner) {
        inner.classList.remove("shift-preview-inner--col", "shift-preview-inner--row");
        inner.style.gridTemplateColumns = "";
        inner.style.gridTemplateRows = "";
        inner.style.width = "";
        inner.style.height = "";
        inner.querySelectorAll(".shift-preview-tile").forEach((el) => {
          el.classList.remove(SHIFT_PREVIEW_HUNT_HINT_CLASS);
        });
      }
    }
  }

  function setPreviewInnerGrid(inner, nRows, nCols, m) {
    inner.style.gridTemplateColumns = `repeat(${nCols}, ${m.tw}px)`;
    inner.style.gridTemplateRows = `repeat(${nRows}, ${m.th}px)`;
    const w = nCols * m.tw + Math.max(0, nCols - 1) * m.gap;
    const h = nRows * m.th + Math.max(0, nRows - 1) * m.gap;
    inner.style.width = w + "px";
    inner.style.height = h + "px";
  }

  function showPreviewTiles(inner, need) {
    inner.querySelectorAll(".shift-preview-tile").forEach((el, i) => {
      el.style.display = i < need ? "" : "none";
    });
  }

  function fillPreviewStripWithBoard(inner, k, mapCellToBoard) {
    const n = GRID_SIZE;
    const tiles = inner.querySelectorAll(".shift-preview-tile");
    const need = n * k;
    const starterFlat =
      ctx.state.perfectHuntOnPace && ctx.state.perfectHuntHintStickyFlat != null
        ? ctx.state.perfectHuntHintStickyFlat
        : computePerfectHuntStarterFlatWithRowHints(
            ctx.state.gameBoard,
            ctx.state.perfectHunt,
            ctx.state.perfectHuntOrderIndex,
            ctx.state.perfectHuntOnPace,
            n,
            ctx.state.perfectHuntStarterFlats,
            ctx.state.perfectHuntStarterNeighborSigs,
            ctx.state.perfectHuntStarterTorNeighbors
          );
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove(SHIFT_PREVIEW_HUNT_HINT_CLASS);
    }
    let t = 0;
    for (let row = 0; row < need; row++) {
      const mapped = mapCellToBoard(row, n, k);
      const ch = ctx.state.gameBoard[mapped.r][mapped.c];
      const el = tiles[t++];
      if (getTileText(el) !== ch) setTileText(el, ch);
      syncConsumedEmptySlotVisual(el, ch);
      const mappedFlat = mapped.r * n + mapped.c;
      el.classList.toggle(
        SHIFT_PREVIEW_HUNT_HINT_CLASS,
        starterFlat != null && mappedFlat === starterFlat
      );
    }
    showPreviewTiles(inner, need);
  }

  function fillPreviewStripHorizontalLeft(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n, cols) => {
      const r = Math.floor(idx / cols);
      const cInStrip = idx % cols;
      return { r, c: n - cols + cInStrip };
    });
  }

  function fillPreviewStripHorizontalRight(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, _n, cols) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      return { r, c };
    });
  }

  function fillPreviewStripVerticalTop(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n, rows) => {
      const rInStrip = Math.floor(idx / n);
      const c = idx % n;
      return { r: n - rows + rInStrip, c };
    });
  }

  function fillPreviewStripVerticalBottom(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n) => {
      const r = Math.floor(idx / n);
      const c = idx % n;
      return { r, c };
    });
  }

  function updateShiftStageVisual(txVis, tyVis, horizontal, rawTx, rawTy) {
    if (rawTx === undefined) rawTx = txVis;
    if (rawTy === undefined) rawTy = tyVis;

    if (!gridStage || !shiftPreviewStrip) {
      ctx.state.shift.visualStripCount = 0;
      grid.style.transition = "none";
      grid.style.transform = `translate(${txVis}px, ${tyVis}px)`;
      return;
    }

    const inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
    if (!inner) return;

    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const strideX = m.tw + m.gap;
    const strideY = m.th + m.gap;
    const gridH = grid.offsetHeight;

    if (horizontal) {
      gridStage.classList.remove("grid-stage--col");
      if (txVis > 0) {
        const magRaw = Math.abs(rawTx);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideX, n);
        if (steps === 0) {
          ctx.state.shift.visualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(${txVis}px, 0)`;
          return;
        }
        const k = steps;
        ctx.state.shift.visualStripCount = k;
        ctx.state.shift.visualStripHorizontal = true;
        gridStage.classList.remove("grid-stage--strip-end");
        const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = ghostW + "px";
        shiftPreviewStrip.style.height = gridH + "px";
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        setPreviewInnerGrid(inner, n, k, m);
        fillPreviewStripHorizontalLeft(inner, k);
        const baseX = -(ghostW + m.gap) + txVis;
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(${baseX}px, 0)`;
      } else if (txVis < 0) {
        const magRaw = Math.abs(rawTx);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideX, n);
        if (steps === 0) {
          ctx.state.shift.visualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(${txVis}px, 0)`;
          return;
        }
        const k = steps;
        ctx.state.shift.visualStripCount = k;
        ctx.state.shift.visualStripHorizontal = true;
        gridStage.classList.add("grid-stage--strip-end");
        const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = ghostW + "px";
        shiftPreviewStrip.style.height = gridH + "px";
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        setPreviewInnerGrid(inner, n, k, m);
        fillPreviewStripHorizontalRight(inner, k);
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(${txVis}px, 0)`;
      } else {
        ctx.state.shift.visualStripCount = 0;
        clearShiftPreview();
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
    } else {
      gridStage.classList.add("grid-stage--col");
      const gridW = grid.offsetWidth;
      if (tyVis > 0) {
        const magRaw = Math.abs(rawTy);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideY, n);
        if (steps === 0) {
          ctx.state.shift.visualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(0, ${tyVis}px)`;
          return;
        }
        const k = steps;
        ctx.state.shift.visualStripCount = k;
        ctx.state.shift.visualStripHorizontal = false;
        gridStage.classList.remove("grid-stage--strip-end");
        const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = gridW + "px";
        shiftPreviewStrip.style.height = ghostH + "px";
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        setPreviewInnerGrid(inner, k, n, m);
        fillPreviewStripVerticalTop(inner, k);
        const baseY = -ghostH + tyVis;
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(0, ${baseY}px)`;
      } else if (tyVis < 0) {
        const magRaw = Math.abs(rawTy);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideY, n);
        if (steps === 0) {
          ctx.state.shift.visualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(0, ${tyVis}px)`;
          return;
        }
        const k = steps;
        ctx.state.shift.visualStripCount = k;
        ctx.state.shift.visualStripHorizontal = false;
        gridStage.classList.add("grid-stage--strip-end");
        const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = gridW + "px";
        shiftPreviewStrip.style.height = ghostH + "px";
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        setPreviewInnerGrid(inner, k, n, m);
        fillPreviewStripVerticalBottom(inner, k);
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(0, ${tyVis}px)`;
      } else {
        ctx.state.shift.visualStripCount = 0;
        clearShiftPreview();
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
    }
  }

  function armOneShotAudioUnlockOnGridAndShift() {
    const onFirstPointer = () => {
      void unlockGameAudio();
    };
    grid.addEventListener("pointerdown", onFirstPointer, {
      once: true,
      capture: true,
    });
    boardShiftZone.addEventListener("pointerdown", onFirstPointer, {
      once: true,
      capture: true,
    });
  }

  armOneShotAudioUnlockOnGridAndShift();

  boardShiftZone.addEventListener("pointerdown", onShiftPointerDown, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointermove", onShiftPointerMove, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointerup", onShiftPointerUp, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointercancel", onShiftPointerUp, {
    passive: false,
  });
  boardShiftZone.addEventListener(
    "touchmove",
    (event) => {
      if (!host.getIsGameActive() || host.getIsPaused()) return;
      if (event.cancelable) event.preventDefault();
    },
    { passive: false }
  );
  boardShiftZone.addEventListener(
    "touchend",
    (event) => {
      if (!host.getIsGameActive() || host.getIsPaused()) return;
      if (event.cancelable) event.preventDefault();
    },
    { passive: false }
  );
  if (boardShiftDismissButton && boardShiftHints) {
    let boardShiftHintsHideInProgress = false;
    const BOARD_SHIFT_HINTS_FADE_MS = 320;
    const hideBoardShiftHints = (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (
        boardShiftHintsHideInProgress ||
        boardShiftHints.classList.contains("hiddenDisplay")
      ) {
        return;
      }
      playSound("button2", host.getIsMuted());
      boardShiftHintsHideInProgress = true;
      boardShiftZone.classList.add("board-shift-zone--instructions-fading");
      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        boardShiftHints.removeEventListener("transitionend", onTransitionEnd);
        window.clearTimeout(fallbackTimer);
        boardShiftHints.classList.add("hiddenDisplay");
        boardShiftDismissButton.classList.add("hiddenDisplay");
        boardShiftZone.classList.remove("board-shift-zone--instructions-fading");
        boardShiftHintsHideInProgress = false;
      };
      const onTransitionEnd = (e) => {
        if (e.target !== boardShiftHints || e.propertyName !== "opacity") {
          return;
        }
        finalize();
      };
      boardShiftHints.addEventListener("transitionend", onTransitionEnd);
      const fallbackTimer = window.setTimeout(finalize, BOARD_SHIFT_HINTS_FADE_MS + 80);
    };
    boardShiftDismissButton.addEventListener("pointerdown", (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    });
    boardShiftDismissButton.addEventListener("pointerup", hideBoardShiftHints, {
      passive: false,
    });
    boardShiftDismissButton.addEventListener("touchend", hideBoardShiftHints, {
      passive: false,
    });
    boardShiftDismissButton.addEventListener("click", hideBoardShiftHints);
  }

  function resetShiftDragVisualHard() {
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    ctx.state.shift.visualTx = 0;
    ctx.state.shift.visualTy = 0;
    ctx.state.shift.visualStripCount = 0;
    host.unlockGridSizeAfterSwipe();
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    host.syncLineOverlaySize();
  }

  function finishShiftSwipeAnimation() {
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    ctx.state.shift.visualStripCount = 0;
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    ctx.state.shift.animating = false;
    host.syncLineOverlaySize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        host.unlockGridSizeAfterSwipe();
        host.syncLineOverlaySize();
      });
    });
  }

  function cancelGridShiftAnimations() {
    if (typeof grid.getAnimations === "function") {
      grid.getAnimations().forEach((a) => a.cancel());
    }
    if (gridStage && typeof gridStage.getAnimations === "function") {
      gridStage.getAnimations().forEach((a) => a.cancel());
    }
  }

  function animateGridSettleFromTo(dx, dy, onDone, durationMs) {
    const settleMs = durationMs != null ? durationMs : SHIFT_SETTLE_MS;
    const startT = `translate(${dx}px, ${dy}px)`;
    const endT = "translate(0px, 0px)";
    let doneCalled = false;
    let fallbackTimer = 0;

    const finish = () => {
      if (doneCalled) return;
      doneCalled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      cancelGridShiftAnimations();
      grid.style.transform = "";
      grid.style.transition = "";
      onDone();
    };

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      finish();
      return;
    }

    fallbackTimer = window.setTimeout(finish, SHIFT_GESTURE_FALLBACK_MS);

    if (typeof grid.animate === "function") {
      const anim = grid.animate([{ transform: startT }, { transform: endT }], {
        duration: settleMs,
        easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
        fill: "forwards",
      });
      anim.finished.then(() => finish()).catch(() => finish());
      return;
    }

    grid.style.transition = "none";
    grid.style.transform = startT;
    requestAnimationFrame(() => {
      grid.style.transition = `transform ${settleMs}ms ${SHIFT_SETTLE_EASE}`;
      grid.style.transform = endT;
      const onEnd = (ev) => {
        if (ev.target !== grid || ev.propertyName !== "transform") return;
        grid.removeEventListener("transitionend", onEnd);
        finish();
      };
      grid.addEventListener("transitionend", onEnd);
    });
  }

  function runShiftSpringBackToZero() {
    const hadMove = ctx.state.shift.visualTx !== 0 || ctx.state.shift.visualTy !== 0;
    ctx.state.shift.visualTx = 0;
    ctx.state.shift.visualTy = 0;
    if (!hadMove) {
      if (gridLineWrapper) {
        gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
      }
      clearShiftPreview();
      if (gridStage) {
        gridStage.style.transition = "";
        gridStage.style.transform = "";
      }
      if (gridPan) {
        gridPan.style.transition = "";
        gridPan.style.transform = "";
      }
      grid.style.transition = "";
      grid.style.transform = "";
      host.syncLineOverlaySize();
      return;
    }

    ctx.state.shift.animating = true;
    if (gridLineWrapper) {
      gridLineWrapper.classList.add("grid-line-wrapper--shift-clipping");
    }

    const before = grid.getBoundingClientRect();
    clearShiftPreview();
    if (gridStage) {
      gridStage.style.transition = "none";
      gridStage.style.transform = "";
    }
    if (gridPan) {
      gridPan.style.transition = "none";
      gridPan.style.transform = "";
    }
    grid.style.transition = "none";
    grid.style.transform = "";
    void grid.offsetHeight;
    const after = grid.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;

    host.syncLineOverlaySize();
    animateGridSettleFromTo(dx, dy, () => {
      finishShiftSwipeAnimation();
    });
  }

  function runShiftSettleAfterDrag(applyShift, meta) {
    const { horizontal, signedVis, k } = meta;
    ctx.state.shift.visualTx = 0;
    ctx.state.shift.visualTy = 0;

    ctx.state.shift.animating = true;
    if (gridLineWrapper) {
      gridLineWrapper.classList.add("grid-line-wrapper--shift-clipping");
    }

    const useStageSettle =
      gridStage &&
      shiftPreviewStrip &&
      !shiftPreviewStrip.classList.contains("shift-preview-strip--hidden");

    if (!useStageSettle) {
      const before = grid.getBoundingClientRect();
      clearShiftPreview();
      if (gridStage) {
        gridStage.style.transition = "none";
        gridStage.style.transform = "";
      }
      if (gridPan) {
        gridPan.style.transition = "none";
        gridPan.style.transform = "";
      }
      grid.style.transition = "none";
      grid.style.transform = "";
      applyShift();
      host.syncDomFromBoard();
      void grid.offsetHeight;
      const after = grid.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      host.syncLineOverlaySize();
      animateGridSettleFromTo(dx, dy, () => {
        finishShiftSwipeAnimation();
      });
      return;
    }

    const mDrag = getGridCellMetrics();
    let stageTransformFromDrag = gridStage.style.transform;
    if (!stageTransformFromDrag) {
      stageTransformFromDrag = computeShiftStageTransformString(
        horizontal,
        signedVis,
        k,
        mDrag
      );
    }

    grid.style.transition = "none";
    grid.style.transform = "";

    const { targetTransform, skipSnapAnimate } = computeShiftSnapPlan(
      horizontal,
      signedVis,
      k,
      mDrag,
      stageTransformFromDrag
    );

    const useWaapiSettle =
      typeof gridStage.animate === "function" && typeof grid.animate === "function";

    let rejoinDone = false;
    let fallbackTimer;
    let snapEndTimer = null;
    let snapStageTransitionEndHandler = null;
    let snapWaapiAnim = null;
    let snapWaapiSafetyTimer = null;
    let rejoinWaapiStageAnim = null;
    let rejoinWaapiGridAnim = null;
    let rejoinWaapiSafetyTimer = null;
    let commitDone = false;

    const commitBoardNow = () => {
      if (commitDone) return;
      commitDone = true;
      applyShift();
      host.syncDomFromBoard();
      host.syncLineOverlaySize();
    };

    const afterSnapTeardown = () => {
      if (rejoinDone) {
        return;
      }
      rejoinDone = true;
      window.clearTimeout(fallbackTimer);
      if (snapEndTimer != null) {
        window.clearTimeout(snapEndTimer);
        snapEndTimer = null;
      }
      if (snapWaapiSafetyTimer != null) {
        window.clearTimeout(snapWaapiSafetyTimer);
        snapWaapiSafetyTimer = null;
      }
      if (snapWaapiAnim) {
        try {
          snapWaapiAnim.cancel();
        } catch (_) {}
        snapWaapiAnim = null;
      }
      if (gridStage && snapStageTransitionEndHandler) {
        gridStage.removeEventListener("transitionend", snapStageTransitionEndHandler);
        snapStageTransitionEndHandler = null;
      }
      if (gridStage) {
        gridStage.style.transition = "";
      }
      const stageCssForComp =
        gridStage && gridStage.style.transform ? gridStage.style.transform : "none";
      const gridComp0 = gridInverseCompensateTranslateString(stageCssForComp);
      grid.style.transition = "none";
      grid.style.transform = gridComp0;
      void grid.offsetHeight;
      clearShiftPreview();
      commitBoardNow();

      const stageT = gridStage ? gridStage.style.transform : "";
      const stageAtRest =
        !stageT ||
        stageT === "none" ||
        stageT === "translate(0px, 0px)" ||
        stageT === "translate(0, 0)";

      let rejoinTimer = null;
      let rejoinFinished = false;
      let rejoinStageEnded = false;
      let rejoinGridEnded = false;

      function onRejoinTransitionEnd(ev) {
        if (ev.target !== gridStage && ev.target !== grid) {
          return;
        }
        if (ev.propertyName !== "transform" && ev.propertyName !== "translate") {
          return;
        }
        if (rejoinTimer != null) {
          window.clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }
        if (ev.target === gridStage) {
          if (rejoinStageEnded) return;
          rejoinStageEnded = true;
        } else {
          if (rejoinGridEnded) return;
          rejoinGridEnded = true;
        }
        if (rejoinStageEnded && rejoinGridEnded) {
          if (gridStage) {
            gridStage.removeEventListener("transitionend", onRejoinTransitionEnd);
          }
          grid.removeEventListener("transitionend", onRejoinTransitionEnd);
          finishRejoin();
        }
      }

      function finishRejoin() {
        if (rejoinFinished) {
          return;
        }
        rejoinFinished = true;
        if (rejoinWaapiSafetyTimer != null) {
          window.clearTimeout(rejoinWaapiSafetyTimer);
          rejoinWaapiSafetyTimer = null;
        }
        if (rejoinWaapiStageAnim) {
          try {
            rejoinWaapiStageAnim.cancel();
          } catch (_) {}
          rejoinWaapiStageAnim = null;
        }
        if (rejoinWaapiGridAnim) {
          try {
            rejoinWaapiGridAnim.cancel();
          } catch (_) {}
          rejoinWaapiGridAnim = null;
        }
        if (rejoinTimer != null) {
          window.clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }
        if (gridStage) {
          gridStage.removeEventListener("transitionend", onRejoinTransitionEnd);
        }
        grid.removeEventListener("transitionend", onRejoinTransitionEnd);
        if (gridStage) {
          gridStage.style.transition = "";
          gridStage.style.transform = "";
        }
        grid.style.transition = "";
        grid.style.transform = "";
        finishShiftSwipeAnimation();
      }

      if (!gridStage || stageAtRest) {
        finishRejoin();
        return;
      }

      if (useWaapiSettle) {
        const stageFrom = gridStage.style.transform || "translate(0px, 0px)";
        gridStage.style.transition = "none";
        void gridStage.offsetHeight;
        void grid.offsetHeight;
        rejoinWaapiStageAnim = gridStage.animate(
          [{ transform: stageFrom }, { transform: "translate(0px, 0px)" }],
          {
            duration: SHIFT_REJOIN_SNAP_MS,
            easing: SHIFT_COMMIT_SNAP_EASE,
            fill: "forwards",
          }
        );
        rejoinWaapiGridAnim = grid.animate(
          [{ transform: gridComp0 }, { transform: "translate(0px, 0px)" }],
          {
            duration: SHIFT_REJOIN_SNAP_MS,
            easing: SHIFT_COMMIT_SNAP_EASE,
            fill: "forwards",
          }
        );
        rejoinWaapiSafetyTimer = window.setTimeout(() => {
          rejoinWaapiSafetyTimer = null;
          finishRejoin();
        }, SHIFT_REJOIN_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
        Promise.all([rejoinWaapiStageAnim.finished, rejoinWaapiGridAnim.finished])
          .then(() => {
            if (rejoinWaapiSafetyTimer != null) {
              window.clearTimeout(rejoinWaapiSafetyTimer);
              rejoinWaapiSafetyTimer = null;
            }
            if (rejoinFinished) return;
            finishRejoin();
          })
          .catch(() => {});
      } else {
        rejoinTimer = window.setTimeout(() => {
          rejoinTimer = null;
          finishRejoin();
        }, SHIFT_REJOIN_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);

        gridStage.style.transition = "none";
        void gridStage.offsetHeight;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (gridStage) {
              gridStage.removeEventListener("transitionend", onRejoinTransitionEnd);
              gridStage.addEventListener("transitionend", onRejoinTransitionEnd);
            }
            grid.removeEventListener("transitionend", onRejoinTransitionEnd);
            grid.addEventListener("transitionend", onRejoinTransitionEnd);
            gridStage.style.transition = `transform ${SHIFT_REJOIN_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
            grid.style.transition = `transform ${SHIFT_REJOIN_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
            void grid.offsetHeight;
            void gridStage.offsetHeight;
            gridStage.style.transform = "translate(0px, 0px)";
            grid.style.transform = "translate(0px, 0px)";
          });
        });
      }
    };

    fallbackTimer = window.setTimeout(() => {
      afterSnapTeardown();
    }, SHIFT_GESTURE_FALLBACK_MS);

    host.syncLineOverlaySize();

    if (skipSnapAnimate) {
      gridStage.style.transition = "none";
      gridStage.style.transform = targetTransform;
      void grid.offsetHeight;
      requestAnimationFrame(() => afterSnapTeardown());
    } else if (useWaapiSettle) {
      gridStage.style.transition = "none";
      gridStage.style.transform = stageTransformFromDrag;
      void gridStage.offsetHeight;
      snapWaapiAnim = gridStage.animate(
        [{ transform: stageTransformFromDrag }, { transform: targetTransform }],
        {
          duration: SHIFT_COMMIT_SNAP_MS,
          easing: SHIFT_COMMIT_SNAP_EASE,
          fill: "forwards",
        }
      );
      snapWaapiSafetyTimer = window.setTimeout(() => {
        snapWaapiSafetyTimer = null;
        afterSnapTeardown();
      }, SHIFT_COMMIT_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
      snapWaapiAnim.finished
        .then(() => {
          if (snapWaapiSafetyTimer != null) {
            window.clearTimeout(snapWaapiSafetyTimer);
            snapWaapiSafetyTimer = null;
          }
          if (rejoinDone) return;
          afterSnapTeardown();
        })
        .catch(() => {});
    } else {
      snapStageTransitionEndHandler = (ev) => {
        if (ev.target !== gridStage) {
          return;
        }
        if (ev.propertyName !== "transform" && ev.propertyName !== "translate") {
          return;
        }
        if (gridStage && snapStageTransitionEndHandler) {
          gridStage.removeEventListener("transitionend", snapStageTransitionEndHandler);
          snapStageTransitionEndHandler = null;
        }
        window.clearTimeout(snapEndTimer);
        snapEndTimer = null;
        afterSnapTeardown();
      };
      snapEndTimer = window.setTimeout(() => {
        snapEndTimer = null;
        afterSnapTeardown();
      }, SHIFT_COMMIT_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
      gridStage.style.transition = "none";
      gridStage.style.transform = stageTransformFromDrag;
      void gridStage.offsetHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gridStage && snapStageTransitionEndHandler) {
            gridStage.removeEventListener(
              "transitionend",
              snapStageTransitionEndHandler
            );
          }
          gridStage.addEventListener("transitionend", snapStageTransitionEndHandler);
          gridStage.style.transition = `transform ${SHIFT_COMMIT_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
          gridStage.style.transform = targetTransform;
        });
      });
    }
  }

  function onShiftPointerDown(e) {
    if (typeof host.getShiftsAllowed === "function" && !host.getShiftsAllowed()) return;
    if (!host.uiState.gameActive || host.uiState.paused || host.shiftState.animating)
      return;
    if (e.button != null && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    ctx.state.shift.pointerDownAt = performance.now();
    void unlockGameAudio();
    cancelGridShiftAnimations();
    ctx.state.shift.pointerId = e.pointerId;
    ctx.state.shift.startX = e.clientX;
    ctx.state.shift.startY = e.clientY;
    ctx.state.shift.dragLockedHorizontal = null;
    resetShiftVisualState();
    ctx.state.shift.visualStripHorizontal = false;
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    host.unlockGridSizeAfterSwipe();
    host.lockGridSizeForSwipe();
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    host.syncLineOverlaySize();
    try {
      boardShiftZone.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onShiftPointerMove(e) {
    if (host.shiftState.pointerId !== e.pointerId || host.shiftState.animating) return;
    if (e.cancelable) e.preventDefault();

    const samples =
      typeof e.getCoalescedEvents === "function"
        ? (() => {
            const c = e.getCoalescedEvents();
            return c.length ? c : [e];
          })()
        : [e];

    if (ctx.state.shift.dragLockedHorizontal === null) {
      for (let si = 0; si < samples.length; si++) {
        const sample = samples[si];
        const sdx = sample.clientX - ctx.state.shift.startX;
        const sdy = sample.clientY - ctx.state.shift.startY;
        const sadx = Math.abs(sdx);
        const sady = Math.abs(sdy);
        if (Math.max(sadx, sady) >= SHIFT_AXIS_LOCK_PX) {
          ctx.state.shift.dragLockedHorizontal = sadx >= sady;
          break;
        }
      }
    }

    if (ctx.state.shift.dragLockedHorizontal === null) {
      if (gridPan) {
        gridPan.style.transition = "none";
        gridPan.style.transform = "";
      }
      if (gridStage) {
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
      grid.style.transition = "none";
      grid.style.transform = "translate(0, 0)";
      clearShiftPreview();
      resetShiftVisualState();
      host.syncLineOverlaySize();
      return;
    }

    const dx = e.clientX - ctx.state.shift.startX;
    const dy = e.clientY - ctx.state.shift.startY;
    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const stride = ctx.state.shift.dragLockedHorizontal ? m.tw + m.gap : m.th + m.gap;
    const maxSlide = shiftMaxStepsPerGesture(n) * stride;
    const axis = ctx.state.shift.dragLockedHorizontal ? dx : dy;
    const clamped = Math.max(
      Math.min(axis * SHIFT_SLIDE_SENSITIVITY, maxSlide),
      -maxSlide
    );
    let tx = 0;
    let ty = 0;
    if (ctx.state.shift.dragLockedHorizontal) {
      tx = clamped;
    } else {
      ty = clamped;
    }
    const q = quantizeShiftVisualAxis(
      tx,
      ty,
      ctx.state.shift.dragLockedHorizontal,
      stride,
      n
    );
    updateShiftStageVisual(
      q.tx,
      q.ty,
      ctx.state.shift.dragLockedHorizontal,
      q.rawTx,
      q.rawTy
    );
    ctx.state.shift.visualTx = q.tx;
    ctx.state.shift.visualTy = q.ty;
    host.syncLineOverlaySize();
  }

  function onShiftPointerUp(e) {
    if (host.shiftState.pointerId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    try {
      boardShiftZone.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const dx = e.clientX - ctx.state.shift.startX;
    const dy = e.clientY - ctx.state.shift.startY;
    const travel = Math.hypot(dx, dy);
    const pressMs = performance.now() - ctx.state.shift.pointerDownAt;
    const lockedHorizontal = ctx.state.shift.dragLockedHorizontal;
    ctx.state.shift.dragLockedHorizontal = null;
    ctx.state.shift.pointerId = null;

    const noSwipeAxisLock = lockedHorizontal === null;
    const looksLikeTap =
      noSwipeAxisLock &&
      travel < SHIFT_TAP_MAX_TRAVEL_PX &&
      pressMs < SHIFT_TAP_MAX_PRESS_MS &&
      host.getIsGameActive() &&
      !host.getIsPaused() &&
      !ctx.state.shift.animating &&
      !host.getIsMouseDown();

    if (looksLikeTap) {
      const now = performance.now();
      const doubleEndGapMs =
        e.pointerType === "mouse" || e.pointerType === "pen"
          ? SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_MOUSE
          : SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_TOUCH;
      if (
        ctx.state.shift.doubleTapPrevAt > 0 &&
        now - ctx.state.shift.doubleTapPrevAt < doubleEndGapMs
      ) {
        host.clearTapStreak();
        resetShiftDragVisualHard();
        host.endGame();
        return;
      }
      ctx.state.shift.doubleTapPrevAt = now;
      return;
    } else {
      host.clearTapStreak();
    }

    tryApplyBoardShift(dx, dy, lockedHorizontal);
  }

  function tryApplyBoardShift(dx, dy, lockedHorizontal) {
    if (ctx.state.shift.animating) return;

    const hadVisual = ctx.state.shift.visualTx !== 0 || ctx.state.shift.visualTy !== 0;

    if (!host.getIsGameActive() || host.getIsPaused()) {
      resetShiftDragVisualHard();
      return;
    }
    if (typeof host.getShiftsAllowed === "function" && !host.getShiftsAllowed()) {
      resetShiftDragVisualHard();
      return;
    }
    if (host.getIsMouseDown()) {
      if (hadVisual) {
        runShiftSpringBackToZero();
      } else {
        resetShiftDragVisualHard();
      }
      return;
    }

    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const horizontal =
      lockedHorizontal !== null ? lockedHorizontal : Math.abs(dx) >= Math.abs(dy);
    const stride = horizontal ? m.tw + m.gap : m.th + m.gap;
    const magVis = horizontal
      ? Math.abs(ctx.state.shift.visualTx)
      : Math.abs(ctx.state.shift.visualTy);
    const signedVis = horizontal ? ctx.state.shift.visualTx : ctx.state.shift.visualTy;

    const steps = shiftCommitStepsFromAxisMag(magVis, stride, n);
    if (steps === 0) {
      if (hadVisual) {
        runShiftSpringBackToZero();
      }
      return;
    }

    const applyShift = () => {
      const signedSteps = signedVis >= 0 ? steps : -steps;
      if (horizontal) {
        host.applyColumnShift(signedSteps);
      } else {
        host.applyRowShift(signedSteps);
      }
    };
    runShiftSettleAfterDrag(applyShift, { horizontal, signedVis, k: steps });
  }

  return { resetShiftDragVisualHard };
}
