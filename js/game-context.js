import { createInitialShiftGestureState } from "./shift-gestures.js";

export function createGameContext() {
  return {
    refs: {},
    fn: {},
    state: {
      shift: createInitialShiftGestureState(),
      /** @type {string[][]} */
      gameBoard: [],
      /** @type {string[] | null} */
      perfectHunt: null,
      /** @type {number | null} */
      perfectHuntTargetSum: null,
      /** @type {Map<string, number> | null} */
      perfectHuntChoirRateByWord: null,
      /** @type {Set<string> | null} */
      perfectHuntWordsSubmitted: null,
      wordLine: {
        active: false,
        /** @type {ReturnType<typeof setTimeout> | null} */
        messageTimer: null,
        /** @type {ReturnType<typeof setTimeout> | null} */
        fadeTimer: null,
        epoch: 0,
      },
      word: {
        /** @type {HTMLButtonElement[]} */
        selectedButtons: [],
        /** @type {Set<HTMLButtonElement>} */
        selectedButtonSet: new Set(),
        /** @type {HTMLButtonElement | null} */
        lastButton: null,
        currentWord: "",
        /** @type {ReturnType<typeof setTimeout> | null} */
        wordSubmitFeedbackTimer: null,
        wordReplaceEpoch: 0,
        wordReplaceLockGen: 0,
      },
    },
  };
}
