import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import type { Vec2 } from '../events';
import { Grid } from '../grid/grid';
import { Sim } from '../sim';
import { movementSystem } from '../systems/movement';
import { GUARD_ACTIONS } from './actions';
import { createAiSystem } from './aiSystem';
import { createGuardBrain } from './guardBrain';
import { GUARD } from './tuning';
import { createAiState, type Action, type Agent, type Sensor } from './types';

const DT = 1 / 60;

/** Arrival counts within `GUARD.arriveRadius`, so positions are only that exact. */
function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(GUARD.arriveRadius + 1e-6);
}

/** What the fake sensor reports. Tests flip these to script a scenario. */
interface Scene {
  sees: Vec2 | null;
  inRange: boolean;
}

function setup(route: Vec2[] = [], rows?: string[]) {
  const scene: Scene = { sees: null, inRange: false };
  const fakeEyes: Sensor = {
    name: 'fakeEyes',
    sense(agent) {
      const bb = agent.ai.blackboard;
      bb.facts.seesPlayer = scene.sees !== null;
      bb.facts.playerInRange = scene.sees !== null && scene.inRange;
      if (scene.sees) bb.playerSeenAt = { ...scene.sees };
    },
  };
  const sim = new Sim([
    createAiSystem({ sensors: [fakeEyes], decision: createGuardBrain(), actions: GUARD_ACTIONS }),
    movementSystem,
  ]);
  if (rows) sim.grid = Grid.fromRows(rows);
  const guard = sim.world.add({
    transform: transform(1.5, 1.5),
    velocity: { x: 0, z: 0 },
    collider: { halfWidth: 0.3, halfDepth: 0.3, height: 1.7 },
    guard: true,
    ai: createAiState(route, { x: 1.5, z: 1.5, yaw: 0 }),
  }) as Agent;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
  };
  return { sim, guard, scene, run };
}

describe('guard AI pipeline', () => {
  it('starts in patrol and walks the route in a loop', () => {
    const { guard, run } = setup([
      { x: 4.5, z: 1.5 },
      { x: 1.5, z: 1.5 },
    ]);
    run(DT);
    expect(guard.ai.state).toBe('patrol');
    // starts on the nearest waypoint (index 1), so the first leg goes east to 4.5 and back
    let maxX = 0;
    let headedBack = false;
    for (let i = 0; i < 600 && !(headedBack && guard.ai.memory.waypoint === 0); i++) {
      run(DT);
      maxX = Math.max(maxX, guard.transform.x);
      if (guard.ai.memory.waypoint === 1) headedBack = true;
    }
    expectNear(maxX, 4.5);
    expectNear(guard.transform.x, 1.5); // completed the loop and turned east again
    expect(guard.ai.state).toBe('patrol');
  });

  it('investigates a noise, looks around, then returns to patrol', () => {
    const { guard, run } = setup();
    run(DT);
    guard.ai.blackboard.noiseAt = { x: 3.5, z: 1.5 };
    run(DT * 2);
    expect(guard.ai.state).toBe('investigate');
    run(2 / GUARD.speed.walk + 0.2);
    expectNear(guard.transform.x, 3.5);
    run(GUARD.investigate.lookTime + 0.1);
    expect(guard.ai.blackboard.noiseAt).toBeNull();
    expect(guard.ai.state).toBe('returning');
    run(2 / GUARD.speed.walk + 0.5);
    expect(guard.ai.state).toBe('patrol');
    expectNear(guard.transform.x, 1.5);
  });

  it('drops an investigation to chase the moment it sees the player', () => {
    const { guard, scene, run } = setup();
    run(DT);
    guard.ai.blackboard.noiseAt = { x: 8, z: 1.5 };
    run(0.5);
    expect(guard.ai.state).toBe('investigate');
    scene.sees = { x: 1.5, z: 6 };
    run(DT * 2);
    expect(guard.ai.state).toBe('chase');
    expect(Math.hypot(guard.velocity.x, guard.velocity.z)).toBeCloseTo(GUARD.speed.run);
  });

  it('shoots while in range, chases when the player slips out, searches when the trail goes cold', () => {
    const { sim, guard, scene, run } = setup();
    run(DT);
    scene.sees = { x: 1.5, z: 4 };
    scene.inRange = true;
    run(DT * 3);
    expect(guard.ai.state).toBe('shoot');
    expect(guard.velocity.x).toBe(0);

    scene.inRange = false;
    run(DT * 2);
    expect(guard.ai.state).toBe('chase');

    scene.sees = null; // lost sight: run to where they were last seen, then search
    sim.squad.lastKnownPlayer = { x: 1.5, z: 4 };
    run(2.5 / GUARD.speed.run + 0.3);
    expect(guard.ai.state).toBe('search');
  });

  it('keeps searching while the squad is in Evasion and stands down after', () => {
    const { sim, guard, run } = setup();
    run(DT);
    sim.squad.alert = 'evasion';
    sim.squad.lastKnownPlayer = { x: 5, z: 5 };
    run(DT * 2);
    expect(guard.ai.state).toBe('search');
    run(30);
    expect(guard.ai.state).toBe('search');
    sim.squad.alert = 'caution';
    run(30);
    expect(guard.ai.state).toBe('patrol');
  });

  it('hunts the last known position when the squad goes to Alert', () => {
    const { sim, guard, run } = setup();
    run(DT);
    sim.squad.alert = 'alert';
    sim.squad.lastKnownPlayer = { x: 6, z: 1.5 };
    run(DT * 2);
    expect(guard.ai.state).toBe('chase');
    expect(guard.velocity.x).toBeCloseTo(GUARD.speed.run);
  });

  it('interrupts the running action when switching and starts the next with fresh memory', () => {
    const calls: string[] = [];
    const spy = (name: 'patrol' | 'chase'): Action => ({
      ...GUARD_ACTIONS[name],
      start: (a, c) => {
        calls.push(`start ${name}`);
        GUARD_ACTIONS[name].start(a, c);
      },
      interrupt: () => calls.push(`interrupt ${name}`),
    });
    const scene = { sees: false };
    const sim = new Sim([
      createAiSystem({
        sensors: [{ name: 'eyes', sense: (a) => (a.ai.blackboard.facts.seesPlayer = scene.sees) }],
        decision: createGuardBrain(),
        actions: { ...GUARD_ACTIONS, patrol: spy('patrol'), chase: spy('chase') },
      }),
    ]);
    const guard = sim.world.add({
      transform: transform(0, 0),
      velocity: { x: 0, z: 0 },
      ai: createAiState([{ x: 5, z: 0 }], { x: 0, z: 0, yaw: 0 }),
    }) as Agent;
    sim.step(DT);
    guard.ai.memory.junk = 42;
    scene.sees = true;
    sim.step(DT);
    expect(calls).toEqual(['start patrol', 'interrupt patrol', 'start chase']);
    expect(guard.ai.memory.junk).toBeUndefined();
  });

  it('gives up on a point it cannot reach instead of walking into a wall forever', () => {
    const { guard, run } = setup([], ['#######', '#..#..#', '#######']);
    run(DT);
    guard.ai.blackboard.noiseAt = { x: 5.5, z: 1.5 };
    run(GUARD.stuckTime + 1);
    expect(guard.ai.memory.looking).toBeDefined(); // treated as arrived, now looking around
    expect(guard.transform.x).toBeLessThan(3);
  });
});
