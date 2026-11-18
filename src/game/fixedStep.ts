/**
 * Accumulator-based fixed-timestep driver (DESIGN.md §2.1).
 *
 * Real frame time is fed in; the simulation is stepped in whole `stepSeconds` slices.
 * The leftover fraction becomes `alpha`, which the renderer uses to interpolate
 * between the previous and current sim states.
 *
 * Pure and DOM-free so it is fully unit-testable.
 */

export interface FixedStepOptions {
  /** Simulation step length in seconds (default 1/60). */
  readonly stepSeconds?: number;
  /**
   * Max sim steps per frame. Prevents the "spiral of death" when a frame takes
   * very long (tab switch, debugger pause): excess time is dropped, not replayed.
   */
  readonly maxStepsPerFrame?: number;
}

export interface AdvanceResult {
  /** Number of sim steps executed this frame. */
  readonly steps: number;
  /** Interpolation factor in [0, 1) between the previous and current sim state. */
  readonly alpha: number;
  /** Seconds discarded because the step cap was hit. */
  readonly droppedSeconds: number;
}

// Absorbs floating-point drift so a frame of exactly 1/60 s always yields one step.
const EPSILON = 1e-9;

export class FixedStepper {
  readonly stepSeconds: number;
  readonly maxStepsPerFrame: number;
  private accumulator = 0;
  private pausedFlag = false;

  constructor(options: FixedStepOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
    if (!(this.stepSeconds > 0)) throw new RangeError('stepSeconds must be > 0');
    if (!(this.maxStepsPerFrame >= 1)) throw new RangeError('maxStepsPerFrame must be >= 1');
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  /** Pausing freezes the sim; alpha stays where it was so the frame doesn't jitter. */
  pause(): void {
    this.pausedFlag = true;
  }

  resume(): void {
    this.pausedFlag = false;
  }

  /** Clears accumulated time, e.g. after a level load. */
  reset(): void {
    this.accumulator = 0;
  }

  advance(frameSeconds: number, step: (dt: number) => void): AdvanceResult {
    if (this.pausedFlag) {
      return { steps: 0, alpha: this.alpha(), droppedSeconds: 0 };
    }

    // Ignore clock glitches (negative / NaN / Infinity) rather than corrupting state.
    if (Number.isFinite(frameSeconds) && frameSeconds > 0) {
      this.accumulator += frameSeconds;
    }

    let steps = 0;
    while (this.accumulator + EPSILON >= this.stepSeconds && steps < this.maxStepsPerFrame) {
      step(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0; // EPSILON may overshoot slightly

    let droppedSeconds = 0;
    if (this.accumulator + EPSILON >= this.stepSeconds) {
      // Cap hit: keep only the sub-step remainder so interpolation stays smooth.
      const remainder = this.accumulator % this.stepSeconds;
      droppedSeconds = this.accumulator - remainder;
      this.accumulator = remainder;
    }

    return { steps, alpha: this.alpha(), droppedSeconds };
  }

  private alpha(): number {
    const a = this.accumulator / this.stepSeconds;
    return a < 0 ? 0 : a >= 1 ? 0 : a;
  }
}
