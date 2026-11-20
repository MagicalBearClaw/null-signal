import { describe, expect, it } from 'vitest';
import { transform, type Entity } from '../components';
import type { SimEvent } from '../events';
import { EMPTY_INPUT } from '../input';
import { Sim } from '../sim';
import { playerInputSystem } from '../systems/playerInput';
import { applyDamage, createHealth, healthSystem } from './health';

function setup() {
  const sim = new Sim([healthSystem, playerInputSystem]);
  const player = sim.world.add({
    transform: transform(1, 1),
    velocity: { x: 0, z: 0 },
    stance: 'stand',
    health: { ...createHealth(100), invulnerableFor: 1 },
    player: true,
  } as Entity);
  const guard = sim.world.add({
    transform: transform(3, 1),
    guard: true,
    health: createHealth(50),
  } as Entity);
  const events: SimEvent[] = [];
  sim.events.onAny((e) => events.push(e));
  const hit = (target: Entity, amount: number, source?: Entity) =>
    applyDamage(sim.world, sim.events, target, amount, source);
  return { sim, player, guard, events, hit };
}

describe('applyDamage', () => {
  it('subtracts health and emits a damage event with source and target ids', () => {
    const { sim, player, guard, events, hit } = setup();
    expect(hit(player, 30, guard)).toEqual({ applied: true, lethal: false });
    expect(player.health?.current).toBe(70);
    sim.step(1 / 60);
    expect(events).toContainEqual({
      type: 'damage',
      target: sim.world.id(player),
      amount: 30,
      lethal: false,
      source: sim.world.id(guard),
    });
  });

  it('ignores hits during the invulnerability window, then accepts them again', () => {
    const { sim, player, hit } = setup();
    hit(player, 10);
    expect(hit(player, 10)).toEqual({ applied: false, lethal: false });
    expect(player.health?.current).toBe(90);
    for (let i = 0; i < 61; i++) sim.step(1 / 60);
    expect(hit(player, 10).applied).toBe(true);
    expect(player.health?.current).toBe(80);
  });

  it('kills the player at zero health: dead, stopped, playerDied emitted', () => {
    const { sim, player, events, hit } = setup();
    player.velocity = { x: 3, z: 0 };
    expect(hit(player, 150)).toEqual({ applied: true, lethal: true });
    expect(player.health?.current).toBe(0);
    expect(player.dead).toBe(true);
    expect(player.velocity).toEqual({ x: 0, z: 0 });
    sim.step(1 / 60);
    expect(events.map((e) => e.type)).toEqual(['damage', 'playerDied']);
  });

  it('reports a kill (not playerDied) for anything else', () => {
    const { sim, player, guard, events, hit } = setup();
    hit(guard, 50, player);
    sim.step(1 / 60);
    expect(events.at(-1)).toEqual({
      type: 'kill',
      target: sim.world.id(guard),
      source: sim.world.id(player),
    });
  });

  it('cannot hurt the dead, entities without health, or with zero damage', () => {
    const { sim, player, hit } = setup();
    hit(player, 100);
    player.health = { ...createHealth(100), current: 0 }; // even with invulnerability over
    expect(hit(player, 10).applied).toBe(false);
    expect(hit(sim.world.add({ transform: transform() }), 10).applied).toBe(false);
    const { player: fresh, hit: hit2 } = setup();
    expect(hit2(fresh, 0).applied).toBe(false);
  });
});

describe('dead player', () => {
  it('no longer responds to movement input', () => {
    const { sim, player, hit } = setup();
    hit(player, 100);
    sim.step(1 / 60, { ...EMPTY_INPUT, move: { x: 1, z: 0 } });
    expect(player.velocity).toEqual({ x: 0, z: 0 });
  });
});
