import type { Rect } from '../level/model';
import type { System } from '../sim';
import type { Objective } from './objective';

export type ObjectiveStatus = 'active' | 'complete' | 'failed';

/** The running objective of the current level. Held by the Sim (`sim.objective`). */
export interface ObjectiveRun {
  readonly objective: Objective;
  status: ObjectiveStatus;
}

/** A goal zone: the rectangle the player must reach to finish. */
export interface GoalZone extends Rect {
  /** Mirrors the objective's `goalUnlocked()` (render shows it). */
  unlocked: boolean;
  /** The player was inside last tick (so `goalReached` fires on entry only). */
  occupied: boolean;
}

export function createGoalZone(r: Rect): GoalZone {
  return { x: r.x, z: r.z, width: r.width, depth: r.depth, unlocked: false, occupied: false };
}

const inside = (g: Rect, x: number, z: number) =>
  x >= g.x && x <= g.x + g.width && z >= g.z && z <= g.z + g.depth;

/**
 * Feeds the objective last tick's events, tracks the player entering goal zones
 * (`goalReached`, only while unlocked), and emits `objectiveComplete` or
 * `objectiveFailed` once when the objective settles.
 */
export const objectiveSystem: System = {
  name: 'objective',
  update({ world, events, objective: run }) {
    if (!run || run.status !== 'active') return;
    const obj = run.objective;
    for (const e of events.lastTick) obj.onEvent(e);

    if (obj.isFailed()) {
      run.status = 'failed';
      events.emit({ type: 'objectiveFailed' });
      return;
    }
    if (obj.isComplete()) {
      run.status = 'complete';
      events.emit({ type: 'objectiveComplete' });
      return;
    }

    const unlocked = obj.goalUnlocked();
    const player = world.with('player', 'transform').without('dead').first;
    for (const e of world.with('goal')) {
      const g = e.goal;
      g.unlocked = unlocked;
      const isIn = !!player && inside(g, player.transform.x, player.transform.z);
      if (isIn && !g.occupied && unlocked) events.emit({ type: 'goalReached' });
      // a locked goal doesn't latch, so it fires the moment it unlocks under the player
      g.occupied = isIn && unlocked;
    }
  },
};
