import type { AlertState } from '../events';
import type { System } from '../sim';

/**
 * The level-wide alert machine (DESIGN.md §8):
 *
 *   Normal → Suspicious → Alert → Evasion → Caution → Normal
 *
 * - Any guard spotting the player jumps straight to Alert from any state. Each entry
 *   into Alert is counted for the rating.
 * - Suspicious: something is being investigated. Times out back to Normal.
 * - Alert holds while anyone sees the player and drops to Evasion once nobody has seen
 *   them for `lostAfter` seconds. Every guard hunts the last known position.
 * - Evasion (everyone searches) and Caution (back on patrol, on edge) run down on timers.
 *
 * `stepAlert` is pure; `alertSystem` feeds it from the guards' blackboards.
 */

export const ALERT_TIMERS = {
  /** Suspicious falls back to Normal after this long with nothing being investigated. */
  suspicious: 6,
  /** Alert drops to Evasion after the player has been out of sight this long. */
  lostAfter: 4,
  evasion: 20,
  caution: 30,
} as const;

export interface AlertMachine {
  state: AlertState;
  /** Seconds left in a timed state (or until Alert gives up). */
  timer: number;
  /** Times the level has entered Alert. */
  alertCount: number;
}

export interface AlertInputs {
  /** At least one guard sees the player this tick. */
  readonly spotted: boolean;
  /** At least one guard is investigating something. */
  readonly investigating: boolean;
}

export function createAlertMachine(): AlertMachine {
  return { state: 'normal', timer: 0, alertCount: 0 };
}

/** Advances the machine by `dt`. Returns the previous state if it changed, else null. */
export function stepAlert(m: AlertMachine, input: AlertInputs, dt: number): AlertState | null {
  const from = m.state;
  const enter = (to: AlertState, timer: number) => {
    m.state = to;
    m.timer = timer;
    if (to === 'alert') m.alertCount++;
  };

  if (input.spotted) {
    if (m.state === 'alert') m.timer = ALERT_TIMERS.lostAfter;
    else enter('alert', ALERT_TIMERS.lostAfter);
    return from === m.state ? null : from;
  }

  m.timer = Math.max(0, m.timer - dt);
  switch (m.state) {
    case 'normal':
      if (input.investigating) enter('suspicious', ALERT_TIMERS.suspicious);
      break;
    case 'suspicious':
      if (input.investigating) m.timer = ALERT_TIMERS.suspicious;
      else if (m.timer === 0) enter('normal', 0);
      break;
    case 'alert':
      if (m.timer === 0) enter('evasion', ALERT_TIMERS.evasion);
      break;
    case 'evasion':
      if (m.timer === 0) enter('caution', ALERT_TIMERS.caution);
      break;
    case 'caution':
      if (m.timer === 0) enter('normal', 0);
      break;
  }
  return from === m.state ? null : from;
}

/**
 * Runs the alert machine once per tick after the guards have sensed and decided. Writes
 * the state into the squad blackboard (guards react next tick) and emits `alertChanged`.
 */
export const alertSystem: System = {
  name: 'alert',
  update({ world, squad, events }, dt) {
    let spotted = false;
    let investigating = false;
    for (const g of world.with('ai').without('dead')) {
      spotted ||= g.ai.blackboard.facts.seesPlayer;
      investigating ||= g.ai.state === 'investigate';
    }
    const from = stepAlert(squad.machine, { spotted, investigating }, dt);
    squad.alert = squad.machine.state;
    if (from) events.emit({ type: 'alertChanged', from, to: squad.machine.state });
  },
};
