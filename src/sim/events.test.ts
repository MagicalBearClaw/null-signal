import { describe, expect, it } from 'vitest';
import { EventBus, type SimEvent } from './events';

const noise: SimEvent = { type: 'noise', kind: 'knock', at: { x: 1, z: 2 }, radius: 4 };
const kill: SimEvent = { type: 'kill', target: 7 };

describe('EventBus', () => {
  it('holds emitted events until flush, then delivers them in emit order', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.onAny((e) => seen.push(e.type));
    bus.emit(noise);
    bus.emit(kill);
    expect(seen).toEqual([]);
    expect(bus.flush()).toEqual([noise, kill]);
    expect(seen).toEqual(['noise', 'kill']);
  });

  it('publishes the flushed batch as lastTick until the next flush', () => {
    const bus = new EventBus();
    bus.emit(noise);
    bus.flush();
    expect(bus.lastTick).toEqual([noise]);
    expect([...bus.ofType('noise')]).toEqual([noise]);
    expect([...bus.ofType('kill')]).toEqual([]);
    bus.flush();
    expect(bus.lastTick).toEqual([]);
  });

  it('routes typed listeners by event type only', () => {
    const bus = new EventBus();
    const kills: number[] = [];
    bus.on('kill', (e) => kills.push(e.target));
    bus.emit(noise);
    bus.emit(kill);
    bus.flush();
    expect(kills).toEqual([7]);
  });

  it('defers events emitted during dispatch to the next flush (no re-entrant loops)', () => {
    const bus = new EventBus();
    let calls = 0;
    bus.on('kill', () => {
      calls++;
      bus.emit(kill);
    });
    bus.emit(kill);
    bus.flush();
    expect(calls).toBe(1);
    bus.flush();
    expect(calls).toBe(2);
  });

  it('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    let n = 0;
    const off = bus.on('kill', () => n++);
    off();
    bus.emit(kill);
    bus.flush();
    expect(n).toBe(0);
  });

  it('clear drops pending and published events', () => {
    const bus = new EventBus();
    bus.emit(noise);
    bus.flush();
    bus.emit(kill);
    bus.clear();
    expect(bus.lastTick).toEqual([]);
    expect(bus.flush()).toEqual([]);
  });
});
