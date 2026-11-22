import type { Collider } from '../components';
import { wrapAngle } from '../math';
import type { System } from '../sim';
import { look, updateAwareness, type Sighting } from '../ai/vision';

/**
 * Surveillance cameras (DESIGN.md §10): a wall-mounted head that sweeps between two
 * angles, pausing at each end. It watches with the same cone and awareness meter as a
 * guard (`vision.ts`); a full meter raises Alert at the player's position. While it sees
 * the player the head locks on and stops sweeping.
 *
 * A camera can be shot out (it has health, so `applyDamage` marks it `dead`) or knocked
 * out for a while (`disabledFor`, for chaff).
 */

export const CAMERA = {
  /** Narrower than a guard's eyes, about the same reach. */
  fov: (50 * Math.PI) / 180,
  /** Head turn speed while sweeping, radians per second. */
  turnRate: 0.6,
  health: 20,
  collider: { halfWidth: 0.2, halfDepth: 0.2, height: 0.35 } satisfies Collider,
  /** Mount height for the view (render only reads it). */
  mountHeight: 2.2,
} as const;

export interface SurveillanceCamera {
  /** Centre of the sweep (the `facing` set in Tiled). */
  readonly baseYaw: number;
  /** Full sweep arc, radians. 0 = fixed camera. */
  readonly sweep: number;
  /** Seconds the head holds at each end. */
  readonly pause: number;
  /** Which end the head is turning toward: +1 = clockwise from the player's view (+yaw). */
  dir: 1 | -1;
  /** Seconds left holding at an end. */
  hold: number;
  /** Detection meter, 0..1. */
  awareness: number;
  /** Sees the player this tick (awareness full and in view). */
  sees: boolean;
  /** Seconds left knocked out (chaff). While > 0 it neither turns nor watches. */
  disabledFor: number;
}

export function createCamera(baseYaw: number, sweep: number, pause: number): SurveillanceCamera {
  return { baseYaw, sweep, pause, dir: 1, hold: 0, awareness: 0, sees: false, disabledFor: 0 };
}

/**
 * Advances the sweep by `dt` from the head's current `yaw` and returns the new yaw. On
 * reaching an end the head holds for `pause` seconds and then turns back.
 */
export function stepSweep(cam: SurveillanceCamera, yaw: number, dt: number): number {
  if (cam.sweep <= 0) return cam.baseYaw;
  if (cam.hold > 0) {
    cam.hold = Math.max(0, cam.hold - dt);
    return yaw;
  }
  const half = cam.sweep / 2;
  let offset = wrapAngle(yaw - cam.baseYaw) + cam.dir * CAMERA.turnRate * dt;
  if (cam.dir * offset >= half) {
    offset = cam.dir * half;
    cam.dir = cam.dir === 1 ? -1 : 1;
    cam.hold = cam.pause;
  }
  return wrapAngle(cam.baseYaw + offset);
}

const UNSEEN: Sighting = { visible: false, distance: Infinity };

/**
 * Turns and senses every working camera. A camera that spots the player writes the
 * position to the squad's last-known spot and emits `spotted`; `alertSystem` reads
 * `sees` to hold the level in Alert. Runs before `alertSystem`.
 */
export const cameraSystem: System = {
  name: 'camera',
  update(ctx, dt) {
    const player = ctx.world.with('player', 'transform').without('dead').first;
    for (const e of ctx.world.with('camera', 'transform', 'vision').without('dead')) {
      const cam = e.camera;
      if (cam.disabledFor > 0) {
        cam.disabledFor = Math.max(0, cam.disabledFor - dt);
        cam.awareness = 0;
        cam.sees = false;
        continue;
      }

      const stance = player?.stance ?? 'stand';
      const target = player ? { x: player.transform.x, z: player.transform.z } : null;
      const sighting = target ? look(ctx.grid, e.transform, e.vision, target, stance) : UNSEEN;
      cam.awareness =
        cam.sees && sighting.visible
          ? 1
          : updateAwareness(cam.awareness, sighting, e.vision.range, stance, dt);

      const sees = sighting.visible && cam.awareness >= 1;
      if (sees && target && player) {
        ctx.squad.lastKnownPlayer = { ...target };
        ctx.squad.lastKnownTick = ctx.tick;
        if (!cam.sees) {
          ctx.events.emit({
            type: 'spotted',
            by: ctx.world.id(e) ?? -1,
            target: ctx.world.id(player) ?? -1,
          });
        }
      }
      cam.sees = sees;
      if (!sees) e.transform.yaw = stepSweep(cam, e.transform.yaw, dt);
    }
  },
};
