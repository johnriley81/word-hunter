import { computePerfectHuntStarterFlatWithRowHints } from "./board-logic.js";
import {
  isGridAllNormalizedEmpty,
  omitEmptyNextLetterSlots,
} from "./puzzle-export-sim/next-letters.js";

export function createPerfectHuntHintController({
  ctx,
  grid,
  gridSize,
  getGridButtonElements,
  getIsGameActive,
  updateNextLetters,
  getNextLetters,
  setNextLetters,
}) {
  const PERFECT_HUNT_HINT_CLASS = "grid-button--perfect-hunt-hint";

  function clearPerfectHuntHintVisual() {
    const gridButtonElements = getGridButtonElements();
    for (let i = 0; i < gridButtonElements.length; i++) {
      gridButtonElements[i].classList.remove(PERFECT_HUNT_HINT_CLASS);
    }
    ctx.state.perfectHuntHintFlat = null;
    ctx.state.perfectHuntHintStickyFlat = null;
  }

  function computePerfectHuntHintFlat() {
    return computePerfectHuntStarterFlatWithRowHints(
      ctx.state.gameBoard,
      ctx.state.perfectHunt,
      ctx.state.perfectHuntOrderIndex,
      ctx.state.perfectHuntOnPace,
      gridSize,
      ctx.state.perfectHuntStarterFlats,
      ctx.state.perfectHuntStarterTorNeighbors
    );
  }

  function refreshPerfectHuntHint() {
    if (!getIsGameActive()) {
      clearPerfectHuntHintVisual();
      return;
    }

    const nSq = gridSize * gridSize;

    let nextFlat;
    if (ctx.state.perfectHuntOnPace && ctx.state.perfectHuntHintStickyFlat != null) {
      nextFlat = ctx.state.perfectHuntHintStickyFlat;
    } else {
      nextFlat = computePerfectHuntHintFlat();
      ctx.state.perfectHuntHintStickyFlat =
        ctx.state.perfectHuntOnPace && nextFlat != null ? nextFlat : null;
    }
    const prevFlat = ctx.state.perfectHuntHintFlat;

    if (nextFlat == null) {
      clearPerfectHuntHintVisual();
      return;
    }

    for (let i = 0; i < nSq; i++) {
      if (i !== nextFlat) {
        grid.children[i]?.classList.remove(PERFECT_HUNT_HINT_CLASS);
      }
    }

    const btn = grid.children[nextFlat];
    if (!btn) {
      ctx.state.perfectHuntHintFlat = null;
      ctx.state.perfectHuntHintStickyFlat = null;
      return;
    }

    if (prevFlat === nextFlat && btn.classList.contains(PERFECT_HUNT_HINT_CLASS)) {
      ctx.state.perfectHuntHintFlat = nextFlat;
      return;
    }

    btn.classList.add(PERFECT_HUNT_HINT_CLASS);
    ctx.state.perfectHuntHintFlat = nextFlat;
  }

  function currentWordMatchesExpectedPerfectHunt(word) {
    if (!ctx.state.perfectHuntOnPace) return false;
    const hunt = ctx.state.perfectHunt;
    if (!hunt?.length) return false;
    const idx = ctx.state.perfectHuntOrderIndex;
    if (idx >= hunt.length) return false;
    const key = String(word || "").toLowerCase();
    return key === String(hunt[idx]).toLowerCase();
  }

  return {
    PERFECT_HUNT_HINT_CLASS,
    clearPerfectHuntHintVisual,
    refreshPerfectHuntHint,
    currentWordMatchesExpectedPerfectHunt,
  };
}

export function createPerfectHuntWordDragHooks({
  ctx,
  getScore,
  setScore,
  getTrophyWord,
  setTrophyWord,
  getTrophyWordScore,
  setTrophyWordScore,
  getNextLetters,
  setNextLetters,
  updateNextLetters,
  getIsGameActive,
  gridSize,
  scoreValidationWordsPlayed,
  clearPerfectHuntHintVisual,
  refreshPerfectHuntHint,
  currentWordMatchesExpectedPerfectHunt,
}) {
  return {
    evaluatePerfectHuntSubmit(word, wordScore) {
      const key = String(word || "").toLowerCase();
      if (
        !ctx.state.perfectHunt?.length ||
        ctx.state.perfectHuntTargetSum == null ||
        !ctx.state.perfectHuntChoirRateByWord
      ) {
        return { inList: false, isPerfectCompletion: false, choirPlaybackRate: null };
      }
      const inList = ctx.state.perfectHunt.some((w) => w.toLowerCase() === key);
      if (!inList) {
        return { inList: false, isPerfectCompletion: false, choirPlaybackRate: null };
      }
      const nextSet = new Set(ctx.state.perfectHuntWordsSubmitted);
      nextSet.add(key);
      const choirPlaybackRate = ctx.state.perfectHuntChoirRateByWord.get(key) ?? 1;
      const huntLen = ctx.state.perfectHunt?.length ?? 0;
      const isPerfectCompletion =
        huntLen > 0 &&
        nextSet.size === huntLen &&
        getScore() + wordScore === ctx.state.perfectHuntTargetSum;
      return { inList: true, isPerfectCompletion, choirPlaybackRate };
    },
    commitPerfectHuntWordIfListed(word) {
      const key = String(word || "").toLowerCase();
      if (!ctx.state.perfectHunt?.some((w) => w.toLowerCase() === key)) return;
      ctx.state.perfectHuntWordsSubmitted.add(key);
    },
    recordPerfectHuntOrderPace(word) {
      if (!ctx.state.perfectHuntOnPace) return { brokePace: false };
      const hunt = ctx.state.perfectHunt;
      if (!hunt?.length) {
        ctx.state.perfectHuntOnPace = false;
        ctx.state.perfectHuntHintStickyFlat = null;
        return { brokePace: false };
      }
      const idx = ctx.state.perfectHuntOrderIndex;
      if (idx >= hunt.length) {
        return { brokePace: false };
      }
      const key = String(word || "").toLowerCase();
      const expected = hunt[idx];
      if (key === String(expected).toLowerCase()) {
        ctx.state.perfectHuntHintStickyFlat = null;
        const nextIdx = idx + 1;
        ctx.state.perfectHuntOrderIndex = nextIdx;
        return { brokePace: false };
      }
      ctx.state.perfectHuntOnPace = false;
      ctx.state.perfectHuntHintStickyFlat = null;
      return { brokePace: true };
    },
    collapseNextLetterBlankSlots() {
      setNextLetters(omitEmptyNextLetterSlots(getNextLetters()));
      updateNextLetters();
    },
    areAllLetterTilesUsedUp() {
      return isGridAllNormalizedEmpty(ctx.state.gameBoard, gridSize);
    },
    isWordKeepingPerfectHuntPace: currentWordMatchesExpectedPerfectHunt,
    refreshPerfectHuntHint,
    clearPerfectHuntHintVisual,
    recordLeaderboardScoreTurn(word) {
      const w = String(word || "").toLowerCase();
      if (w) scoreValidationWordsPlayed.push(w);
    },
    recordTrophyWordIfBest(word, wordScore) {
      const w = String(word || "");
      const n = Number(wordScore);
      if (!Number.isFinite(n)) return;
      if (
        n > getTrophyWordScore() ||
        (n === getTrophyWordScore() && w.length > getTrophyWord().length)
      ) {
        setTrophyWord(w);
        setTrophyWordScore(n);
      }
    },
    addToScore: (delta) => {
      setScore(getScore() + delta);
    },
    getGameActive: getIsGameActive,
  };
}
