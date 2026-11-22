import { describe, expect, it } from 'vitest';
import { playerWeaponSystem } from '../combat/playerWeapon';
import { transform } from '../components';
import type { SimEvent } from '../events';
import { EMPTY_INPUT } from '../input';
import type { ObjectiveLevel } from './objective';
import { createGoalZone, objectiveSystem } from './objectiveSystem';
import { createObjective, validateObjective } from './registry';
import { Sim } from '../sim';

const GOAL = { x: 8, z: 0, width: 2, depth: 2 };
const level = (items: string[] = []): ObjectiveLevel => ({
  goals: [GOAL],
  pickups: items.map((item, i) => ({ id: i + 1, x: i, z: 5, item, amount: 1 })),
  guards: [],
});
const feed = (o: ReturnType<typeof createObjective>, ...events: SimEvent[]) =>
  events.forEach((e) => o.onEvent(e));
const pickup = (item: string): SimEvent => ({ type: 'pickup', entity: 0, item });
const GOAL_REACHED: SimEvent = { type: 'goalReached' };

describe('sneak', () => {
  it('completes on reaching the goal, with weapons off', () => {
    const o = createObjective({ type: 'sneak', params: {} }, level());
    expect(o.rules.weapons).toBe(false);
    expect(o.goalUnlocked()).toBe(true);
    expect(o.hudText()).toBe('Reach the exit');
    expect(o.isComplete()).toBe(false);
    feed(o, GOAL_REACHED);
    expect(o.isComplete()).toBe(true);
    expect(o.isFailed()).toBe(false);
  });

  it('takes no params', () => {
    expect(validateObjective({ type: 'sneak', params: { item: 'x' } }, level()).ok).toBe(false);
  });
});

describe('collectThenExit', () => {
  it('keeps the goal locked until every tagged item is collected', () => {
    const o = createObjective(
      { type: 'collectThenExit', params: { item: 'drive', label: 'drives' } },
      level(['drive', 'drive', 'medkit']),
    );
    expect(o.rules.weapons).toBe(true);
    expect(o.hudText()).toBe('Collect drives 0/2');
    feed(o, GOAL_REACHED, pickup('drive'), pickup('medkit'));
    expect(o.isComplete()).toBe(false); // reaching a locked goal does nothing
    expect(o.goalUnlocked()).toBe(false);
    expect(o.hudText()).toBe('Collect drives 1/2');
    feed(o, pickup('drive'));
    expect(o.goalUnlocked()).toBe(true);
    expect(o.hudText()).toBe('Reach the exit');
    feed(o, GOAL_REACHED);
    expect(o.isComplete()).toBe(true);
  });

  it('honours an explicit count lower than what the map holds', () => {
    const o = createObjective(
      { type: 'collectThenExit', params: { item: 'drive', count: 1 } },
      level(['drive', 'drive']),
    );
    feed(o, pickup('drive'));
    expect(o.goalUnlocked()).toBe(true);
  });

  it('rejects a count the map cannot satisfy, or no items at all', () => {
    const v = validateObjective(
      { type: 'collectThenExit', params: { item: 'drive', count: 3 } },
      level(['drive']),
    );
    expect(v).toEqual({ ok: false, issues: ['objective: needs 3 "drive" pickups, the map has 1'] });
    const none = validateObjective({ type: 'collectThenExit', params: { item: 'drive' } }, level());
    expect(none).toEqual({ ok: false, issues: ['objective: no "drive" pickups to collect'] });
  });
});

describe('objectiveSystem', () => {
  function setup(type: string, params: unknown, items: string[] = []) {
    const sim = new Sim([playerWeaponSystem, objectiveSystem]);
    sim.objective = { objective: createObjective({ type, params }, level(items)), status: 'active' };
    const player = sim.world.add({ transform: transform(1, 1), player: true as const });
    const goal = sim.world.add({ transform: transform(9, 1), goal: createGoalZone(GOAL) });
    const seen: string[] = [];
    sim.events.onAny((e) => seen.push(e.type));
    return { sim, player, goal, seen };
  }

  it('finishes a sneak level when the player walks into the goal, once', () => {
    const { sim, player, seen } = setup('sneak', {});
    sim.step(1 / 60);
    player.transform.x = 9;
    for (let i = 0; i < 5; i++) sim.step(1 / 60);
    expect(seen.filter((t) => t === 'goalReached')).toHaveLength(1);
    expect(seen.filter((t) => t === 'objectiveComplete')).toHaveLength(1);
    expect(sim.objective?.status).toBe('complete');
  });

  it('fires goalReached when the goal unlocks under a player already standing in it', () => {
    const { sim, player, goal, seen } = setup('collectThenExit', { item: 'drive' }, ['drive']);
    player.transform.x = 9;
    sim.step(1 / 60);
    expect(goal.goal.unlocked).toBe(false);
    expect(seen).not.toContain('goalReached');
    sim.events.emit(pickup('drive'));
    for (let i = 0; i < 4; i++) sim.step(1 / 60);
    expect(goal.goal.unlocked).toBe(true);
    expect(seen).toContain('objectiveComplete');
  });

  it('disables the player weapon on a sneak level', () => {
    const { sim } = setup('sneak', {});
    const attack = {
      ...EMPTY_INPUT,
      held: new Set(['attack'] as const),
      pressed: new Set(['attack'] as const),
    };
    sim.step(1 / 60, attack);
    expect(sim.events.lastTick.some((e) => e.type === 'shot')).toBe(false);
    // the same press fires on a level that allows weapons
    const armed = setup('collectThenExit', { item: 'drive' }, ['drive']).sim;
    armed.step(1 / 60, attack);
    expect(armed.events.lastTick.some((e) => e.type === 'shot')).toBe(true);
  });
});
