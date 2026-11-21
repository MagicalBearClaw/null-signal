import type { World } from 'miniplex';
import type { Entity } from '../components';
import type { Vec2 } from '../events';
import type { Grid } from '../grid/grid';
import { raycast } from '../grid/raycast';
import { bulletMask } from '../grid/tiles';

export interface ShotResult {
  /** First damageable entity the shot reached, or null. */
  readonly hit: Entity | null;
  /** Where the shot stopped: the hit entity, a wall, or full range. */
  readonly end: Vec2;
}

/** Distance along the ray (origin + t·dir) where it enters the box, or null if it misses. */
function rayBox(o: Vec2, d: Vec2, cx: number, cz: number, hw: number, hd: number): number | null {
  let tMin = 0;
  let tMax = Infinity;
  for (const [oa, da, c, h] of [
    [o.x, d.x, cx, hw],
    [o.z, d.z, cz, hd],
  ] as const) {
    if (Math.abs(da) < 1e-12) {
      if (oa < c - h || oa > c + h) return null;
      continue;
    }
    let t1 = (c - h - oa) / da;
    let t2 = (c + h - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/**
 * Instant shot from `origin` along unit vector `dir`, up to `range` tiles. Hits the nearest
 * living entity with health and a collider (never the shooter) that walls don't shield.
 * Cover follows the stance rule: a low wall stops a shot at a crouched or crawling target
 * but not at a standing one, so bullets fly over low cover (`bulletMask`).
 */
export function hitscan(
  world: World<Entity>,
  grid: Grid | null,
  shooter: Entity,
  origin: Vec2,
  dir: Vec2,
  range: number,
): ShotResult {
  let best: Entity | null = null;
  let bestT = range;
  for (const e of world.with('transform', 'collider', 'health').without('dead')) {
    if (e === shooter) continue;
    const t = rayBox(origin, dir, e.transform.x, e.transform.z, e.collider.halfWidth, e.collider.halfDepth);
    if (t === null || t >= bestT) continue;
    if (grid && raycast(grid, origin, dir, t, bulletMask(e.stance ?? 'stand'))) continue;
    best = e;
    bestT = t;
  }

  if (!best && grid) {
    const wall = raycast(grid, origin, dir, range, bulletMask('stand'));
    if (wall) bestT = wall.distance;
  }
  return { hit: best, end: { x: origin.x + dir.x * bestT, z: origin.z + dir.z * bestT } };
}
