import { describe, expect, it } from 'vitest';
import { Grid } from '../grid/grid';
import { stanceMask } from '../grid/tiles';
import { clearPath, findPath } from './pathfinding';

const STAND = stanceMask('stand');
const BOX = { halfWidth: 0.3, halfDepth: 0.3 };

describe('findPath', () => {
  it('goes straight when nothing is in the way', () => {
    const grid = Grid.fromRows(['......', '......']);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 5.2, z: 0.5 }, STAND, BOX)).toEqual([{ x: 5.2, z: 0.5 }]);
  });

  it('routes around a wall and ends exactly on the target', () => {
    const grid = Grid.fromRows([
      '.....', //
      '.###.',
      '.....',
    ]);
    const path = findPath(grid, { x: 2.5, z: 0.5 }, { x: 2.4, z: 2.6 }, STAND, BOX);
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 2.4, z: 2.6 });
    // every leg must be walkable for a guard-sized box
    let from = { x: 2.5, z: 0.5 };
    for (const p of path ?? []) {
      expect(clearPath(grid, from, p, STAND, BOX)).toBe(true);
      from = p;
    }
    expect(path?.length).toBeGreaterThan(1);
  });

  it('does not cut diagonally between two touching walls', () => {
    const grid = Grid.fromRows([
      '.#', //
      '#.',
    ]);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 }, STAND, BOX)).toBeNull();
  });

  it('returns null for a blocked or walled-off goal', () => {
    const grid = Grid.fromRows(['..#', '###', '...']);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }, STAND, BOX)).toBeNull();
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 1.5, z: 2.5 }, STAND, BOX)).toBeNull();
  });

  it('respects the stance mask: crawlspaces are walls to a standing guard', () => {
    const grid = Grid.fromRows(['.~.', '###']);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }, STAND, BOX)).toBeNull();
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }, stanceMask('crawl'), BOX)).not.toBeNull();
  });

  it('finds a long path through a maze', () => {
    const grid = Grid.fromRows([
      '.#.....', //
      '.#.###.',
      '.#.#...',
      '.#.#.##',
      '...#...',
    ]);
    const path = findPath(grid, { x: 0.5, z: 0.5 }, { x: 6.5, z: 4.5 }, STAND, BOX);
    expect(path?.at(-1)).toEqual({ x: 6.5, z: 4.5 });
  });
});
