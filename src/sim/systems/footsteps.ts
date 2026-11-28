import { PLAYER } from '../player/tuning';
import type { System } from '../sim';

/**
 * Emits a `footstep` noise every stride while an entity walks or runs upright. Running
 * carries further than walking; crouching and crawling are silent. Runs after
 * `movement`, so it measures the distance actually covered (pushing into a wall makes no
 * noise). Going quiet or stopping resets the stride.
 */
export const footstepSystem: System = {
  name: 'footsteps',
  update({ world, events }) {
    for (const e of world.with('locomotion', 'transform', 'prevTransform')) {
      const loco = e.locomotion;
      const upright = (e.stance ?? 'stand') === 'stand';
      const moved = Math.hypot(e.transform.x - e.prevTransform.x, e.transform.z - e.prevTransform.z);
      if (!upright || moved === 0) {
        loco.travelled = 0;
        continue;
      }
      loco.travelled += moved;
      const radius = loco.running ? PLAYER.footsteps.runRadius : PLAYER.footsteps.walkRadius;
      const id = world.id(e);
      while (loco.travelled >= PLAYER.footsteps.stride) {
        loco.travelled -= PLAYER.footsteps.stride;
        events.emit({
          type: 'noise',
          kind: 'footstep',
          at: { x: e.transform.x, z: e.transform.z },
          radius,
          ...(id === undefined ? {} : { source: id }),
        });
      }
    }
  },
};
