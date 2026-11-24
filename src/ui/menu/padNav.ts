import type { Direction } from './focusNav';

/** What a gamepad asks of the menus this frame. */
export type PadIntent = Direction | 'confirm' | 'back';

/** The parts of a `Gamepad` the menus read (standard mapping). */
export interface PadState {
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

const STICK = 0.5;
const REPEAT_DELAY = 0.4;
const REPEAT_RATE = 0.12;

function held(pad: PadState): Set<PadIntent> {
  const b = (i: number) => pad.buttons[i]?.pressed === true;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  const s = new Set<PadIntent>();
  if (b(12) || y < -STICK) s.add('up');
  if (b(13) || y > STICK) s.add('down');
  if (b(14) || x < -STICK) s.add('left');
  if (b(15) || x > STICK) s.add('right');
  if (b(0)) s.add('confirm');
  if (b(1)) s.add('back');
  return s;
}

/**
 * Turns polled gamepad state into menu intents: buttons fire once per press, directions
 * fire on press and then repeat while held, like a keyboard.
 */
export class PadNavigator {
  private prev = new Set<PadIntent>();
  private heldFor = new Map<Direction, number>();

  /** Intents for this frame. `pads` are the connected gamepads; `dt` is in seconds. */
  update(pads: readonly (PadState | null)[], dt: number): PadIntent[] {
    const now = new Set<PadIntent>();
    for (const p of pads) if (p) for (const i of held(p)) now.add(i);
    const out: PadIntent[] = [];
    for (const i of now) {
      if (i === 'confirm' || i === 'back') {
        if (!this.prev.has(i)) out.push(i);
        continue;
      }
      const t = this.heldFor.get(i);
      if (t === undefined) {
        out.push(i);
        this.heldFor.set(i, -REPEAT_DELAY);
      } else {
        let next = t + dt;
        if (next >= REPEAT_RATE) {
          out.push(i);
          next -= REPEAT_RATE;
        }
        this.heldFor.set(i, next);
      }
    }
    for (const d of [...this.heldFor.keys()]) if (!now.has(d)) this.heldFor.delete(d);
    this.prev = now;
    return out;
  }
}
