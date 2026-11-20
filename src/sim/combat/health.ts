import type { World } from 'miniplex';
import type { Entity, Health } from '../components';
import type { EventBus } from '../events';
import type { System } from '../sim';

export interface DamageResult {
  /** The hit landed (not absorbed by invulnerability or an already dead target). */
  readonly applied: boolean;
  readonly lethal: boolean;
}

const MISSED: DamageResult = { applied: false, lethal: false };

export function createHealth(max: number): Health {
  return { current: max, max, invulnerable: 0, invulnerableFor: 0 };
}

/**
 * Deals `amount` damage to `target`. Ignored while the target is invulnerable (just hit)
 * or dead. A landed hit starts the target's invulnerability window and emits `damage`;
 * a lethal one marks it `dead`, stops it, and emits `playerDied` for the player or
 * `kill` for anything else. All damage sources go through here.
 */
export function applyDamage(
  world: World<Entity>,
  events: EventBus,
  target: Entity,
  amount: number,
  source?: Entity,
): DamageResult {
  const h = target.health;
  if (!h || target.dead || h.invulnerable > 0 || amount <= 0) return MISSED;

  h.current = Math.max(0, h.current - amount);
  h.invulnerable = h.invulnerableFor;
  const lethal = h.current === 0;
  const targetId = world.id(target) ?? -1;
  const sourceId = source ? world.id(source) : undefined;
  events.emit({
    type: 'damage',
    target: targetId,
    amount,
    lethal,
    ...(sourceId !== undefined && { source: sourceId }),
  });

  if (lethal) {
    world.addComponent(target, 'dead', true);
    if (target.velocity) {
      target.velocity.x = 0;
      target.velocity.z = 0;
    }
    if (target.player) events.emit({ type: 'playerDied' });
    else events.emit({ type: 'kill', target: targetId, ...(sourceId !== undefined && { source: sourceId }) });
  }
  return { applied: true, lethal };
}

/** Counts down post-hit invulnerability. */
export const healthSystem: System = {
  name: 'health',
  update({ world }, dt) {
    for (const e of world.with('health')) {
      if (e.health.invulnerable > 0) e.health.invulnerable = Math.max(0, e.health.invulnerable - dt);
    }
  },
};
