import type { Entity } from '../components';
import type { SimContext } from '../sim';
import { applyDamage } from './health';
import { hitscan, type ShotResult } from './hitscan';

export interface HitscanWeapon {
  readonly damage: number;
  readonly range: number;
  /** How far the report carries (a `gunfire` noise for the hearing sensor). */
  readonly noiseRadius: number;
}

/**
 * Fires one hitscan round from `shooter` along `yaw` (0 = north): resolves the hit,
 * applies damage, and emits `shot` (tracers) and a `gunfire` noise.
 */
export function fire(ctx: SimContext, shooter: Entity, yaw: number, weapon: HitscanWeapon): ShotResult {
  const t = shooter.transform;
  if (!t) throw new Error('fire: shooter has no transform');
  const origin = { x: t.x, z: t.z };
  const dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const shot = hitscan(ctx.world, ctx.grid, shooter, origin, dir, weapon.range);
  if (shot.hit) applyDamage(ctx.world, ctx.events, shot.hit, weapon.damage, shooter);

  const source = ctx.world.id(shooter);
  const from = source !== undefined ? { source } : {};
  ctx.events.emit({ type: 'shot', from: origin, to: shot.end, hit: shot.hit !== null, ...from });
  ctx.events.emit({ type: 'noise', kind: 'gunfire', at: origin, radius: weapon.noiseRadius, ...from });
  return shot;
}
