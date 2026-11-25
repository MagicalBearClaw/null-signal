import { describe, expect, it } from 'vitest';
import { doorSystem } from '../sim/hazards/doors';
import { pickupSystem } from '../sim/items/pickups';
import { startLevel } from '../sim/level/spawn';
import { objectiveSystem } from '../sim/objectives/objectiveSystem';
import { Sim } from '../sim/sim';
import { CAMPAIGN } from './levels';

/** End-to-end check that the first campaign level can be finished (guards left out). */
describe('intake', () => {
  function run() {
    const level = CAMPAIGN[0]?.load();
    if (!level) throw new Error('no campaign');
    const sim = new Sim([doorSystem, pickupSystem, objectiveSystem]);
    startLevel(sim, level);
    const player = sim.world.with('player', 'transform', 'inventory').first;
    if (!player) throw new Error('no player');
    const types: string[] = [];
    sim.events.onAny((e) => types.push(e.type));
    const at = (x: number, z: number, seconds = 0.5) => {
      player.transform.x = x;
      player.transform.z = z;
      for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60);
    };
    return { sim, level, player, types, at };
  }

  it('keeps the archive door shut without the keycard', () => {
    const { sim, level, at } = run();
    const door = level.doors[0];
    if (!door) throw new Error('no door');
    at(door.tileX - 0.5, door.tileZ + 0.5, 1);
    expect(sim.grid?.tileAt(door.tileX, door.tileZ)).toBe('door');
  });

  it('is cleared by taking the keycard, passing the door and reaching the exit', () => {
    const { sim, level, player, types, at } = run();
    const card = level.pickups.find((p) => p.item === 'keycard');
    const door = level.doors[0];
    const goal = level.goals[0];
    if (!card || !door || !goal) throw new Error('level is missing a keycard, door or goal');
    at(card.x, card.z);
    expect(player.inventory.keycard).toBeGreaterThanOrEqual(door.keycard);
    at(door.tileX - 0.5, door.tileZ + 0.5, 1);
    expect(sim.grid?.tileAt(door.tileX, door.tileZ)).toBe('doorOpen');
    at(goal.x + goal.width / 2, goal.z + goal.depth / 2);
    expect(types).toContain('objectiveComplete');
  });
});
