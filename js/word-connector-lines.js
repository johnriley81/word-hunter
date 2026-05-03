import { WORD_PATH_COLOR_STEPS } from "./config.js";
import { wordPathDragStrokeColorAt } from "./word-path.js";

/**
 * @param {{
 *   grid: HTMLElement;
 *   gridLineContainer: HTMLElement;
 *   svgNs: string;
 *   selectedButtons: HTMLElement[];
 *   gradientIdPrefix: string;
 * }} deps
 */
export function restyleWordConnectorLines(deps) {
  const { grid, gridLineContainer, svgNs, selectedButtons, gradientIdPrefix } = deps;
  const lineEls = gridLineContainer.querySelectorAll("line");
  let defs = gridLineContainer.querySelector("defs");
  if (lineEls.length === 0) {
    if (defs) defs.remove();
    return;
  }
  const n = selectedButtons.length;
  if (n < 2 || lineEls.length !== n - 1) return;
  if (!defs) {
    defs = document.createElementNS(svgNs, "defs");
    gridLineContainer.insertBefore(defs, gridLineContainer.firstChild);
  }
  defs.replaceChildren();
  const gridRect = grid.getBoundingClientRect();
  const colorSpan = WORD_PATH_COLOR_STEPS;
  const pathColorPhase = (k) => (((k / colorSpan) % 1) + 1) % 1;
  for (let i = 0; i < lineEls.length; i++) {
    const line = lineEls[i];
    const btnA = selectedButtons[i];
    const btnB = selectedButtons[i + 1];
    const lastRect = btnA.getBoundingClientRect();
    const currRect = btnB.getBoundingClientRect();
    const x1 = lastRect.left + lastRect.width / 2 - gridRect.left;
    const y1 = lastRect.top + lastRect.height / 2 - gridRect.top;
    const x2 = currRect.left + currRect.width / 2 - gridRect.left;
    const y2 = currRect.top + currRect.height / 2 - gridRect.top;
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    const p0 = pathColorPhase(i);
    const p1 = pathColorPhase(i + 1);
    const gradId = `${gradientIdPrefix}-${i}`;
    const grad = document.createElementNS(svgNs, "linearGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("x1", String(x1));
    grad.setAttribute("y1", String(y1));
    grad.setAttribute("x2", String(x2));
    grad.setAttribute("y2", String(y2));
    const stop0 = document.createElementNS(svgNs, "stop");
    stop0.setAttribute("offset", "0%");
    stop0.setAttribute("stop-color", wordPathDragStrokeColorAt(p0));
    const stop1 = document.createElementNS(svgNs, "stop");
    stop1.setAttribute("offset", "100%");
    stop1.setAttribute("stop-color", wordPathDragStrokeColorAt(p1));
    grad.appendChild(stop0);
    grad.appendChild(stop1);
    defs.appendChild(grad);
    line.setAttribute("stroke", `url(#${gradId})`);
  }
}
