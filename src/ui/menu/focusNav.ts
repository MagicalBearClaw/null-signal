/**
 * Directional focus movement for menus driven by arrow keys or a gamepad d-pad: from the
 * focused element's box, pick the nearest candidate that lies in the pressed direction.
 * Distance off the axis counts double, so "down" prefers the item straight below over
 * one that is closer but off to the side.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const centre = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

/** Index of the best candidate in `dir` from `from`, or -1 if none lies that way. */
export function pickInDirection(from: Box, candidates: readonly Box[], dir: Direction): number {
  const o = centre(from);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((c, i) => {
    const p = centre(c);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const [along, across] =
      dir === 'up' ? [-dy, dx] : dir === 'down' ? [dy, dx] : dir === 'left' ? [-dx, dy] : [dx, dy];
    if (along <= 1) return; // behind or level with the current item
    const score = along + 2 * Math.abs(across);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
