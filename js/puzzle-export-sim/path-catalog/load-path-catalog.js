import { existsSync, readFileSync } from "node:fs";
import { loadPathSignatureCatalog } from "./path-variant-catalog.js";

/**
 * Load catalog JSON when it contains at least one geometric variant.
 *
 * @param {string} catalogPath absolute or relative path
 * @param {{ allowSignaturesOnly?: boolean }} [opts]
 */
export function loadPathCatalogIfReady(catalogPath, opts = {}) {
  if (!catalogPath || !existsSync(catalogPath)) return null;
  try {
    const c = loadPathSignatureCatalog(catalogPath);
    if (!opts.allowSignaturesOnly && c.signaturesOnly) return null;
    let withVariants = 0;
    for (const sig of Object.values(c.signatures)) {
      if (sig && Array.isArray(sig.variants) && sig.variants.length > 0) withVariants++;
    }
    if (withVariants === 0) return null;
    return c;
  } catch {
    return null;
  }
}

/**
 * @param {string} catalogPath
 */
export function pathCatalogHasVariants(catalogPath) {
  return loadPathCatalogIfReady(catalogPath) != null;
}

/**
 * Quick stats without retaining full catalog in memory twice.
 *
 * @param {string} catalogPath
 */
export function pathCatalogStats(catalogPath) {
  if (!existsSync(catalogPath)) return null;
  const raw = readFileSync(catalogPath, "utf8");
  const j = JSON.parse(raw);
  const sigs =
    j.signatures && typeof j.signatures === "object" ? Object.keys(j.signatures) : [];
  let withVariants = 0;
  let variantCount = 0;
  for (const k of sigs) {
    const v = j.signatures[k]?.variants;
    if (Array.isArray(v) && v.length > 0) {
      withVariants++;
      variantCount += v.length;
    }
  }
  return {
    signatures: sigs.length,
    withVariants,
    variantCount,
    signaturesOnly: !!j.signaturesOnly,
    words: j.wordToSigKey ? Object.keys(j.wordToSigKey).length : 0,
  };
}
