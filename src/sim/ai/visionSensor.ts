import { lineOfSight } from '../grid/raycast';
import { bulletMask } from '../grid/tiles';
import { GUARD } from './tuning';
import type { Sensor } from './types';
import { look, updateAwareness } from './vision';

/**
 * A guard's eyes. Uses the guard's `vision` cone to fill its awareness meter while the
 * player is in view, and writes the result to the blackboard:
 *
 * - awareness ≥ `GUARD.vision.glimpse`: "something's there". The spot becomes a point to
 *   investigate (`noiseAt`), so a half-seen player draws the guard over.
 * - awareness full: `seesPlayer`. The position goes to the guard's and the squad's
 *   memory, and a `spotted` event fires on the first tick.
 * - `playerInRange`: seen, within firing range, with a clear line for bullets.
 *
 * Once a guard has spotted the player it keeps tracking for as long as they stay in view.
 */
export function createVisionSensor(): Sensor {
  return {
    name: 'vision',
    sense(agent, ctx, dt) {
      const bb = agent.ai.blackboard;
      const cone = agent.vision;
      const player = ctx.world.with('player', 'transform').without('dead').first;
      if (!cone || !player) {
        bb.facts.seesPlayer = false;
        bb.facts.playerInRange = false;
        return;
      }

      const stance = player.stance ?? 'stand';
      const target = { x: player.transform.x, z: player.transform.z };
      const sighting = look(ctx.grid, agent.transform, cone, target, stance);
      const was = bb.facts.seesPlayer;
      bb.awareness =
        was && sighting.visible ? 1 : updateAwareness(bb.awareness, sighting, cone.range, stance, dt);

      const sees = sighting.visible && bb.awareness >= 1;
      bb.facts.seesPlayer = sees;
      if (sees) {
        bb.playerSeenAt = target;
        ctx.squad.lastKnownPlayer = { ...target };
        ctx.squad.lastKnownTick = ctx.tick;
        if (!was) {
          ctx.events.emit({
            type: 'spotted',
            by: ctx.world.id(agent) ?? -1,
            target: ctx.world.id(player) ?? -1,
          });
        }
      } else if (sighting.visible && bb.awareness >= GUARD.vision.glimpse) {
        bb.noiseAt = { ...target };
      }

      bb.facts.playerInRange =
        sees &&
        sighting.distance <= GUARD.shootRange &&
        (!ctx.grid || lineOfSight(ctx.grid, agent.transform, target, bulletMask(stance)));
    },
  };
}
