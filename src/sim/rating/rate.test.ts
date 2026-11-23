import { describe, expect, it } from 'vitest';
import { applyRankRules, rankFor, rate, type RatedLevel, type Rank } from './rate';
import { emptyStats, type RunStats } from './stats';
import { RATING_WEIGHTS } from './weights';

const THRESHOLDS = { S: 9000, A: 7000, B: 5000, C: 3000 };
const level = (objective = 'collectThenExit', parTime = 90): RatedLevel => ({
  parTime,
  rankThresholds: THRESHOLDS,
  objective: { type: objective, params: {} },
});
const run = (over: Partial<RunStats> = {}): RunStats => ({ ...emptyStats(), time: 90, ...over });

describe('rankFor', () => {
  it.each<[number, Rank]>([
    [10000, 'S'],
    [9000, 'S'],
    [8999, 'A'],
    [7000, 'A'],
    [6999, 'B'],
    [5000, 'B'],
    [3000, 'C'],
    [2999, 'D'],
    [0, 'D'],
  ])('%i → %s', (score, rank) => {
    expect(rankFor(score, THRESHOLDS)).toBe(rank);
  });
});

describe('applyRankRules', () => {
  it.each<[string, Partial<RunStats>, Rank, Rank, boolean]>([
    ['sneak', {}, 'S', 'S', false],
    ['sneak', { kills: 1 }, 'S', 'A', true],
    ['sneak', { alerts: 1 }, 'S', 'A', true],
    ['sneak', { neutralized: 3, spotted: 2 }, 'S', 'S', false], // KOs and glimpses don't break the rule
    ['sneak', { kills: 1 }, 'B', 'B', false], // only S is capped
    ['collectThenExit', { kills: 5, alerts: 2 }, 'S', 'S', false], // rule is sneak-only
  ])('%s with %o: %s → %s', (objective, stats, before, after, capped) => {
    expect(applyRankRules(before, run(stats), objective)).toEqual({ rank: after, capped });
  });
});

// The scoring formula (scoreLines) is the owner's to write; these pin down what it must do.
describe('rate', () => {
  it('gives a flawless run at par an S', () => {
    const r = rate(run(), level());
    expect(r.rank).toBe('S');
    expect(r.capped).toBe(false);
  });

  it('adds up its breakdown to the score', () => {
    const r = rate(run({ kills: 1, alerts: 1, time: 120 }), level());
    const sum = r.breakdown.reduce((s, l) => s + l.points, 0);
    expect(r.score).toBe(Math.max(0, Math.round(sum)));
  });

  it('penalises a kill harder than a KO', () => {
    expect(RATING_WEIGHTS.kill).toBeGreaterThan(RATING_WEIGHTS.neutralized);
    expect(rate(run({ kills: 1 }), level()).score).toBeLessThan(rate(run({ neutralized: 1 }), level()).score);
  });

  it.each<[keyof RunStats, number]>([
    ['kills', 1],
    ['neutralized', 1],
    ['alerts', 1],
    ['spotted', 1],
    ['damageTaken', 30],
    ['continues', 1],
    ['itemsUsed', 1],
    ['ammoUsed', 10],
  ])('costs points for %s', (stat, amount) => {
    expect(rate(run({ [stat]: amount }), level()).score).toBeLessThan(rate(run(), level()).score);
  });

  it('scores slower runs lower and never rewards finishing early by more than the cap', () => {
    const atPar = rate(run(), level()).score;
    expect(rate(run({ time: 150 }), level()).score).toBeLessThan(atPar);
    expect(rate(run({ time: 1 }), level()).score).toBeLessThanOrEqual(atPar + RATING_WEIGHTS.underParCap);
  });

  it('never goes below 0 and bottoms out at D', () => {
    const r = rate(run({ kills: 50, alerts: 20, continues: 10, time: 3000 }), level());
    expect(r.score).toBe(0);
    expect(r.rank).toBe('D');
  });

  it('caps a dirty sneak run at A however high it scores', () => {
    const r = rate(run({ alerts: 1 }), level('sneak'), { ...RATING_WEIGHTS, alert: 0 });
    expect(r.rank).toBe('A');
    expect(r.capped).toBe(true);
  });

  it('is pure', () => {
    const stats = run({ kills: 2, time: 100 });
    expect(rate(stats, level())).toEqual(rate(stats, level()));
    expect(stats).toEqual(run({ kills: 2, time: 100 }));
  });
});
