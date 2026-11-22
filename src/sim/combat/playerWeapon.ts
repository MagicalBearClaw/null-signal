import { PLAYER } from '../player/tuning';
import type { System } from '../sim';
import { fire } from './fire';

/**
 * The player's debug sidearm (until the arsenal arrives in M3): `attack` fires one
 * accurate round straight ahead, at most once per `PLAYER.weapon.interval`. Objectives
 * can turn weapons off (`rules.weapons`).
 */
export const playerWeaponSystem: System = {
  name: 'playerWeapon',
  update(ctx, dt) {
    if (ctx.objective?.objective.rules.weapons === false) return; // e.g. a sneak level
    for (const player of ctx.world.with('player', 'transform').without('dead')) {
      const cooldown = Math.max(0, (player.weaponCooldown ?? 0) - dt);
      player.weaponCooldown = cooldown;
      if (cooldown > 0 || !ctx.input.pressed.has('attack')) continue;
      fire(ctx, player, player.transform.yaw, PLAYER.weapon);
      player.weaponCooldown = PLAYER.weapon.interval;
    }
  },
};
