/**
 * Global rating weights (DESIGN.md §6). Points are on the same scale as each level's
 * `rankThresholds` (the fixture uses S 9000 / A 7000 / B 5000 / C 3000), so a clean run
 * at par starts from `base` and every penalty pulls it down from there.
 *
 * Tune here; the formula that uses them is in `rate.ts`.
 */
export const RATING_WEIGHTS = {
  /** Score of a flawless run finished exactly at par. */
  base: 10000,
  /** Points per second slower than par. */
  overParPerSecond: 25,
  /** Points per second faster than par (a small reward, capped by `underParCap`). */
  underParPerSecond: 10,
  /** Most points finishing early can earn. */
  underParCap: 1000,
  /** Per kill. Must be higher than `neutralized`: killing is the loud, lazy option. */
  kill: 700,
  /** Per enemy knocked out. */
  neutralized: 200,
  /** Per time the level entered Alert. */
  alert: 900,
  /** Per time a guard or camera spotted the player. */
  spotted: 300,
  /** Per point of health lost. */
  damageTaken: 6,
  /** Per continue. */
  continue: 1500,
  /** Per item used. */
  itemUsed: 100,
  /** Per round fired. */
  ammoUsed: 15,
} as const;

export type RatingWeights = { readonly [K in keyof typeof RATING_WEIGHTS]: number };
