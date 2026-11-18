import { describe, expect, it } from 'vitest';
import { transform } from './components';
import { Sim, type System } from './sim';
import { movementSystem } from './systems/movement';

function recorder(name: string, log: string[]): System {
  return { name, update: () => log.push(name) };
}

describe('Sim', () => {
  it('runs systems in registration order every tick', () => {
    const log: string[] = [];
    const sim = new Sim([recorder('a', log), recorder('b', log), recorder('c', log)]);
    sim.step(1 / 60);
    sim.step(1 / 60);
    expect(log).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(sim.systemNames).toEqual(['a', 'b', 'c']);
    expect(sim.tick).toBe(2);
  });

  it('rejects duplicate system names', () => {
    expect(() => new Sim([recorder('a', []), recorder('a', [])])).toThrow(/Duplicate/);
  });

  it('flushes events after all systems, so they are visible to systems next tick', () => {
    const seenByReader: number[] = [];
    const emitter: System = {
      name: 'emitter',
      update: ({ events, tick }) => events.emit({ type: 'kill', target: tick }),
    };
    const reader: System = {
      name: 'reader',
      update: ({ events }) => {
        for (const e of events.ofType('kill')) seenByReader.push(e.target);
      },
    };
    // reader runs before emitter, so it sees the previous tick's events
    const sim = new Sim([reader, emitter]);
    const external: number[] = [];
    sim.events.on('kill', (e) => external.push(e.target));
    sim.step(1 / 60);
    expect(external).toEqual([0]);
    expect(seenByReader).toEqual([]);
    sim.step(1 / 60);
    expect(seenByReader).toEqual([0]);
    expect(external).toEqual([0, 1]);
  });

  it('snapshots prevTransform before systems mutate transform', () => {
    const sim = new Sim([movementSystem]);
    const e = sim.world.add({ transform: transform(0, 0), velocity: { x: 60, z: 0 } });
    sim.step(1 / 60);
    expect(e.prevTransform?.x).toBe(0);
    expect(e.transform.x).toBeCloseTo(1);
    sim.step(1 / 60);
    expect(e.prevTransform?.x).toBeCloseTo(1);
    expect(e.transform.x).toBeCloseTo(2);
  });
});

describe('movementSystem', () => {
  it('integrates velocity and angular velocity', () => {
    const sim = new Sim([movementSystem]);
    const e = sim.world.add({
      transform: transform(1, 1),
      velocity: { x: 2, z: -4 },
      angularVelocity: Math.PI,
    });
    sim.step(0.5);
    expect(e.transform).toMatchObject({ x: 2, z: -1 });
    expect(e.transform.yaw).toBeCloseTo(Math.PI / 2);
  });
});
