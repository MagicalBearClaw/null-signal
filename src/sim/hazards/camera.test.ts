import { describe, expect, it } from 'vitest';
import { alertSystem } from '../ai/alert';
import { applyDamage } from '../combat/health';
import { createHealth } from '../combat/health';
import { transform } from '../components';
import type { EventOf } from '../events';
import { Grid } from '../grid/grid';
import { Sim } from '../sim';
import { CAMERA, cameraSystem, createCamera, stepSweep } from './camera';

const DT = 1 / 60;

describe('stepSweep', () => {
  it('sweeps between the two ends, holding at each for the pause', () => {
    const cam = createCamera(0, Math.PI / 2, 1);
    let yaw = 0;
    const yaws: number[] = [];
    for (let t = 0; t < 12; t += DT) {
      yaw = stepSweep(cam, yaw, DT);
      yaws.push(yaw);
    }
    const half = Math.PI / 4;
    expect(Math.max(...yaws)).toBeCloseTo(half);
    expect(Math.min(...yaws)).toBeCloseTo(-half);
    // holds at the +end for ~1 s: count ticks spent there
    const atEnd = yaws.filter((y) => Math.abs(y - half) < 1e-9).length;
    expect(atEnd * DT).toBeGreaterThanOrEqual(1);
    expect(atEnd * DT).toBeLessThan(2.1); // reached at most twice in 12 s
  });

  it('keeps a fixed camera on its facing', () => {
    const cam = createCamera(1, 0, 1);
    expect(stepSweep(cam, 1, 1)).toBe(1);
  });

  it('works around the ±π seam', () => {
    const cam = createCamera(Math.PI, Math.PI / 2, 0);
    let yaw = Math.PI;
    for (let t = 0; t < 5; t += DT) {
      yaw = stepSweep(cam, yaw, DT);
      // never strays more than half the arc from south
      expect(Math.abs(Math.atan2(Math.sin(yaw - Math.PI), Math.cos(yaw - Math.PI)))).toBeLessThanOrEqual(
        Math.PI / 4 + 1e-9,
      );
    }
  });
});

describe('cameraSystem', () => {
  /** Camera at the top of a room, facing south (yaw π) at the player 3 tiles away. */
  function setup(rows = ['.....', '.....', '.....', '.....', '.....'], sweep = 0) {
    const sim = new Sim([cameraSystem, alertSystem]);
    sim.grid = Grid.fromRows(rows);
    const camera = sim.world.add({
      transform: transform(2.5, 0.5, Math.PI),
      collider: { ...CAMERA.collider },
      vision: { fov: CAMERA.fov, range: 6 },
      health: createHealth(CAMERA.health),
      camera: createCamera(Math.PI, sweep, 1),
    });
    const player = sim.world.add({
      transform: transform(2.5, 3.5),
      stance: 'stand' as const,
      health: createHealth(100),
      player: true as const,
    });
    const spotted: EventOf<'spotted'>[] = [];
    sim.events.on('spotted', (e) => spotted.push(e));
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += DT) sim.step(DT);
    };
    return { sim, camera, player, spotted, run };
  }

  it('spots a player in view, raises Alert and records where they were', () => {
    const { sim, camera, spotted, run } = setup();
    run(2);
    expect(camera.camera.sees).toBe(true);
    expect(sim.squad.alert).toBe('alert');
    expect(sim.squad.lastKnownPlayer).toEqual({ x: 2.5, z: 3.5 });
    expect(spotted).toHaveLength(1); // once per sighting, not every tick
  });

  it('cannot see through walls', () => {
    const { sim, camera, run } = setup(['.....', '.....', '#####', '.....', '.....']);
    run(3);
    expect(camera.camera.sees).toBe(false);
    expect(sim.squad.alert).toBe('normal');
  });

  it('locks on and stops sweeping while it sees the player', () => {
    const { camera, run } = setup(undefined, Math.PI / 3);
    run(2);
    expect(camera.camera.sees).toBe(true);
    const yaw = camera.transform.yaw;
    run(1);
    expect(camera.transform.yaw).toBe(yaw);
  });

  it('is blind and still while disabled, then wakes up', () => {
    const { sim, camera, run } = setup(undefined, Math.PI / 3);
    camera.camera.disabledFor = 2;
    const yaw = camera.transform.yaw;
    run(1.9);
    expect(camera.camera.sees).toBe(false);
    expect(camera.transform.yaw).toBe(yaw);
    expect(sim.squad.alert).toBe('normal');
    run(2);
    expect(camera.camera.disabledFor).toBe(0);
    expect(camera.camera.sees).toBe(true);
  });

  it('can be shot out, which stops it watching and clears the alert input', () => {
    const { sim, camera, run } = setup();
    run(2);
    const result = applyDamage(sim.world, sim.events, camera, CAMERA.health);
    expect(result.lethal).toBe(true);
    run(0.1);
    expect(camera.dead).toBe(true);
    // Alert holds for lostAfter, then falls to Evasion: nobody sees the player any more
    run(5);
    expect(sim.squad.alert).toBe('evasion');
  });
});
