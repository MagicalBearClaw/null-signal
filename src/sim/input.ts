import type { Vec2 } from './events';

/**
 * What the sim sees of player input: one immutable snapshot per tick. Devices,
 * bindings and DOM events live in `src/game/input/`; the sim only knows actions.
 */

export const BUTTON_ACTIONS = [
  'run',
  'crouch',
  /** Context action: CQC grab, interact, wall-press knock. */
  'action',
  'attack',
  /** First-person look / aim (held). */
  'aim',
  'weaponMenu',
  'itemMenu',
  'pause',
] as const;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export interface InputSnapshot {
  /**
   * Movement intent on the X/Z plane (+X east, +Z south), length ≤ 1. Analog sticks give
   * partial lengths (walk vs run by tilt); keys give 0 or 1.
   */
  readonly move: Vec2;
  /**
   * Aim direction on the X/Z plane, not normalized, or null when there's nothing to aim
   * with (no pointer yet and the right stick is centred). The overhead camera is
   * north-up, so screen right/down map straight to +X/+Z.
   */
  readonly look: Vec2 | null;
  /** Actions held this tick. */
  readonly held: ReadonlySet<ButtonAction>;
  /** Actions that went down this tick (were not held last tick). */
  readonly pressed: ReadonlySet<ButtonAction>;
  /** Actions that went up this tick. */
  readonly released: ReadonlySet<ButtonAction>;
}

const NONE: ReadonlySet<ButtonAction> = new Set();

export const EMPTY_INPUT: InputSnapshot = {
  move: { x: 0, z: 0 },
  look: null,
  held: NONE,
  pressed: NONE,
  released: NONE,
};
