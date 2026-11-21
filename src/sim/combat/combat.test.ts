import { describe, expect, it } from 'vitest';
import { GUARD_ACTIONS } from '../ai/actions';
import { createAiSystem } from '../ai/aiSystem';
import { createGuardBrain } from '../ai/guardBrain';
import { GUARD } from '../ai/tuning';
import { createAiState, type Agent } from '../ai/types';
import { createVisionSensor } from '../ai/visionSensor';
import { transform, type Entity } from '../components';
import type { SimEvent } from '../events';
import { Grid } from '../grid/grid';
import type { Stance } from '../grid/tiles';
import { EMPTY_INPUT } from '../input';
import { PLAYER } from '../player/tuning';
import { Rng } from '../rng';
import { Sim } from '../sim';
import { playerInputSystem } from '../systems/playerInput';
import { createHealth, healthSystem } from './health';
import { hitscan } from './hitscan';
import { playerWeaponSystem } from './playerWeapon';

const BOX = { halfWidth: 0.3, halfDepth: 0.3, height: 1.6 };

function body(x: number, z: number, stance: Stance = 'stand'): Entity {
  return { transform: transform(x, z), collider: { ...BOX }, stance, health: createHealth(100) };
}

describe('Rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    const xs = Array.from({ length: 100 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Rng(8).next()).not.toBe(xs[0]);
  });
});

describe('hitscan', () => {
  const NORTH = { x: 0, z: -1 };

  it('hits the nearest body in the line of fire and stops there', () => {
    const sim = new Sim([]);
    const shooter = sim.world.add(body(2.5, 8.5));
    const near = sim.world.add(body(2.5, 5.5));
    sim.world.add(body(2.5, 2.5));
    const shot = hitscan(sim.world, null, shooter, { x: 2.5, z: 8.5 }, NORTH, 10);
    expect(shot.hit).toBe(near);
    expect(shot.end.z).toBeCloseTo(5.8);
  });

  it('never hits the shooter, the dead, or anything off the line', () => {
    const sim = new Sim([]);
    const shooter = sim.world.add(body(2.5, 8.5));
    sim.world.add({ ...body(2.5, 5.5), dead: true });
    sim.world.add(body(4.5, 5.5));
    expect(hitscan(sim.world, null, shooter, { x: 2.5, z: 8.5 }, NORTH, 10).hit).toBeNull();
  });

  it('stops at walls', () => {
    const sim = new Sim([]);
    const grid = Grid.fromRows(['.....', '.....', '..#..', '.....', '.....']);
    const shooter = sim.world.add(body(2.5, 4.5));
    sim.world.add(body(2.5, 0.5));
    const shot = hitscan(sim.world, grid, shooter, { x: 2.5, z: 4.5 }, NORTH, 10);
    expect(shot.hit).toBeNull();
    expect(shot.end.z).toBeCloseTo(3);
  });

  it('flies over low cover at a standing target but not at a crouched one', () => {
    const grid = Grid.fromRows(['.....', '.....', '..=..', '.....', '.....']);
    for (const [stance, hits] of [
      ['stand', true],
      ['crouch', false],
    ] as const) {
      const sim = new Sim([]);
      const shooter = sim.world.add(body(2.5, 4.5));
      const target = sim.world.add(body(2.5, 0.5, stance));
      const shot = hitscan(sim.world, grid, shooter, { x: 2.5, z: 4.5 }, NORTH, 10);
      expect(shot.hit === target).toBe(hits);
    }
  });
});

describe('guard combat', () => {
  const DT = 1 / 60;
  const ROOM = Array.from({ length: 10 }, () => '..........');

  function setup(playerAt: { x: number; z: number }, stance: Stance = 'stand') {
    const sim = new Sim([
      healthSystem,
      createAiSystem({
        sensors: [createVisionSensor()],
        decision: createGuardBrain(),
        actions: GUARD_ACTIONS,
      }),
    ]);
    sim.grid = Grid.fromRows(ROOM);
    const guard = sim.world.add({
      transform: transform(4.5, 9.5, 0),
      velocity: { x: 0, z: 0 },
      collider: { ...BOX },
      vision: { fov: Math.PI / 2, range: 9 },
      health: createHealth(GUARD.health),
      guard: true,
      ai: createAiState([], { x: 4.5, z: 9.5, yaw: 0 }),
    }) as Agent;
    const player = sim.world.add({
      ...body(playerAt.x, playerAt.z, stance),
      health: { ...createHealth(PLAYER.health.max), invulnerableFor: PLAYER.health.invulnerableFor },
      player: true,
    });
    const events: SimEvent[] = [];
    sim.events.onAny((e) => events.push(e));
    return { sim, guard, player, events };
  }

  it('opens fire once in range, after the reaction delay, making noise each shot', () => {
    const { sim, guard, events } = setup({ x: 4.5, z: 6.5 });
    for (let i = 0; i < 2 / DT; i++) sim.step(DT);
    expect(guard.ai.state).toBe('shoot');
    const shots = events.filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'noise' && e.kind === 'gunfire')).toBe(true);
    // at most one shot per interval
    expect(shots.length).toBeLessThanOrEqual(Math.ceil(2 / GUARD.combat.interval));
  });

  it('hits close targets far more often than distant ones', () => {
    const accuracy = (z: number) => {
      const { sim, events } = setup({ x: 4.5, z });
      for (let i = 0; i < 20 / DT; i++) {
        sim.step(DT);
        const p = sim.world.with('player', 'health').first;
        if (p) p.health.current = 100; // keep the target alive
      }
      const shots = events.filter((e): e is Extract<SimEvent, { type: 'shot' }> => e.type === 'shot');
      return shots.filter((s) => s.hit).length / shots.length;
    };
    const near = accuracy(7.5); // 2 tiles
    const far = accuracy(3.5); // 6 tiles
    expect(near).toBeGreaterThan(0.9);
    expect(far).toBeLessThan(near - 0.3);
  });

  it('eventually kills a player who stands in the open', () => {
    const { sim, player, events } = setup({ x: 4.5, z: 7.5 });
    for (let i = 0; i < 30 / DT && !player.dead; i++) sim.step(DT);
    expect(player.dead).toBe(true);
    sim.step(DT);
    expect(events.some((e) => e.type === 'playerDied')).toBe(true);
  });

  it('stops fighting once dead', () => {
    const { sim, guard } = setup({ x: 4.5, z: 6.5 });
    for (let i = 0; i < 1 / DT; i++) sim.step(DT);
    sim.world.addComponent(guard, 'dead', true);
    const state = guard.ai.state;
    for (let i = 0; i < 1 / DT; i++) sim.step(DT);
    expect(guard.ai.state).toBe(state);
  });
});

describe('player debug weapon', () => {
  it('kills a guard in three hits, no faster than the fire interval allows', () => {
    const sim = new Sim([playerInputSystem, playerWeaponSystem, healthSystem]);
    sim.world.add({
      ...body(2.5, 5.5),
      velocity: { x: 0, z: 0 },
      player: true,
    });
    const guard = sim.world.add({ ...body(2.5, 1.5), health: createHealth(GUARD.health) });
    const fire = { ...EMPTY_INPUT, pressed: new Set(['attack'] as const) };
    sim.step(1 / 60, fire);
    sim.step(1 / 60, fire); // still cooling down: ignored
    expect(guard.health?.current).toBe(GUARD.health - PLAYER.weapon.damage);
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < PLAYER.weapon.interval * 60; k++) sim.step(1 / 60);
      sim.step(1 / 60, fire);
    }
    expect(guard.dead).toBe(true);
  });
});
