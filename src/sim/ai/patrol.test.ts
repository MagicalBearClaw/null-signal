import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import type { Vec2 } from '../events';
import { Grid } from '../grid/grid';
import type { PatrolStyle } from '../level/model';
import { Sim } from '../sim';
import { movementSystem } from '../systems/movement';
import { GUARD_ACTIONS, nextWaypoint } from './actions';
import { createAiSystem } from './aiSystem';
import { createGuardBrain } from './guardBrain';
import { GUARD } from './tuning';
import { createAiState, type Agent } from './types';

const DT = 1 / 60;

function setup(rows: string[], at: Vec2, route: Vec2[], style?: PatrolStyle) {
  const sim = new Sim([
    createAiSystem({ sensors: [], decision: createGuardBrain(), actions: GUARD_ACTIONS }),
    movementSystem,
  ]);
  sim.grid = Grid.fromRows(rows);
  const guard = sim.world.add({
    transform: transform(at.x, at.z),
    velocity: { x: 0, z: 0 },
    collider: { halfWidth: 0.3, halfDepth: 0.3, height: 1.7 },
    ai: createAiState(route, { x: at.x, z: at.z, yaw: 0 }, style),
  }) as Agent;
  return { sim, guard };
}

describe('nextWaypoint', () => {
  it('wraps around for loop routes', () => {
    expect(nextWaypoint(2, 1, 3, 'loop')).toEqual({ i: 0, dir: 1 });
  });

  it('reverses at both ends for ping-pong routes', () => {
    const seq: number[] = [];
    let s = { i: 0, dir: 1 };
    for (let k = 0; k < 6; k++) {
      s = nextWaypoint(s.i, s.dir, 3, 'pingpong');
      seq.push(s.i);
    }
    expect(seq).toEqual([1, 2, 1, 0, 1, 2]);
  });
});

describe('patrol', () => {
  it('walks around a wall to reach the next waypoint', () => {
    const { sim, guard } = setup(
      [
        '#######', //
        '#.....#',
        '#.###.#',
        '#.....#',
        '#######',
      ],
      { x: 3.5, z: 1.5 },
      [
        { x: 3.5, z: 1.5 },
        { x: 3.5, z: 3.5 },
      ],
    );
    let reached = false;
    for (let i = 0; i < 60 * 8 && !reached; i++) {
      sim.step(DT);
      reached = Math.hypot(guard.transform.x - 3.5, guard.transform.z - 3.5) <= GUARD.arriveRadius + 1e-6;
    }
    expect(reached).toBe(true);
  });

  it('waits at each waypoint and sweeps its gaze when lookAround is set', () => {
    const style: PatrolStyle = { mode: 'pingpong', wait: 2, lookAround: true };
    const { sim, guard } = setup(
      ['......'],
      { x: 0.5, z: 0.5 },
      [
        { x: 0.5, z: 0.5 },
        { x: 4.5, z: 0.5 },
      ],
      style,
    );
    sim.step(DT); // arrive on waypoint 0 at once, start waiting
    const yaws: number[] = [];
    for (let i = 0; i < 60 * 1.5; i++) {
      sim.step(DT);
      yaws.push(guard.transform.yaw);
    }
    expect(guard.transform.x).toBeCloseTo(0.5); // still waiting
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeCloseTo(GUARD.patrol.lookArc, 1); // looked around
    for (let i = 0; i < 60 * 1; i++) sim.step(DT);
    expect(guard.transform.x).toBeGreaterThan(0.6); // wait over, walking on
  });
});
