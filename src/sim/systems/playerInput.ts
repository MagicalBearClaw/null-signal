import type { System } from '../sim';

/** Placeholder speeds in tiles/second until the moveset ticket tunes stances. */
export const WALK_SPEED = 2.5;
export const RUN_SPEED = 5;

/**
 * Turns the tick's input snapshot into player velocity. Runs before `movement`.
 * Minimal on purpose: stances, facing and collision arrive with the core moveset.
 */
export const playerInputSystem: System = {
  name: 'playerInput',
  update({ world, input }) {
    const speed = input.held.has('run') ? RUN_SPEED : WALK_SPEED;
    for (const e of world.with('player', 'velocity')) {
      e.velocity.x = input.move.x * speed;
      e.velocity.z = input.move.z * speed;
    }
  },
};
