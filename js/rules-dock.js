import { syncLiveSfxMute } from "./audio.js";

export function setRulesOverlayVisible(refs, gridPan, onPausedChange, isVisible) {
  const { rules, gameInfoContainer, bottomDock, grid } = refs;
  rules.classList.toggle("hidden", !isVisible);
  rules.classList.toggle("visible", isVisible);
  document.body.classList.toggle("rules-overlay-open", isVisible);
  gameInfoContainer.classList.toggle("hiddenDisplay", isVisible);
  bottomDock.classList.toggle("hiddenDisplay", isVisible);
  grid.classList.toggle("hidden", isVisible);
  grid.classList.toggle("visible", !isVisible);
  if (gridPan) {
    gridPan.classList.toggle("hidden", isVisible);
    gridPan.classList.toggle("visible", !isVisible);
  }
  onPausedChange(isVisible);
}

export function attachRulesDock(opts) {
  const {
    refs,
    gridPan,
    rules,
    rulesButton,
    muteButton,
    getIsMuted,
    setIsMuted,
    onPausedChange,
  } = opts;

  function setVisible(isVisible) {
    setRulesOverlayVisible(refs, gridPan, onPausedChange, isVisible);
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
