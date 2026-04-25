const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;

let context = null;
let masterGain = null;
let sfxBus = null;
const bufferById = new Map();
let lastGameOverSource = null;
let didWireResume = false;
let useWebSfx = false;

function ensureGraph() {
  if (context) return context;
  if (typeof AudioContextCtor !== "function") return null;
  context = new AudioContextCtor();
  masterGain = context.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(context.destination);
  sfxBus = context.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(masterGain);
  if (!didWireResume) {
    didWireResume = true;
    document.addEventListener("visibilitychange", () => {
      if (context && context.state === "suspended" && !document.hidden) {
        void context.resume();
      }
    });
    document.addEventListener(
      "pointerdown",
      () => {
        if (context && context.state === "suspended") {
          void context.resume();
        }
      },
      { capture: true }
    );
  }
  return context;
}

export function isWebSfxPathActive() {
  return useWebSfx;
}

export function isWebAudioContextAvailable() {
  return typeof AudioContextCtor === "function";
}

export async function initWebSfxFromSpec(spec) {
  if (typeof AudioContextCtor !== "function") return false;
  const ctx = ensureGraph();
  if (!ctx) return false;
  if (context.state === "suspended") {
    await context.resume();
  }
  const tasks = spec.map(async ({ id, src }) => {
    const r = await fetch(src);
    if (!r.ok) {
      throw new Error(`SFX load failed: ${src}`);
    }
    const ab = await r.arrayBuffer();
    const buffer = await new Promise((resolve, reject) => {
      context.decodeAudioData(
        ab.slice(0),
        (buf) => resolve(buf),
        (err) => reject(err || new Error("decodeAudioData failed"))
      );
    });
    return { id, buffer };
  });
  const decoded = await Promise.all(tasks);
  for (const { id, buffer } of decoded) {
    bufferById.set(id, buffer);
  }
  useWebSfx = true;
  return true;
}

export function setSfxMasterMuted(muted) {
  if (!masterGain) return;
  masterGain.gain.value = muted ? 0 : 1;
}

function stopWebGameOverIfPlaying() {
  if (!lastGameOverSource) return;
  try {
    lastGameOverSource.onended = null;
    const when = context.currentTime;
    lastGameOverSource.stop(when);
  } catch (_) {}
  lastGameOverSource = null;
}

export function resetWebGameOver() {
  stopWebGameOverIfPlaying();
}

export function playWebSfx(name, muted, options = {}) {
  if (!useWebSfx || !context || !bufferById.size) {
    return false;
  }
  const buffer = bufferById.get(name);
  if (!buffer) {
    return false;
  }
  const playbackRateRaw =
    typeof options.playbackRate === "number" ? options.playbackRate : 1;
  const playbackRate = Math.min(2, Math.max(0.25, playbackRateRaw));
  if (name === "gameOver") {
    try {
      sfxBus.gain.setValueAtTime(0, context.currentTime);
    } catch (_) {}
    stopWebGameOverIfPlaying();
    const src = context.createBufferSource();
    src.buffer = buffer;
    const g = context.createGain();
    g.gain.value = muted ? 0 : 1;
    const onEnded = typeof options.onEnded === "function" ? options.onEnded : null;
    src.onended = () => {
      if (src === lastGameOverSource) {
        lastGameOverSource = null;
      }
      if (onEnded) onEnded();
    };
    lastGameOverSource = src;
    src.connect(g);
    g.connect(masterGain);
    src.start(context.currentTime);
    return true;
  }
  try {
    sfxBus.gain.setValueAtTime(1, context.currentTime);
  } catch (_) {}
  const src = context.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = playbackRate;
  const g = context.createGain();
  g.gain.value = muted ? 0 : 1;
  src.connect(g);
  g.connect(sfxBus);
  src.start(context.currentTime);
  return true;
}
