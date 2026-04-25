import {
  LETTER_WEIGHTS,
  SHIFT_STRIDE_FIRST_FRAC,
  SCENARIO_MESSAGE_VARIANTS,
} from "./config.js";

export function normalizeTileText(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase();
  if (normalized === "q") return "qu";
  return normalized;
}

export function getLetterWeight(tileText) {
  const normalized = normalizeTileText(tileText);
  return LETTER_WEIGHTS[normalized] ?? 1;
}

export function shiftMaxStepsPerGesture(n) {
  return Math.max(1, n - 1);
}

export function shiftCommitStepsFromAxisMag(magPx, stridePx, n) {
  if (magPx <= 0) return 0;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  if (magPx < first) return 0;
  const cap = shiftMaxStepsPerGesture(n);
  return Math.min(cap, 1 + Math.floor((magPx - first) / stridePx));
}

export function clampAxisMagToCommitBandForK(magPx, stridePx, k) {
  if (k <= 0 || magPx <= 0) return magPx;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  const low = first + (k - 1) * stridePx;
  const hiEx = first + k * stridePx;
  return Math.min(Math.max(magPx, low), hiEx - 1e-6);
}

export function quantizeShiftVisualAxis(tx, ty, horizontal, stridePx, n) {
  const rawAxis = horizontal ? tx : ty;
  const magRaw = Math.abs(rawAxis);
  if (magRaw <= 0) {
    return { tx, ty, rawTx: tx, rawTy: ty };
  }
  const steps = shiftCommitStepsFromAxisMag(magRaw, stridePx, n);
  if (steps === 0) {
    return { tx, ty, rawTx: tx, rawTy: ty };
  }
  const sign = rawAxis >= 0 ? 1 : -1;
  const snapped = clampAxisMagToCommitBandForK(magRaw, stridePx, steps);
  if (horizontal) {
    return { tx: sign * snapped, ty: 0, rawTx: tx, rawTy: ty };
  }
  return { tx: 0, ty: sign * snapped, rawTx: tx, rawTy: ty };
}

export function pickRandomScenarioMessage(scenarioKey, fallbackMessage = "") {
  const variants = SCENARIO_MESSAGE_VARIANTS[scenarioKey];
  if (!Array.isArray(variants) || variants.length === 0) {
    return fallbackMessage;
  }
  const i = Math.floor(Math.random() * variants.length);
  return variants[i];
}

/** @param {string[]} labels Tile labels in path order */
export function getLiveWordScoreBreakdownFromLabels(labels) {
  const sequence = Array.isArray(labels) ? labels : [];
  const length = sequence.reduce((total, s) => {
    return total + String(s || "").length;
  }, 0);
  if (length === 0) {
    return { letterSum: 0, length: 0, wordTotal: 0 };
  }
  const letterSum = sequence.reduce((sum, s) => {
    return sum + getLetterWeight(s);
  }, 0);
  return {
    letterSum,
    length,
    wordTotal: letterSum * length,
  };
}

export function applyColumnShiftInPlace(board, signedSteps, n) {
  const kk = Math.abs(signedSteps) % n;
  if (kk === 0) return;
  const copy = board.map((row) => row.slice());
  const right = signedSteps > 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      board[r][c] = right ? copy[r][(c - kk + n * 10) % n] : copy[r][(c + kk) % n];
    }
  }
}

export function applyRowShiftInPlace(board, signedSteps, n) {
  const kk = Math.abs(signedSteps) % n;
  if (kk === 0) return;
  const copy = board.map((row) => row.slice());
  const down = signedSteps > 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      board[r][c] = down ? copy[(r - kk + n * 10) % n][c] : copy[(r + kk) % n][c];
    }
  }
}

export function parseStageTranslatePx(transformCss) {
  if (!transformCss || transformCss === "none") return { x: 0, y: 0 };
  try {
    const m = new DOMMatrixReadOnly(transformCss);
    return { x: m.m41, y: m.m42 };
  } catch (_) {
    return { x: 0, y: 0 };
  }
}

export function gridInverseCompensateTranslateString(stageTransformCss) {
  const { x, y } = parseStageTranslatePx(stageTransformCss);
  return `translate(${-x}px, ${-y}px)`;
}

export function stageTransformsWithinPx(a, b, epsPx) {
  const pa = parseStageTranslatePx(a);
  const pb = parseStageTranslatePx(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) < epsPx;
}

export function computeShiftStageTransformString(horizontal, signedAxis, k, m) {
  if (horizontal) {
    const tx = signedAxis;
    if (tx > 0) {
      const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
      const baseX = -(ghostW + m.gap) + tx;
      return `translate(${baseX}px, 0)`;
    }
    if (tx < 0) {
      return `translate(${tx}px, 0)`;
    }
    return "translate(0px, 0px)";
  }

  const ty = signedAxis;
  if (ty > 0) {
    const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
    const baseY = -ghostH + ty;
    return `translate(0px, ${baseY}px)`;
  }
  if (ty < 0) {
    return `translate(0px, ${ty}px)`;
  }
  return "translate(0px, 0px)";
}

export function computeShiftSnapPlan(
  horizontal,
  signedVis,
  k,
  mDrag,
  stageTransformFromDrag
) {
  const stride = horizontal ? mDrag.tw + mDrag.gap : mDrag.th + mDrag.gap;
  const mag = Math.abs(signedVis);
  const snappedMag = clampAxisMagToCommitBandForK(mag, stride, k);
  const snappedSigned = signedVis >= 0 ? snappedMag : -snappedMag;
  const targetTransform = computeShiftStageTransformString(
    horizontal,
    snappedSigned,
    k,
    mDrag
  );
  const skipSnapAnimate = stageTransformsWithinPx(
    stageTransformFromDrag,
    targetTransform,
    0.45
  );
  return { targetTransform, skipSnapAnimate };
}
