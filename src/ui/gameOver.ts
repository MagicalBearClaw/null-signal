/**
 * Game Over overlay (DESIGN.md §4.2): shown over the frozen level when the player dies.
 * Continue restarts the level (counted); Exit leaves it. Plain DOM over the canvas.
 *
 * The same panel announces a cleared level (`showCleared`) until the results screen
 * (MIC-87) takes over: Replay restarts the level, Exit leaves it.
 */

import type { UiNavigator } from './navigator';

export interface GameOverActions {
  onContinue(): void;
  onExit(): void;
}

export interface GameOverOverlay {
  /** Shows the overlay; `continues` is how many times this level has been continued so far. */
  show(continues: number): void;
  /** Shows the level-cleared variant. Its first button calls `onContinue` too. */
  showCleared(): void;
  hide(): void;
  readonly visible: boolean;
  dispose(): void;
}

const STYLE = `
.ns-gameover {
  position: absolute; inset: 0; display: none;
  align-items: center; justify-content: center; flex-direction: column; gap: 28px;
  background: radial-gradient(ellipse at center, rgba(40, 4, 2, 0.55), rgba(2, 4, 4, 0.9));
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #ff4a24;
  animation: ns-gameover-in 400ms ease-out;
}
.ns-gameover.open { display: flex; }
.ns-gameover h1 {
  margin: 0; font-size: clamp(32px, 7vw, 72px); letter-spacing: 0.3em; font-weight: 600;
  text-shadow: 0 0 12px #ff4a24, 0 0 32px rgba(255, 74, 36, 0.6);
}
.ns-gameover p { margin: 0; color: #c47a68; letter-spacing: 0.2em; font-size: 14px; }
.ns-gameover .buttons { display: flex; gap: 20px; }
.ns-gameover button {
  font: inherit; font-size: 18px; letter-spacing: 0.2em; padding: 10px 28px; cursor: pointer;
  color: #1de9b6; background: rgba(6, 32, 28, 0.8); border: 1px solid #1de9b6;
  box-shadow: 0 0 10px rgba(29, 233, 182, 0.35);
}
.ns-gameover button:hover, .ns-gameover button:focus-visible {
  outline: none; background: #1de9b6; color: #021210; box-shadow: 0 0 18px #1de9b6;
}
.ns-gameover.cleared {
  color: #1de9b6;
  background: radial-gradient(ellipse at center, rgba(2, 40, 32, 0.55), rgba(2, 4, 4, 0.9));
}
.ns-gameover.cleared h1 { text-shadow: 0 0 12px #1de9b6, 0 0 32px rgba(29, 233, 182, 0.6); }
.ns-gameover.cleared p { color: #6fbfa9; }
@keyframes ns-gameover-in { from { opacity: 0; } to { opacity: 1; } }
`;

export function createGameOverOverlay(
  root: HTMLElement,
  actions: GameOverActions,
  navigator: UiNavigator,
): GameOverOverlay {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'ns-gameover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'ns-gameover-title');
  el.innerHTML = `
    <h1 id="ns-gameover-title">SIGNAL LOST</h1>
    <p class="continues"></p>
    <div class="buttons">
      <button type="button" data-action="continue">CONTINUE</button>
      <button type="button" data-action="exit">EXIT</button>
    </div>`;
  root.appendChild(el);

  const continueBtn = el.querySelector<HTMLButtonElement>('[data-action="continue"]');
  const exitBtn = el.querySelector<HTMLButtonElement>('[data-action="exit"]');
  const continues = el.querySelector<HTMLParagraphElement>('.continues');
  const title = el.querySelector<HTMLHeadingElement>('h1');
  if (!continueBtn || !exitBtn || !continues || !title) throw new Error('game over markup is incomplete');

  const open_ = (cleared: boolean, detail: string) => {
    el.classList.toggle('cleared', cleared);
    title.textContent = cleared ? 'OBJECTIVE COMPLETE' : 'SIGNAL LOST';
    continueBtn.textContent = cleared ? 'REPLAY' : 'CONTINUE';
    continues.textContent = detail;
    el.classList.add('open');
    open = true;
    release ??= navigator.activate(el);
    continueBtn.focus();
  };

  let open = false;
  const close = (then: () => void) => () => {
    if (!open) return;
    overlay.hide();
    then();
  };
  continueBtn.addEventListener('click', close(actions.onContinue));
  exitBtn.addEventListener('click', close(actions.onExit));
  // arrows / d-pad move between the buttons (navigator); the game's own keys stay inert
  el.addEventListener('keydown', (e) => e.stopPropagation());
  let release: (() => void) | null = null;

  const overlay: GameOverOverlay = {
    show(count) {
      open_(false, count > 0 ? `CONTINUES  ${count}` : '');
    },
    showCleared() {
      open_(true, 'SIMULATION CLEARED');
    },
    hide() {
      el.classList.remove('open');
      open = false;
      release?.();
      release = null;
    },
    get visible() {
      return open;
    },
    dispose() {
      el.remove();
      style.remove();
    },
  };
  return overlay;
}
