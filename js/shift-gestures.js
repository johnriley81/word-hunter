export function createInitialShiftGestureState() {
  return {
    pointerId: null,
    startX: 0,
    startY: 0,
    pointerDownAt: 0,
    doubleTapPrevAt: 0,
    animating: false,
    /** @type {null | boolean} */
    dragLockedHorizontal: null,
    visualTx: 0,
    visualTy: 0,
    visualStripCount: 0,
    visualStripHorizontal: true,
    swipeTickPrevMag: 0,
    lockedGridWidthPx: 0,
    lockedGridHeightPx: 0,
  };
}
