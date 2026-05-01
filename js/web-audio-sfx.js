const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;

let context = null;
let masterGain = null;
let sfxBus = null;
const bufferById = new Map();
let lastGameOverSource = null;
let lastPerfectSource = null;
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
    const tryResumeContext = () => {
      if (context && context.state === "suspended") {
        void context.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tryResumeContext();
    });
    window.addEventListener("pageshow", () => tryResumeContext());
    for (const evt of ["pointerdown", "touchstart"]) {
      document.addEventListener(evt, tryResumeContext, {
        capture: true,
        passive: true,
      });
    }
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

function stopWebPerfectIfPlaying() {
  if (!lastPerfectSource) return;
  try {
    lastPerfectSource.onended = null;
    const when = context.currentTime;
    lastPerfectSource.stop(when);
  } catch (_) {}
  lastPerfectSource = null;
}

export function resetWebGameOver() {
  stopWebGameOverIfPlaying();
  stopWebPerfectIfPlaying();
}

export function playWebSfx(name, muted, options = {}) {
  if (!useWebSfx || !context || !bufferById.size) {
    return false;
  }
  if (context.state !== "running") {
    void context.resume().catch(() => {});
  }
  const buffer = bufferById.get(name);
  if (!buffer) {
    return false;
  }
  const playbackRateRaw =
    typeof options.playbackRate === "number" ? options.playbackRate : 1;
  const playbackRate = Math.min(2, Math.max(0.25, playbackRateRaw));
  if (name === "gameOver" || name === "perfect") {
    try {
      sfxBus.gain.setValueAtTime(0, context.currentTime);
    } catch (_) {}
    stopWebGameOverIfPlaying();
    stopWebPerfectIfPlaying();
    const src = context.createBufferSource();
    src.buffer = buffer;
    const g = context.createGain();
    g.gain.value = muted ? 0 : 1;
    const onEnded = typeof options.onEnded === "function" ? options.onEnded : null;
    src.onended = () => {
      if (name === "gameOver" && src === lastGameOverSource) {
        lastGameOverSource = null;
      }
      if (name === "perfect" && src === lastPerfectSource) {
        lastPerfectSource = null;
      }
      if (onEnded) onEnded();
    };
    if (name === "gameOver") {
      lastGameOverSource = src;
    } else {
      lastPerfectSource = src;
    }
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
