import type { Entity } from '../components';
import { overlapsBlocked } from '../grid/collision';
import type { Grid } from '../grid/grid';
import { stanceMask, type Stance } from '../grid/tiles';
import { wrapAngle } from '../math';
import { PLAYER } from '../player/tuning';
import type { System } from '../sim';

/** Yaw that faces along (x, z). Inverse of forward = (-sin yaw, -cos yaw). */
export function yawOf(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

/** Rotates `from` toward `to` by at most `maxStep` radians, along the shorter arc. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = wrapAngle(to - from);
  return Math.abs(diff) <= maxStep ? to : wrapAngle(from + Math.sign(diff) * maxStep);
}

function heightOf(stance: Stance): number {
  return stance === 'crouch' ? PLAYER.collider.crouchHeight : PLAYER.collider.standHeight;
}

/**
 * Crouch toggles on press. Standing back up only happens when there is headroom
 * (no stand-blocking tile overlapping the body); otherwise the player stays down.
 */
function nextStance(e: Entity & { stance: Stance }, grid: Grid | null, crouchPressed: boolean): Stance {
  if (!crouchPressed) return e.stance;
  if (e.stance === 'stand') return 'crouch';
  const t = e.transform;
  const blocked = grid && t && e.collider && overlapsBlocked(grid, t.x, t.z, e.collider, stanceMask('stand'));
  return blocked ? e.stance : 'stand';
}

/**
 * Player controller: input snapshot → stance, velocity and facing. Runs before
 * `movement`, which applies the velocity with collision.
 *
 * - Analog: speed scales with stick deflection; keys give full speed.
 * - Run (held) only while standing; crouching ignores it.
 * - The body turns toward the move direction at `PLAYER.turnRate`.
 */
export const playerInputSystem: System = {
  name: 'playerInput',
  update({ world, input, grid }, dt) {
    for (const e of world.with('player', 'velocity', 'transform', 'stance').without('dead')) {
      const stance = nextStance(e, grid, input.pressed.has('crouch'));
      if (stance !== e.stance) {
        e.stance = stance;
        if (e.collider) e.collider.height = heightOf(stance);
      }

      const { x, z } = input.move;
      const amount = Math.min(1, Math.hypot(x, z));
      const moving = amount > PLAYER.moveThreshold;
      const running = moving && stance === 'stand' && input.held.has('run');
      const top = running ? PLAYER.speed.run : stance === 'crouch' ? PLAYER.speed.crouch : PLAYER.speed.walk;

      if (moving) {
        const scale = (top * amount) / Math.hypot(x, z);
        e.velocity.x = x * scale;
        e.velocity.z = z * scale;
        e.transform.yaw = turnToward(e.transform.yaw, yawOf(x, z), PLAYER.turnRate * dt);
      } else {
        e.velocity.x = 0;
        e.velocity.z = 0;
      }
      if (e.locomotion) e.locomotion.running = running;
    }
  },
};
