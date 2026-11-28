import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import { Grid } from '../grid/grid';
import { Sim } from '../sim';
import { GUARD_ACTIONS } from './actions';
import { createAiSystem } from './aiSystem';
import { createGuardBrain } from './guardBrain';
import { createHearingSensor, soundPathLength } from './hearing';
import { createAiState, type Agent } from './types';

describe('soundPathLength', () => {
  const open = Grid.fromRows(['..........', '..........', '..........']);

  it('is the straight distance across open floor', () => {
    expect(soundPathLength(open, { x: 1.5, z: 1.5 }, { x: 4.5, z: 1.5 }, 10)).toBeCloseTo(3);
    expect(soundPathLength(open, { x: 1.2, z: 1.2 }, { x: 1.8, z: 1.6 }, 10)).toBeCloseTo(
      Math.hypot(0.6, 0.4),
    );
  });

  it('is null beyond the radius', () => {
    expect(soundPathLength(open, { x: 0.5, z: 0.5 }, { x: 9.5, z: 0.5 }, 5)).toBeNull();
  });

  it('goes around a wall, so a sound behind one carries less far', () => {
    //   ".....#....." : the wall leaves a gap at the bottom row
    const g = Grid.fromRows(['.....#.....', '.....#.....', '...........']);
    const a = { x: 3.5, z: 0.5 };
    const b = { x: 7.5, z: 0.5 };
    const around = soundPathLength(g, a, b, 20);
    expect(around).not.toBeNull();
    expect(around as number).toBeGreaterThan(4 + 2); // longer than straight through (4)
    expect(soundPathLength(g, a, b, 5)).toBeNull(); // in range as the crow flies, not by path
  });

  it('is blocked completely by a sealed wall or a closed door, and passes an open one', () => {
    const sealed = Grid.fromRows(['..#..', '..#..', '..#..']);
    expect(soundPathLength(sealed, { x: 0.5, z: 1.5 }, { x: 4.5, z: 1.5 }, 50)).toBeNull();
    const door = Grid.fromRows(['..#..', '..D..', '..#..']);
    expect(soundPathLength(door, { x: 0.5, z: 1.5 }, { x: 4.5, z: 1.5 }, 50)).toBeNull();
    door.set(2, 1, 'doorOpen');
    expect(soundPathLength(door, { x: 0.5, z: 1.5 }, { x: 4.5, z: 1.5 }, 50)).toBeCloseTo(4);
  });

  it('carries through low cover, crawlspaces and vents', () => {
    const g = Grid.fromRows(['.=~v.']);
    expect(soundPathLength(g, { x: 0.5, z: 0.5 }, { x: 4.5, z: 0.5 }, 10)).toBeCloseTo(4);
  });
});

describe('hearing sensor', () => {
  const DT = 1 / 60;
  function setup(rows = ['............', '............', '............']) {
    const sim = new Sim([
      createAiSystem({
        sensors: [createHearingSensor()],
        decision: createGuardBrain(),
        actions: GUARD_ACTIONS,
      }),
    ]);
    sim.grid = Grid.fromRows(rows);
    const guard = sim.world.add({
      transform: transform(1.5, 1.5),
      velocity: { x: 0, z: 0 },
      guard: true as const,
      ai: createAiState([], { x: 1.5, z: 1.5, yaw: 0 }),
    }) as Agent;
    const player = sim.world.add({ transform: transform(8.5, 1.5), player: true as const });
    const noise = (x: number, radius: number, source = sim.world.id(player)) =>
      sim.events.emit({
        type: 'noise',
        kind: 'knock',
        at: { x, z: 1.5 },
        radius,
        ...(source === undefined ? {} : { source }),
      });
    return { sim, guard, player, noise };
  }

  it('sends a guard to investigate a noise it can hear', () => {
    const { sim, guard, noise } = setup();
    noise(5.5, 6);
    sim.step(DT); // flushed
    sim.step(DT); // heard
    expect(guard.ai.blackboard.noiseAt).toEqual({ x: 5.5, z: 1.5 });
    sim.step(DT);
    expect(guard.ai.state).toBe('investigate');
  });

  it('ignores noises out of earshot or behind walls', () => {
    const quiet = setup();
    quiet.noise(9.5, 3);
    quiet.sim.step(DT);
    quiet.sim.step(DT);
    expect(quiet.guard.ai.blackboard.noiseAt).toBeNull();

    const walled = setup(['.....#......', '.....#......', '.....#......']);
    walled.noise(7.5, 20);
    walled.sim.step(DT);
    walled.sim.step(DT);
    expect(walled.guard.ai.blackboard.noiseAt).toBeNull();
  });

  it('does not react to its own noise', () => {
    const { sim, guard, noise } = setup();
    noise(2.5, 6, sim.world.id(guard));
    sim.step(DT);
    sim.step(DT);
    expect(guard.ai.blackboard.noiseAt).toBeNull();
  });

  it('updates where the squad thinks the player is during a hunt', () => {
    const { sim, noise } = setup();
    sim.squad.alert = 'evasion';
    noise(6.5, 8);
    sim.step(DT);
    sim.step(DT);
    expect(sim.squad.lastKnownPlayer).toEqual({ x: 6.5, z: 1.5 });
  });
});
