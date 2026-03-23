/** World: x in [-3, 3] with +3 on the left; y in [0, 600] feet (0 = tee, up the fairway). */
export const WORLD = {
  xMin: -3,
  xMax: 3,
  yMin: 0,
  yMax: 600,
} as const

export function worldToCanvas(
  wx: number,
  wy: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = ((WORLD.xMax - wx) / (WORLD.xMax - WORLD.xMin)) * width
  const y = height - (wy / WORLD.yMax) * height
  return { x, y }
}

export function canvasToWorld(
  cx: number,
  cy: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = WORLD.xMax - (cx / width) * (WORLD.xMax - WORLD.xMin)
  const y = (1 - cy / height) * WORLD.yMax
  return { x, y }
}

export function clampWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(WORLD.xMax, Math.max(WORLD.xMin, x)),
    y: Math.min(WORLD.yMax, Math.max(WORLD.yMin, y)),
  }
}

/** Cubic Bézier from P0=(0,0) to P3, with control points P1, P2. */
export function bezierPoint(
  t: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
): { x: number; y: number } {
  const u = 1 - t
  const u2 = u * u
  const t2 = t * t
  const t3 = t2 * t
  const x = 3 * u2 * t * p1x + 3 * u * t2 * p2x + t3 * p3x
  const y = 3 * u2 * t * p1y + 3 * u * t2 * p2y + t3 * p3y
  return { x, y }
}
