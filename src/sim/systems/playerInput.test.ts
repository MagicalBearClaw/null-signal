import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import { EMPTY_INPUT, type ButtonAction } from '../input';
import { Sim } from '../sim';
import { movementSystem } from './movement';
import { playerInputSystem, RUN_SPEED, WALK_SPEED } from './playerInput';

describe('playerInputSystem', () => {
  it('drives player velocity from the input snapshot, running while held', () => {
    const sim = new Sim([playerInputSystem, movementSystem]);
    const p = sim.world.add({ transform: transform(), velocity: { x: 0, z: 0 }, player: true });
    const other = sim.world.add({ transform: transform(), velocity: { x: 0, z: 0 } });

    sim.step(1, { ...EMPTY_INPUT, move: { x: 1, z: 0 } });
    expect(p.transform.x).toBeCloseTo(WALK_SPEED);
    expect(other.transform.x).toBe(0);

    const run = new Set<ButtonAction>(['run']);
    sim.step(1, { ...EMPTY_INPUT, move: { x: 0, z: -1 }, held: run });
    expect(p.transform.z).toBeCloseTo(-RUN_SPEED);

    sim.step(1);
    expect(p.velocity).toEqual({ x: 0, z: 0 });
  });
});
