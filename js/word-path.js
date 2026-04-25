export function wordPathDragStrokeColorAt(p) {
  let u = p % 1;
  if (u < 0) u += 1;
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const rRed = 4 / 11;
  const rPink = 7 / 11;
  const rBlue = 9 / 11;
  const am = { r: 255, g: 175, b: 0 };
  const rd = { r: 255, g: 0, b: 0 };
  const pk = { r: 255, g: 125, b: 195 };
  const bl = { r: 85, g: 145, b: 255 };
  if (u <= rRed) {
    const t = rRed > 0 ? u / rRed : 0;
    return `rgb(${lerp(am.r, rd.r, t)},${lerp(am.g, rd.g, t)},${lerp(
      am.b,
      rd.b,
      t
    )})`;
  }
  if (u <= rPink) {
    const t = (u - rRed) / (rPink - rRed);
    return `rgb(${lerp(rd.r, pk.r, t)},${lerp(rd.g, pk.g, t)},${lerp(
      rd.b,
      pk.b,
      t
    )})`;
  }
  if (u <= rBlue) {
    const t = (u - rPink) / (rBlue - rPink);
    return `rgb(${lerp(pk.r, bl.r, t)},${lerp(pk.g, bl.g, t)},${lerp(
      pk.b,
      bl.b,
      t
    )})`;
  }
  const t = rBlue < 1 ? (u - rBlue) / (1 - rBlue) : 0;
  return `rgb(${lerp(bl.r, am.r, t)},${lerp(bl.g, am.g, t)},${lerp(
    bl.b,
    am.b,
    t
  )})`;
}
