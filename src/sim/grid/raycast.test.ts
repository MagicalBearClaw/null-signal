import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { lineOfSight, raycast } from './raycast';
import { TEST_RULES } from './testRules';
import { Block } from './tiles';

const grid = (...rows: string[]) => Grid.fromRows(rows, TEST_RULES);

describe('raycast', () => {
  it('returns the first blocking tile, distance, point and face normal', () => {
    const g = grid('...#.');
    const hit = raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, 10, Block.Sight);
    expect(hit).toMatchObject({ tileX: 3, tileZ: 0, normal: { x: -1, z: 0 } });
    expect(hit?.distance).toBeCloseTo(2.5);
    expect(hit?.point.x).toBeCloseTo(3);
  });

  it('works in the negative directions', () => {
    const g = grid('#...', '....', '....');
    const west = raycast(g, { x: 2.5, z: 0.5 }, { x: -1, z: 0 }, 10, Block.Sight);
    expect(west).toMatchObject({ tileX: 0, normal: { x: 1, z: 0 } });
    const north = raycast(g, { x: 2.5, z: 2.5 }, { x: 0, z: -1 }, 10, Block.Sight);
    expect(north).toMatchObject({ tileX: 2, tileZ: -1, normal: { x: 0, z: 1 } }); // off-grid = wall
    expect(north?.distance).toBeCloseTo(2.5);
  });

  it('returns null when nothing blocks within maxDistance', () => {
    const g = grid('....#');
    expect(raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, 3, Block.Sight)).toBeNull();
  });

  it('respects the mask: low walls block movement but not sight or bullets in these rules', () => {
    const g = grid('.=.#');
    const sight = raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, 10, Block.Sight);
    expect(sight?.tileX).toBe(3);
    const body = raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, 10, Block.Stand);
    expect(body?.tileX).toBe(1);
  });

  it('visits every tile along a diagonal (no skipping)', () => {
    const g = grid(
      '....', //
      '..#.',
      '....',
    );
    // Shallow diagonal from (0.5, 0.5) toward (3.5, 2.0) passes through tile (2, 1).
    const hit = raycast(g, { x: 0.5, z: 0.5 }, { x: 3, z: 1.5 }, 10, Block.Sight);
    expect(hit).toMatchObject({ tileX: 2, tileZ: 1 });
  });

  it('cannot slip between two diagonally touching walls through their shared corner', () => {
    const g = grid(
      '.#', //
      '#.',
    );
    const hit = raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 1 }, 10, Block.Sight);
    expect(hit).not.toBeNull();
    expect(hit?.distance).toBeCloseTo(Math.SQRT1_2);
  });

  it('hits at distance 0 when fired from inside a blocking tile', () => {
    const g = grid('#.');
    expect(raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, 5, Block.Sight)).toMatchObject({
      distance: 0,
      normal: { x: 0, z: 0 },
    });
  });

  it('handles a zero direction and an empty mask without looping', () => {
    const g = grid('...');
    expect(raycast(g, { x: 0.5, z: 0.5 }, { x: 0, z: 0 }, 5, Block.Sight)).toBeNull();
    expect(raycast(g, { x: 0.5, z: 0.5 }, { x: 1, z: 0 }, Infinity, 0)).toBeNull();
  });
});

describe('lineOfSight', () => {
  const g = grid(
    '.....', //
    '..#..',
    '.....',
  );

  it('is clear in open space and blocked by a wall in between', () => {
    expect(lineOfSight(g, { x: 0.5, z: 0.5 }, { x: 4.5, z: 0.5 }, Block.Sight)).toBe(true);
    expect(lineOfSight(g, { x: 0.5, z: 1.5 }, { x: 4.5, z: 1.5 }, Block.Sight)).toBe(false);
  });

  it('is symmetric', () => {
    const a = { x: 0.5, z: 2.5 };
    const b = { x: 4.5, z: 0.2 };
    expect(lineOfSight(g, a, b, Block.Sight)).toBe(lineOfSight(g, b, a, Block.Sight));
  });

  it('still sees a target standing flush against a wall face', () => {
    expect(lineOfSight(g, { x: 0.5, z: 1.5 }, { x: 2, z: 1.5 }, Block.Sight)).toBe(true);
  });

  it('is hidden when the target stands in a sight-blocking tile', () => {
    const v = grid('..v');
    expect(lineOfSight(v, { x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }, Block.Sight)).toBe(false);
  });
});
