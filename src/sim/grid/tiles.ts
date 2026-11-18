/**
 * Tile semantics. What a tile *is* (blocks standing, hides you from sight, stops
 * bullets) lives here; what it *looks like* belongs to the render theme (DESIGN.md §5).
 */

export type Tile =
  | 'floor'
  | 'wall'
  | 'lowWall'
  | 'crawlspace'
  | 'vent'
  /** A closed door. The door system swaps it to `doorOpen` and back at runtime. */
  | 'door'
  | 'doorOpen'
  /** Walkable; the hazard system damages whoever stands on it while it is live. */
  | 'electrified';

export const TILES: readonly Tile[] = [
  'floor',
  'wall',
  'lowWall',
  'crawlspace',
  'vent',
  'door',
  'doorOpen',
  'electrified',
];

export type Stance = 'stand' | 'crouch' | 'crawl';

/**
 * Blocking channels as bit flags, so one tile can block several things and a query
 * can ask about several at once.
 *
 * Sight and bullets each have a "high" and a "low" channel. A ray aimed at a standing
 * target only tests the high channel; a ray aimed at a crouched or crawling target tests
 * both. That one rule is what makes low cover stance-dependent: standing behind a crate
 * you are seen and shot over it, crouching behind it you are hidden and protected.
 * Use {@link sightMask} / {@link bulletMask} rather than combining these by hand.
 */
export const Block = {
  /** Movement while standing (also used for walking/running guards). */
  Stand: 1 << 0,
  /** Movement while crouched. */
  Crouch: 1 << 1,
  /** Movement while crawling. */
  Crawl: 1 << 2,
  /** Vision rays at any target (full-height occluders). */
  Sight: 1 << 3,
  /** Vision rays at a crouched or crawling target (low occluders). */
  SightLow: 1 << 4,
  /** Bullet and turret rays at any target. */
  Bullet: 1 << 5,
  /** Bullet and turret rays at a crouched or crawling target. */
  BulletLow: 1 << 6,
} as const;

export type BlockMask = number;

const MOVE_ALL = Block.Stand | Block.Crouch | Block.Crawl;
const SIGHT_ALL = Block.Sight | Block.SightLow;
const BULLET_ALL = Block.Bullet | Block.BulletLow;

export const BLOCK_ALL: BlockMask = MOVE_ALL | SIGHT_ALL | BULLET_ALL;

/**
 * The rule table: which channels each tile blocks.
 *
 * - **lowWall**: waist-high cover. Nobody walks or crawls over it. A standing target is
 *   seen and shot over it; a crouched or crawling target behind it is hidden and safe.
 * - **crawlspace**: open low gap (under a desk or vehicle). Crawl only. Hides and shields
 *   whoever is lying in it, but rays at standing targets pass over it.
 * - **vent**: enclosed duct. Crawl only, and fully opaque and bulletproof. Noise still
 *   carries out of it (hearing is not a ray, so this table doesn't affect it).
 * - **door**: closed door, blocks everything; **doorOpen** blocks nothing.
 * - **electrified**: blocks nothing; it is a hazard, not an obstacle.
 */
export const TILE_BLOCKS: Readonly<Record<Tile, BlockMask>> = {
  floor: 0,
  wall: BLOCK_ALL,
  lowWall: MOVE_ALL | Block.SightLow | Block.BulletLow,
  crawlspace: Block.Stand | Block.Crouch | Block.SightLow | Block.BulletLow,
  vent: Block.Stand | Block.Crouch | SIGHT_ALL | BULLET_ALL,
  door: BLOCK_ALL,
  doorOpen: 0,
  electrified: 0,
};

const isLow = (stance: Stance) => stance !== 'stand';

/** The movement channel for a stance. */
export function stanceMask(stance: Stance): BlockMask {
  switch (stance) {
    case 'stand':
      return Block.Stand;
    case 'crouch':
      return Block.Crouch;
    case 'crawl':
      return Block.Crawl;
  }
}

/** The channels a vision ray must test when looking at a target in `targetStance`. */
export function sightMask(targetStance: Stance): BlockMask {
  return isLow(targetStance) ? SIGHT_ALL : Block.Sight;
}

/** The channels a bullet ray must test when fired at a target in `targetStance`. */
export function bulletMask(targetStance: Stance): BlockMask {
  return isLow(targetStance) ? BULLET_ALL : Block.Bullet;
}
