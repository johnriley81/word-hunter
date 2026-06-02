const STORAGE_PREFIX = "wordhunter:lb-session:";

/** @type {Map<string, string>} */
const memoryFallback = new Map();

function randomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function resetLeaderboardSessionStorageForTests() {
  memoryFallback.clear();
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    const keys = [];
    for (let i = 0; i < globalThis.localStorage.length; i += 1) {
      const key = globalThis.localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) globalThis.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Stable UUID per puzzle day for session-scoped leaderboard UPSERT.
 *
 * @param {number | string} puzzleId
 */
export function getLeaderboardSessionId(puzzleId) {
  const key = `${STORAGE_PREFIX}${String(puzzleId)}`;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      const existing = globalThis.localStorage.getItem(key);
      if (existing) return existing;
      const id = randomUUID();
      globalThis.localStorage.setItem(key, id);
      return id;
    }
  } catch {
    // fall through to in-memory fallback
  }
  if (memoryFallback.has(key)) return memoryFallback.get(key);
  const id = randomUUID();
  memoryFallback.set(key, id);
  return id;
}
