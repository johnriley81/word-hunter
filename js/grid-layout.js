export function lockGridSizeForSwipe(grid, shiftState) {
  if (shiftState.lockedGridWidthPx > 0 && shiftState.lockedGridHeightPx > 0) return;
  const br = grid.getBoundingClientRect();
  if (br.width < 1 || br.height < 1) return;
  shiftState.lockedGridWidthPx = br.width;
  shiftState.lockedGridHeightPx = br.height;
  grid.style.width = shiftState.lockedGridWidthPx + "px";
  grid.style.maxWidth = shiftState.lockedGridWidthPx + "px";
  grid.style.height = shiftState.lockedGridHeightPx + "px";
}

export function unlockGridSizeAfterSwipe(shiftState) {
  shiftState.lockedGridWidthPx = 0;
  shiftState.lockedGridHeightPx = 0;
}

/**
 * @param {{
 *   grid: HTMLElement;
 *   gridLineWrapper: HTMLElement | null;
 *   gridLineContainer: HTMLElement;
 *   beforeMeasure?: () => void;
 * }} deps
 */
export function createLineOverlayLayoutSync(deps) {
  const { grid, gridLineWrapper, gridLineContainer, beforeMeasure } = deps;

  let lineOverlaySyncRaf = 0;

  function syncLineOverlaySize() {
    if (!gridLineWrapper) return;
    if (typeof beforeMeasure === "function") beforeMeasure();
    const wrap = gridLineWrapper.getBoundingClientRect();
    const gridR = grid.getBoundingClientRect();
    const offsetLeft = Math.round(gridR.left - wrap.left);
    const offsetTop = Math.round(gridR.top - wrap.top);
    gridLineContainer.style.left = offsetLeft + "px";
    gridLineContainer.style.top = offsetTop + "px";
    gridLineContainer.style.width = grid.offsetWidth + "px";
    gridLineContainer.style.height = grid.offsetHeight + "px";
  }

  function scheduleSyncLineOverlaySize() {
    if (lineOverlaySyncRaf !== 0) return;
    lineOverlaySyncRaf = window.requestAnimationFrame(() => {
      lineOverlaySyncRaf = 0;
      syncLineOverlaySize();
    });
  }

  return { syncLineOverlaySize, scheduleSyncLineOverlaySize };
}
