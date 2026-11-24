import type { AlertState } from '../../sim/events';

/** What the HUD reads from the sim each frame (plain data, so it is easy to test). */
export interface HudInput {
  readonly health: { readonly current: number; readonly max: number } | null;
  readonly alert: { readonly state: AlertState; readonly timer: number };
  /** The objective's HUD line, or null outside a level. */
  readonly objective: string | null;
}

export type AlertTone = 'alert' | 'evasion' | 'caution';

export interface HudView {
  /** 0..1 */
  readonly life: number;
  /** Null hides the status panel (Normal, Suspicious). */
  readonly status: { readonly label: string; readonly tone: AlertTone; readonly countdown: string } | null;
  readonly objective: string | null;
}

const LABELS: Partial<Record<AlertState, [string, AlertTone]>> = {
  alert: ['ALERT', 'alert'],
  evasion: ['EVASION', 'evasion'],
  caution: ['CAUTION', 'caution'],
};

/** Seconds as `SS.cc` (hundredths), the countdown format on the status panel. */
export function formatCountdown(seconds: number): string {
  const cs = Math.max(0, Math.ceil(seconds * 100));
  return `${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/**
 * Turns sim state into what the HUD shows. Suspicious stays off the HUD on purpose: the
 * player should read a guard's curiosity from the guard, not from a banner.
 */
export function hudView(input: HudInput): HudView {
  const h = input.health;
  const life = h && h.max > 0 ? Math.min(1, Math.max(0, h.current / h.max)) : 0;
  const label = LABELS[input.alert.state];
  return {
    life,
    status: label ? { label: label[0], tone: label[1], countdown: formatCountdown(input.alert.timer) } : null,
    objective: input.objective,
  };
}

/** How long the objective line stays up after the level starts or the text changes. */
export const OBJECTIVE_SHOW_SECONDS = 4;

/** Decides when the objective banner is visible: at start and briefly on each change. */
export class ObjectiveBanner {
  private text: string | null = null;
  private left = 0;

  /** Feed the current objective line once per frame; returns the text to show, or null. */
  update(text: string | null, dt: number): string | null {
    if (text !== this.text) {
      this.text = text;
      this.left = text ? OBJECTIVE_SHOW_SECONDS : 0;
    } else {
      this.left = Math.max(0, this.left - dt);
    }
    return this.left > 0 ? this.text : null;
  }

  /** Shows the current line again from the start (a new run of the level). */
  replay(): void {
    this.text = null;
  }
}
