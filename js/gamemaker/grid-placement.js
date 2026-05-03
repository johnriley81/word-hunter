import { GRID_SIZE, WORD_PATH_COLOR_STEPS, WORD_INVALID_SHAKE_MS } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  torNeighborQuadExportTokensFromBoard,
} from "../board-logic.js";
import { getTileButtonFromEvent, setTileTextAllowEmpty } from "../grid-tiles.js";
import { isAdjacentGridTiles, syncSelectionVisitDepthOnGrid } from "../word-play.js";
import { wordPathDragStrokeColorAt } from "../word-path.js";
import { clearWordSubmitFeedbackTimer } from "../word-drag.js";
import { ensureShiftPreviewElements } from "../shift-dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function copyBoard4(/** @type {string[][]} */ src) {
  return src.map((row) => row.slice());
}

function makeEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function clearLines(gridLineContainer) {
  while (gridLineContainer.firstChild) {
    gridLineContainer.firstChild.remove();
  }
}

export function buttonFlatIndex(grid, button) {
  const i = Array.prototype.indexOf.call(grid.children, button);
  return i < 0 ? -1 : i;
}

/**
 * @param {{
 *   ctx: ReturnType<typeof import("../game-context.js").createGameContext>;
 *   grid: HTMLElement;
 *   gridLineContainer: HTMLElement;
 *   gridLineWrapper: HTMLElement | null;
 *   getTargetEntry: () => unknown | null;
 *   getCurrentWordIndexAsc: () => number;
 *   getWordSet: () => Set<string>;
 *   getGameActive: () => boolean;
 *   setMouseDown: (v: boolean) => void;
 *   getMouseDown: () => boolean;
 *   getBoardSnapshotPreDrag: () => string[][] | null;
 *   setBoardSnapshotPreDrag: (v: string[][] | null) => void;
 *   onToolbarLetterProgress?: () => void;
 *   appendBuildPlay: (play: {
 *     word: string;
 *     min_tiles: number;
 *     pathFlat: number[];
 *     covered: string[];
 *     starter_tor_neighbor_quad: string[];
 *   }) => void;
 *   bumpPlacementStep: () => void;
 *   updateUi: () => void;
 * }} deps
 */
export function createGridPlacementApi(deps) {
  const {
    ctx,
    grid,
    gridLineContainer,
    gridLineWrapper,
    getTargetEntry,
    getCurrentWordIndexAsc,
    getWordSet,
    getGameActive,
    setMouseDown,
    getMouseDown,
    getBoardSnapshotPreDrag,
    setBoardSnapshotPreDrag,
    appendBuildPlay,
    bumpPlacementStep,
    updateUi,
    onToolbarLetterProgress,
  } = deps;

  const word = ctx.state.word;

  function syncBuildDomFromBoardFixed(g, gameBoard) {
    const n = GRID_SIZE;
    const tiles = g.children;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        setTileTextAllowEmpty(tiles[r * n + c], gameBoard[r][c]);
      }
    }
  }

  function restyleAllWordConnectorLines() {
    const lineEls = gridLineContainer.querySelectorAll("line");
    let defs = gridLineContainer.querySelector("defs");
    if (lineEls.length === 0) {
      if (defs) defs.remove();
      return;
    }
    const nSel = word.selectedButtons.length;
    if (nSel < 2 || lineEls.length !== nSel - 1) return;
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      gridLineContainer.insertBefore(defs, gridLineContainer.firstChild);
    }
    defs.replaceChildren();
    const gridRect = grid.getBoundingClientRect();
    const colorSpan = WORD_PATH_COLOR_STEPS;
    const pathColorPhase = (k) => (((k / colorSpan) % 1) + 1) % 1;
    for (let i = 0; i < lineEls.length; i++) {
      const line = lineEls[i];
      const btnA = word.selectedButtons[i];
      const btnB = word.selectedButtons[i + 1];
      const lastRect = btnA.getBoundingClientRect();
      const currRect = btnB.getBoundingClientRect();
      const x1 = lastRect.left + lastRect.width / 2 - gridRect.left;
      const y1 = lastRect.top + lastRect.height / 2 - gridRect.top;
      const x2 = currRect.left + currRect.width / 2 - gridRect.left;
      const y2 = currRect.top + currRect.height / 2 - gridRect.top;
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      const p0 = pathColorPhase(i);
      const p1 = pathColorPhase(i + 1);
      const gradId = "gm-conn-grad-" + i;
      const grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("gradientUnits", "userSpaceOnUse");
      grad.setAttribute("x1", String(x1));
      grad.setAttribute("y1", String(y1));
      grad.setAttribute("x2", String(x2));
      grad.setAttribute("y2", String(y2));
      const stop0 = document.createElementNS(SVG_NS, "stop");
      stop0.setAttribute("offset", "0%");
      stop0.setAttribute("stop-color", wordPathDragStrokeColorAt(p0));
      const stop1 = document.createElementNS(SVG_NS, "stop");
      stop1.setAttribute("offset", "100%");
      stop1.setAttribute("stop-color", wordPathDragStrokeColorAt(p1));
      grad.appendChild(stop0);
      grad.appendChild(stop1);
      defs.appendChild(grad);
      line.setAttribute("stroke", "url(#" + gradId + ")");
    }
  }

  function syncLineOverlaySize() {
    if (!gridLineWrapper) return;
    const wrap = gridLineWrapper.getBoundingClientRect();
    const gridR = grid.getBoundingClientRect();
    const offsetLeft = Math.round(gridR.left - wrap.left);
    const offsetTop = Math.round(gridR.top - wrap.top);
    gridLineContainer.style.left = offsetLeft + "px";
    gridLineContainer.style.top = offsetTop + "px";
    gridLineContainer.style.width = grid.offsetWidth + "px";
    gridLineContainer.style.height = grid.offsetHeight + "px";
  }

  let gamemakerLineOverlaySyncRaf = 0;

  function scheduleSyncLineOverlaySize() {
    if (gamemakerLineOverlaySyncRaf !== 0) return;
    gamemakerLineOverlaySyncRaf = window.requestAnimationFrame(() => {
      gamemakerLineOverlaySyncRaf = 0;
      syncLineOverlaySize();
    });
  }

  function lockGridSizeForSwipe() {
    if (ctx.state.shift.lockedGridWidthPx > 0 && ctx.state.shift.lockedGridHeightPx > 0)
      return;
    const br = grid.getBoundingClientRect();
    if (br.width < 1 || br.height < 1) return;
    ctx.state.shift.lockedGridWidthPx = br.width;
    ctx.state.shift.lockedGridHeightPx = br.height;
    grid.style.width = ctx.state.shift.lockedGridWidthPx + "px";
    grid.style.maxWidth = ctx.state.shift.lockedGridWidthPx + "px";
    grid.style.height = ctx.state.shift.lockedGridHeightPx + "px";
  }

  function unlockGridSizeAfterSwipe() {
    ctx.state.shift.lockedGridWidthPx = 0;
    ctx.state.shift.lockedGridHeightPx = 0;
  }

  function clearSelectionVisual() {
    for (const b of word.selectedButtons) {
      b.classList.remove(
        "selected",
        "grid-button--selected-enter",
        "grid-button--invalid-shake"
      );
      b.removeAttribute("data-selection-visits");
    }
    clearLines(gridLineContainer);
  }

  function resetSelection() {
    clearWordSubmitFeedbackTimer(ctx);
    word.currentWord = "";
    clearSelectionVisual();
    word.selectedButtons = [];
    word.selectedButtonSet = new Set();
    word.lastButton = null;
    setBoardSnapshotPreDrag(null);
  }

  function revertBoardToPreDragSnapshot() {
    const snap = getBoardSnapshotPreDrag();
    if (!snap) return;
    const n = GRID_SIZE;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.state.gameBoard[r][c] = snap[r][c];
      }
    }
    syncBuildDomFromBoardFixed(grid, ctx.state.gameBoard);
  }

  function updateSelectionVisits() {
    syncSelectionVisitDepthOnGrid(grid, word.selectedButtons);
  }

  function refreshPathIntoBoardAndDom() {
    const entry = getTargetEntry();
    const snap = getBoardSnapshotPreDrag();
    if (!snap || !entry) return;
    const glyphs = wordToTileLabelSequence(
      String(/** @type {{ word?: string }} */ (entry).word || "").toLowerCase()
    );
    const n = GRID_SIZE;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.state.gameBoard[r][c] = snap[r][c];
      }
    }
    for (let i = 0; i < word.selectedButtons.length; i++) {
      const f = buttonFlatIndex(grid, word.selectedButtons[i]);
      if (f < 0) continue;
      const rr = Math.floor(f / n);
      const cc = f % n;
      const g = glyphs[i];
      if (g) ctx.state.gameBoard[rr][cc] = g;
    }
    syncBuildDomFromBoardFixed(grid, ctx.state.gameBoard);
  }

  function beginOnButton(targetButton) {
    if (!targetButton) return;
    if (word.wordReplaceLockGen !== 0) return;
    if (!getGameActive()) return;
    if (!targetButton.classList.contains("grid-button")) return;
    const entry = getTargetEntry();
    if (!entry) return;
    const glyphs = wordToTileLabelSequence(
      String(/** @type {{ word?: string }} */ (entry).word || "").toLowerCase()
    );
    if (glyphs.length === 0) return;
    if (word.selectedButtons.length === 0) {
      setBoardSnapshotPreDrag(copyBoard4(ctx.state.gameBoard));
    }
    setMouseDown(true);
    word.selectedButtons.push(targetButton);
    word.selectedButtonSet.add(targetButton);
    targetButton.classList.add("selected");
    word.lastButton = targetButton;
    updateSelectionVisits();
    refreshPathIntoBoardAndDom();
    onToolbarLetterProgress?.();
  }

  function extendToButton(targetButton) {
    if (!targetButton) return;
    if (!getMouseDown()) return;
    if (!getGameActive()) return;
    if (!getTargetEntry()) return;
    if (
      isAdjacentGridTiles(grid, word.lastButton, targetButton, GRID_SIZE) &&
      targetButton.classList.contains("grid-button")
    ) {
      if (targetButton === word.selectedButtons[word.selectedButtons.length - 2]) {
        const removed = word.selectedButtons.pop();
        const linesOnly = gridLineContainer.querySelectorAll("line");
        if (linesOnly.length) linesOnly[linesOnly.length - 1].remove();
        restyleAllWordConnectorLines();
        if (!word.selectedButtons.includes(removed)) {
          removed.classList.remove("selected", "grid-button--selected-enter");
          word.selectedButtonSet.delete(removed);
        }
        word.lastButton = targetButton;
        updateSelectionVisits();
        refreshPathIntoBoardAndDom();
      } else {
        word.selectedButtons.push(targetButton);
        word.selectedButtonSet.add(targetButton);
        targetButton.classList.add("selected");
        if (word.lastButton) {
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("stroke-width", "3");
          gridLineContainer.appendChild(line);
          restyleAllWordConnectorLines();
        }
        word.lastButton = targetButton;
        updateSelectionVisits();
        const nv = targetButton.getAttribute("data-selection-visits");
        if (nv === "1") {
          targetButton.classList.add("grid-button--selected-enter");
        }
        refreshPathIntoBoardAndDom();
      }
      onToolbarLetterProgress?.();
    }
  }

  function validatePathAgainstTarget() {
    const entry = getTargetEntry();
    if (!entry) return { ok: false, reason: "no target" };
    const w = String(/** @type {{ word?: string }} */ (entry).word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const minTiles = minUniqueTilesForReuseRule(glyphs);
    if (word.selectedButtons.length !== glyphs.length) {
      return { ok: false, reason: "path length" };
    }
    if (new Set(word.selectedButtons).size !== minTiles) {
      return { ok: false, reason: "min_tiles" };
    }
    if (!getWordSet().has(w)) {
      return { ok: false, reason: "dict" };
    }
    return { ok: true, reason: "ok" };
  }

  function applyCommitToBoard() {
    const entry = getTargetEntry();
    if (!entry) return;
    const w = String(/** @type {{ word?: string }} */ (entry).word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const minTiles = minUniqueTilesForReuseRule(glyphs);
    const pathFlat = word.selectedButtons.map((b) => buttonFlatIndex(grid, b));
    const firstSeen = new Set();
    const firstVisits = [];
    for (const b of word.selectedButtons) {
      if (!firstSeen.has(b)) {
        firstSeen.add(b);
        firstVisits.push(b);
      }
    }
    const snap = getBoardSnapshotPreDrag();
    const covered = firstVisits.map((b) => {
      const f = buttonFlatIndex(grid, b);
      if (f < 0 || !snap) return "";
      const r = Math.floor(f / GRID_SIZE);
      const c = f % GRID_SIZE;
      return (snap[r] && snap[r][c]) || "";
    });
    for (let i = 0; i < word.selectedButtons.length; i++) {
      const b = word.selectedButtons[i];
      const g = glyphs[i];
      const f = pathFlat[i];
      const r = Math.floor(f / GRID_SIZE);
      const c = f % GRID_SIZE;
      ctx.state.gameBoard[r][c] = g;
      setTileTextAllowEmpty(b, g);
    }
    setBoardSnapshotPreDrag(null);
    const wiAsc = getCurrentWordIndexAsc();
    if (wiAsc >= 0) {
      const starterTorQuad = torNeighborQuadExportTokensFromBoard(
        ctx.state.gameBoard,
        pathFlat[0],
        GRID_SIZE
      );
      appendBuildPlay({
        word: w,
        min_tiles: minTiles,
        pathFlat,
        covered,
        starter_tor_neighbor_quad: starterTorQuad,
      });
    }
  }

  function onPointerUp() {
    if (!getMouseDown()) return;
    setMouseDown(false);
    const val = validatePathAgainstTarget();
    if (val.ok) {
      applyCommitToBoard();
      bumpPlacementStep();
      resetSelection();
      updateUi();
    } else {
      revertBoardToPreDragSnapshot();
      for (let i = 0; i < word.selectedButtons.length; i++) {
        word.selectedButtons[i].classList.add("grid-button--invalid-shake");
      }
      window.setTimeout(() => {
        resetSelection();
        updateUi();
      }, WORD_INVALID_SHAKE_MS);
    }
  }

  function emptyBoard() {
    const n = GRID_SIZE;
    ctx.state.gameBoard = [];
    for (let r = 0; r < n; r++) {
      ctx.state.gameBoard[r] = [];
      for (let c = 0; c < n; c++) {
        ctx.state.gameBoard[r][c] = "";
      }
    }
  }

  function buildEmptyGrid() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const n = GRID_SIZE;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const button = makeEl("button", "grid-button grid-button--active");
        button.type = "button";
        setTileTextAllowEmpty(button, "");
        button.addEventListener("mousedown", (e) => {
          e.preventDefault();
          if (!getGameActive()) return;
          beginOnButton(getTileButtonFromEvent(grid, e));
        });
        button.addEventListener("mouseover", (e) => {
          if (!getGameActive()) return;
          extendToButton(getTileButtonFromEvent(grid, e));
        });
        button.addEventListener(
          "touchstart",
          (e) => {
            e.preventDefault();
            if (!getGameActive()) return;
            beginOnButton(getTileButtonFromEvent(grid, e));
          },
          { passive: false }
        );
        button.addEventListener("touchmove", (e) => {
          e.preventDefault();
          const t = e.touches[0];
          const el2 = document.elementFromPoint(t.clientX, t.clientY);
          const b = el2 && el2 instanceof Element ? el2.closest(".grid-button") : null;
          if (b && grid.contains(b)) extendToButton(b);
        });
        grid.appendChild(button);
      }
    }
    ensureShiftPreviewElements(ctx);
    syncLineOverlaySize();
    scheduleSyncLineOverlaySize();
    requestAnimationFrame(() => {
      lockGridSizeForSwipe();
    });
  }

  return {
    syncBuildDomFromBoardFixed,
    syncLineOverlaySize,
    scheduleSyncLineOverlaySize,
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
    resetSelection,
    emptyBoard,
    buildEmptyGrid,
    onPointerUp,
    refreshPathIntoBoardAndDom,
  };
}
