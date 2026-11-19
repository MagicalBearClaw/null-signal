import { moveAndSlide } from '../grid/collision';
import { stanceMask } from '../grid/tiles';
import type { System } from '../sim';

/**
 * Integrates velocity and angular velocity into transforms. Entities with a collider
 * move with `moveAndSlide` against the level grid (when one is loaded); everything else
 * moves freely. Tile blocking follows the entity's stance (standing if it has none).
 */
export const movementSystem: System = {
  name: 'movement',
  update({ world, grid }, dt) {
    for (const e of world.with('transform', 'velocity')) {
      const dx = e.velocity.x * dt;
      const dz = e.velocity.z * dt;
      if (grid && e.collider) {
        const r = moveAndSlide(
          grid,
          e.transform.x,
          e.transform.z,
          e.collider,
          dx,
          dz,
          stanceMask(e.stance ?? 'stand'),
        );
        e.transform.x = r.x;
        e.transform.z = r.z;
      } else {
        e.transform.x += dx;
        e.transform.z += dz;
      }
    }
    for (const e of world.with('transform', 'angularVelocity')) {
      e.transform.yaw += e.angularVelocity * dt;
    }
  },
};
