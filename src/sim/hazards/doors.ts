import type { Collider } from '../components';
import type { Grid } from '../grid/grid';
import { TILE_BLOCKS, type BlockMask, type Tile } from '../grid/tiles';
import type { System } from '../sim';

/**
 * Doors (DESIGN.md §10). A door opens on its own when someone allowed through comes near:
 * the player with a keycard of the door's level or higher, or any guard. It closes again
 * once nobody is near and its tile is clear, so it never shuts on anyone.
 *
 * The door slides open over `DOOR.openTime`. Only once it is fully open does its tile
 * become `doorOpen` (passable, see-through); it blocks again as soon as it starts closing.
 */

export const DOOR = {
  /** Distance from the door's tile centre at which an allowed entity opens it. */
  triggerRadius: 1.5,
  openTime: 0.3,
  closeTime: 0.4,
} as const;

export interface Door {
  readonly tileX: number;
  readonly tileZ: number;
  /** Keycard level needed. 0 = anyone. */
  readonly keycard: number;
  /** 0 = shut, 1 = fully open. */
  openness: number;
}

export function createDoor(tileX: number, tileZ: number, keycard: number): Door {
  return { tileX, tileZ, keycard, openness: 0 };
}

/** Whether an entity's box overlaps the door's tile. */
function overlapsTile(x: number, z: number, c: Collider, door: Door): boolean {
  return (
    x + c.halfWidth > door.tileX &&
    x - c.halfWidth < door.tileX + 1 &&
    z + c.halfDepth > door.tileZ &&
    z - c.halfDepth < door.tileZ + 1
  );
}

export const doorSystem: System = {
  name: 'doors',
  update(ctx, dt) {
    const { world, grid, events } = ctx;
    if (!grid) return;
    const movers = world.with('transform', 'collider').without('dead');
    for (const e of world.with('door')) {
      const door = e.door;
      const cx = door.tileX + 0.5;
      const cz = door.tileZ + 0.5;
      let wanted = false;
      let occupied = false;
      for (const m of movers) {
        if (!m.player && !m.guard) continue;
        const { x, z } = m.transform;
        occupied ||= overlapsTile(x, z, m.collider, door);
        const allowed = m.guard === true || (m.inventory?.keycard ?? 0) >= door.keycard;
        wanted ||= allowed && Math.hypot(x - cx, z - cz) <= DOOR.triggerRadius;
      }

      const wasOpen = door.openness >= 1;
      // Someone standing in the doorway keeps it open, whoever they are.
      const opening = wanted || (occupied && door.openness > 0);
      door.openness = opening
        ? Math.min(1, door.openness + dt / DOOR.openTime)
        : Math.max(0, door.openness - dt / DOOR.closeTime);
      const isOpen = door.openness >= 1;
      if (isOpen !== wasOpen) {
        grid.set(door.tileX, door.tileZ, isOpen ? 'doorOpen' : 'door');
        events.emit({ type: 'door', tile: { x: door.tileX, z: door.tileZ }, open: isOpen });
      }
    }
  },
};

/** Rules for route planning by door openers: a closed door counts as open. */
const OPENER_RULES: Readonly<Record<Tile, BlockMask>> = { ...TILE_BLOCKS, door: TILE_BLOCKS.doorOpen };
const openerViews = new WeakMap<Grid, Grid>();

/**
 * The grid as a guard plans routes on it: closed doors are passable, because the guard
 * opens them on the way. Shares the live tiles, so door and wall changes show through.
 */
export function plannerGrid(grid: Grid): Grid {
  let view = openerViews.get(grid);
  if (!view) openerViews.set(grid, (view = grid.withRules(OPENER_RULES)));
  return view;
}
