import { pickInDirection, type Direction } from './menu/focusNav';
import { PadNavigator } from './menu/padNav';

/**
 * Keyboard and gamepad control for DOM overlays. An overlay `activate`s its root element
 * while shown; the topmost active root gets arrow keys / d-pad (move focus between its
 * buttons), Enter / A (press the focused button) and Escape / B (its `onBack`). Mouse
 * clicks work natively.
 */
export interface UiNavigator {
  /** Takes over navigation for `root` until the returned function is called. */
  activate(root: HTMLElement, options?: { onBack?: () => void }): () => void;
  /** Focuses the first focusable element in the active root. */
  focusFirst(): void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [data-nav]';
const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function createUiNavigator(
  getPads: () => readonly (Gamepad | null)[] = () => navigator.getGamepads?.() ?? [],
): UiNavigator {
  const stack: { root: HTMLElement; onBack?: (() => void) | undefined }[] = [];
  const pad = new PadNavigator();
  let raf = 0;
  let last = 0;

  const top = () => stack[stack.length - 1];
  const focusables = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );

  function focusFirst(): void {
    const t = top();
    if (t) focusables(t.root)[0]?.focus();
  }

  function move(dir: Direction): void {
    const t = top();
    if (!t) return;
    const items = focusables(t.root);
    const current = document.activeElement as HTMLElement | null;
    if (!current || !t.root.contains(current)) {
      items[0]?.focus();
      return;
    }
    const others = items.filter((el) => el !== current);
    const i = pickInDirection(
      current.getBoundingClientRect(),
      others.map((el) => el.getBoundingClientRect()),
      dir,
    );
    const next = others[i];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    }
  }

  function confirm(): void {
    const t = top();
    const current = document.activeElement as HTMLElement | null;
    if (t && current && t.root.contains(current)) current.click();
    else focusFirst();
  }

  function onKey(e: KeyboardEvent): void {
    const t = top();
    if (!t) return;
    const dir = KEY_DIRS[e.key];
    const typing =
      e.target instanceof HTMLInputElement && e.target.type !== 'file' && e.target.type !== 'range';
    if (dir && !typing) {
      move(dir);
      e.preventDefault();
    } else if (e.key === 'Escape' && t.onBack) {
      t.onBack();
      e.preventDefault();
    }
  }

  function poll(now: number): void {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    for (const intent of pad.update(getPads(), dt)) {
      if (intent === 'confirm') confirm();
      else if (intent === 'back') top()?.onBack?.();
      else move(intent);
    }
    raf = stack.length ? requestAnimationFrame(poll) : 0;
  }

  window.addEventListener('keydown', onKey, true);

  return {
    activate(root, options) {
      const entry = { root, onBack: options?.onBack };
      stack.push(entry);
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(poll);
      }
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    focusFirst,
  };
}
