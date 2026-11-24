import { hudView, ObjectiveBanner, type HudInput } from './model';

/**
 * In-level HUD (DESIGN.md §3.4), plain DOM over the canvas: life bar top-left, alert
 * status with countdown top-right, and the objective line, shown briefly at level start
 * and whenever it changes. Reads sim state; never writes it.
 */
export interface Hud {
  /** Call once per rendered frame while a level runs. */
  update(input: HudInput, dt: number): void;
  /** A new run started: show the objective line again. */
  levelStarted(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const STYLE = `
.ns-hud { position: absolute; inset: 0; pointer-events: none; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #bfeee2; }
.ns-hud.hidden { display: none; }
.ns-hud .life { position: absolute; top: 18px; left: 18px; display: flex; flex-direction: column; gap: 6px; }
.ns-hud .life span { font-size: 11px; letter-spacing: 0.35em; color: #6fbfa9; }
.ns-hud .bar { position: relative; width: min(260px, 40vw); height: 12px; border: 1px solid #1de9b6; background: rgba(2, 12, 10, 0.7); box-shadow: 0 0 10px rgba(29, 233, 182, 0.25); }
.ns-hud .bar i { position: absolute; inset: 1px auto 1px 1px; background: linear-gradient(90deg, #12a888, #1de9b6); transition: width 120ms linear; }
.ns-hud .bar b { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(2, 12, 10, 0.9) calc(10% - 1px) 10%); }
.ns-hud .bar.low i { background: linear-gradient(90deg, #a8321a, #ff5a36); }
.ns-hud .bar.hit { animation: ns-hud-hit 260ms ease-out; }
@keyframes ns-hud-hit { 0% { box-shadow: 0 0 18px #ff5a36; border-color: #ff5a36; } 100% { box-shadow: 0 0 10px rgba(29, 233, 182, 0.25); } }
.ns-hud .status { position: absolute; top: 14px; right: 18px; text-align: right; padding: 8px 14px; border: 1px solid currentColor; background: rgba(2, 8, 8, 0.72); }
.ns-hud .status strong { display: block; font-size: 20px; letter-spacing: 0.3em; }
.ns-hud .status em { display: block; font-style: normal; font-size: 26px; letter-spacing: 0.08em; font-variant-numeric: tabular-nums; }
.ns-hud .status.alert { color: #ff4a24; text-shadow: 0 0 10px rgba(255, 74, 36, 0.7); animation: ns-hud-pulse 0.8s ease-in-out infinite alternate; }
.ns-hud .status.evasion { color: #ffb020; text-shadow: 0 0 10px rgba(255, 176, 32, 0.5); }
.ns-hud .status.caution { color: #1de9b6; text-shadow: 0 0 10px rgba(29, 233, 182, 0.5); }
@keyframes ns-hud-pulse { from { background: rgba(40, 6, 2, 0.75); } to { background: rgba(2, 8, 8, 0.72); } }
.ns-hud .objective { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); padding: 10px 22px; border-top: 1px solid #1de9b6; border-bottom: 1px solid #1de9b6;
  background: rgba(2, 12, 10, 0.75); font-size: 16px; letter-spacing: 0.25em; text-transform: uppercase; white-space: nowrap; transition: opacity 400ms ease; }
.ns-hud .objective.gone { opacity: 0; }
`;

export function createHud(root: HTMLElement): Hud {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'ns-hud hidden';
  el.innerHTML = `
    <div class="life"><span>LIFE</span><div class="bar" role="meter" aria-label="Life" aria-valuemin="0" aria-valuemax="100"><i></i><b></b></div></div>
    <div class="status" role="status" hidden><strong></strong><em></em></div>
    <div class="objective gone" aria-live="polite"></div>`;
  root.appendChild(el);

  const q = <T extends HTMLElement>(sel: string) => {
    const found = el.querySelector<T>(sel);
    if (!found) throw new Error(`HUD markup is missing ${sel}`);
    return found;
  };
  const bar = q('.bar');
  const fill = q('.bar i');
  const status = q('.status');
  const statusLabel = q('.status strong');
  const statusTime = q('.status em');
  const objective = q('.objective');
  const banner = new ObjectiveBanner();
  let lastLife = -1;

  return {
    update(input, dt) {
      const v = hudView(input);
      if (v.life !== lastLife) {
        if (lastLife >= 0 && v.life < lastLife) {
          bar.classList.remove('hit');
          void bar.offsetWidth; // restart the flash animation
          bar.classList.add('hit');
        }
        lastLife = v.life;
        fill.style.width = `calc(${(v.life * 100).toFixed(1)}% - 2px)`;
        bar.classList.toggle('low', v.life <= 0.25);
        bar.setAttribute('aria-valuenow', String(Math.round(v.life * 100)));
      }
      status.hidden = !v.status;
      if (v.status) {
        status.className = `status ${v.status.tone}`;
        statusLabel.textContent = v.status.label;
        statusTime.textContent = v.status.countdown;
      }
      const text = banner.update(v.objective, dt);
      if (text) objective.textContent = text;
      objective.classList.toggle('gone', !text);
    },
    levelStarted() {
      banner.replay();
      lastLife = -1;
    },
    setVisible(visible) {
      el.classList.toggle('hidden', !visible);
    },
    dispose() {
      el.remove();
      style.remove();
    },
  };
}
