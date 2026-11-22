import type { Entity } from '../components';
import type { System } from '../sim';

/**
 * Items lying in the level and what the player carries (DESIGN.md §9.2). Walking over a
 * pickup collects it. A `keycard` pickup's `amount` is the card's level (1–5); holding
 * card N opens every door of level N or lower, so only the highest card matters.
 */

export const PICKUP = {
  /** Distance from the player's centre at which a pickup is collected. */
  radius: 0.6,
} as const;

export const KEYCARD_ITEM = 'keycard';

export interface Pickup {
  readonly item: string;
  readonly amount: number;
}

export interface Inventory {
  /** Highest keycard level held. 0 = none. */
  keycard: number;
  /** Other items by name, with counts. */
  items: Record<string, number>;
}

export function createInventory(): Inventory {
  return { keycard: 0, items: {} };
}

/** Adds a pickup to an inventory. */
export function collect(inv: Inventory, pickup: Pickup): void {
  if (pickup.item === KEYCARD_ITEM) inv.keycard = Math.max(inv.keycard, pickup.amount);
  else inv.items[pickup.item] = (inv.items[pickup.item] ?? 0) + pickup.amount;
}

export const pickupSystem: System = {
  name: 'pickups',
  update({ world, events }) {
    const player = world.with('player', 'transform', 'inventory').without('dead').first;
    if (!player) return;
    const taken: Entity[] = [];
    for (const e of world.with('pickup', 'transform')) {
      const d = Math.hypot(e.transform.x - player.transform.x, e.transform.z - player.transform.z);
      if (d > PICKUP.radius) continue;
      collect(player.inventory, e.pickup);
      events.emit({ type: 'pickup', entity: world.id(player) ?? -1, item: e.pickup.item });
      taken.push(e);
    }
    for (const e of taken) world.remove(e);
  },
};
