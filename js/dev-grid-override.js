/** ?devGrid=<slug> loads text/dev-overrides/<slug>.json (grid4 | solvedGrid | startingGrid; optional next50 / nextLetters). */

const OVERRIDE_DIR = "text/dev-overrides/";

/** @param {unknown} g */
function is4x4StringGrid(g) {
  if (!Array.isArray(g) || g.length !== 4) return false;
  for (const row of g) {
    if (!Array.isArray(row) || row.length !== 4) return false;
  }
  return true;
}

/**
 * @returns {Promise<null | { grid4: string[][], nextLetters: string[] | null, label: string }>}
 */
export async function fetchDevGridPlaytestOverride() {
  if (typeof location === "undefined" || !location?.search) {
    return null;
  }
  const slug = new URLSearchParams(location.search).get("devGrid");
  if (slug == null || String(slug).trim() === "") {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(String(slug))) {
    console.warn(
      "[devGrid] query ignored: slug must be [a-z0-9], dash, underscore only"
    );
    return null;
  }
  const url = `${OVERRIDE_DIR}${encodeURIComponent(slug)}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[devGrid] could not load", url, res.status);
    return null;
  }
  let j;
  try {
    j = await res.json();
  } catch (e) {
    console.warn("[devGrid] JSON parse error", e);
    return null;
  }
  const raw = j.grid4 ?? j.solvedGrid ?? j.startingGrid;
  if (!is4x4StringGrid(raw)) {
    console.warn(
      "[devGrid] need grid4 | solvedGrid | startingGrid as 4×4 arrays in",
      url
    );
    return null;
  }
  /** @type {string[][]} */
  const grid4 = raw.map((row) =>
    row.map((c) => {
      const t = String(c == null ? "" : c)
        .toLowerCase()
        .trim();
      if (t === "qu") return "qu";
      return t.length ? t.charAt(0) : "";
    })
  );
  const rawNext = j.next50 ?? j.nextLetters;
  let nextLetters = null;
  if (Array.isArray(rawNext) && rawNext.length > 0) {
    nextLetters = rawNext.map((x) => {
      const s = String(x == null ? "" : x)
        .toLowerCase()
        .trim();
      return s.length > 0 ? s : "a";
    });
  }
  const label = typeof j.label === "string" && j.label ? j.label : String(slug);
  return { grid4, nextLetters, label };
}

/**
 * When an override is active, tag the page for optional styling.
 * @param {string | null} label
 */
export function applyDevGridOverrideDataset(label) {
  if (label == null || typeof document === "undefined" || !document.body) {
    return;
  }
  document.body.dataset.devGrid = label;
  document.body.classList.add("dev-grid-override--active");
}

export function clearDevGridOverrideDataset() {
  if (typeof document === "undefined" || !document.body) return;
  delete document.body.dataset.devGrid;
  document.body.classList.remove("dev-grid-override--active");
}
