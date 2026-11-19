import { PLAYER } from '../player/tuning';
import type { System } from '../sim';

/**
 * Emits a `footstep` noise every stride while an entity runs. Runs after `movement`, so
 * it measures the distance actually covered (running into a wall makes no noise).
 * Walking and crouching are silent; stopping resets the stride.
 */
export const footstepSystem: System = {
  name: 'footsteps',
  update({ world, events }) {
    for (const e of world.with('locomotion', 'transform', 'prevTransform')) {
      const loco = e.locomotion;
      if (!loco.running) {
        loco.travelled = 0;
        continue;
      }
      loco.travelled += Math.hypot(e.transform.x - e.prevTransform.x, e.transform.z - e.prevTransform.z);
      const id = world.id(e);
      while (loco.travelled >= PLAYER.footsteps.stride) {
        loco.travelled -= PLAYER.footsteps.stride;
        events.emit({
          type: 'noise',
          kind: 'footstep',
          at: { x: e.transform.x, z: e.transform.z },
          radius: PLAYER.footsteps.radius,
          ...(id === undefined ? {} : { source: id }),
        });
      }
    }
  },
};
