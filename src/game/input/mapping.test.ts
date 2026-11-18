import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, PAD } from './bindings';
import { applyDeadzone, EMPTY_RAW, mapInput, SnapshotTracker, type RawInput, type RawPad } from './mapping';

const raw = (over: Partial<RawInput>): RawInput => ({ ...EMPTY_RAW, ...over });
const keys = (...codes: string[]) => raw({ keys: new Set(codes) });
const padWith = (over: { buttons?: Record<number, number>; axes?: number[] }): RawPad => {
  const buttons = Array.from({ length: 17 }, (_, i) => over.buttons?.[i] ?? 0);
  return { buttons, axes: over.axes ?? [0, 0, 0, 0] };
};
const map = (r: RawInput) => mapInput(r, DEFAULT_BINDINGS);

describe('applyDeadzone', () => {
  const dz = { inner: 0.2, outer: 0.9 };

  it('zeroes small deflections (stick drift)', () => {
    expect(applyDeadzone(0.1, -0.1, dz)).toEqual({ x: 0, z: 0 });
  });

  it('rescales so output ramps from 0 at the inner edge to 1 at the outer edge', () => {
    expect(applyDeadzone(0.55, 0, dz).x).toBeCloseTo(0.5);
    expect(applyDeadzone(0.9, 0, dz).x).toBeCloseTo(1);
    expect(applyDeadzone(1, 0, dz).x).toBeCloseTo(1); // clamped
  });

  it('is radial: a diagonal keeps its direction and is not cut by per-axis zeroing', () => {
    const v = applyDeadzone(0.18, 0.18, dz); // each axis < inner, but length ≈ 0.25
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeCloseTo(v.z);
  });
});

describe('mapInput', () => {
  it('maps keys to held actions', () => {
    expect([...map(keys('ShiftLeft', 'KeyE')).held].sort()).toEqual(['action', 'run']);
  });

  it('maps mouse buttons and analog pad triggers past the threshold', () => {
    expect(map(raw({ mouseButtons: new Set([0, 2]) })).held).toEqual(new Set(['attack', 'aim']));
    const half = map(raw({ pads: [padWith({ buttons: { [PAD.rightTrigger]: 0.4 } })] }));
    expect(half.held.has('attack')).toBe(false);
    const full = map(raw({ pads: [padWith({ buttons: { [PAD.rightTrigger]: 0.8 } })] }));
    expect(full.held.has('attack')).toBe(true);
  });

  it('normalizes diagonal key movement to length 1', () => {
    const { move } = map(keys('KeyW', 'KeyD'));
    expect(move.x).toBeCloseTo(Math.SQRT1_2);
    expect(move.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('cancels opposite directions', () => {
    expect(map(keys('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight')).move).toEqual({ x: 0, z: 0 });
  });

  it('keeps partial stick tilt for analog walk speed', () => {
    const { move } = map(raw({ pads: [padWith({ axes: [0, 0.575, 0, 0] })] }));
    expect(move.x).toBe(0);
    expect(move.z).toBeCloseTo(0.5);
  });

  it('combines keys and stick without exceeding length 1', () => {
    const { move } = map(raw({ keys: new Set(['KeyD']), pads: [padWith({ axes: [1, 0, 0, 0] })] }));
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(1);
  });

  it('uses the most deflected stick across several pads', () => {
    const { move } = map(
      raw({ pads: [padWith({ axes: [0.3, 0, 0, 0] }), padWith({ axes: [-1, 0, 0, 0] })] }),
    );
    expect(move.x).toBeCloseTo(-1);
  });

  it('aims with the right stick when deflected, else the pointer, else null', () => {
    expect(map(EMPTY_RAW).look).toBeNull();
    const pointer = { x: 0.5, y: -0.25 };
    expect(map(raw({ pointer })).look).toEqual({ x: 0.5, z: -0.25 });
    const stick = map(raw({ pointer, pads: [padWith({ axes: [0, 0, 0, 1] })] })).look;
    expect(stick?.x).toBeCloseTo(0);
    expect(stick?.z).toBeCloseTo(1);
    expect(map(raw({ pointer: { x: 0, y: 0 } })).look).toBeNull(); // dead centre has no direction
  });
});

describe('SnapshotTracker', () => {
  it('reports pressed on the first tick, held while down, released on the tick after', () => {
    const t = new SnapshotTracker();
    const s1 = t.next(map(keys('KeyF')));
    expect([s1.held.has('attack'), s1.pressed.has('attack'), s1.released.has('attack')]).toEqual([
      true,
      true,
      false,
    ]);
    const s2 = t.next(map(keys('KeyF')));
    expect([s2.held.has('attack'), s2.pressed.has('attack')]).toEqual([true, false]);
    const s3 = t.next(map(EMPTY_RAW));
    expect([s3.held.has('attack'), s3.released.has('attack')]).toEqual([false, true]);
    const s4 = t.next(map(EMPTY_RAW));
    expect(s4.released.size).toBe(0);
  });

  it('two bindings for one action count as one press', () => {
    const t = new SnapshotTracker();
    t.next(map(keys('KeyF')));
    const s = t.next(map(raw({ keys: new Set(['KeyF']), mouseButtons: new Set([0]) })));
    expect(s.pressed.has('attack')).toBe(false);
  });

  it('carries move and look through', () => {
    const s = new SnapshotTracker().next(map(raw({ keys: new Set(['KeyS']), pointer: { x: 1, y: 0 } })));
    expect(s.move).toEqual({ x: 0, z: 1 });
    expect(s.look).toEqual({ x: 1, z: 0 });
  });
});
