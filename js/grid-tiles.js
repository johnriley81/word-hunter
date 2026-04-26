import { normalizeTileText, getLetterWeight } from "./board-logic.js";

export function getTileButtonFromEvent(grid, event) {
  if (!(event.target instanceof Element)) return null;
  const button = event.target.closest(".grid-button");
  if (!button || !grid.contains(button)) return null;
  return button;
}

export function getTileText(el) {
  if (!el) return "";
  return normalizeTileText(el.dataset.tileText || el.textContent);
}

export function setTileText(el, tileText) {
  const normalized = normalizeTileText(tileText);
  el.dataset.tileText = normalized;
  const isBlankTile = normalized === "";

  let glyph = el.querySelector(".tile-glyph");
  if (!glyph) {
    glyph = document.createElement("span");
    glyph.className = "tile-glyph";
    el.appendChild(glyph);
  }
  glyph.textContent = normalized;

  let badge = el.querySelector(".tile-weight-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tile-weight-badge";
    badge.setAttribute("aria-hidden", "true");
    el.appendChild(badge);
  }
  badge.textContent = isBlankTile ? "" : String(getLetterWeight(normalized));
  badge.style.display = isBlankTile ? "none" : "";
  el.disabled = isBlankTile;
}

/**
 * Like setTileText but never disables the button (for gamemaker empty cells).
 * @param {HTMLButtonElement} el
 * @param {string} tileText
 */
export function setTileTextAllowEmpty(el, tileText) {
  const normalized = normalizeTileText(tileText);
  el.dataset.tileText = normalized;
  const isBlankTile = normalized === "";
  el.classList.toggle("grid-button--build-empty", isBlankTile);

  let glyph = el.querySelector(".tile-glyph");
  if (!glyph) {
    glyph = document.createElement("span");
    glyph.className = "tile-glyph";
    el.appendChild(glyph);
  }
  glyph.textContent = isBlankTile ? "·" : normalized;

  let badge = el.querySelector(".tile-weight-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tile-weight-badge";
    badge.setAttribute("aria-hidden", "true");
    el.appendChild(badge);
  }
  badge.textContent = isBlankTile ? "" : String(getLetterWeight(normalized));
  badge.style.display = isBlankTile ? "none" : "";
  el.disabled = false;
}

export function syncDomFromBoard(grid, gameBoard, gridSize) {
  const n = gridSize;
  const tiles = grid.children;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      setTileText(tiles[r * n + c], gameBoard[r][c]);
    }
  }
}
