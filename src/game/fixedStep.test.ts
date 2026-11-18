import { describe, expect, it } from 'vitest';
import { FixedStepper } from './fixedStep';

const STEP = 1 / 60;

function run(stepper: FixedStepper, frameSeconds: number) {
  const dts: number[] = [];
  const result = stepper.advance(frameSeconds, (dt) => dts.push(dt));
  return { ...result, dts };
}

describe('FixedStepper', () => {
  it.each([
    ['exactly one step', STEP, 1],
    ['half a step', STEP / 2, 0],
    ['two and a half steps', STEP * 2.5, 2],
    ['zero', 0, 0],
  ])('%s → %d step(s)', (_label, frame, expected) => {
    expect(run(new FixedStepper(), frame).steps).toBe(expected);
  });

  it('runs exactly one step per frame at 60 fps over many frames (no float drift)', () => {
    const s = new FixedStepper();
    let total = 0;
    for (let i = 0; i < 6000; i++) {
      const { steps } = run(s, STEP);
      expect(steps).toBe(1);
      total += steps;
    }
    expect(total).toBe(6000);
  });

  it('alternates 0 and 1 steps at 120 fps', () => {
    const s = new FixedStepper();
    const steps = Array.from({ length: 8 }, () => run(s, STEP / 2).steps);
    expect(steps).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('passes the fixed dt to every step', () => {
    const { dts } = run(new FixedStepper(), STEP * 3);
    expect(dts).toEqual([STEP, STEP, STEP]);
  });

  it('carries the remainder forward as alpha', () => {
    const s = new FixedStepper();
    const r = run(s, STEP * 1.25);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.25, 6);
    const r2 = run(s, STEP * 0.75);
    expect(r2.steps).toBe(1);
    expect(r2.alpha).toBeCloseTo(0, 6);
  });

  it('caps steps per frame and drops the excess (spiral-of-death guard)', () => {
    const s = new FixedStepper({ maxStepsPerFrame: 5 });
    const r = run(s, 2); // 2 s hitch = 120 steps owed
    expect(r.steps).toBe(5);
    expect(r.droppedSeconds).toBeGreaterThan(1.8);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThan(1);
    // Next normal frame is back to one step, not a catch-up burst.
    expect(run(s, STEP).steps).toBe(1);
  });

  it('runs no steps while paused and keeps alpha frozen', () => {
    const s = new FixedStepper();
    const before = run(s, STEP * 1.5).alpha;
    s.pause();
    const r = run(s, 1);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(before, 6);
    s.resume();
    expect(run(s, STEP).steps).toBe(1);
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('ignores invalid frame time %d', (bad) => {
    const s = new FixedStepper();
    expect(run(s, bad).steps).toBe(0);
    expect(run(s, STEP).steps).toBe(1);
  });

  it('reset clears accumulated time', () => {
    const s = new FixedStepper();
    run(s, STEP * 0.9);
    s.reset();
    expect(run(s, STEP * 0.5).steps).toBe(0);
  });

  it('rejects invalid options', () => {
    expect(() => new FixedStepper({ stepSeconds: 0 })).toThrow(RangeError);
    expect(() => new FixedStepper({ maxStepsPerFrame: 0 })).toThrow(RangeError);
  });
});
