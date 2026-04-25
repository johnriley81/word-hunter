import {
  CURRENT_WORD_MESSAGE_ON_MS,
  CURRENT_WORD_FADE_MS,
  CURRENT_WORD_BRIEF_FADE_IN_MS,
  START_TOUCHPAD_FADE_MS,
  PRE_START_WORDMARK,
  INTRO_MESSAGE_TEXT,
  happyHuntingColor,
} from "./config.js";

export function getShowMessageDurationMs(flashTimes, flashHoldExtraMs = 0) {
  const flashes = Math.max(1, Number(flashTimes) || 1);
  const onMs = CURRENT_WORD_MESSAGE_ON_MS;
  const extra = Math.max(0, Number(flashHoldExtraMs) || 0);
  const fadeInPad = flashes * CURRENT_WORD_BRIEF_FADE_IN_MS;
  if (flashes === 1) {
    return onMs + extra + fadeInPad;
  }
  return flashes * onMs + (flashes - 1) * 380 + flashes * extra + fadeInPad;
}

export function clearWordLineTimers(ctx) {
  const wl = ctx.state.wordLine;
  if (wl.messageTimer) {
    window.clearTimeout(wl.messageTimer);
    wl.messageTimer = null;
  }
  if (wl.fadeTimer) {
    window.clearTimeout(wl.fadeTimer);
    wl.fadeTimer = null;
  }
  wl.active = false;
}

export function beginCurrentWordMessageSession(ctx) {
  const wl = ctx.state.wordLine;
  wl.epoch++;
  const myEpoch = wl.epoch;
  if (wl.messageTimer) {
    window.clearTimeout(wl.messageTimer);
    wl.messageTimer = null;
  }
  if (wl.fadeTimer) {
    window.clearTimeout(wl.fadeTimer);
    wl.fadeTimer = null;
  }
  wl.active = true;
  return myEpoch;
}

export function crossfadeCopyScoreToCopied(ctx) {
  const el = ctx.refs.currentWordElement;
  const fadeOutMs = CURRENT_WORD_FADE_MS;
  const fadeInMs = CURRENT_WORD_BRIEF_FADE_IN_MS;

  el.style.transition = "none";
  void el.offsetHeight;
  el.style.transition = `opacity ${fadeOutMs}ms ease-out`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("current-word--soft-hidden");
    });
  });

  window.setTimeout(() => {
    el.style.transition = "none";
    el.classList.add("current-word--soft-hidden");
    el.textContent = "Score copied";
    el.style.color = "#ffffff";
    void el.offsetHeight;
    el.style.transition = `opacity ${fadeInMs}ms ease-out`;
    requestAnimationFrame(() => {
      el.classList.remove("current-word--soft-hidden");
    });
    window.setTimeout(() => {
      el.style.transition = "";
    }, fadeInMs + 120);
  }, fadeOutMs + 60);
}

export function fadeInCurrentWordLine(ctx, text, color, options = {}) {
  const currentWordElement = ctx.refs.currentWordElement;
  const wl = ctx.state.wordLine;
  const fadeMs = options.fadeMs ?? CURRENT_WORD_BRIEF_FADE_IN_MS;
  const epoch = options.epoch;
  const epochOk = () => epoch === undefined || epoch === wl.epoch;

  currentWordElement.style.transition = "none";
  currentWordElement.classList.add("current-word--soft-hidden");
  currentWordElement.textContent = text;
  currentWordElement.style.color = color;
  void currentWordElement.offsetHeight;
  currentWordElement.style.transition = `opacity ${fadeMs}ms ease-out`;

  requestAnimationFrame(() => {
    if (!epochOk()) return;
    currentWordElement.classList.remove("current-word--soft-hidden");
  });
  window.setTimeout(() => {
    if (!epochOk()) return;
    currentWordElement.style.transition = "";
  }, fadeMs + 100);
}

export function beginCurrentWordOpacityFade(ctx, myEpoch) {
  const currentWordElement = ctx.refs.currentWordElement;
  const wl = ctx.state.wordLine;
  currentWordElement.style.transition = `opacity ${CURRENT_WORD_FADE_MS}ms ease-out`;
  currentWordElement.classList.remove("current-word--valid-solve");
  requestAnimationFrame(() => {
    if (myEpoch !== wl.epoch) return;
    currentWordElement.classList.add("current-word--soft-hidden");
  });
}

export function crossfadeWordmarkToHappyHunting(ctx, options = {}) {
  const currentWordElement = ctx.refs.currentWordElement;
  const wl = ctx.state.wordLine;
  const updateCurrentWord = ctx.fn.updateCurrentWord;
  if (typeof updateCurrentWord !== "function") {
    throw new Error(
      "ctx.fn.updateCurrentWord must be set before crossfadeWordmarkToHappyHunting"
    );
  }

  const skipWordmark = options.skipWordmark === true;
  const myEpoch = beginCurrentWordMessageSession(ctx);
  currentWordElement.classList.remove("current-word--valid-solve");

  const fadeInMs = CURRENT_WORD_BRIEF_FADE_IN_MS;
  const half = Math.max(1, Math.floor(START_TOUCHPAD_FADE_MS / 2));

  if (skipWordmark) {
    fadeInCurrentWordLine(ctx, INTRO_MESSAGE_TEXT, happyHuntingColor, {
      fadeMs: fadeInMs,
      epoch: myEpoch,
    });
    const introHoldAnchorMs = Math.max(START_TOUCHPAD_FADE_MS, fadeInMs + 120);
    window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      currentWordElement.style.transition = "";
    }, introHoldAnchorMs);
    const holdBeforeFade = CURRENT_WORD_MESSAGE_ON_MS - CURRENT_WORD_FADE_MS;
    wl.messageTimer = window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      currentWordElement.classList.add("current-word--soft-hidden");
      wl.fadeTimer = window.setTimeout(() => {
        if (myEpoch !== wl.epoch) return;
        wl.active = false;
        updateCurrentWord();
        wl.messageTimer = null;
        wl.fadeTimer = null;
      }, CURRENT_WORD_FADE_MS);
    }, introHoldAnchorMs + holdBeforeFade);
    return;
  }

  currentWordElement.textContent = PRE_START_WORDMARK;
  currentWordElement.style.color = "white";
  currentWordElement.classList.remove("current-word--soft-hidden");

  currentWordElement.style.transition = `opacity ${half}ms ease`;

  let wordmarkHandoffDone = false;
  const runHappyHuntingHandoff = () => {
    if (wordmarkHandoffDone) return;
    if (myEpoch !== wl.epoch) return;
    wordmarkHandoffDone = true;
    window.clearTimeout(wordmarkHandoffFallbackTimer);
    currentWordElement.removeEventListener(
      "transitionend",
      onWordmarkOpacityTransitionEnd
    );
    currentWordElement.removeEventListener(
      "webkitTransitionEnd",
      onWordmarkOpacityTransitionEnd
    );
    fadeInCurrentWordLine(ctx, INTRO_MESSAGE_TEXT, happyHuntingColor, {
      fadeMs: fadeInMs,
      epoch: myEpoch,
    });
  };

  function onWordmarkOpacityTransitionEnd(e) {
    if (e.target !== currentWordElement) return;
    if (e.propertyName !== "opacity") return;
    runHappyHuntingHandoff();
  }

  currentWordElement.addEventListener("transitionend", onWordmarkOpacityTransitionEnd);
  currentWordElement.addEventListener(
    "webkitTransitionEnd",
    onWordmarkOpacityTransitionEnd
  );
  const wordmarkHandoffFallbackTimer = window.setTimeout(
    runHappyHuntingHandoff,
    half + 160
  );

  requestAnimationFrame(() => {
    if (myEpoch !== wl.epoch) return;
    requestAnimationFrame(() => {
      if (myEpoch !== wl.epoch) return;
      currentWordElement.classList.add("current-word--soft-hidden");
    });
  });

  const introVisualEndMs = half + 160 + fadeInMs + 120;
  const introHoldAnchorMs = Math.max(START_TOUCHPAD_FADE_MS, introVisualEndMs);

  window.setTimeout(() => {
    if (myEpoch !== wl.epoch) return;
    currentWordElement.style.transition = "";
  }, introHoldAnchorMs);

  const holdBeforeFade = CURRENT_WORD_MESSAGE_ON_MS - CURRENT_WORD_FADE_MS;
  wl.messageTimer = window.setTimeout(() => {
    if (myEpoch !== wl.epoch) return;
    currentWordElement.classList.add("current-word--soft-hidden");
    wl.fadeTimer = window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      wl.active = false;
      updateCurrentWord();
      wl.messageTimer = null;
      wl.fadeTimer = null;
    }, CURRENT_WORD_FADE_MS);
  }, introHoldAnchorMs + holdBeforeFade);
}

export function showMessage(
  ctx,
  message,
  flashTimes = 1,
  color = "white",
  visibleHoldMs = null,
  flashHoldExtraMs = 0
) {
  const currentWordElement = ctx.refs.currentWordElement;
  const wl = ctx.state.wordLine;
  const updateCurrentWord = ctx.fn.updateCurrentWord;
  if (typeof updateCurrentWord !== "function") {
    throw new Error("ctx.fn.updateCurrentWord must be set before showMessage");
  }

  const myEpoch = beginCurrentWordMessageSession(ctx);
  currentWordElement.classList.remove("current-word--valid-solve");

  const fadeInMs = CURRENT_WORD_BRIEF_FADE_IN_MS;
  fadeInCurrentWordLine(ctx, message, color, {
    fadeMs: fadeInMs,
    epoch: myEpoch,
  });

  const needsValidSolve =
    visibleHoldMs != null && visibleHoldMs > 0 && flashTimes === 1;
  if (needsValidSolve) {
    window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      currentWordElement.classList.add("current-word--valid-solve");
    }, fadeInMs);
  }

  const holdBeforeFade =
    visibleHoldMs != null && visibleHoldMs > 0 && flashTimes === 1
      ? visibleHoldMs
      : CURRENT_WORD_MESSAGE_ON_MS - CURRENT_WORD_FADE_MS + flashHoldExtraMs;
  const untilFadeOutStart = holdBeforeFade + fadeInMs;

  if (flashTimes > 1) {
    wl.messageTimer = window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      beginCurrentWordOpacityFade(ctx, myEpoch);
      wl.fadeTimer = window.setTimeout(() => {
        if (myEpoch !== wl.epoch) return;
        currentWordElement.style.transition = "";
        wl.active = false;
        updateCurrentWord();
        wl.messageTimer = window.setTimeout(() => {
          if (myEpoch !== wl.epoch) return;
          showMessage(
            ctx,
            message,
            flashTimes - 1,
            color,
            visibleHoldMs,
            flashHoldExtraMs
          );
        }, 380);
      }, CURRENT_WORD_FADE_MS);
    }, untilFadeOutStart);
  } else {
    wl.messageTimer = window.setTimeout(() => {
      if (myEpoch !== wl.epoch) return;
      beginCurrentWordOpacityFade(ctx, myEpoch);
      wl.fadeTimer = window.setTimeout(() => {
        if (myEpoch !== wl.epoch) return;
        currentWordElement.style.transition = "";
        wl.active = false;
        updateCurrentWord();
        wl.messageTimer = null;
        wl.fadeTimer = null;
      }, CURRENT_WORD_FADE_MS);
    }, untilFadeOutStart);
  }
}
