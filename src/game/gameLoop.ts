import { FixedStepper, type FixedStepOptions } from './fixedStep';

/** Advances the simulation by one fixed step of `dt` seconds. */
export type StepFn = (dt: number) => void;
/** Draws the current frame; `alpha` interpolates between previous and current sim state. */
export type RenderFn = (alpha: number) => void;

/** Injectable timing sources so the loop can be driven by tests. */
export interface LoopScheduler {
  now(): number; // milliseconds
  request(cb: () => void): number;
  cancel(handle: number): void;
}

export const browserScheduler: LoopScheduler = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

/**
 * Drives sim + render each animation frame: sim at a fixed rate via FixedStepper,
 * render once per frame with interpolation alpha. Pause freezes the sim but keeps
 * rendering (menus drawn over a frozen world).
 */
export class GameLoop {
  private readonly stepper: FixedStepper;
  private handle: number | null = null;
  private last = 0;

  constructor(
    private readonly step: StepFn,
    private readonly render: RenderFn,
    options: FixedStepOptions = {},
    private readonly scheduler: LoopScheduler = browserScheduler,
  ) {
    this.stepper = new FixedStepper(options);
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get paused(): boolean {
    return this.stepper.paused;
  }

  start(): void {
    if (this.handle !== null) return;
    this.last = this.scheduler.now();
    this.handle = this.scheduler.request(this.frame);
  }

  stop(): void {
    if (this.handle === null) return;
    this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  pause(): void {
    this.stepper.pause();
  }

  resume(): void {
    this.stepper.resume();
  }

  /** Call after loading a level so load time isn't simulated. */
  resetClock(): void {
    this.last = this.scheduler.now();
    this.stepper.reset();
  }

  private readonly frame = (): void => {
    const now = this.scheduler.now();
    const frameSeconds = (now - this.last) / 1000;
    this.last = now;
    const { alpha } = this.stepper.advance(frameSeconds, this.step);
    this.render(alpha);
    if (this.handle !== null) this.handle = this.scheduler.request(this.frame);
  };
}
