import type { Vec2 } from '../../sim/events';
import type { Grid } from '../../sim/grid/grid';
import { raycast } from '../../sim/grid/raycast';
import type { BlockMask } from '../../sim/grid/tiles';

/**
 * Visible area of a view cone as a triangle-fan outline: `[origin, p0, p1, ...]`, where
 * each p is where a ray across the arc stops (at a blocking tile, or at `range`).
 *
 * Debug only: real vision checks the target point directly; this just shows the shape.
 */
export function visionFan(
  grid: Grid,
  origin: Vec2,
  yaw: number,
  fov: number,
  range: number,
  rays: number,
  mask: BlockMask,
): Vec2[] {
  const points: Vec2[] = [{ x: origin.x, z: origin.z }];
  const n = Math.max(1, rays);
  for (let i = 0; i <= n; i++) {
    const a = yaw - fov / 2 + (fov * i) / n;
    // yaw 0 faces -Z; positive yaw turns counter-clockwise seen from above
    const dir = { x: -Math.sin(a), z: -Math.cos(a) };
    const hit = raycast(grid, origin, dir, range, mask);
    const d = hit ? hit.distance : range;
    points.push({ x: origin.x + dir.x * d, z: origin.z + dir.z * d });
  }
  return points;
}
