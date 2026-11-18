import { z } from 'zod';
import { BUTTON_ACTIONS, type ButtonAction } from '../../sim/input';

/**
 * Physical input → action bindings. Plain data, so Settings can show, edit and persist
 * them. Codes are `KeyboardEvent.code` (layout-independent: WASD stays put on AZERTY),
 * `MouseEvent.button`, and W3C "standard" gamepad button indices.
 */

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type Binding =
  | { readonly device: 'key'; readonly code: string }
  | { readonly device: 'mouse'; readonly button: number }
  | { readonly device: 'pad'; readonly button: number };

export interface Bindings {
  readonly buttons: Readonly<Record<ButtonAction, readonly Binding[]>>;
  /** Digital movement (keys, d-pad). The left stick always moves too. */
  readonly move: Readonly<Record<Direction, readonly Binding[]>>;
}

const key = (code: string): Binding => ({ device: 'key', code });
const mouse = (button: number): Binding => ({ device: 'mouse', button });
const pad = (button: number): Binding => ({ device: 'pad', button });

/** Standard-mapping gamepad button indices. */
export const PAD = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export const DEFAULT_BINDINGS: Bindings = {
  buttons: {
    run: [key('ShiftLeft'), pad(PAD.leftStick)],
    crouch: [key('KeyC'), key('ControlLeft'), pad(PAD.east)],
    action: [key('KeyE'), key('Space'), pad(PAD.south)],
    attack: [mouse(0), key('KeyF'), pad(PAD.rightTrigger)],
    aim: [mouse(2), key('KeyQ'), pad(PAD.leftTrigger)],
    weaponMenu: [key('KeyR'), pad(PAD.rightBumper)],
    itemMenu: [key('Tab'), pad(PAD.leftBumper)],
    pause: [key('Escape'), key('KeyP'), pad(PAD.start)],
  },
  move: {
    up: [key('KeyW'), key('ArrowUp'), pad(PAD.dpadUp)],
    down: [key('KeyS'), key('ArrowDown'), pad(PAD.dpadDown)],
    left: [key('KeyA'), key('ArrowLeft'), pad(PAD.dpadLeft)],
    right: [key('KeyD'), key('ArrowRight'), pad(PAD.dpadRight)],
  },
};

export function sameBinding(a: Binding, b: Binding): boolean {
  if (a.device !== b.device) return false;
  return a.device === 'key' ? a.code === (b as typeof a).code : a.button === (b as typeof a).button;
}

export type BindTarget =
  | { readonly kind: 'button'; readonly action: ButtonAction }
  | { readonly kind: 'move'; readonly direction: Direction };

/**
 * Returns new bindings with `binding` added to `target` and removed from every other
 * action, so one physical input never triggers two actions.
 */
export function rebind(bindings: Bindings, target: BindTarget, binding: Binding): Bindings {
  const without = (list: readonly Binding[]) => list.filter((b) => !sameBinding(b, binding));
  const buttons = Object.fromEntries(
    BUTTON_ACTIONS.map((a) => {
      const list = without(bindings.buttons[a]);
      return [a, target.kind === 'button' && target.action === a ? [...list, binding] : list];
    }),
  ) as Record<ButtonAction, Binding[]>;
  const move = Object.fromEntries(
    DIRECTIONS.map((d) => {
      const list = without(bindings.move[d]);
      return [d, target.kind === 'move' && target.direction === d ? [...list, binding] : list];
    }),
  ) as Record<Direction, Binding[]>;
  return { buttons, move };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const BINDINGS_VERSION = 1;

const BindingSchema = z.discriminatedUnion('device', [
  z.object({ device: z.literal('key'), code: z.string().min(1) }),
  z.object({ device: z.literal('mouse'), button: z.number().int().min(0) }),
  z.object({ device: z.literal('pad'), button: z.number().int().min(0) }),
]);

const SavedSchema = z.object({
  version: z.literal(BINDINGS_VERSION),
  // Plain string keys: unknown actions (from a newer or older build) are ignored, not errors.
  buttons: z.record(z.string(), z.array(BindingSchema)),
  move: z.record(z.string(), z.array(BindingSchema)),
});

export function serializeBindings(bindings: Bindings): string {
  return JSON.stringify({ version: BINDINGS_VERSION, ...bindings });
}

/**
 * Parses saved bindings. Actions missing from the save (e.g. added in a later version of
 * the game) get their defaults. Unknown actions are dropped. Throws on malformed data so
 * the caller can decide to reset.
 */
export function parseBindings(json: string): Bindings {
  const saved = SavedSchema.parse(JSON.parse(json));
  const buttons = Object.fromEntries(
    BUTTON_ACTIONS.map((a) => [a, saved.buttons[a] ?? DEFAULT_BINDINGS.buttons[a]]),
  ) as Record<ButtonAction, Binding[]>;
  const move = Object.fromEntries(
    DIRECTIONS.map((d) => [d, saved.move[d] ?? DEFAULT_BINDINGS.move[d]]),
  ) as Record<Direction, Binding[]>;
  return { buttons, move };
}
