import type { Vec2 } from '../events';
import type { Grid } from './grid';
import type { BlockMask } from './tiles';

export interface RayHit {
  readonly tileX: number;
  readonly tileZ: number;
  /** Distance from the origin to the hit point, in tiles. */
  readonly distance: number;
  /** World-space hit point on the tile's face. */
  readonly point: Vec2;
  /** Outward normal of the face that was hit; (0, 0) when the origin tile itself blocks. */
  readonly normal: Vec2;
}

/**
 * Grid DDA raycast (Amanatides & Woo): visits every tile the ray passes through, in order,
 * and returns the first one that blocks `mask`, or null if nothing blocks within
 * `maxDistance`. The origin tile counts, so a ray fired from inside a blocking tile hits at
 * distance 0.
 *
 * When the ray passes exactly through a tile corner it steps X before Z, so it can't slip
 * between two diagonally touching walls.
 */
export function raycast(
  grid: Grid,
  origin: Vec2,
  direction: Vec2,
  maxDistance: number,
  mask: BlockMask,
): RayHit | null {
  let tx = Math.floor(origin.x);
  let tz = Math.floor(origin.z);
  if (grid.blocks(tx, tz, mask)) {
    return { tileX: tx, tileZ: tz, distance: 0, point: { x: origin.x, z: origin.z }, normal: { x: 0, z: 0 } };
  }

  const len = Math.hypot(direction.x, direction.z);
  if (len === 0 || !(maxDistance > 0)) return null;
  const dx = direction.x / len;
  const dz = direction.z / len;

  // Past the grid everything is wall; cap the walk so an empty mask can't loop forever.
  const limit = Math.min(maxDistance, Math.hypot(grid.width, grid.depth) + 2);

  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx > 0 ? (tx + 1 - origin.x) / dx : dx < 0 ? (origin.x - tx) / -dx : Infinity;
  let tMaxZ = dz > 0 ? (tz + 1 - origin.z) / dz : dz < 0 ? (origin.z - tz) / -dz : Infinity;

  for (;;) {
    let t: number;
    let normal: Vec2;
    if (tMaxX <= tMaxZ) {
      t = tMaxX;
      tx += stepX;
      tMaxX += tDeltaX;
      normal = { x: -stepX, z: 0 };
    } else {
      t = tMaxZ;
      tz += stepZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, z: -stepZ };
    }
    // Strict: a face exactly at maxDistance is not a hit, so a target standing flush
    // against a wall is still visible.
    if (t >= limit) return null;
    if (grid.blocks(tx, tz, mask)) {
      return {
        tileX: tx,
        tileZ: tz,
        distance: t,
        point: { x: origin.x + dx * t, z: origin.z + dz * t },
        normal,
      };
    }
  }
}

/** True when nothing blocking `mask` lies between `from` and `to`. */
export function lineOfSight(grid: Grid, from: Vec2, to: Vec2, mask: BlockMask): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  return raycast(grid, from, { x: dx, z: dz }, dist, mask) === null;
}
