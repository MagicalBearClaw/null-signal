import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { lineOfSight } from './raycast';
import { Block, bulletMask, sightMask, stanceMask, TILE_BLOCKS, type Stance, type Tile } from './tiles';

const blocks = (tile: Tile, mask: number) => (TILE_BLOCKS[tile] & mask) !== 0;
const ALL_STANCES: Stance[] = ['stand', 'crouch', 'crawl'];

describe('TILE_BLOCKS', () => {
  it('floor blocks nothing and walls block everything', () => {
    expect(TILE_BLOCKS.floor).toBe(0);
    for (const b of Object.values(Block)) expect(blocks('wall', b)).toBe(true);
  });

  it('low walls block every stance of movement', () => {
    for (const s of ALL_STANCES) expect(blocks('lowWall', stanceMask(s))).toBe(true);
  });

  it('low walls cover low targets but not standing ones', () => {
    expect(blocks('lowWall', sightMask('stand'))).toBe(false);
    expect(blocks('lowWall', bulletMask('stand'))).toBe(false);
    for (const s of ['crouch', 'crawl'] as const) {
      expect(blocks('lowWall', sightMask(s))).toBe(true);
      expect(blocks('lowWall', bulletMask(s))).toBe(true);
    }
  });

  it('crawlspaces and vents only allow crawling', () => {
    for (const t of ['crawlspace', 'vent'] as const) {
      expect(blocks(t, stanceMask('stand'))).toBe(true);
      expect(blocks(t, stanceMask('crouch'))).toBe(true);
      expect(blocks(t, stanceMask('crawl'))).toBe(false);
    }
  });

  it('crawlspaces hide low targets but let rays at standing targets pass over', () => {
    expect(blocks('crawlspace', sightMask('crawl'))).toBe(true);
    expect(blocks('crawlspace', sightMask('stand'))).toBe(false);
  });

  it('vents are opaque and bulletproof for everyone', () => {
    for (const s of ALL_STANCES) {
      expect(blocks('vent', sightMask(s))).toBe(true);
      expect(blocks('vent', bulletMask(s))).toBe(true);
    }
  });
});

describe('stance-dependent cover with the real table', () => {
  // A guard at the west end; a low wall; the player just east of it.
  const g = Grid.fromRows(['..=..']);
  const guard = { x: 0.5, z: 0.5 };
  const player = { x: 3.5, z: 0.5 };

  it('sees and can shoot a standing player over a low wall', () => {
    expect(lineOfSight(g, guard, player, sightMask('stand'))).toBe(true);
    expect(lineOfSight(g, guard, player, bulletMask('stand'))).toBe(true);
  });

  it('loses a crouched player behind the same low wall', () => {
    expect(lineOfSight(g, guard, player, sightMask('crouch'))).toBe(false);
    expect(lineOfSight(g, guard, player, bulletMask('crouch'))).toBe(false);
  });

  it('still sees a crouched player in the open, in front of the wall', () => {
    expect(lineOfSight(g, guard, { x: 1.5, z: 0.5 }, sightMask('crouch'))).toBe(true);
  });

  it('hides a player crawling inside a crawlspace', () => {
    const c = Grid.fromRows(['..~']);
    expect(lineOfSight(c, guard, { x: 2.5, z: 0.5 }, sightMask('crawl'))).toBe(false);
  });
});

describe('masks per stance', () => {
  it('maps each stance to its own movement channel', () => {
    expect(stanceMask('stand')).toBe(Block.Stand);
    expect(stanceMask('crouch')).toBe(Block.Crouch);
    expect(stanceMask('crawl')).toBe(Block.Crawl);
  });

  it('adds the low channels only for low targets', () => {
    expect(sightMask('stand')).toBe(Block.Sight);
    expect(sightMask('crawl')).toBe(Block.Sight | Block.SightLow);
    expect(bulletMask('crouch')).toBe(Block.Bullet | Block.BulletLow);
  });
});
