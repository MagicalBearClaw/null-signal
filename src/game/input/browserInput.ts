import type { RawInput, RawPad } from './mapping';

/** Keys the browser would otherwise act on (scroll, focus change, find, menus). */
const PREVENT_DEFAULT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export interface BrowserInputOptions {
  /** Receives keyboard events (usually `window`). */
  readonly keyTarget: EventTarget;
  /** The game view: receives mouse events and defines the pointer's centre. */
  readonly view: HTMLElement;
  /** Gamepad source; defaults to `navigator.getGamepads`. Injectable for tests. */
  readonly getGamepads?: () => readonly (Gamepad | null)[];
}

/**
 * Collects DOM keyboard/mouse events and polls the Gamepad API, producing one
 * {@link RawInput} per `sample()` (called once per sim tick).
 *
 * Taps shorter than a tick are latched: a key pressed and released between two samples
 * still reads as down for exactly one sample, so quick presses are never lost.
 */
export class BrowserInput {
  private readonly down = new Set<string>();
  private readonly tapped = new Set<string>();
  private readonly mouseDown = new Set<number>();
  private readonly mouseTapped = new Set<number>();
  private pointer: { x: number; y: number } | null = null;
  private readonly getGamepads: () => readonly (Gamepad | null)[];
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly options: BrowserInputOptions) {
    this.getGamepads = options.getGamepads ?? (() => navigator.getGamepads());
    const { keyTarget, view } = options;

    this.listen(keyTarget, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (PREVENT_DEFAULT.has(ke.code)) ke.preventDefault();
      if (ke.repeat) return;
      this.down.add(ke.code);
      this.tapped.add(ke.code);
    });
    this.listen(keyTarget, 'keyup', (e) => this.down.delete((e as KeyboardEvent).code));
    this.listen(keyTarget, 'blur', () => this.clear());

    this.listen(view, 'mousedown', (e) => {
      const me = e as MouseEvent;
      this.mouseDown.add(me.button);
      this.mouseTapped.add(me.button);
    });
    // Released anywhere, not just over the view, so a drag-out doesn't leave it stuck.
    this.listen(keyTarget, 'mouseup', (e) => this.mouseDown.delete((e as MouseEvent).button));
    this.listen(view, 'mousemove', (e) => this.trackPointer(e as MouseEvent));
    this.listen(view, 'contextmenu', (e) => e.preventDefault()); // right button = aim
  }

  sample(): RawInput {
    const keys = new Set([...this.down, ...this.tapped]);
    const mouseButtons = new Set([...this.mouseDown, ...this.mouseTapped]);
    this.tapped.clear();
    this.mouseTapped.clear();
    return { keys, mouseButtons, pointer: this.pointer, pads: this.pollPads() };
  }

  /** Releases everything (focus lost, tab hidden). */
  clear(): void {
    this.down.clear();
    this.tapped.clear();
    this.mouseDown.clear();
    this.mouseTapped.clear();
  }

  dispose(): void {
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
  }

  private trackPointer(e: MouseEvent): void {
    const r = this.options.view.getBoundingClientRect();
    const half = Math.min(r.width, r.height) / 2 || 1;
    this.pointer = {
      x: (e.clientX - (r.left + r.width / 2)) / half,
      y: (e.clientY - (r.top + r.height / 2)) / half,
    };
  }

  private pollPads(): RawPad[] {
    const pads: RawPad[] = [];
    for (const p of this.getGamepads()) {
      // Non-standard mappings have arbitrary button/axis layouts; ignore rather than guess.
      if (!p?.connected || p.mapping !== 'standard') continue;
      pads.push({ buttons: p.buttons.map((b) => b.value), axes: [...p.axes] });
    }
    return pads;
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }
}
