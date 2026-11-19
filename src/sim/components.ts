import type { Stance } from './grid/tiles';

/**
 * ECS component catalogue (miniplex). An entity is a plain object; every component
 * is an optional property. Systems query by property name, e.g. `world.with('transform', 'velocity')`.
 *
 * Coordinate convention (shared with render):
 * - The level is a grid on the X/Z plane. 1 unit = 1 tile. +X = east, +Z = south.
 * - Y is height (up). Most gameplay is planar and uses x/z only.
 * - `yaw` is a rotation about +Y in radians. 0 faces -Z (north). Positive yaw turns counter-clockwise
 *   when viewed from above, matching three.js `rotation.y`.
 *
 * Add new components here, with a one-line doc comment. Keep them as plain data with no methods,
 * so state stays serialisable for saves, replays and tests.
 */

export interface Transform {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Velocity {
  /** Units per second on the X/Z plane. */
  x: number;
  z: number;
}

/** Axis-aligned box collider centred on the transform (used by grid collision, MIC-69). */
export interface Collider {
  halfWidth: number; // X extent / 2
  halfDepth: number; // Z extent / 2
  height: number; // Y extent from transform.y
}

/**
 * Locomotion state shared by the player and (later) guards. `running` is set by the
 * controller each tick; `travelled` accumulates distance toward the next footstep noise.
 */
export interface Locomotion {
  running: boolean;
  travelled: number;
}

/** Tells the render layer which view to build. The sim never reads it. */
export interface Renderable {
  kind: string;
}

export interface Entity {
  /** Current simulated pose. */
  transform?: Transform;
  /**
   * Pose at the start of the current tick. Written by the Sim before systems run, so the
   * renderer can interpolate `prevTransform → transform` by alpha.
   */
  prevTransform?: Transform;
  velocity?: Velocity;
  /** Radians per second about +Y. */
  angularVelocity?: number;
  collider?: Collider;
  /** Body posture. Sensors read it (low targets are harder to see), movement uses it for tile blocking. */
  stance?: Stance;
  locomotion?: Locomotion;
  renderable?: Renderable;

  // ── Tags (presence-only) ──────────────────────────────
  player?: true;
  guard?: true;
}

export function transform(x = 0, z = 0, yaw = 0, y = 0): Transform {
  return { x, y, z, yaw };
}
