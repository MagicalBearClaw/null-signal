import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import type { EventOf } from '../events';
import { Sim } from '../sim';
import { collect, createInventory, pickupSystem } from './pickups';

describe('collect', () => {
  it('keeps the highest keycard, so a lower card never downgrades', () => {
    const inv = createInventory();
    collect(inv, { item: 'keycard', amount: 3 });
    collect(inv, { item: 'keycard', amount: 1 });
    expect(inv.keycard).toBe(3);
  });

  it('counts other items', () => {
    const inv = createInventory();
    collect(inv, { item: 'medkit', amount: 1 });
    collect(inv, { item: 'medkit', amount: 2 });
    expect(inv.items).toEqual({ medkit: 3 });
  });
});

describe('pickupSystem', () => {
  function setup() {
    const sim = new Sim([pickupSystem]);
    const player = sim.world.add({
      transform: transform(1, 1),
      inventory: createInventory(),
      player: true as const,
    });
    const card = sim.world.add({ transform: transform(3, 1), pickup: { item: 'keycard', amount: 2 } });
    const events: EventOf<'pickup'>[] = [];
    sim.events.on('pickup', (e) => events.push(e));
    return { sim, player, card, events };
  }

  it('collects an item the player walks over, emits pickup and removes it', () => {
    const { sim, player, card, events } = setup();
    sim.step(1 / 60);
    expect(sim.world.has(card)).toBe(true);
    player.transform.x = 2.6;
    sim.step(1 / 60);
    sim.step(1 / 60);
    expect(player.inventory.keycard).toBe(2);
    expect(sim.world.has(card)).toBe(false);
    expect(events).toEqual([{ type: 'pickup', entity: sim.world.id(player), item: 'keycard' }]);
  });

  it('leaves items alone once the player is dead', () => {
    const { sim, player, card } = setup();
    player.transform.x = 3;
    sim.world.addComponent(player, 'dead', true);
    sim.step(1 / 60);
    expect(sim.world.has(card)).toBe(true);
  });
});
