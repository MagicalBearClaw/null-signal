import { describe, expect, it } from 'vitest';
import { GUARD_ACTIONS } from '../ai/actions';
import { createAiSystem } from '../ai/aiSystem';
import { createGuardBrain } from '../ai/guardBrain';
import { createAiState } from '../ai/types';
import { transform } from '../components';
import type { EventOf } from '../events';
import { Grid } from '../grid/grid';
import { createInventory } from '../items/pickups';
import { Sim } from '../sim';
import { movementSystem } from '../systems/movement';
import { DOOR, createDoor, doorSystem, plannerGrid } from './doors';

const DT = 1 / 60;
const BOX = { halfWidth: 0.3, halfDepth: 0.3, height: 1.7 };

/** A corridor split by a level-`keycard` door at (3, 1). */
function setup(keycard: number) {
  const sim = new Sim([doorSystem]);
  sim.grid = Grid.fromRows(['#######', '...D...', '#######']);
  const door = sim.world.add({ transform: transform(3.5, 1.5), door: createDoor(3, 1, keycard) });
  const player = sim.world.add({
    transform: transform(0.5, 1.5),
    collider: { ...BOX },
    inventory: createInventory(),
    player: true as const,
  });
  const events: EventOf<'door'>[] = [];
  sim.events.on('door', (e) => events.push(e));
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) sim.step(DT);
  };
  return { sim, door, player, events, run };
}

describe('doorSystem', () => {
  it('opens for the player when they come near with no card needed, then closes behind them', () => {
    const { sim, door, player, events, run } = setup(0);
    run(0.5);
    expect(door.door.openness).toBe(0); // too far
    player.transform.x = 2.4;
    run(DOOR.openTime + 0.1);
    expect(door.door.openness).toBe(1);
    expect(sim.grid?.tileAt(3, 1)).toBe('doorOpen');
    player.transform.x = 0.5;
    run(0.05);
    expect(sim.grid?.tileAt(3, 1)).toBe('door'); // blocks as soon as it starts closing
    run(DOOR.closeTime);
    expect(door.door.openness).toBe(0);
    expect(events.map((e) => e.open)).toEqual([true, false]);
  });

  it('stays shut for a player whose card is too low, and opens for a card of that level or higher', () => {
    const { sim, door, player, run } = setup(3);
    player.transform.x = 2.4;
    player.inventory.keycard = 2;
    run(1);
    expect(door.door.openness).toBe(0);
    expect(sim.grid?.tileAt(3, 1)).toBe('door');
    player.inventory.keycard = 5;
    run(1);
    expect(sim.grid?.tileAt(3, 1)).toBe('doorOpen');
  });

  it('opens for any guard, whatever the level', () => {
    const { sim, player, run } = setup(5);
    sim.world.remove(player);
    sim.world.add({ transform: transform(4.5, 1.5), collider: { ...BOX }, guard: true as const });
    run(1);
    expect(sim.grid?.tileAt(3, 1)).toBe('doorOpen');
  });

  it('never closes on someone standing in the doorway', () => {
    const { sim, door, player, run } = setup(1);
    player.inventory.keycard = 1;
    player.transform.x = 2.4;
    run(1);
    // a guard steps into the doorway, then the player leaves
    sim.world.add({ transform: transform(3.5, 1.5), collider: { ...BOX }, guard: true as const });
    player.transform.x = 0.5;
    run(2);
    expect(door.door.openness).toBe(1);
  });

  it('ignores the dead', () => {
    const { sim, door, player, run } = setup(0);
    player.transform.x = 2.4;
    sim.world.addComponent(player, 'dead', true);
    run(1);
    expect(door.door.openness).toBe(0);
  });
});

describe('guards and doors', () => {
  it('plans routes through closed doors but the live grid still blocks them', () => {
    const grid = Grid.fromRows(['...D...']);
    const plan = plannerGrid(grid);
    expect(plan).toBe(plannerGrid(grid)); // cached per grid
    expect(grid.blocks(3, 0, 1)).toBe(true);
    expect(plan.blocks(3, 0, 1)).toBe(false);
    grid.set(1, 0, 'wall');
    expect(plan.tileAt(1, 0)).toBe('wall'); // shares live tiles
  });

  it('walks a guard through a locked door to reach its post', () => {
    const sim = new Sim([
      createAiSystem({ sensors: [], decision: createGuardBrain(), actions: GUARD_ACTIONS }),
      movementSystem,
      doorSystem,
    ]);
    sim.grid = Grid.fromRows(['#######', '...D...', '#######']);
    sim.world.add({ transform: transform(3.5, 1.5), door: createDoor(3, 1, 5) });
    const guard = sim.world.add({
      transform: transform(0.5, 1.5),
      velocity: { x: 0, z: 0 },
      collider: { ...BOX },
      guard: true as const,
      ai: createAiState([], { x: 6.5, z: 1.5, yaw: 0 }),
    });
    guard.ai.state = 'returning';
    for (let t = 0; t < 8; t += DT) sim.step(DT);
    expect(guard.transform.x).toBeGreaterThan(5.5);
  });
});
