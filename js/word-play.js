export function isAdjacentGridTiles(gridEl, button1, button2, n) {
  const index1 = Array.prototype.indexOf.call(gridEl.children, button1);
  const index2 = Array.prototype.indexOf.call(gridEl.children, button2);
  const r1 = Math.floor(index1 / n);
  const c1 = index1 % n;
  const r2 = Math.floor(index2 / n);
  const c2 = index2 % n;
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
}

export function syncSelectionVisitDepthOnGrid(gridEl, selectedButtons) {
  const counts = new Map();
  for (const btn of selectedButtons) {
    counts.set(btn, (counts.get(btn) || 0) + 1);
  }
  for (const btn of gridEl.children) {
    if (!btn.classList.contains("grid-button")) continue;
    const n = counts.get(btn);
    if (n === undefined) {
      btn.removeAttribute("data-selection-visits");
    } else {
      btn.setAttribute("data-selection-visits", String(n));
    }
  }
}
