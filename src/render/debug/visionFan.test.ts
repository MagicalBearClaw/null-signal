import { describe, expect, it } from 'vitest';
import { Grid } from '../../sim/grid/grid';
import { Block } from '../../sim/grid/tiles';
import { visionFan } from './visionFan';

describe('visionFan', () => {
  const open = Grid.fromRows(['.........', '.........', '.........', '.........', '.........']);

  it('starts at the origin and has rays + 1 edge points', () => {
    const p = visionFan(open, { x: 4.5, z: 4.5 }, 0, Math.PI / 2, 3, 8, Block.Sight);
    expect(p).toHaveLength(10);
    expect(p[0]).toEqual({ x: 4.5, z: 4.5 });
  });

  it('faces north at yaw 0 and reaches full range in open space', () => {
    const p = visionFan(open, { x: 4.5, z: 4.5 }, 0, 0, 3, 1, Block.Sight);
    expect(p[1]?.x).toBeCloseTo(4.5);
    expect(p[1]?.z).toBeCloseTo(1.5);
  });

  it('turns counter-clockwise with positive yaw (yaw π/2 faces west)', () => {
    const p = visionFan(open, { x: 4.5, z: 2.5 }, Math.PI / 2, 0, 2, 1, Block.Sight);
    expect(p[1]?.x).toBeCloseTo(2.5);
    expect(p[1]?.z).toBeCloseTo(2.5);
  });

  it('is cut short by walls', () => {
    const g = Grid.fromRows(['.....', '..#..', '.....', '.....']);
    const p = visionFan(g, { x: 2.5, z: 3.5 }, 0, 0, 5, 1, Block.Sight);
    expect(p[1]?.z).toBeCloseTo(2); // stops at the south face of the wall at row 1
  });
});
