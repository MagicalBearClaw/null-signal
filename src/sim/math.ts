/** Pure numeric helpers for the simulation. No three.js here (DESIGN.md §2.1). */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const TAU = Math.PI * 2;

/** Wraps an angle to [-π, π). */
export function wrapAngle(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Interpolates angles along the shortest arc (so 179° → -179° doesn't spin the long way). */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
