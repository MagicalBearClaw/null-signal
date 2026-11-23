import { describe, expect, it } from 'vitest';
import fixtureRaw from '../../../levels/maps/fixture.tmj?raw';
import tilesetRaw from '../../../levels/tilesets/semantics.tsj?raw';
import { applyDamage } from '../combat/health';
import { EventBus, type SimEvent } from '../events';
import { startLevel } from '../level/spawn';
import { loadLevel } from '../level/tiled';
import { Sim } from '../sim';
import { StatsTracker, emptyStats } from './stats';

const PLAYER = 1;
const GUARD = 7;
const started: SimEvent = { type: 'levelStarted', player: PLAYER };

function tracked(...events: SimEvent[]): StatsTracker {
  const t = new StatsTracker();
  for (const e of events) t.record(e);
  return t;
}

describe('StatsTracker', () => {
  it('counts what the player did and what happened to them, ignoring everyone else', () => {
    const t = tracked(
      started,
      { type: 'kill', target: GUARD, source: PLAYER },
      { type: 'kill', target: 8, source: GUARD }, // not the player's kill
      { type: 'ko', target: 9, source: PLAYER },
      { type: 'alertChanged', from: 'normal', to: 'alert' },
      { type: 'alertChanged', from: 'alert', to: 'evasion' },
      { type: 'alertChanged', from: 'evasion', to: 'alert' },
      { type: 'spotted', by: GUARD, target: PLAYER },
      { type: 'spotted', by: GUARD, target: 3 },
      { type: 'damage', target: PLAYER, amount: 15, lethal: false, source: GUARD },
      { type: 'damage', target: GUARD, amount: 34, lethal: false, source: PLAYER },
      { type: 'damage', target: PLAYER, amount: 15, lethal: false, source: GUARD },
      { type: 'itemUsed', item: 'medkit' },
      { type: 'ammoUsed', weapon: 'sidearm', amount: 3 },
      { type: 'ammoUsed', weapon: 'sidearm', amount: 2 },
    );
    expect(t.stats).toEqual({
      ...emptyStats(),
      kills: 1,
      neutralized: 1,
      alerts: 2,
      spotted: 1,
      damageTaken: 30,
      itemsUsed: 1,
      ammoUsed: 5,
    });
  });

  it('counts time only while the level runs', () => {
    const t = new StatsTracker();
    t.elapse(5); // before the level starts
    t.record(started);
    t.elapse(1.5);
    t.elapse(1.5);
    t.record({ type: 'objectiveComplete' });
    t.elapse(10); // results screen
    expect(t.stats.time).toBe(3);
  });

  it('stops the clock on death', () => {
    const t = tracked(started);
    t.elapse(2);
    t.record({ type: 'playerDied' });
    t.elapse(2);
    expect(t.stats.time).toBe(2);
  });

  it('keeps continues across restarts within an attempt and clears the rest', () => {
    const t = tracked(started, { type: 'kill', target: GUARD, source: PLAYER });
    t.elapse(4);
    t.record({ type: 'playerDied' });
    t.continued();
    t.record({ type: 'levelStarted', player: 42 }); // restart: new player entity id
    expect(t.stats).toEqual({ ...emptyStats(), continues: 1 });
    t.record({ type: 'kill', target: GUARD, source: 42 });
    expect(t.stats.kills).toBe(1);

    t.continued();
    t.record(started);
    expect(t.stats.continues).toBe(2);

    t.beginAttempt();
    t.record(started);
    expect(t.stats.continues).toBe(0);
  });

  it('attaches to a bus and sees events as they are dispatched', () => {
    const bus = new EventBus();
    const t = new StatsTracker();
    const off = t.attach(bus);
    bus.emit(started);
    bus.emit({ type: 'spotted', by: GUARD, target: PLAYER });
    expect(t.stats.spotted).toBe(0); // nothing until the tick flushes
    bus.flush();
    expect(t.stats.spotted).toBe(1);
    off();
    bus.emit({ type: 'spotted', by: GUARD, target: PLAYER });
    bus.flush();
    expect(t.stats.spotted).toBe(1);
  });

  it('learns the player from a real level start and records damage from the sim', () => {
    const level = loadLevel(
      'fixture',
      JSON.parse(fixtureRaw) as unknown,
      () => JSON.parse(tilesetRaw) as unknown,
    );
    const sim = new Sim([]);
    const t = new StatsTracker();
    t.attach(sim.events);
    startLevel(sim, level);
    const player = sim.world.with('player', 'health').first;
    if (!player) throw new Error('no player');
    applyDamage(sim.world, sim.events, player, 25);
    sim.step(1 / 60);
    expect(t.stats.damageTaken).toBe(25);
  });
});
