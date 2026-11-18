import type { System } from '../sim';

/**
 * Integrates velocity and angular velocity into transforms. Collision response is not
 * handled here; grid collision (MIC-69) will run right after this system or replace it.
 */
export const movementSystem: System = {
  name: 'movement',
  update({ world }, dt) {
    for (const e of world.with('transform', 'velocity')) {
      e.transform.x += e.velocity.x * dt;
      e.transform.z += e.velocity.z * dt;
    }
    for (const e of world.with('transform', 'angularVelocity')) {
      e.transform.yaw += e.angularVelocity * dt;
    }
  },
};
