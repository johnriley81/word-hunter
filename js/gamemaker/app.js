import { createGameContext } from "../game-context.js";
import { PERFECT_HUNT_WORD_COUNT } from "../config.js";
import { wordToTileLabelSequence } from "../board-logic.js";
import { loadWordlistWordSet } from "../game-lifecycle.js";
import { attachShiftGestures } from "../shift-dom.js";
import { comparePoolWordEntriesDesc } from "./pool-order.js";
import {
  buildSwapBucketsByStats,
  collectSwapAlternatesBetweenNeighborScores,
} from "./swap-buckets.js";
import { buildGamemakerDictExportPayload } from "./build-export-payload.js";
import { createGridPlacementApi } from "./grid-placement.js";
import { createGamemakerShiftHost } from "./shift-host.js";
import { stringifyGamemakerDictExport } from "./clipboard-export.js";
import { loadGamemakerPuzzlePool } from "./load-pool.js";

const WORD_COUNT = PERFECT_HUNT_WORD_COUNT;

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
  const targetEl = el("gamemaker-target");
  const metaEl = el("gamemaker-meta");
  const btnList = el("gamemaker-btn-list");
  const btnExport = el("gamemaker-btn-export");
  const btnWordSwap = el("gamemaker-btn-word-swap");

  Object.assign(ctx.refs, {
    grid,
    gridPan,
    gridStage,
    shiftPreviewStrip,
    boardShiftZone,
    boardShiftHints,
    gridLineContainer,
    gridLineWrapper,
    gridViewport,
  });

  const word = ctx.state.word;
  let isMouseDown = false;
  let isGameActive = true;
  let wordSet = new Set();
  let listsData = { lists: [] };
  let currentWords = /** @type {any[]} */ ([]);
  let placementStep = 0;
  let buildPlaysChron =
    /** @type {Array<{ word: string, min_tiles: number, pathFlat: number[], covered: string[], starter_tor_neighbor_quad: string[] }>} */ ([]);
  let boardSnapshotPreDrag = /** @type {string[][] | null} */ (null);
  let puzzleBatch = [];
  /** @type {Map<string, Array<{ word: string, min_tiles: number, reuse: number, wordTotal: number }>>} */
  let swapBuckets = new Map();

  function getCurrentWordIndexAsc() {
    return placementStep >= WORD_COUNT ? -1 : placementStep;
  }

  function getTargetEntry() {
    const ix = getCurrentWordIndexAsc();
    if (ix < 0 || !currentWords[ix]) return null;
    return currentWords[ix];
  }

  function sumWordTotalsForCurrentList() {
    let s = 0;
    for (const e of currentWords) {
      s += Number(e?.wordTotal) || 0;
    }
    return s;
  }

  function queuedMetaPrefix() {
    return puzzleBatch.length ? "Q:" + puzzleBatch.length + "·" : "";
  }

  function toolbarMetaText(entry, letterDone, letterTotal) {
    const listTotal = sumWordTotalsForCurrentList();
    const r = entry.reuse ?? 0;
    const sc = entry.wordTotal ?? "";
    return (
      queuedMetaPrefix() +
      "T:" +
      listTotal +
      " R:" +
      r +
      " Σ:" +
      sc +
      " " +
      letterDone +
      "/" +
      letterTotal
    );
  }

  function swapAlternatesForCurrentStep() {
    if (swapBuckets.size === 0 || getCurrentWordIndexAsc() < 0) return [];
    return collectSwapAlternatesBetweenNeighborScores(
      swapBuckets,
      currentWords,
      placementStep
    );
  }

  function refreshWordSwapButton() {
    if (!btnWordSwap) return;
    btnWordSwap.disabled = swapAlternatesForCurrentStep().length === 0;
  }

  function isPuzzleCompleteForExport() {
    return buildPlaysChron.length === WORD_COUNT && getCurrentWordIndexAsc() < 0;
  }

  function refreshListButtonLabel() {
    if (!btnList) return;
    btnList.textContent = isPuzzleCompleteForExport() ? "next" : "reset";
  }

  function setToolbarForEntry(entry, letterDone) {
    if (!entry) {
      if (isPuzzleCompleteForExport()) {
        targetEl.textContent = "Done — next";
        const sum = sumWordTotalsForCurrentList();
        metaEl.textContent = queuedMetaPrefix() + (sum ? "Total: " + sum : "");
        return;
      }
      if (currentWords.length === 0) {
        targetEl.textContent = "";
        metaEl.textContent =
          queuedMetaPrefix() +
          (!(listsData.lists || []).length
            ? "Run npm run gen:puzzle-pool (text/gamemaker/pregen/puzzle-pool.json)"
            : `No puzzle lists with exactly ${WORD_COUNT} words in pool.`);
        return;
      }
      const listExhausted = placementStep >= currentWords.length;
      targetEl.textContent = "—";
      metaEl.textContent =
        queuedMetaPrefix() +
        (listExhausted
          ? `List has ${currentWords.length} hunt words (${WORD_COUNT} required). Placed ${buildPlaysChron.length}/${WORD_COUNT}.`
          : "Pick a hunt word");
      return;
    }
    const w = (entry.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const total = glyphs.length;
    const cur = Math.min(Math.max(0, letterDone), total);
    targetEl.textContent = w.toUpperCase();
    metaEl.textContent = toolbarMetaText(entry, cur, total);
  }

  function updateUi() {
    setToolbarForEntry(getTargetEntry(), 0);
    refreshListButtonLabel();
    refreshWordSwapButton();
  }

  function refreshToolbarLetterProgress() {
    const entry = getTargetEntry();
    if (!entry) return;
    setToolbarForEntry(entry, word.selectedButtons.length);
  }

  let exportCopyFeedbackTimer = 0;

  function showExportMetaMessage(msg, ms) {
    if (exportCopyFeedbackTimer) window.clearTimeout(exportCopyFeedbackTimer);
    metaEl.textContent = msg;
    exportCopyFeedbackTimer = window.setTimeout(() => {
      exportCopyFeedbackTimer = 0;
      updateUi();
    }, ms);
  }

  const placement = createGridPlacementApi({
    ctx,
    grid,
    gridLineContainer,
    gridLineWrapper,
    getTargetEntry,
    getCurrentWordIndexAsc,
    getWordSet: () => wordSet,
    getGameActive: () => isGameActive,
    setMouseDown: (v) => {
      isMouseDown = v;
    },
    getMouseDown: () => isMouseDown,
    getBoardSnapshotPreDrag: () => boardSnapshotPreDrag,
    setBoardSnapshotPreDrag: (v) => {
      boardSnapshotPreDrag = v;
    },
    onToolbarLetterProgress: refreshToolbarLetterProgress,
    appendBuildPlay(play) {
      buildPlaysChron.push({ ...play });
    },
    bumpPlacementStep() {
      placementStep++;
    },
    updateUi,
  });

  const { shiftHost } = createGamemakerShiftHost({
    ctx,
    getGameBoard: () => ctx.state.gameBoard,
    syncDomFromBoard: () =>
      placement.syncBuildDomFromBoardFixed(grid, ctx.state.gameBoard),
    syncLineOverlaySize: () => placement.syncLineOverlaySize(),
    scheduleSyncLineOverlaySize: () => placement.scheduleSyncLineOverlaySize(),
    lockGridSizeForSwipe: () => placement.lockGridSizeForSwipe(),
    unlockGridSizeAfterSwipe: () => placement.unlockGridSizeAfterSwipe(),
    getIsGameActive: () => isGameActive,
    getIsMouseDown: () => isMouseDown,
  });

  attachShiftGestures(ctx, shiftHost);

  document.addEventListener("mouseup", () => placement.onPointerUp());
  document.addEventListener("touchend", () => placement.onPointerUp());

  function swapCurrentWord() {
    const alts = swapAlternatesForCurrentStep();
    if (!getTargetEntry() || alts.length === 0) {
      showExportMetaMessage("No swap", 1800);
      return;
    }
    const picked = alts[Math.floor(Math.random() * alts.length)];
    const start = placementStep;
    const tail = currentWords.slice(start).map((e) => ({
      word: String(e.word || "").toLowerCase(),
      min_tiles: Number(e.min_tiles),
      reuse: Number(e.reuse),
      wordTotal: Number(e.wordTotal),
    }));
    tail[0] = {
      word: picked.word,
      min_tiles: picked.min_tiles,
      reuse: picked.reuse,
      wordTotal: picked.wordTotal,
    };
    tail.sort(comparePoolWordEntriesDesc);
    const pickedLc = picked.word.toLowerCase();
    const idxInTail = tail.findIndex(
      (e) => String(e.word || "").toLowerCase() === pickedLc
    );
    currentWords = currentWords.slice(0, start).concat(tail);
    placementStep = start + (idxInTail >= 0 ? idxInTail : 0);
    placement.resetSelection();
    updateUi();
  }

  function randomListIndex() {
    const n = (listsData.lists || []).length;
    return n ? Math.floor(Math.random() * n) : 0;
  }

  function resolveValidListIndex(startIx) {
    const lists = listsData.lists || [];
    const n = lists.length;
    if (!n) return -1;
    const normalized = ((startIx % n) + n) % n;
    for (let o = 0; o < n; o++) {
      const idx = (normalized + o) % n;
      if ((lists[idx].words || []).length === WORD_COUNT) return idx;
    }
    return -1;
  }

  function loadListAt(ix) {
    const lists = listsData.lists || [];
    if (!lists.length) return;
    const resolved = resolveValidListIndex(ix);
    if (resolved < 0) currentWords = [];
    else {
      const wordsIn = (lists[resolved].words || []).slice();
      wordsIn.sort(comparePoolWordEntriesDesc);
      currentWords = wordsIn;
    }
    placementStep = 0;
    buildPlaysChron = [];
    placement.emptyBoard();
    placement.syncBuildDomFromBoardFixed(grid, ctx.state.gameBoard);
    placement.resetSelection();
    updateUi();
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
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

  /** @returns {{ starting_grids: string[][][]; next_letters: string[]; perfect_hunt: string[]; perfect_hunt_starter_tor_neighbors: string[] } | null} */
  function buildDictExportFromState() {
    return buildGamemakerDictExportPayload({
      gameBoard: ctx.state.gameBoard,
      buildPlaysChron,
      currentWords,
      wordCount: WORD_COUNT,
    });
  }

  function appendCompletedPuzzleToBatch() {
    const d = buildDictExportFromState();
    if (d) puzzleBatch.push(d);
  }

  function loadNextOrReset() {
    if (isPuzzleCompleteForExport()) appendCompletedPuzzleToBatch();
    loadListAt(randomListIndex());
  }

  async function exportPuzzle() {
    let lines = puzzleBatch.slice();
    if (lines.length === 0 && isPuzzleCompleteForExport()) {
      const d = buildDictExportFromState();
      if (d) lines = [d];
    }
    const nLines = lines.length;
    if (nLines === 0) {
      showExportMetaMessage(
        "Nothing to export — place all " +
          WORD_COUNT +
          " hunt words first (tap list when placement is locked)",
        2800
      );
      return;
    }
    let text;
    try {
      text = lines.map((d) => stringifyGamemakerDictExport(d)).join("\n");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Export stringify failed";
      showExportMetaMessage(msg.slice(0, 200), 4000);
      return;
    }
    try {
      await copyTextToClipboard(text);
      puzzleBatch = [];
      showExportMetaMessage(
        nLines === 1 ? "Copied 1 puzzle" : "Copied " + nLines + " puzzles",
        2000
      );
    } catch {
      showExportMetaMessage("Copy failed — check HTTPS or clipboard permission", 2500);
    }
  }

  async function init() {
    wordSet = await loadWordlistWordSet();
    listsData = await loadGamemakerPuzzlePool();
    swapBuckets = buildSwapBucketsByStats(listsData.lists || []);
    placement.buildEmptyGrid();
    placement.emptyBoard();
    placement.syncBuildDomFromBoardFixed(grid, ctx.state.gameBoard);
    if (listsData.lists.length) {
      loadListAt(randomListIndex());
    } else {
      currentWords = [];
      swapBuckets = new Map();
    }
    updateUi();
    if (btnList) btnList.addEventListener("click", () => loadNextOrReset());
    if (btnWordSwap) btnWordSwap.addEventListener("click", () => swapCurrentWord());
    if (btnExport)
      btnExport.addEventListener("click", () => {
        void exportPuzzle();
      });
  }

  void init();
}

createGamemaker();
