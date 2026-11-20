import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import type { AlertState, EventOf } from '../events';
import { Grid } from '../grid/grid';
import { Sim } from '../sim';
import { GUARD_ACTIONS } from './actions';
import { createAiSystem } from './aiSystem';
import { ALERT_TIMERS, alertSystem, createAlertMachine, stepAlert, type AlertInputs } from './alert';
import { createGuardBrain } from './guardBrain';
import { createAiState, type Agent, type Sensor } from './types';

const QUIET: AlertInputs = { spotted: false, investigating: false };
const SEEN: AlertInputs = { spotted: true, investigating: false };
const CURIOUS: AlertInputs = { spotted: false, investigating: true };

/** Steps the machine `seconds` of quiet in small ticks and returns the visited states. */
function quiet(m: ReturnType<typeof createAlertMachine>, seconds: number, input = QUIET): AlertState[] {
  const seen: AlertState[] = [];
  for (let t = 0; t < seconds; t += 0.1) {
    stepAlert(m, input, 0.1);
    if (seen.at(-1) !== m.state) seen.push(m.state);
  }
  return seen;
}

describe('stepAlert', () => {
  it('starts Normal with no alerts counted', () => {
    expect(createAlertMachine()).toEqual({ state: 'normal', timer: 0, alertCount: 0 });
  });

  it('Normal → Suspicious while a guard investigates, and back after the timeout', () => {
    const m = createAlertMachine();
    expect(stepAlert(m, CURIOUS, 0.1)).toBe('normal');
    expect(m.state).toBe('suspicious');
    quiet(m, 3, CURIOUS); // investigating keeps it suspicious
    expect(m.state).toBe('suspicious');
    quiet(m, ALERT_TIMERS.suspicious - 0.5);
    expect(m.state).toBe('suspicious');
    quiet(m, 1);
    expect(m.state).toBe('normal');
  });

  it('jumps to Alert from any state when the player is spotted, counting each entry', () => {
    for (const start of ['normal', 'suspicious', 'evasion', 'caution'] as const) {
      const m = { ...createAlertMachine(), state: start, timer: 5 };
      expect(stepAlert(m, SEEN, 0.1)).toBe(start);
      expect(m.state).toBe('alert');
      expect(m.alertCount).toBe(1);
    }
  });

  it('does not count staying in Alert as a new alert', () => {
    const m = createAlertMachine();
    stepAlert(m, SEEN, 0.1);
    expect(stepAlert(m, SEEN, 0.1)).toBeNull();
    expect(m.alertCount).toBe(1);
  });

  it('runs the full cycle Alert → Evasion → Caution → Normal on its timers', () => {
    const m = createAlertMachine();
    stepAlert(m, SEEN, 0.1);
    const total = ALERT_TIMERS.lostAfter + ALERT_TIMERS.evasion + ALERT_TIMERS.caution + 1;
    expect(quiet(m, total)).toEqual(['alert', 'evasion', 'caution', 'normal']);
  });

  it('holds Alert while the player stays in sight', () => {
    const m = createAlertMachine();
    for (let t = 0; t < ALERT_TIMERS.lostAfter * 3; t += 0.1) stepAlert(m, SEEN, 0.1);
    expect(m.state).toBe('alert');
  });

  it('re-enters Alert when spotted during Evasion, counting a second alert', () => {
    const m = createAlertMachine();
    stepAlert(m, SEEN, 0.1);
    quiet(m, ALERT_TIMERS.lostAfter + 1);
    expect(m.state).toBe('evasion');
    stepAlert(m, SEEN, 0.1);
    expect(m.state).toBe('alert');
    expect(m.alertCount).toBe(2);
  });

  it('lets Evasion and Caution run out even while guards investigate', () => {
    const m = { ...createAlertMachine(), state: 'caution' as const, timer: 1 };
    quiet(m, 0.5, CURIOUS);
    expect(m.state).toBe('caution'); // investigating does not reset or shortcut Caution
    expect(quiet(m, 1, CURIOUS)).toEqual(['caution', 'normal', 'suspicious']); // times out, then the investigation counts
  });
});

describe('alertSystem', () => {
  const DT = 1 / 60;

  function setup() {
    const eyes = { seen: false };
    const sensor: Sensor = {
      name: 'eyes',
      sense(agent, ctx) {
        // only the first guard can see; it reports the player at (8, 1)
        const isWatcher = agent.ai.post.x === 1.5;
        agent.ai.blackboard.facts.seesPlayer = isWatcher && eyes.seen;
        if (isWatcher && eyes.seen) {
          agent.ai.blackboard.playerSeenAt = { x: 8.5, z: 1.5 };
          ctx.squad.lastKnownPlayer = { x: 8.5, z: 1.5 };
        }
      },
    };
    const sim = new Sim([
      createAiSystem({ sensors: [sensor], decision: createGuardBrain(), actions: GUARD_ACTIONS }),
      alertSystem,
    ]);
    sim.grid = Grid.fromRows(['..........', '..........', '..........']);
    const guard = (x: number) =>
      sim.world.add({
        transform: transform(x, 1.5),
        velocity: { x: 0, z: 0 },
        guard: true,
        ai: createAiState([], { x, z: 1.5, yaw: 0 }),
      }) as Agent;
    const guards = [guard(1.5), guard(4.5)];
    const changes: EventOf<'alertChanged'>[] = [];
    sim.events.on('alertChanged', (e) => changes.push(e));
    return { sim, eyes, guards, changes };
  }

  it('puts every guard on the hunt when one spots the player, and emits alertChanged', () => {
    const { sim, eyes, guards, changes } = setup();
    sim.step(DT);
    eyes.seen = true;
    sim.step(DT); // watcher sees; alert machine goes to Alert
    sim.step(DT); // guards react to squadAlert; the change event is dispatched
    expect(sim.squad.alert).toBe('alert');
    expect(sim.squad.machine.alertCount).toBe(1);
    expect(changes).toEqual([{ type: 'alertChanged', from: 'normal', to: 'alert' }]);
    expect(guards.map((g) => g.ai.state)).toEqual(['chase', 'chase']);
  });

  it('sends everyone searching in Evasion and back to patrol after Caution', () => {
    const { sim, eyes, guards } = setup();
    sim.step(DT);
    eyes.seen = true;
    sim.step(DT);
    eyes.seen = false;
    for (let i = 0; i < (ALERT_TIMERS.lostAfter + 1) / DT; i++) sim.step(DT);
    expect(sim.squad.alert).toBe('evasion');
    expect(guards.every((g) => g.ai.state === 'search' || g.ai.state === 'chase')).toBe(true);
    for (let i = 0; i < (ALERT_TIMERS.evasion + ALERT_TIMERS.caution + 30) / DT; i++) sim.step(DT);
    expect(sim.squad.alert).toBe('normal');
    expect(guards.map((g) => g.ai.state)).toEqual(['patrol', 'patrol']);
  });

  it('starts every level fresh', () => {
    const { sim, eyes } = setup();
    eyes.seen = true;
    sim.step(DT);
    sim.reset();
    expect(sim.squad.alert).toBe('normal');
    expect(sim.squad.machine.alertCount).toBe(0);
  });
});
