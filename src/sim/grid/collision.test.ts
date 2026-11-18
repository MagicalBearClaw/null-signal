import { describe, expect, it } from 'vitest';
import { moveAndSlide, overlapsBlocked } from './collision';
import { Grid } from './grid';
import { TEST_RULES } from './testRules';
import { Block } from './tiles';

const box = { halfWidth: 0.3, halfDepth: 0.3 };
const grid = (...rows: string[]) => Grid.fromRows(rows, TEST_RULES);

describe('moveAndSlide', () => {
  // x: 0123
  const room = grid(
    '#####', // z0
    '#...#', // z1
    '#...#', // z2
    '#####', // z3
  );

  it('moves freely through open floor', () => {
    const r = moveAndSlide(room, 1.5, 1.5, box, 1, 0.5, Block.Stand);
    expect(r).toEqual({ x: 2.5, z: 2, hitX: false, hitZ: false });
  });

  it('stops flush against a wall', () => {
    const r = moveAndSlide(room, 3.5, 1.5, box, 0.5, 0, Block.Stand);
    expect(r.x).toBeCloseTo(4 - 0.3);
    expect(r.hitX).toBe(true);
  });

  it('stops flush moving in the negative direction too', () => {
    const r = moveAndSlide(room, 1.5, 1.5, box, -0.5, -0.5, Block.Stand);
    expect(r.x).toBeCloseTo(1.3);
    expect(r.z).toBeCloseTo(1.3);
    expect(r.hitX && r.hitZ).toBe(true);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const r = moveAndSlide(room, 3.5, 1.5, box, 0.5, 0.4, Block.Stand);
    expect(r.x).toBeCloseTo(3.7);
    expect(r.z).toBeCloseTo(1.9);
    expect([r.hitX, r.hitZ]).toEqual([true, false]);
  });

  it('keeps sliding while flush against a wall (no snagging on tile seams)', () => {
    let p = { x: 3.7, z: 1.4 };
    for (let i = 0; i < 15; i++) {
      const r = moveAndSlide(room, p.x, p.z, box, 0.1, 0.1, Block.Stand);
      p = { x: r.x, z: r.z };
    }
    expect(p.x).toBeCloseTo(3.7);
    expect(p.z).toBeCloseTo(2.7); // stopped by the south wall, not the seam at z = 2
  });

  it('cannot tunnel through a thin wall with a huge delta', () => {
    const g = grid('.#.');
    const r = moveAndSlide(g, 0.5, 0.5, box, 50, 0, Block.Stand);
    expect(r.x).toBeCloseTo(0.7);
    expect(r.hitX).toBe(true);
  });

  it('does not cut an outside corner diagonally: X resolves first, then Z hits', () => {
    const g = grid(
      '..', //
      '.#',
    );
    // Starting top-left, moving down-right into the corner block.
    const r = moveAndSlide(g, 0.5, 0.5, box, 0.5, 0.5, Block.Stand);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0.7);
    expect([r.hitX, r.hitZ]).toEqual([false, true]);
  });

  it('fits through a one-tile gap exactly when the box is narrower than the tile', () => {
    const g = grid(
      '#.#', //
      '#.#',
      '#.#',
    );
    const r = moveAndSlide(g, 1.5, 0.5, box, 0, 2, Block.Stand);
    expect(r).toMatchObject({ x: 1.5, z: 2.5, hitZ: false });
  });

  it('blocks per stance: crawlspaces stop standing but let crawling through', () => {
    const g = grid('.~.');
    expect(moveAndSlide(g, 0.5, 0.5, box, 2, 0, Block.Stand).x).toBeCloseTo(0.7);
    expect(moveAndSlide(g, 0.5, 0.5, box, 2, 0, Block.Crawl).x).toBeCloseTo(2.5);
  });

  it('ignores tiles already overlapped at the start', () => {
    const g = grid('~..');
    const r = moveAndSlide(g, 0.5, 0.5, box, 1, 0, Block.Stand);
    expect(r).toMatchObject({ x: 1.5, hitX: false });
  });

  it('handles a box wider than a tile', () => {
    const big = { halfWidth: 0.8, halfDepth: 0.8 };
    const g = grid(
      '.....', //
      '.....',
      '...#.',
    );
    // Spans rows 0..1 at z = 1.0; moving east it must not see the wall in row 2.
    const r = moveAndSlide(g, 1, 1, big, 2, 0, Block.Stand);
    expect(r).toMatchObject({ x: 3, hitX: false });
    // Lowered to span rows 1..2, it now hits the wall at column 3.
    const r2 = moveAndSlide(g, 1, 1.5, big, 2, 0, Block.Stand);
    expect(r2.x).toBeCloseTo(2.2);
  });
});

describe('overlapsBlocked', () => {
  it('reports overlap but not mere touching', () => {
    const g = grid('.~');
    expect(overlapsBlocked(g, 0.7, 0.5, box, Block.Stand)).toBe(false); // flush at x = 1
    expect(overlapsBlocked(g, 0.75, 0.5, box, Block.Stand)).toBe(true);
    expect(overlapsBlocked(g, 0.75, 0.5, box, Block.Crawl)).toBe(false);
  });
});
