import type { Vec2 } from '../events';
import { overlapsBlocked } from '../grid/collision';
import type { Grid } from '../grid/grid';

/** Collision box the path must fit through (half extents, in tiles). */
export interface PathBox {
  readonly halfWidth: number;
  readonly halfDepth: number;
}

const SQRT2 = Math.SQRT2;
/** 8-connected neighbours: [dx, dz, cost]. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Octile distance: exact cost on an empty 8-connected grid, so A* stays optimal. */
function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
}

/** Min-heap of tile indices keyed by f-score. */
class Heap {
  private readonly items: number[] = [];
  constructor(private readonly score: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key(a[p]) <= this.key(a[c])) break;
      [a[p], a[c]] = [a[c] as number, a[p] as number];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0] as number;
    const last = a.pop() as number;
    if (a.length > 0) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.key(a[l]) < this.key(a[m])) m = l;
        if (r < a.length && this.key(a[r]) < this.key(a[m])) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m] as number, a[p] as number];
        p = m;
      }
    }
    return top;
  }
  private key(i: number | undefined): number {
    return this.score[i ?? 0] ?? Infinity;
  }
}

/**
 * Grid A* from `from` to `to` for an agent blocked by `mask`. Moves are 8-way; diagonals
 * may not cut corners (both side tiles must be open). Returns world-space waypoints that
 * end exactly at `to`, smoothed so straight runs collapse to one point, or null when the
 * goal is blocked or unreachable.
 *
 * The start tile is allowed to be blocked (an agent brushing a wall overlaps it).
 */
export function findPath(grid: Grid, from: Vec2, to: Vec2, mask: number, box: PathBox): Vec2[] | null {
  const sx = Math.floor(from.x);
  const sz = Math.floor(from.z);
  const gx = Math.floor(to.x);
  const gz = Math.floor(to.z);
  const open = (x: number, z: number) => grid.inBounds(x, z) && !grid.blocks(x, z, mask);
  if (!open(gx, gz) || !grid.inBounds(sx, sz)) return null;

  const w = grid.width;
  const n = w * grid.depth;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = sz * w + sx;
  const goal = gz * w + gx;
  g[start] = 0;
  f[start] = octile(sx, sz, gx, gz);
  const heap = new Heap(f);
  heap.push(start);

  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cz = (cur - cx) / w;
    for (const [dx, dz, cost] of STEPS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!open(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!open(cx + dx, cz) || !open(cx, cz + dz))) continue;
      const ni = nz * w + nx;
      const tentative = (g[cur] as number) + cost;
      if (tentative < (g[ni] as number)) {
        g[ni] = tentative;
        f[ni] = tentative + octile(nx, nz, gx, gz);
        came[ni] = cur;
        heap.push(ni);
      }
    }
  }
  if (goal !== start && came[goal] === -1) return null;

  const tiles: Vec2[] = [];
  for (let i = goal; i !== start && i !== -1; i = came[i] as number) {
    tiles.push({ x: (i % w) + 0.5, z: Math.floor(i / w) + 0.5 });
  }
  tiles.reverse();
  tiles[tiles.length - 1] = { x: to.x, z: to.z };
  if (tiles.length === 0) tiles.push({ x: to.x, z: to.z });
  return smooth(grid, from, tiles, mask, box);
}

/** True when `box` can slide in a straight line from `a` to `b` without touching a blocked tile. */
export function clearPath(grid: Grid, a: Vec2, b: Vec2, mask: number, box: PathBox): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (overlapsBlocked(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, box, mask)) return false;
  }
  return true;
}

/** String-pulling: from each anchor, skip ahead to the farthest waypoint reachable in a straight line. */
function smooth(grid: Grid, from: Vec2, pts: Vec2[], mask: number, box: PathBox): Vec2[] {
  const out: Vec2[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearPath(grid, anchor, pts[j] as Vec2, mask, box)) j--;
    const p = pts[j] as Vec2;
    out.push(p);
    anchor = p;
    i = j + 1;
  }
  return out;
}
