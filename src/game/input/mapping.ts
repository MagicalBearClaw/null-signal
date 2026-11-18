import type { Vec2 } from '../../sim/events';
import { BUTTON_ACTIONS, type ButtonAction, type InputSnapshot } from '../../sim/input';
import { DIRECTIONS, type Binding, type Bindings, type Direction } from './bindings';

/** Device state sampled once per tick, before any binding is applied. */
export interface RawInput {
  /** `KeyboardEvent.code`s that are down (or were tapped since the last sample). */
  readonly keys: ReadonlySet<string>;
  readonly mouseButtons: ReadonlySet<number>;
  /**
   * Pointer offset from the centre of the game view, in half-view units (±1 at the
   * shorter edge), +x right, +y down. Null until the pointer has entered the view.
   */
  readonly pointer: { readonly x: number; readonly y: number } | null;
  readonly pads: readonly RawPad[];
}

export interface RawPad {
  /** Button values 0..1 (triggers are analog). */
  readonly buttons: readonly number[];
  /** Standard mapping: 0/1 left stick x/y, 2/3 right stick x/y. +y is down. */
  readonly axes: readonly number[];
}

export const EMPTY_RAW: RawInput = { keys: new Set(), mouseButtons: new Set(), pointer: null, pads: [] };

export interface DeadzoneOptions {
  /** Stick deflection below this reads as zero (absorbs drift). */
  readonly inner: number;
  /** Deflection at or above this reads as full (worn sticks rarely reach 1.0). */
  readonly outer: number;
}

export const DEFAULT_DEADZONE: DeadzoneOptions = { inner: 0.2, outer: 0.95 };

/** Analog triggers count as pressed past this value. */
const PAD_BUTTON_THRESHOLD = 0.5;

/**
 * Radial, rescaled deadzone. Radial (on the vector's length, not per axis) keeps
 * diagonals smooth; rescaling maps [inner, outer] onto [0, 1] so movement ramps up from
 * zero at the edge of the deadzone instead of jumping to 20%.
 */
export function applyDeadzone(x: number, y: number, { inner, outer }: DeadzoneOptions): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= inner) return { x: 0, z: 0 };
  const scaled = Math.min(1, (len - inner) / (outer - inner));
  return { x: (x / len) * scaled, z: (y / len) * scaled };
}

function isDown(b: Binding, raw: RawInput): boolean {
  switch (b.device) {
    case 'key':
      return raw.keys.has(b.code);
    case 'mouse':
      return raw.mouseButtons.has(b.button);
    case 'pad':
      return raw.pads.some((p) => (p.buttons[b.button] ?? 0) > PAD_BUTTON_THRESHOLD);
  }
}

/** The stick with the largest deflection across all connected pads. */
function strongestStick(raw: RawInput, xAxis: number, deadzone: DeadzoneOptions): Vec2 {
  let best: Vec2 = { x: 0, z: 0 };
  for (const p of raw.pads) {
    const v = applyDeadzone(p.axes[xAxis] ?? 0, p.axes[xAxis + 1] ?? 0, deadzone);
    if (Math.hypot(v.x, v.z) > Math.hypot(best.x, best.z)) best = v;
  }
  return best;
}

export interface MappedInput {
  readonly move: Vec2;
  readonly look: Vec2 | null;
  readonly held: ReadonlySet<ButtonAction>;
}

/** Applies bindings to one raw sample. Pure. */
export function mapInput(raw: RawInput, bindings: Bindings, deadzone = DEFAULT_DEADZONE): MappedInput {
  const held = new Set<ButtonAction>();
  for (const action of BUTTON_ACTIONS) {
    if (bindings.buttons[action].some((b) => isDown(b, raw))) held.add(action);
  }

  const dir = (d: Direction) => (bindings.move[d].some((b) => isDown(b, raw)) ? 1 : 0);
  const [up, down, left, right] = DIRECTIONS.map(dir) as [number, number, number, number];
  const stick = strongestStick(raw, 0, deadzone);
  let x = right - left + stick.x;
  let z = down - up + stick.z;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }

  // The right stick wins while it is deflected; otherwise aim at the pointer.
  const rightStick = strongestStick(raw, 2, deadzone);
  const look =
    rightStick.x !== 0 || rightStick.z !== 0
      ? rightStick
      : raw.pointer && (raw.pointer.x !== 0 || raw.pointer.y !== 0)
        ? { x: raw.pointer.x, z: raw.pointer.y }
        : null;

  return { move: { x, z }, look, held };
}

/** Turns successive mapped samples into snapshots with pressed/released edges. */
export class SnapshotTracker {
  private previous: ReadonlySet<ButtonAction> = new Set();

  next(mapped: MappedInput): InputSnapshot {
    const pressed = new Set<ButtonAction>();
    const released = new Set<ButtonAction>();
    for (const a of mapped.held) if (!this.previous.has(a)) pressed.add(a);
    for (const a of this.previous) if (!mapped.held.has(a)) released.add(a);
    this.previous = mapped.held;
    return { move: mapped.move, look: mapped.look, held: mapped.held, pressed, released };
  }
}
