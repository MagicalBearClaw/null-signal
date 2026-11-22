import type { z } from 'zod';
import type { SimEvent } from '../events';
import type { Level } from '../level/model';

/**
 * Level objectives (DESIGN.md §5). Each scenario type implements {@link Objective} and
 * registers an {@link ObjectiveType} in `registry.ts`; the level's `objective` map property
 * picks one. The objective system feeds it sim events and asks whether it is done.
 */

/** Rules an objective imposes on the rest of the sim. */
export interface ObjectiveRules {
  /** False: the player's weapons don't fire. */
  readonly weapons: boolean;
}

export interface Objective {
  readonly rules: ObjectiveRules;
  /** Called with every sim event, in order, one tick after it is emitted. */
  onEvent(e: SimEvent): void;
  /** Whether stepping into a goal zone counts. A locked goal ignores the player. */
  goalUnlocked(): boolean;
  isComplete(): boolean;
  isFailed(): boolean;
  /** One line for the HUD, e.g. "Collect drives 1/3". */
  hudText(): string;
}

/** The parts of a level an objective may read. */
export type ObjectiveLevel = Pick<Level, 'goals' | 'pickups' | 'guards'>;

export interface ObjectiveType<P> {
  /** Validates and defaults the `objectiveParams` map property. */
  readonly params: z.ZodType<P>;
  /** Checks that need the level too (e.g. enough items exist). Returns problems found. */
  check?(level: ObjectiveLevel, params: P): string[];
  init(level: ObjectiveLevel, params: P): Objective;
}

/** Goal zones every objective needs to finish on. */
export function needsGoal(level: ObjectiveLevel): string[] {
  return level.goals.length > 0 ? [] : ['objective: this objective needs at least one goal zone'];
}
