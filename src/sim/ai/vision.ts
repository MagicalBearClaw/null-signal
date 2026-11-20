import type { Vec2 } from '../events';
import type { Grid } from '../grid/grid';
import { lineOfSight } from '../grid/raycast';
import { sightMask, type Stance } from '../grid/tiles';
import { wrapAngle } from '../math';

/**
 * Vision shared by guards and surveillance cameras: a cone test with grid occlusion, and
 * an awareness meter that fills while the target stays in view. Pure functions only; the
 * guard sensor (`visionSensor.ts`) and the camera system call these.
 */

/** A view cone: full opening angle and reach. Stored on entities as `Entity.vision`. */
export interface VisionCone {
  /** Full opening angle, radians. */
  fov: number;
  /** Reach, tiles. */
  range: number;
}

export interface Eye {
  readonly x: number;
  readonly z: number;
  /** Facing; 0 looks north (-Z). */
  readonly yaw: number;
}

export interface Sighting {
  /** Target is inside the cone with an unblocked line of sight. */
  readonly visible: boolean;
  readonly distance: number;
}

export const VISION = {
  /** Awareness gained per second at the edge of the cone, standing. A full meter = spotted. */
  baseRate: 0.9,
  /** Extra rate multiplier at point-blank range, fading linearly to none at full range. */
  closeBonus: 4,
  /** Inside this distance a visible target is spotted instantly. */
  instantRange: 1.25,
  /** How much slower crouched and crawling targets are noticed. */
  stance: { stand: 1, crouch: 0.45, crawl: 0.25 } satisfies Record<Stance, number>,
  /** Awareness lost per second while the target is out of view. */
  decayRate: 0.35,
} as const;

/**
 * Whether `eye` sees a target at `target` in the given stance. Occlusion follows the
 * stance-dependent cover rule: rays at a crouched or crawling target are also blocked by
 * low walls (`sightMask`).
 */
export function look(grid: Grid | null, eye: Eye, cone: VisionCone, target: Vec2, stance: Stance): Sighting {
  const dx = target.x - eye.x;
  const dz = target.z - eye.z;
  const distance = Math.hypot(dx, dz);
  if (distance > cone.range) return { visible: false, distance };
  if (distance > 1e-6) {
    // angle between facing (-sin yaw, -cos yaw) and the direction to the target
    const off = wrapAngle(Math.atan2(-dx, -dz) - eye.yaw);
    if (Math.abs(off) > cone.fov / 2) return { visible: false, distance };
  }
  const clear = !grid || lineOfSight(grid, eye, target, sightMask(stance));
  return { visible: clear, distance };
}

/** Awareness gained per second for a visible target: faster up close, slower when low. */
export function detectionRate(distance: number, range: number, stance: Stance): number {
  if (distance <= VISION.instantRange) return Infinity;
  const proximity = 1 - Math.min(1, distance / range);
  return VISION.baseRate * (1 + VISION.closeBonus * proximity) * VISION.stance[stance];
}

/** Steps an awareness meter (0..1) by `dt`: fills while visible, drains otherwise. */
export function updateAwareness(
  awareness: number,
  sighting: Sighting,
  range: number,
  stance: Stance,
  dt: number,
): number {
  const next = sighting.visible
    ? awareness + detectionRate(sighting.distance, range, stance) * dt
    : awareness - VISION.decayRate * dt;
  return Math.min(1, Math.max(0, next));
}
