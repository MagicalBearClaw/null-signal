import { describe, expect, it } from 'vitest';
import { GameLoop, type LoopScheduler } from './gameLoop';

/** Manual scheduler: tick(ms) advances the clock and fires the pending frame. */
function fakeScheduler() {
  let time = 0;
  let pending: (() => void) | null = null;
  let nextHandle = 1;
  const scheduler: LoopScheduler = {
    now: () => time,
    request: (cb) => {
      pending = cb;
      return nextHandle++;
    },
    cancel: () => {
      pending = null;
    },
  };
  const tick = (ms: number) => {
    time += ms;
    const cb = pending;
    pending = null;
    cb?.();
  };
  /** Moves the clock without firing a frame (e.g. a blocking level load). */
  const advanceClock = (ms: number) => {
    time += ms;
  };
  return { scheduler, tick, advanceClock, hasPending: () => pending !== null };
}

describe('GameLoop', () => {
  it('steps the sim at a fixed rate and renders once per frame', () => {
    const { scheduler, tick } = fakeScheduler();
    let steps = 0;
    const alphas: number[] = [];
    const loop = new GameLoop(
      () => steps++,
      (a) => alphas.push(a),
      {},
      scheduler,
    );
    loop.start();
    for (let i = 0; i < 10; i++) tick(1000 / 30); // 30 fps display
    expect(steps).toBe(20); // 60 Hz sim
    expect(alphas).toHaveLength(10);
  });

  it('keeps rendering but stops stepping while paused', () => {
    const { scheduler, tick } = fakeScheduler();
    let steps = 0;
    let renders = 0;
    const loop = new GameLoop(
      () => steps++,
      () => renders++,
      {},
      scheduler,
    );
    loop.start();
    loop.pause();
    for (let i = 0; i < 5; i++) tick(1000 / 60);
    expect(steps).toBe(0);
    expect(renders).toBe(5);
    loop.resume();
    tick(1000 / 60);
    expect(steps).toBe(1);
  });

  it('stop cancels the pending frame', () => {
    const { scheduler, hasPending } = fakeScheduler();
    const loop = new GameLoop(
      () => {},
      () => {},
      {},
      scheduler,
    );
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(hasPending()).toBe(false);
  });

  it('resetClock prevents simulating load time', () => {
    const { scheduler, tick, advanceClock } = fakeScheduler();
    let steps = 0;
    const loop = new GameLoop(
      () => steps++,
      () => {},
      { maxStepsPerFrame: 1000 },
      scheduler,
    );
    loop.start();
    advanceClock(3000); // 3 s level load before the next frame
    loop.resetClock();
    tick(0);
    expect(steps).toBe(0);
  });
});
