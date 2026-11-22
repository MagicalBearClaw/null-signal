import { z } from 'zod';
import { needsGoal, type Objective, type ObjectiveType } from './objective';

export interface CollectParams {
  /** Pickup `item` that counts. */
  readonly item: string;
  /** How many to collect. Default: every pickup of that item in the level. */
  readonly count?: number | undefined;
  /** Name shown on the HUD. Default: the item name. */
  readonly label?: string | undefined;
}

const available = (pickups: readonly { item: string }[], item: string) =>
  pickups.filter((p) => p.item === item).length;

/**
 * `collectThenExit`: pick up N items tagged `item`; the goal zones unlock once you have
 * them all, and reaching one finishes the level.
 */
export const collectThenExit: ObjectiveType<CollectParams> = {
  params: z
    .object({
      item: z.string().min(1),
      count: z.number().int().positive().optional(),
      label: z.string().min(1).optional(),
    })
    .strict(),
  check(level, p) {
    const have = available(level.pickups, p.item);
    const need = p.count ?? have;
    const issues = needsGoal(level);
    if (need === 0) issues.push(`objective: no "${p.item}" pickups to collect`);
    else if (need > have) issues.push(`objective: needs ${need} "${p.item}" pickups, the map has ${have}`);
    return issues;
  },
  init(level, p): Objective {
    const need = p.count ?? available(level.pickups, p.item);
    const label = p.label ?? p.item;
    let got = 0;
    let reached = false;
    return {
      rules: { weapons: true },
      onEvent(e) {
        if (e.type === 'pickup' && e.item === p.item) got++;
        else if (e.type === 'goalReached' && got >= need) reached = true;
      },
      goalUnlocked: () => got >= need,
      isComplete: () => reached,
      isFailed: () => false,
      hudText: () => (got >= need ? 'Reach the exit' : `Collect ${label} ${Math.min(got, need)}/${need}`),
    };
  },
};
