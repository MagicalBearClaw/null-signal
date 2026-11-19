import { transform, type Collider } from '../components';
import { PLAYER } from '../player/tuning';
import type { Sim } from '../sim';
import { createGrid, type Level } from './model';

/** Guard size is a placeholder until the AI tickets tune it. */
export const PLAYER_COLLIDER: Collider = {
  halfWidth: PLAYER.collider.halfWidth,
  halfDepth: PLAYER.collider.halfDepth,
  height: PLAYER.collider.standHeight,
};
export const GUARD_COLLIDER: Collider = { halfWidth: 0.3, halfDepth: 0.3, height: 1.7 };

/**
 * Replaces whatever the sim holds with a fresh run of `level`: new collision grid,
 * player at the spawn, one entity per guard. Other placements (cameras, doors, ...)
 * get entities as their systems are built.
 */
export function startLevel(sim: Sim, level: Level): void {
  sim.reset();
  sim.grid = createGrid(level);

  const { spawn } = level;
  sim.world.add({
    transform: transform(spawn.x, spawn.z, spawn.yaw),
    velocity: { x: 0, z: 0 },
    collider: { ...PLAYER_COLLIDER },
    stance: 'stand',
    locomotion: { running: false, travelled: 0 },
    renderable: { kind: 'player' },
    player: true,
  });

  for (const g of level.guards) {
    sim.world.add({
      transform: transform(g.x, g.z, g.yaw),
      velocity: { x: 0, z: 0 },
      collider: { ...GUARD_COLLIDER },
      renderable: { kind: 'guard' },
      guard: true,
    });
  }
}
