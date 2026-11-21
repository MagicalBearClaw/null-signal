/**
 * Seeded pseudo-random numbers for the sim (mulberry32). Gameplay randomness must come
 * from here, never `Math.random`, so a level replays identically from the same seed and
 * inputs (tests, replays, bug reports).
 */
export class Rng {
  private state: number;

  constructor(seed = 0x5eed) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [-1, 1). */
  signed(): number {
    return this.next() * 2 - 1;
  }
}
