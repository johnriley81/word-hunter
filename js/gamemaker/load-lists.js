/**
 * Puzzle builder list data: merge every bundle URL from manifest.json, same path for all callers.
 */

const GM_MANIFEST_URL = "text/gamemaker/manifest.json";
/** Single bundle used only if manifest is missing or yields zero puzzles. */
const GM_FALLBACK_BUNDLE_URL = "text/gamemaker/lists/demo-static.json";

/**
 * @param {string} relativeUrl
 * @returns {Promise<{ lists: unknown[], testHarness?: unknown }>}
 */
async function fetchBundle(relativeUrl) {
  const r = await fetch(relativeUrl);
  if (!r.ok) {
    return { lists: [] };
  }
  const j = await r.json();
  return {
    lists: Array.isArray(j.lists) ? j.lists : [],
    testHarness: j.testHarness,
  };
}

/**
 * @returns {Promise<string[]>}
 */
async function bundleUrlsFromManifest() {
  const res = await fetch(GM_MANIFEST_URL);
  if (!res.ok) return [];
  const m = await res.json();
  const urls = m && (m.bundles || m.lists);
  return Array.isArray(urls) ? urls : [];
}

export async function loadGamemakerListsData() {
  let merged = [];
  let lastHarness = undefined;
  try {
    const urls = await bundleUrlsFromManifest();
    for (const rel of urls) {
      try {
        const { lists, testHarness } = await fetchBundle(rel);
        merged.push(...lists);
        if (testHarness != null) lastHarness = testHarness;
      } catch (_) {}
    }
  } catch (_) {
    merged = [];
  }
  if (!merged.length) {
    try {
      const fb = await fetchBundle(GM_FALLBACK_BUNDLE_URL);
      merged = fb.lists;
      if (fb.testHarness != null) lastHarness = fb.testHarness;
    } catch (_) {}
  }
  return {
    lists: merged,
    ...(lastHarness != null ? { testHarness: lastHarness } : {}),
  };
}
