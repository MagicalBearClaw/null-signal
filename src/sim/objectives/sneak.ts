import { z } from 'zod';
import { needsGoal, type Objective, type ObjectiveType } from './objective';

/** `sneak`: reach a goal zone. Weapons are disabled, so it is stealth or nothing. */
export const sneak: ObjectiveType<Record<string, never>> = {
  params: z.object({}).strict(),
  check: needsGoal,
  init(): Objective {
    let reached = false;
    return {
      rules: { weapons: false },
      onEvent(e) {
        if (e.type === 'goalReached') reached = true;
      },
      goalUnlocked: () => true,
      isComplete: () => reached,
      isFailed: () => false,
      hudText: () => 'Reach the exit',
    };
  },
};
