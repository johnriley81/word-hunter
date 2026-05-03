import { playSound, bingPlaybackRateForWordLength } from "./audio.js";
import {
  WORD_LINE_FADE_MS,
  WORD_INVALID_SHAKE_MS,
  WORD_COMMIT_AFTER_PULSE_MS,
  WORD_COMMIT_CHAIN_PULSE_MS,
  WORD_LETTER_FLIP_MS,
  WORD_REPLACE_FLIP_OVERLAP_MS,
  WORD_REPLACE_TAIL_SLACK_MS,
  WORD_RELEASE_GREEN_MS,
  WORD_SUCCESS_MESSAGE_FADE_EARLY_MS,
  getWordReplaceAnimationHoldMs,
  greenTextColor,
  huntPaceSuccessFlashColor,
  redTextColor,
} from "./config.js";
import { getTileButtonFromEvent, getTileText, setTileText } from "./grid-tiles.js";
import { showMessage } from "./ui-word-line.js";
import { restyleWordConnectorLines } from "./word-connector-lines.js";
import { isAdjacentGridTiles, syncSelectionVisitDepthOnGrid } from "./word-play.js";

export function clearWordSubmitFeedbackTimer(ctx) {
  const w = ctx.state.word;
  if (w.wordSubmitFeedbackTimer !== null) {
    window.clearTimeout(w.wordSubmitFeedbackTimer);
    w.wordSubmitFeedbackTimer = null;
  }
}

export function bumpWordReplaceEpoch(ctx) {
  const w = ctx.state.word;
  w.wordReplaceEpoch++;
  w.wordReplaceLockGen = 0;
}

export function resetWordSelectionState(ctx, host) {
  const w = ctx.state.word;
  w.selectedButtons = [];
  w.selectedButtonSet = new Set();
  w.lastButton = null;
  w.currentWord = "";
  host.updateCurrentWord();
  host.updateScoreStrip();
}

export function createWordDragHandlers(ctx, host) {
  const w = () => ctx.state.word;
  const gridSize = host.gridSize;
  const svgNs = host.svgNs;

  function syncSelectionVisitDepth() {
    syncSelectionVisitDepthOnGrid(host.grid, w().selectedButtons);
  }

  function isAdjacent(button1, button2) {
    return isAdjacentGridTiles(host.grid, button1, button2, gridSize);
  }

  function finishWordDragCleanup(options = {}) {
    const skipLines = options.skipLines === true;
    clearWordSubmitFeedbackTimer(ctx);
    w().currentWord = "";
    w().selectedButtons.forEach((button) => {
      button.classList.remove(
        "selected",
        "grid-button--selected-enter",
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--word-release-hunt-pace",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in"
      );
      button.removeAttribute("data-selection-visits");
    });
    host.updateCurrentWord();
    w().selectedButtons = [];
    w().selectedButtonSet = new Set();
    w().lastButton = null;
    host.updateScoreStrip();
    if (!skipLines) {
      while (host.gridLineContainer.firstChild) {
        host.gridLineContainer.firstChild.remove();
      }
    }
  }

  function restyleAllWordConnectorLines() {
    restyleWordConnectorLines({
      grid: host.grid,
      gridLineContainer: host.gridLineContainer,
      svgNs,
      selectedButtons: w().selectedButtons,
      gradientIdPrefix: "word-conn-path-grad",
    });
  }

  function applyWordConnectorLineOutcome(isValid, options = {}) {
    const lines = host.gridLineContainer.querySelectorAll("line");
    const winClass = "grid-line--result-valid";
    const loseClass = "grid-line--result-invalid";
    const huntPaceClass = "grid-line--result-hunt-pace";
    const huntPaceSuccess = options.huntPaceSuccess === true;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      line.classList.remove(winClass, loseClass, huntPaceClass);
      line.classList.add(isValid ? winClass : loseClass);
      if (isValid && huntPaceSuccess) {
        line.classList.add(huntPaceClass);
      }
    }
  }

  function fadeOutWordConnectorLines(onComplete) {
    const lines = host.gridLineContainer.querySelectorAll("line");
    if (lines.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      lines[i].classList.add("grid-line--fade-out");
    }
    window.setTimeout(() => {
      while (host.gridLineContainer.firstChild) {
        host.gridLineContainer.firstChild.remove();
      }
      if (onComplete) onComplete();
    }, WORD_LINE_FADE_MS + 40);
  }

  function runSuccessPopThenStaggeredFlip(
    tilesToReplace,
    onWordCommitAnimationsComplete,
    huntPaceSuccess = false,
    collapseNextLetterBlanksAfterFlip = false
  ) {
    const st = w();
    st.wordReplaceEpoch++;
    const epoch = st.wordReplaceEpoch;
    const n = tilesToReplace.length;
    const gridN = gridSize;
    if (n === 0) {
      if (collapseNextLetterBlanksAfterFlip) {
        host.collapseNextLetterBlankSlots?.();
      }
      if (typeof onWordCommitAnimationsComplete === "function") {
        onWordCommitAnimationsComplete();
      }
      return;
    }
    st.wordReplaceLockGen = epoch;

    host.clearPerfectHuntHintVisual?.();

    let phaseBStarted = false;
    let greenDoneCount = 0;

    const runTileStep = (i) => {
      if (epoch !== st.wordReplaceEpoch) return;
      const head = host.nextLettersElement.querySelector(".queue-ribbon-letter--head");
      if (head) {
        head.classList.add("queue-ribbon-letter--pulse");
      }
      const pulseMs = i === 0 ? WORD_COMMIT_AFTER_PULSE_MS : WORD_COMMIT_CHAIN_PULSE_MS;
      window.setTimeout(() => {
        if (epoch !== st.wordReplaceEpoch) return;
        const button = tilesToReplace[i];

        const runFlipAndFinish = (nextLetter) => {
          if (epoch !== st.wordReplaceEpoch) return;
          if (i === 0) {
            fadeOutWordConnectorLines();
          }
          const midMs = Math.max(40, Math.floor(WORD_LETTER_FLIP_MS / 2));

          button.classList.remove("grid-button--letter-flip");
          void button.offsetWidth;
          button.classList.add("grid-button--letter-flip");

          window.setTimeout(() => {
            if (epoch !== st.wordReplaceEpoch) return;
            setTileText(button, nextLetter);
            const idx = Array.prototype.indexOf.call(host.grid.children, button);
            const r = Math.floor(idx / gridN);
            const c = idx % gridN;
            ctx.state.gameBoard[r][c] = nextLetter;
          }, midMs);
        };

        let didShift = false;
        const afterHeadGone = () => {
          if (epoch !== st.wordReplaceEpoch || didShift) return;
          didShift = true;
          const nextLetter = host.getNextLetters().shift() || "";
          host.updateNextLetters();
          runFlipAndFinish(nextLetter);
        };

        afterHeadGone();
      }, pulseMs);
    };

    const startPhaseB = () => {
      if (epoch !== st.wordReplaceEpoch || phaseBStarted) return;
      phaseBStarted = true;
      const gapBetweenFlipStarts = WORD_LETTER_FLIP_MS - WORD_REPLACE_FLIP_OVERLAP_MS;
      const nl = host.getNextLetters();
      const nextByIndex = Array.from({ length: n }, (_, j) =>
        j < nl.length ? nl[j] ?? "" : ""
      );
      const hasPeel = nextByIndex.some((ch) => ch === "");
      const tFlipEndLast =
        WORD_COMMIT_AFTER_PULSE_MS +
        (n - 1) * gapBetweenFlipStarts +
        WORD_LETTER_FLIP_MS +
        WORD_REPLACE_TAIL_SLACK_MS;

      const finishWordCommitAnimations = () => {
        if (epoch !== st.wordReplaceEpoch) return;
        if (collapseNextLetterBlanksAfterFlip) {
          host.collapseNextLetterBlankSlots?.();
        }
        for (let j = 0; j < n; j++) {
          const b = tilesToReplace[j];
          b.classList.remove("grid-button--letter-flip");
          b.classList.remove(
            "grid-button--word-release-green",
            "grid-button--word-release-hunt-pace"
          );
          if (nextByIndex[j] === "") {
            b.classList.remove("grid-button--slot-consumed-instant");
            void b.offsetWidth;
            b.classList.add(
              huntPaceSuccess
                ? "grid-button--slot-consumed-hunt-pace"
                : "grid-button--slot-consumed"
            );
          }
        }
        st.lastButton = null;
        st.wordReplaceLockGen = 0;
        host.refreshPerfectHuntHint?.();
        window.setTimeout(() => {
          if (epoch !== st.wordReplaceEpoch) return;
          if (typeof onWordCommitAnimationsComplete === "function") {
            onWordCommitAnimationsComplete();
          }
        }, 0);
      };

      window.setTimeout(finishWordCommitAnimations, tFlipEndLast);

      window.setTimeout(() => runTileStep(0), 0);
      for (let i = 1; i < n; i++) {
        const flipStartMs = WORD_COMMIT_AFTER_PULSE_MS + i * gapBetweenFlipStarts;
        const delayMs = flipStartMs - WORD_COMMIT_CHAIN_PULSE_MS;
        window.setTimeout(() => runTileStep(i), delayMs);
      }
    };

    for (let i = 0; i < n; i++) {
      const b = tilesToReplace[i];
      b.classList.remove("grid-button--word-success");
      b.classList.remove(
        "grid-button--word-release-green",
        "grid-button--word-release-hunt-pace"
      );
      b.classList.add(
        huntPaceSuccess
          ? "grid-button--word-release-hunt-pace"
          : "grid-button--word-release-green"
      );
    }

    for (let i = 0; i < n; i++) {
      const btn = tilesToReplace[i];
      btn.addEventListener(
        "animationend",
        () => {
          greenDoneCount++;
          if (greenDoneCount >= n) {
            startPhaseB();
          }
        },
        { once: true }
      );
    }

    window.setTimeout(() => {
      if (epoch !== st.wordReplaceEpoch || phaseBStarted) return;
      startPhaseB();
    }, WORD_RELEASE_GREEN_MS + WORD_REPLACE_TAIL_SLACK_MS);
  }

  function beginSelectionOnButton(targetButton) {
    if (!targetButton) return;
    if (targetButton.disabled) return;
    if (w().wordReplaceLockGen !== 0) return;
    if (
      getTileText(targetButton) !== "" &&
      (w().lastButton === null || isAdjacent(w().lastButton, targetButton))
    ) {
      host.setMouseDown(true);
      w().currentWord += getTileText(targetButton);
      w().selectedButtons.push(targetButton);
      w().selectedButtonSet.add(targetButton);
      targetButton.classList.add("selected");
      w().lastButton = targetButton;
      syncSelectionVisitDepth();
      host.updateCurrentWord();
      host.updateScoreStrip();
    }
  }

  function extendSelectionToButton(targetButton) {
    if (!targetButton) return;
    if (targetButton.disabled) return;
    if (
      host.getMouseDown() &&
      getTileText(targetButton) !== "" &&
      (w().lastButton === null || isAdjacent(w().lastButton, targetButton))
    ) {
      let extendedWithNewTile = false;
      if (targetButton === w().selectedButtons[w().selectedButtons.length - 2]) {
        const removedButton = w().selectedButtons.pop();
        w().currentWord = w().currentWord.slice(0, -1);
        if (getTileText(removedButton) === "qu") {
          w().currentWord = w().currentWord.slice(0, -1);
        }

        const linesOnly = host.gridLineContainer.querySelectorAll("line");
        if (linesOnly.length) linesOnly[linesOnly.length - 1].remove();
        restyleAllWordConnectorLines();

        if (!w().selectedButtons.includes(removedButton)) {
          removedButton.classList.remove("selected");
          removedButton.classList.remove("grid-button--selected-enter");
          w().selectedButtonSet.delete(removedButton);
        }
      } else {
        extendedWithNewTile = true;
        w().currentWord += getTileText(targetButton);
        w().selectedButtons.push(targetButton);
        w().selectedButtonSet.add(targetButton);
        targetButton.classList.add("selected");

        if (w().lastButton) {
          const line = document.createElementNS(svgNs, "line");
          line.setAttribute("stroke-width", "3");
          host.gridLineContainer.appendChild(line);
          restyleAllWordConnectorLines();
        }
      }
      w().lastButton = targetButton;
      syncSelectionVisitDepth();
      if (extendedWithNewTile) {
        const v = targetButton.getAttribute("data-selection-visits");
        if (v === "1") {
          targetButton.classList.add("grid-button--selected-enter");
          const onSelectedEnterEnd = (e) => {
            if (e.target !== targetButton) return;
            targetButton.removeEventListener("animationend", onSelectedEnterEnd);
            targetButton.classList.remove("grid-button--selected-enter");
          };
          targetButton.addEventListener("animationend", onSelectedEnterEnd);
        }
      }
      host.updateCurrentWord();
      host.updateScoreStrip();
    }
  }

  function handleTouchStart(event) {
    if (!host.getGameActive()) return;
    const targetButton = getTileButtonFromEvent(host.grid, event);
    beginSelectionOnButton(targetButton);
  }

  function handleTouchMove(event) {
    if (!host.getGameActive()) return;
    event.preventDefault();
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const button =
      element && element instanceof Element ? element.closest(".grid-button") : null;

    if (button && host.grid.contains(button)) {
      extendSelectionToButton(button);
    }
  }

  function handleTouchEnd(event) {
    if (!host.getGameActive()) return;
    handleMouseUp(event);
  }

  function handleMouseDown(event) {
    if (!host.getGameActive()) return;
    const targetButton = getTileButtonFromEvent(host.grid, event);
    beginSelectionOnButton(targetButton);
  }

  function handleMouseOver(event) {
    if (!host.getGameActive()) return;
    const targetButton = getTileButtonFromEvent(host.grid, event);
    extendSelectionToButton(targetButton);
  }

  function handleMouseUp(event) {
    if (!host.getGameActive()) return;
    if (!host.getMouseDown()) return;
    host.setMouseDown(false);

    if (w().currentWord.length <= 2) {
      if (host.gridLineContainer.querySelector("line")) {
        finishWordDragCleanup({ skipLines: true });
        fadeOutWordConnectorLines();
      } else {
        finishWordDragCleanup();
      }
      return;
    }

    if (host.validateWord(w().currentWord)) {
      const len = w().currentWord.length;
      const cw = w().currentWord;
      const wordScore = host.getWordScoreFromSelectedTiles(w().selectedButtons);
      const huntMeta = host.evaluatePerfectHuntSubmit(cw, wordScore);
      const keepingPace = host.isWordKeepingPerfectHuntPace(cw);
      if (huntMeta.isPerfectCompletion) {
        playSound("perfect", host.getMuted(), {
          onEnded: host.onPerfectFanfareEnded,
        });
      } else if (keepingPace && huntMeta.choirPlaybackRate != null) {
        playSound("choir", host.getMuted(), {
          playbackRate: huntMeta.choirPlaybackRate,
        });
      } else {
        playSound("bing", host.getMuted(), {
          playbackRate: bingPlaybackRateForWordLength(len),
        });
      }
      const tilesToReplace = Array.from(w().selectedButtonSet);
      host.recordLeaderboardScoreTurn?.(cw, tilesToReplace.length);
      host.addToScore(wordScore);
      const paceOrderResult = host.recordPerfectHuntOrderPace(cw);
      host.commitPerfectHuntWordIfListed(cw);
      showMessage(
        ctx,
        `${cw.toUpperCase()} +${wordScore}`,
        1,
        keepingPace ? huntPaceSuccessFlashColor : greenTextColor,
        Math.max(
          0,
          getWordReplaceAnimationHoldMs(tilesToReplace.length) -
            WORD_SUCCESS_MESSAGE_FADE_EARLY_MS
        )
      );
      host.recordTrophyWordIfBest(cw, wordScore);
      host.updateScore();

      applyWordConnectorLineOutcome(true, { huntPaceSuccess: keepingPace });

      w().selectedButtons.forEach((button) => {
        button.classList.remove("selected", "grid-button--selected-enter");
        button.removeAttribute("data-selection-visits");
      });
      w().selectedButtons = [];
      w().selectedButtonSet = new Set();
      w().lastButton = null;
      host.updateCurrentWord();
      host.updateScoreStrip();
      w().currentWord = "";

      runSuccessPopThenStaggeredFlip(
        tilesToReplace,
        () => {
          if (!huntMeta.isPerfectCompletion) return;
          if (!host.getGameActive()) return;
          host.endGameWithStinger?.({ endgameStinger: "perfect" });
        },
        keepingPace,
        paceOrderResult.brokePace === true
      );
    } else {
      playSound("invalid", host.getMuted());
      showMessage(ctx, "INVALID", 1, redTextColor);
      applyWordConnectorLineOutcome(false);
      fadeOutWordConnectorLines();
      for (let i = 0; i < w().selectedButtons.length; i++) {
        w().selectedButtons[i].classList.add("grid-button--invalid-shake");
      }
      clearWordSubmitFeedbackTimer(ctx);
      w().wordSubmitFeedbackTimer = window.setTimeout(() => {
        w().wordSubmitFeedbackTimer = null;
        finishWordDragCleanup();
      }, WORD_INVALID_SHAKE_MS);
    }
  }

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseDown,
    handleMouseOver,
    handleMouseUp,
  };
}
