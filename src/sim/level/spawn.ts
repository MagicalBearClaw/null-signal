import { GUARD } from '../ai/tuning';
import { createAiState } from '../ai/types';
import { createHealth } from '../combat/health';
import { transform, type Collider } from '../components';
import { CAMERA, createCamera } from '../hazards/camera';
import { createDoor } from '../hazards/doors';
import { createInventory } from '../items/pickups';
import { createGoalZone } from '../objectives/objectiveSystem';
import { createObjective } from '../objectives/registry';
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
 * player at the spawn, the objective, one entity per guard, camera, door, goal and pickup. Other placements
 * get entities as their systems are built.
 */
export function startLevel(sim: Sim, level: Level): void {
  sim.reset();
  sim.grid = createGrid(level);
  sim.objective = { objective: createObjective(level.objective, level), status: 'active' };

  const { spawn } = level;
  const player = sim.world.add({
    transform: transform(spawn.x, spawn.z, spawn.yaw),
    velocity: { x: 0, z: 0 },
    collider: { ...PLAYER_COLLIDER },
    stance: 'stand',
    locomotion: { running: false, travelled: 0 },
    health: { ...createHealth(PLAYER.health.max), invulnerableFor: PLAYER.health.invulnerableFor },
    inventory: createInventory(),
    renderable: { kind: 'player' },
    player: true,
  });
  sim.events.emit({ type: 'levelStarted', player: sim.world.id(player) ?? -1 });

  for (const g of level.guards) {
    sim.world.add({
      transform: transform(g.x, g.z, g.yaw),
      velocity: { x: 0, z: 0 },
      collider: { ...GUARD_COLLIDER },
      renderable: { kind: 'guard' },
      guard: true,
      vision: { fov: GUARD.vision.fov, range: GUARD.vision.range },
      health: createHealth(GUARD.health),
      ai: createAiState(g.patrol, { x: g.x, z: g.z, yaw: g.yaw }, g.patrolStyle),
    });
  }

  for (const c of level.cameras) {
    sim.world.add({
      transform: transform(c.x, c.z, c.yaw),
      collider: { ...CAMERA.collider },
      renderable: { kind: 'camera' },
      vision: { fov: CAMERA.fov, range: c.range },
      health: createHealth(CAMERA.health),
      camera: createCamera(c.yaw, c.sweep, c.pause),
    });
  }

  for (const d of level.doors) {
    sim.world.add({
      transform: transform(d.tileX + 0.5, d.tileZ + 0.5),
      door: createDoor(d.tileX, d.tileZ, d.keycard),
    });
  }

  for (const g of level.goals) {
    sim.world.add({
      transform: transform(g.x + g.width / 2, g.z + g.depth / 2),
      goal: createGoalZone(g),
      renderable: { kind: 'goal' },
    });
  }

  for (const p of level.pickups) {
    sim.world.add({
      transform: transform(p.x, p.z),
      pickup: { item: p.item, amount: p.amount },
      renderable: { kind: 'pickup' },
    });
  }
}
