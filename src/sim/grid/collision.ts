import type { Grid } from './grid';
import type { BlockMask } from './tiles';

/** Half extents of an axis-aligned box on the X/Z plane. */
export interface HalfExtents {
  readonly halfWidth: number;
  readonly halfDepth: number;
}

export interface MoveResult {
  x: number;
  z: number;
  /** The X component was stopped by a tile. */
  hitX: boolean;
  /** The Z component was stopped by a tile. */
  hitZ: boolean;
}

/**
 * Tolerance for edges that exactly touch a tile boundary. A box resting flush against a
 * wall does not "overlap" it, so it can slide along the wall without snagging.
 */
const EPS = 1e-7;

/**
 * Moves a box by (dx, dz) against the grid, resolving X then Z. Each axis is a swept test
 * over every tile column (or row) the leading edge crosses, so a large delta can't tunnel
 * through a thin wall. A blocked axis stops flush against the tile and the other axis keeps
 * going, which gives wall sliding for free.
 *
 * Tiles the box already overlaps at the start are ignored (e.g. standing up while under a
 * crawlspace). Use {@link overlapsBlocked} to forbid that kind of state change.
 */
export function moveAndSlide(
  grid: Grid,
  x: number,
  z: number,
  box: HalfExtents,
  dx: number,
  dz: number,
  mask: BlockMask,
): MoveResult {
  const { halfWidth: hw, halfDepth: hd } = box;

  let hitX = false;
  if (dx !== 0) {
    const r0 = Math.floor(z - hd + EPS);
    const r1 = Math.floor(z + hd - EPS);
    const blockedCol = (c: number) => anyBlocked(grid, mask, c, c, r0, r1);
    const stop = sweep(x + (dx > 0 ? hw : -hw), dx, blockedCol);
    if (stop === null) {
      x += dx;
    } else {
      x = dx > 0 ? stop - hw : stop + 1 + hw;
      hitX = true;
    }
  }

  let hitZ = false;
  if (dz !== 0) {
    const c0 = Math.floor(x - hw + EPS);
    const c1 = Math.floor(x + hw - EPS);
    const blockedRow = (r: number) => anyBlocked(grid, mask, c0, c1, r, r);
    const stop = sweep(z + (dz > 0 ? hd : -hd), dz, blockedRow);
    if (stop === null) {
      z += dz;
    } else {
      z = dz > 0 ? stop - hd : stop + 1 + hd;
      hitZ = true;
    }
  }

  return { x, z, hitX, hitZ };
}

/** True when the box overlaps any tile that blocks `mask`. */
export function overlapsBlocked(
  grid: Grid,
  x: number,
  z: number,
  box: HalfExtents,
  mask: BlockMask,
): boolean {
  return anyBlocked(
    grid,
    mask,
    Math.floor(x - box.halfWidth + EPS),
    Math.floor(x + box.halfWidth - EPS),
    Math.floor(z - box.halfDepth + EPS),
    Math.floor(z + box.halfDepth - EPS),
  );
}

/**
 * Walks the tile lines a leading edge enters when moving by `delta`, nearest first, and
 * returns the index of the first blocked one, or null if the path is clear.
 */
function sweep(edge: number, delta: number, blocked: (line: number) => boolean): number | null {
  const target = edge + delta;
  if (delta > 0) {
    for (let i = Math.floor(edge - EPS) + 1; i <= Math.floor(target - EPS); i++) if (blocked(i)) return i;
  } else {
    for (let i = Math.floor(edge + EPS) - 1; i >= Math.floor(target + EPS); i--) if (blocked(i)) return i;
  }
  return null;
}

function anyBlocked(grid: Grid, mask: BlockMask, c0: number, c1: number, r0: number, r1: number): boolean {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) if (grid.blocks(c, r, mask)) return true;
  }
  return false;
}
