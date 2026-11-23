import type { Level } from '../level/model';
import type { RunStats } from './stats';
import { RATING_WEIGHTS, type RatingWeights } from './weights';

export const RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Rank = (typeof RANKS)[number];

/** One row of the results screen: what was measured and what it was worth. */
export interface BreakdownLine {
  /** Which part of the score, e.g. "time", "kills". Stable keys; the UI labels them. */
  readonly key: string;
  /** The raw stat behind it (seconds, count, health...). */
  readonly value: number;
  /** Points this line adds (positive) or costs (negative). */
  readonly points: number;
}

export interface Rating {
  readonly score: number;
  readonly rank: Rank;
  readonly breakdown: readonly BreakdownLine[];
  /** True when a rule (sneak: no kills, no alerts) knocked an S down to A. */
  readonly capped: boolean;
}

/** The level data the rating reads. */
export type RatedLevel = Pick<Level, 'parTime' | 'rankThresholds' | 'objective'>;

/**
 * The scoring formula: turns a run into breakdown lines whose points add up to the score.
 * The score is clamped at 0 afterwards, so lines may push it negative.
 *
 * TODO(owner, MIC-84): how time, stealth and violence trade off is the game's core feel,
 * so this is yours to write. Every weight is in `weights.ts`; the tests in `rate.test.ts`
 * describe what any formula must satisfy. Things to decide:
 *  - Base line: start from `w.base` as its own line, or fold it into the time line?
 *  - Time: linear per second over par (`overParPerSecond`), and an early-finish bonus
 *    (`underParPerSecond`, capped at `underParCap`)? Or a curve that forgives the first
 *    few seconds over par?
 *  - Penalties: one line per stat (kills, neutralized, alerts, spotted, damageTaken,
 *    continues, itemsUsed, ammoUsed), points = -(count × weight)?
 */
export function scoreLines(stats: RunStats, level: RatedLevel, w: RatingWeights): BreakdownLine[] {
  void stats;
  void level;
  void w;
  throw new Error('TODO(owner, MIC-84): implement the scoring formula in scoreLines()');
}

/** Letter rank for a score: the first threshold it reaches, else D. */
export function rankFor(score: number, t: RatedLevel['rankThresholds']): Rank {
  if (score >= t.S) return 'S';
  if (score >= t.A) return 'A';
  if (score >= t.B) return 'B';
  if (score >= t.C) return 'C';
  return 'D';
}

/**
 * Rank rules on top of the score. On a `sneak` level an S needs 0 kills and 0 alerts;
 * otherwise the best rank is A.
 */
export function applyRankRules(
  rank: Rank,
  stats: RunStats,
  objective: string,
): { rank: Rank; capped: boolean } {
  const dirty = stats.kills > 0 || stats.alerts > 0;
  if (rank === 'S' && objective === 'sneak' && dirty) return { rank: 'A', capped: true };
  return { rank, capped: false };
}

/** Rates a finished run. Pure: same stats and level, same result. */
export function rate(stats: RunStats, level: RatedLevel, weights: RatingWeights = RATING_WEIGHTS): Rating {
  const breakdown = scoreLines(stats, level, weights);
  const score = Math.max(0, Math.round(breakdown.reduce((sum, l) => sum + l.points, 0)));
  const ruled = applyRankRules(rankFor(score, level.rankThresholds), stats, level.objective.type);
  return { score, breakdown, ...ruled };
}
