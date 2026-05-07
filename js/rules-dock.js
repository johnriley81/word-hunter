import { syncLiveSfxMute } from "./audio.js";

function setRulesOverlayVisible(
  refs,
  onPausedChange,
  scheduleLineOverlayResize,
  isVisible
) {
  const { rules, gameInfoContainer, bottomDock, gridLineWrapper } = refs;
  rules.classList.toggle("hidden", !isVisible);
  rules.classList.toggle("visible", isVisible);
  document.body.classList.toggle("rules-overlay-open", isVisible);
  gameInfoContainer.classList.toggle("hiddenDisplay", isVisible);
  bottomDock.classList.toggle("hiddenDisplay", isVisible);
  gridLineWrapper?.classList.toggle("rules-hide-playing-surface", isVisible);
  onPausedChange(isVisible);
  if (!isVisible && typeof scheduleLineOverlayResize === "function") {
    scheduleLineOverlayResize();
  }
}

export function attachRulesDock(opts) {
  const {
    refs,
    rulesButton,
    muteButton,
    getIsMuted,
    setIsMuted,
    onPausedChange,
    scheduleLineOverlayResize,
  } = opts;
  const { rules } = refs;

  function setVisible(isVisible) {
    setRulesOverlayVisible(refs, onPausedChange, scheduleLineOverlayResize, isVisible);
  }

  rules.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) return;
    setVisible(false);
  });
  rulesButton.addEventListener("click", () => setVisible(true));
  muteButton.addEventListener("click", () => {
    if (getIsMuted()) {
      setIsMuted(false);
      muteButton.textContent = "🔔";
    } else {
      setIsMuted(true);
      muteButton.textContent = "🔕";
    }
    syncLiveSfxMute(getIsMuted());
  });

  return { setRulesOverlayVisible: setVisible };
}
