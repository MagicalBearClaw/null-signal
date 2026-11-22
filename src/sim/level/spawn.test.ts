import { describe, expect, it } from 'vitest';
import fixtureRaw from '../../../levels/maps/fixture.tmj?raw';
import tilesetRaw from '../../../levels/tilesets/semantics.tsj?raw';
import { EMPTY_INPUT } from '../input';
import { Sim } from '../sim';
import { movementSystem } from '../systems/movement';
import { playerInputSystem } from '../systems/playerInput';
import { PLAYER_COLLIDER, startLevel } from './spawn';
import { loadLevel } from './tiled';

const level = loadLevel(
  'fixture',
  JSON.parse(fixtureRaw) as unknown,
  () => JSON.parse(tilesetRaw) as unknown,
);

describe('startLevel', () => {
  it('sets the grid and spawns the player and guards', () => {
    const sim = new Sim([]);
    startLevel(sim, level);
    expect(sim.grid?.width).toBe(level.width);
    const [player] = sim.world.with('player', 'transform');
    expect(player?.transform).toMatchObject({ x: 1.5, z: 1.5, yaw: level.spawn.yaw });
    expect(player && 'collider' in player && player.collider).toEqual(PLAYER_COLLIDER);
    expect(sim.world.with('guard').size).toBe(level.guards.length);
    const cams = sim.world.with('camera', 'transform', 'vision').entities;
    expect(cams).toHaveLength(level.cameras.length);
    expect(cams[0]?.vision.range).toBe(level.cameras[0]?.range);
    expect(cams[0]?.camera.sweep).toBe(level.cameras[0]?.sweep);
  });

  it('replaces the previous run entirely', () => {
    const sim = new Sim([]);
    sim.world.add({ renderable: { kind: 'stray' } });
    sim.events.emit({ type: 'kill', target: 1 });
    startLevel(sim, level);
    startLevel(sim, level);
    expect(sim.world.with('player').size).toBe(1);
    expect(sim.world.with('renderable').entities.some((e) => e.renderable.kind === 'stray')).toBe(false);
    expect(sim.events.flush()).toEqual([]);
  });

  it('keeps the player inside the walls when walking into them', () => {
    const sim = new Sim([playerInputSystem, movementSystem]);
    startLevel(sim, level);
    const west = { ...EMPTY_INPUT, move: { x: -1, z: 0 } };
    for (let i = 0; i < 120; i++) sim.step(1 / 60, west); // 2 s ≈ 5 tiles of walking
    const [player] = sim.world.with('player', 'transform');
    // Spawn is at x 1.5 with a wall column at x ∈ [0, 1): stops flush at 1 + halfWidth.
    expect(player?.transform.x).toBeCloseTo(1 + PLAYER_COLLIDER.halfWidth);
  });
});
