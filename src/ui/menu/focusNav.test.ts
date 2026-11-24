import { describe, expect, it } from 'vitest';
import { pickInDirection, type Box } from './focusNav';

const box = (left: number, top: number, width = 100, height = 40): Box => ({ left, top, width, height });

describe('pickInDirection', () => {
  // a 3×2 grid of tiles
  const grid = [box(0, 0), box(120, 0), box(240, 0), box(0, 60), box(120, 60), box(240, 60)];

  it('moves to the neighbour in each direction', () => {
    const from = grid[4] as Box; // bottom middle
    const others = grid.filter((b) => b !== from);
    expect(others[pickInDirection(from, others, 'up')]).toBe(grid[1]);
    expect(others[pickInDirection(from, others, 'left')]).toBe(grid[3]);
    expect(others[pickInDirection(from, others, 'right')]).toBe(grid[5]);
    expect(pickInDirection(from, others, 'down')).toBe(-1);
  });

  it('prefers the item straight ahead over a nearer one off to the side', () => {
    const from = box(0, 0);
    const straight = box(0, 200);
    const diagonal = box(150, 90);
    expect(pickInDirection(from, [diagonal, straight], 'down')).toBe(1);
  });

  it('steps through a vertical list in order', () => {
    const list = [box(0, 0), box(0, 50), box(0, 100)];
    expect(pickInDirection(list[0] as Box, [list[1] as Box, list[2] as Box], 'down')).toBe(0);
  });
});
