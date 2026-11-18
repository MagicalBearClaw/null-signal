import { Block, BLOCK_ALL, type BlockMask, type Tile } from './tiles';

/**
 * A fixed rule table for collision/raycast tests, so those tests don't change when the
 * game's tuning in `TILE_BLOCKS` does.
 */
export const TEST_RULES: Readonly<Record<Tile, BlockMask>> = {
  floor: 0,
  wall: BLOCK_ALL,
  lowWall: Block.Stand | Block.Crouch | Block.Crawl,
  crawlspace: Block.Stand | Block.Crouch,
  vent: Block.Stand | Block.Crouch | Block.Sight | Block.Bullet,
  door: BLOCK_ALL,
  doorOpen: 0,
  electrified: 0,
};
