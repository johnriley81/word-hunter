import { createGameContext } from "../game-context.js";
import {
  GRID_SIZE,
  WORD_LINE_FADE_MS,
  WORD_PATH_COLOR_STEPS,
  WORD_INVALID_SHAKE_MS,
} from "../config.js";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  minUniqueTilesForReuseRule,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
} from "../board-logic.js";
import { getTileButtonFromEvent, setTileTextAllowEmpty } from "../grid-tiles.js";
import { isAdjacentGridTiles, syncSelectionVisitDepthOnGrid } from "../word-play.js";
import { wordPathDragStrokeColorAt } from "../word-path.js";
import { clearWordSubmitFeedbackTimer } from "../word-drag.js";
import { ensureShiftPreviewElements, attachShiftGestures } from "../shift-dom.js";
import {
  buildNext50FromCoveredInBuildOrder,
  simulateChronoToEndBoard,
  verifyForwardPuzzleIfCoveredChain50,
} from "../puzzle-export-sim.js";
import { loadWordhunterTextAssets } from "../game-lifecycle.js";
import { stringifyGamemakerDictExport } from "./clipboard-export.js";
import { loadGamemakerListsData } from "./load-lists.js";

/** Placement order: high wordTotal first (index 0); matches forward play after sorting ascending. */
const PLACEMENT_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SVG_NS = "http://www.w3.org/2000/svg";

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

function indexFromButton(grid, button) {
  return Array.prototype.indexOf.call(grid.children, button);
}

function buttonFlatIndex(grid, button, n) {
  const i = indexFromButton(grid, button);
  if (i < 0) return -1;
  return i;
}

function syncBuildDomFromBoardFixed(grid, gameBoard) {
  const n = GRID_SIZE;
  const tiles = grid.children;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      setTileTextAllowEmpty(tiles[r * n + c], gameBoard[r][c]);
    }
  }
}

const syncDom = syncBuildDomFromBoardFixed;

function createGamemaker() {
  const ctx = createGameContext();
  const el = (id) => document.getElementById(id);
  const grid = el("grid");
  const gridLineContainer = el("line-container");
  const gridLineWrapper = el("grid-line-wrapper");
  const gridPan = el("grid-pan");
  const gridStage = el("grid-stage");
  const gridViewport = el("grid-viewport");
  const shiftPreviewStrip = el("shift-preview-strip");
  const boardShiftZone = el("board-shift-zone");
  const boardShiftHints = el("board-shift-hints");
  const boardShiftDismissButton = el("board-shift-dismiss");
  const targetEl = el("gamemaker-target");
  const repeatsEl = el("gamemaker-repeats");
  const btnList = el("gamemaker-btn-list");
  const btnExport = el("gamemaker-btn-export");

  Object.assign(ctx.refs, {
    grid,
    gridPan,
    gridStage,
    shiftPreviewStrip,
    boardShiftZone,
    boardShiftHints,
    boardShiftDismissButton,
    gridLineContainer,
    gridLineWrapper,
    gridViewport,
  });

  const word = ctx.state.word;
  let isMouseDown = false;
  let isGameActive = true;
  let wordSet = new Set();
  let listsData = { lists: [] };
  let listIndex = 0;
  let currentWords = /** @type {any[]} */ ([]);
  let alternates = /** @type {string[][]} */ ([]);
  let placementStep = 0;
  let buildPlaysChron =
    /** @type {Array<{ word: string, min_tiles: number, pathFlat: number[], covered: string[] }>} */ ([]);
  let pathByWordAsc = /** @type {number[][]} */ (
    Array(9)
      .fill(null)
      .map(() => [])
  );
  /** @type {string[][] | null} */
  let boardSnapshotPreDrag = null;
  /** @type {string[][] | null} After 8 commits: board before the ninth (lowest-score) word. */
  let exportForwardStartGrid = null;
  /** @type {string[][] | null} Snapshot when the current list / harness was applied. */
  let exportEditorStartGrid = null;

  function copyBoard4(/** @type {string[][]} */ src) {
    return src.map((row) => row.slice());
  }

  function getCurrentWordIndexAsc() {
    if (placementStep >= PLACEMENT_STEPS.length) return -1;
    return PLACEMENT_STEPS[placementStep];
  }

  function getTargetEntry() {
    const ix = getCurrentWordIndexAsc();
    if (ix < 0 || !currentWords[ix]) return null;
    return currentWords[ix];
  }

  function updateUi() {
    const entry = getTargetEntry();
    if (!entry) {
      targetEl.textContent = "Done — export";
      repeatsEl.textContent = "";
      return;
    }
    const w = (entry.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const st = wordReuseStats(glyphs);
    targetEl.textContent = w.toUpperCase() + " (" + (placementStep + 1) + "/9)";
    repeatsEl.textContent = [
      "reuse " + st.reuse,
      "score " + (entry.wordTotal ?? ""),
    ].join(" · ");
  }

  function restyleAllWordConnectorLines() {
    const lineEls = gridLineContainer.querySelectorAll("line");
    let defs = gridLineContainer.querySelector("defs");
    if (lineEls.length === 0) {
      if (defs) defs.remove();
      return;
    }
    const n = word.selectedButtons.length;
    if (n < 2 || lineEls.length !== n - 1) return;
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
    boardSnapshotPreDrag = null;
  }

  function revertBoardToPreDragSnapshot() {
    if (!boardSnapshotPreDrag) return;
    const n = GRID_SIZE;
    const snap = boardSnapshotPreDrag;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.state.gameBoard[r][c] = snap[r][c];
      }
    }
    syncDom(grid, ctx.state.gameBoard);
  }

  function isAdjacent(b1, b2) {
    return isAdjacentGridTiles(grid, b1, b2, GRID_SIZE);
  }

  function updateSelectionVisits() {
    syncSelectionVisitDepthOnGrid(grid, word.selectedButtons);
  }

  function getPartialGlyphString() {
    const entry = getTargetEntry();
    if (!entry) return { glyphs: [], idx: 0 };
    const glyphs = wordToTileLabelSequence((entry.word || "").toLowerCase());
    return { glyphs, idx: word.selectedButtons.length };
  }

  function getRepeatLabel() {
    const s = word.selectedButtons.length;
    if (s === 0) return "";
    const u = new Set(word.selectedButtons).size;
    const reuse = s - u;
    return "path " + s + " · uniq " + u + " · re-use " + reuse;
  }

  function refreshPathIntoBoardAndDom() {
    const entry = getTargetEntry();
    if (!boardSnapshotPreDrag || !entry) return;
    const glyphs = wordToTileLabelSequence((entry.word || "").toLowerCase());
    const n = GRID_SIZE;
    const snap = boardSnapshotPreDrag;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.state.gameBoard[r][c] = snap[r][c];
      }
    }
    for (let i = 0; i < word.selectedButtons.length; i++) {
      const f = buttonFlatIndex(grid, word.selectedButtons[i], n);
      if (f < 0) continue;
      const rr = Math.floor(f / n);
      const cc = f % n;
      const g = glyphs[i];
      if (g) ctx.state.gameBoard[rr][cc] = g;
    }
    syncDom(grid, ctx.state.gameBoard);
  }

  function beginOnButton(targetButton) {
    if (!targetButton) return;
    if (word.wordReplaceLockGen !== 0) return;
    if (!isGameActive) return;
    if (!targetButton.classList.contains("grid-button")) return;
    const entry = getTargetEntry();
    if (!entry) return;
    const glyphs = wordToTileLabelSequence((entry.word || "").toLowerCase());
    if (glyphs.length === 0) return;
    if (word.selectedButtons.length === 0) {
      boardSnapshotPreDrag = copyBoard4(ctx.state.gameBoard);
    }
    isMouseDown = true;
    word.selectedButtons.push(targetButton);
    word.selectedButtonSet.add(targetButton);
    targetButton.classList.add("selected");
    word.lastButton = targetButton;
    updateSelectionVisits();
    refreshPathIntoBoardAndDom();
    repeatsEl.textContent =
      getRepeatLabel() + " · " + getPartialGlyphString().idx + "/" + glyphs.length;
  }

  function extendToButton(targetButton) {
    if (!targetButton) return;
    if (!isMouseDown) return;
    if (!isGameActive) return;
    if (!getTargetEntry()) return;
    if (
      isAdjacent(word.lastButton, targetButton) &&
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
        const n = targetButton.getAttribute("data-selection-visits");
        if (n === "1") {
          targetButton.classList.add("grid-button--selected-enter");
        }
        refreshPathIntoBoardAndDom();
      }
    }
    const entry2 = getTargetEntry();
    const glen = entry2
      ? wordToTileLabelSequence((entry2.word || "").toLowerCase()).length
      : 0;
    repeatsEl.textContent =
      getRepeatLabel() + " · " + word.selectedButtons.length + "/" + glen;
  }

  function validatePathAgainstTarget() {
    const entry = getTargetEntry();
    if (!entry) return { ok: false, reason: "no target" };
    const w = (entry.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const minTiles = minUniqueTilesForReuseRule(glyphs);
    if (word.selectedButtons.length !== glyphs.length) {
      return { ok: false, reason: "path length" };
    }
    if (new Set(word.selectedButtons).size !== minTiles) {
      return { ok: false, reason: "min_tiles" };
    }
    if (!wordSet.has(w)) {
      return { ok: false, reason: "dict" };
    }
    return { ok: true, reason: "ok" };
  }

  function applyCommitToBoard() {
    const entry = getTargetEntry();
    if (!entry) return;
    const w = (entry.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const pathFlat = word.selectedButtons.map((b) =>
      buttonFlatIndex(grid, b, GRID_SIZE)
    );
    const firstVisits = [];
    const firstSeen = new Set();
    for (const b of word.selectedButtons) {
      if (!firstSeen.has(b)) {
        firstSeen.add(b);
        firstVisits.push(b);
      }
    }
    const snap = boardSnapshotPreDrag;
    const covered = firstVisits.map((b) => {
      const f = buttonFlatIndex(grid, b, GRID_SIZE);
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
    boardSnapshotPreDrag = null;
    const wiAsc = getCurrentWordIndexAsc();
    if (wiAsc >= 0) {
      pathByWordAsc[wiAsc] = pathFlat;
      buildPlaysChron.push({
        word: w,
        min_tiles: minUniqueTilesForReuseRule(glyphs),
        pathFlat,
        covered,
      });
    }
  }

  function onPointerUp() {
    if (!isMouseDown) return;
    isMouseDown = false;
    const val = validatePathAgainstTarget();
    if (val.ok) {
      applyCommitToBoard();
      placementStep++;
      if (placementStep === 8) {
        exportForwardStartGrid = copyBoard4(ctx.state.gameBoard);
      }
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
    if (getCurrentWordIndexAsc() < 0) {
      targetEl.classList.add("gamemaker--done");
    } else {
      targetEl.classList.remove("gamemaker--done");
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
          if (!isGameActive) return;
          beginOnButton(getTileButtonFromEvent(grid, e));
        });
        button.addEventListener("mouseover", (e) => {
          if (!isGameActive) return;
          extendToButton(getTileButtonFromEvent(grid, e));
        });
        button.addEventListener(
          "touchstart",
          (e) => {
            e.preventDefault();
            if (!isGameActive) return;
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
    requestAnimationFrame(() => {
      lockGridSizeForSwipe();
    });
  }

  function endGame() {}

  const uiState = {
    get gameActive() {
      return isGameActive;
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
    getIsGameActive: () => isGameActive,
    getIsPaused: () => false,
    getIsMouseDown: () => isMouseDown,
    getShiftsAllowed: () => !isMouseDown,
    getIsMuted: () => true,
    endGame,
    syncDomFromBoard: () => syncDom(grid, ctx.state.gameBoard),
    applyColumnShift: (s) => {
      applyColumnShiftInPlace(ctx.state.gameBoard, s, GRID_SIZE);
      shiftHost.syncDomFromBoard();
    },
    applyRowShift: (s) => {
      applyRowShiftInPlace(ctx.state.gameBoard, s, GRID_SIZE);
      shiftHost.syncDomFromBoard();
    },
    syncLineOverlaySize: () => {
      syncLineOverlaySize();
    },
    clearTapStreak: () => {
      ctx.state.shift.doubleTapPrevAt = 0;
    },
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
  };

  attachShiftGestures(ctx, shiftHost);

  document.addEventListener("mouseup", () => onPointerUp());
  document.addEventListener("touchend", () => onPointerUp());

  function randomListIndex() {
    const n = (listsData.lists || []).length;
    return n ? Math.floor(Math.random() * n) : 0;
  }

  function loadListAt(ix) {
    const lists = listsData.lists || [];
    if (!lists.length) return;
    listIndex = ((ix % lists.length) + lists.length) % lists.length;
    const L = lists[listIndex];
    const wordsIn = (L.words || []).slice();
    const altsIn = (L.alternates || Array(9).fill([])).map((x) =>
      Array.isArray(x) ? x : []
    );
    const paired = wordsIn.map((w, i) => ({ w, a: altsIn[i] || [] }));
    paired.sort((a, b) => (b.w.wordTotal || 0) - (a.w.wordTotal || 0));
    currentWords = paired.map((p) => p.w);
    alternates = paired.map((p) => p.a);
    placementStep = 0;
    buildPlaysChron = [];
    pathByWordAsc = Array(9)
      .fill(null)
      .map(() => []);
    exportForwardStartGrid = null;
    emptyBoard();
    syncDom(grid, ctx.state.gameBoard);
    exportEditorStartGrid = copyBoard4(ctx.state.gameBoard);
    resetSelection();
    updateUi();
  }

  let exportCopyFeedbackTimer = 0;

  async function exportPuzzle() {
    const gEnd = ctx.state.gameBoard.map((row) => row.slice());
    const editor0 =
      exportEditorStartGrid && exportEditorStartGrid.length === 4
        ? exportEditorStartGrid.map((r) => r.slice())
        : Array(4)
            .fill(null)
            .map(() => Array(4).fill(""));
    const playsForExport =
      buildPlaysChron && buildPlaysChron.length
        ? buildPlaysChron.map((p) => {
            const w = String(p.word || "").toLowerCase();
            const glyphs = wordToTileLabelSequence(w);
            return {
              word: w,
              pathFlat: p.pathFlat ? p.pathFlat.slice() : [],
              min_tiles:
                typeof p.min_tiles === "number"
                  ? p.min_tiles
                  : minUniqueTilesForReuseRule(glyphs),
              covered: (p.covered || []).map((ch) => String(ch || "").toLowerCase()),
            };
          })
        : [];
    const next50 = buildNext50FromCoveredInBuildOrder(playsForExport, {
      fillEmpty: "a",
    });
    const order = currentWords
      .map((w, i) => ({ w, i }))
      .sort((a, b) => (a.w.wordTotal || 0) - (b.w.wordTotal || 0));
    const wordsAsc = order.map((x) => (x.w.word || "").toLowerCase());
    const pathsInWordTotalAsc = order.map((x) => pathByWordAsc[x.i] || []);
    const start4 = exportForwardStartGrid
      ? exportForwardStartGrid.map((r) => r.slice())
      : buildPlaysChron.length === 9
        ? simulateChronoToEndBoard(editor0, buildPlaysChron.slice(0, 8))
        : null;
    const gEndL = gEnd.map((r) => r.map((c) => String(c || "").toLowerCase()));
    const solvedForExport = gEndL;
    const v2 =
      playsForExport.length === 9 && next50.length === 50
        ? verifyForwardPuzzleIfCoveredChain50(
            solvedForExport,
            next50,
            wordsAsc,
            pathsInWordTotalAsc,
            playsForExport
          )
        : {
            ok: false,
            reason:
              playsForExport.length < 9
                ? "forward verify needs 9 completed word placements"
                : "next_letters need 50 entries for forward verify",
            queueLeft: next50.slice(),
          };
    if (!v2.ok) {
      console.warn("[gamemaker export] forward verify:", v2.reason);
    }

    const startGridNorm =
      start4 && start4.length === 4
        ? start4.map((r) => r.map((c) => String(c || "").toLowerCase()))
        : null;
    const dictExport = {
      starting_grids: startGridNorm ? [startGridNorm] : [],
      next_letters: next50,
      perfect_hunt: wordsAsc,
    };
    const text = stringifyGamemakerDictExport(dictExport);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      if (exportCopyFeedbackTimer) window.clearTimeout(exportCopyFeedbackTimer);
      repeatsEl.textContent = "copied to clipboard";
      exportCopyFeedbackTimer = window.setTimeout(() => {
        exportCopyFeedbackTimer = 0;
        updateUi();
      }, 2000);
    } catch (e) {
      console.error(e);
      if (exportCopyFeedbackTimer) window.clearTimeout(exportCopyFeedbackTimer);
      repeatsEl.textContent = "copy failed";
      exportCopyFeedbackTimer = window.setTimeout(() => {
        exportCopyFeedbackTimer = 0;
        updateUi();
      }, 2500);
    }
  }

  async function init() {
    const assets = await loadWordhunterTextAssets();
    wordSet = assets.wordSet;
    listsData = await loadGamemakerListsData();
    buildEmptyGrid();
    emptyBoard();
    syncDom(grid, ctx.state.gameBoard);
    if (listsData.lists.length) loadListAt(randomListIndex());
    else {
      currentWords = [];
      targetEl.textContent =
        "Run npm run gen:puzzle-pool (text/gamemaker/pregen/puzzle-pool.json)";
    }
    updateUi();
    btnList.addEventListener("click", () => loadListAt(randomListIndex()));
    btnExport.addEventListener("click", () => {
      void exportPuzzle();
    });
  }

  void init();
}

createGamemaker();
