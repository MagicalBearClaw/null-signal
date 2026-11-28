import type { Vec2 } from '../events';
import type { Grid } from '../grid/grid';
import type { Tile } from '../grid/tiles';
import type { Sensor } from './types';

/**
 * Hearing (DESIGN.md §8). A guard hears a `noise` when sound can travel from its origin
 * to the guard within the noise's radius. Sound goes around walls, not through them: the
 * distance that counts is the shortest path through tiles that carry sound, so a knock
 * on the far side of a thick wall is muffled while one around the corner is heard.
 */

/** Tiles sound cannot pass. Low cover, crawlspaces, vents and open doors all carry it. */
const SOUNDPROOF: ReadonlySet<Tile> = new Set<Tile>(['wall', 'door']);

const SQRT2 = Math.SQRT2;
const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

/**
 * Length of the shortest route sound takes from `from` to `to`, or null if it is longer
 * than `maxLength` (or there is none). Within one open tile it is the straight distance;
 * otherwise it is measured tile centre to tile centre (8-way, no squeezing between
 * diagonal walls) plus the hops from each point to its tile centre.
 */
export function soundPathLength(grid: Grid, from: Vec2, to: Vec2, maxLength: number): number | null {
  const straight = Math.hypot(to.x - from.x, to.z - from.z);
  if (straight > maxLength) return null;
  const sx = Math.floor(from.x);
  const sz = Math.floor(from.z);
  const gx = Math.floor(to.x);
  const gz = Math.floor(to.z);
  if (sx === gx && sz === gz) return straight;
  const open = (x: number, z: number) => grid.inBounds(x, z) && !SOUNDPROOF.has(grid.tileAt(x, z));
  if (!open(sx, sz) || !open(gx, gz)) return null;

  const hop = (p: Vec2, tx: number, tz: number) => Math.hypot(p.x - (tx + 0.5), p.z - (tz + 0.5));
  const budget = maxLength - hop(from, sx, sz) - hop(to, gx, gz);
  if (budget < 0) return null;

  // Dijkstra bounded by the budget; the frontier stays small for game-sized radii.
  const key = (x: number, z: number) => z * grid.width + x;
  const dist = new Map<number, number>([[key(sx, sz), 0]]);
  const frontier: [number, number, number][] = [[0, sx, sz]];
  while (frontier.length > 0) {
    let best = 0;
    frontier.forEach((f, i) => {
      if (f[0] < (frontier[best]?.[0] ?? Infinity)) best = i;
    });
    const [d, x, z] = frontier.splice(best, 1)[0] as [number, number, number];
    if (d > (dist.get(key(x, z)) ?? Infinity)) continue;
    if (x === gx && z === gz) return Math.min(maxLength, d + hop(from, sx, sz) + hop(to, gx, gz));
    for (const [dx, dz, cost] of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!open(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!open(x + dx, z) || !open(x, z + dz))) continue;
      const nd = d + cost;
      if (nd > budget || nd >= (dist.get(key(nx, nz)) ?? Infinity)) continue;
      dist.set(key(nx, nz), nd);
      frontier.push([nd, nx, nz]);
    }
  }
  return null;
}

/**
 * A guard's ears. Reads last tick's `noise` events and, for the closest one it can hear,
 * marks the spot to investigate (`noiseAt`). Its own noises don't count. While the squad
 * hunts, a noise the player made also updates where the squad thinks the player is.
 */
export function createHearingSensor(): Sensor {
  return {
    name: 'hearing',
    sense(agent, ctx) {
      const self = ctx.world.id(agent);
      const ear = { x: agent.transform.x, z: agent.transform.z };
      let heard: { at: Vec2; distance: number; source: number | undefined } | null = null;
      for (const n of ctx.events.ofType('noise')) {
        if (n.source !== undefined && n.source === self) continue;
        const d = ctx.grid
          ? soundPathLength(ctx.grid, n.at, ear, n.radius)
          : Math.hypot(n.at.x - ear.x, n.at.z - ear.z) <= n.radius
            ? Math.hypot(n.at.x - ear.x, n.at.z - ear.z)
            : null;
        if (d !== null && (!heard || d < heard.distance)) heard = { at: n.at, distance: d, source: n.source };
      }
      if (!heard) return;
      const bb = agent.ai.blackboard;
      if (!bb.facts.seesPlayer) bb.noiseAt = { ...heard.at };
      const player = ctx.world.with('player').first;
      const fromPlayer =
        player !== undefined && heard.source !== undefined && heard.source === ctx.world.id(player);
      if (fromPlayer && ctx.squad.alert !== 'normal' && ctx.squad.alert !== 'suspicious') {
        ctx.squad.lastKnownPlayer = { ...heard.at };
        ctx.squad.lastKnownTick = ctx.tick;
      }
    },
  };
}
