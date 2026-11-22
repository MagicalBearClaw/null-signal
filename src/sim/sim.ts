import { World } from 'miniplex';
import { createSquad, type SquadBlackboard } from './ai/blackboard';
import type { Entity } from './components';
import { EventBus } from './events';
import type { Grid } from './grid/grid';
import { EMPTY_INPUT, type InputSnapshot } from './input';
import type { ObjectiveRun } from './objectives/objectiveSystem';
import { Rng } from './rng';

/** Everything a system may touch during a tick. */
export interface SimContext {
  readonly world: World<Entity>;
  readonly events: EventBus;
  /** Number of completed ticks before this one (0 on the first tick). */
  readonly tick: number;
  /** Player input for this tick. */
  readonly input: InputSnapshot;
  /** Collision grid of the loaded level, or null when no level is loaded. */
  readonly grid: Grid | null;
  /** Shared guard knowledge: alert level, last known player position. */
  readonly squad: SquadBlackboard;
  /** Seeded randomness; the only source systems may use. */
  readonly rng: Rng;
  /** The level's objective and whether it is settled, or null outside a level. */
  readonly objective: ObjectiveRun | null;
}

export interface System {
  /** Unique, used in debug tooling and order assertions. */
  readonly name: string;
  update(ctx: SimContext, dt: number): void;
}

/**
 * The simulation: an ECS world, an event bus, and an ordered list of systems.
 *
 * Each `step(dt, input)`:
 *   1. snapshots `transform → prevTransform` (for render interpolation)
 *   2. runs systems in registration order
 *   3. flushes the event bus
 *
 * Systems run in the exact array order given, so order is explicit and reviewable
 * in one place (see `createDefaultSystems` once more systems exist).
 */
export class Sim {
  readonly world = new World<Entity>();
  readonly events = new EventBus();
  /** Set by the level runtime; systems read it through `ctx.grid`. */
  grid: Grid | null = null;
  squad: SquadBlackboard = createSquad();
  rng = new Rng();
  /** Set by `startLevel`. */
  objective: ObjectiveRun | null = null;
  private readonly systems: readonly System[];
  private tickCount = 0;

  constructor(systems: readonly System[]) {
    const names = new Set<string>();
    for (const s of systems) {
      if (names.has(s.name)) throw new Error(`Duplicate system name: ${s.name}`);
      names.add(s.name);
    }
    this.systems = [...systems];
  }

  /** Removes every entity and pending event, e.g. before loading another level. */
  reset(): void {
    for (const e of [...this.world.entities]) this.world.remove(e);
    this.events.clear();
    this.grid = null;
    this.squad = createSquad();
    this.rng = new Rng();
    this.objective = null;
  }

  get tick(): number {
    return this.tickCount;
  }

  get systemNames(): readonly string[] {
    return this.systems.map((s) => s.name);
  }

  step(dt: number, input: InputSnapshot = EMPTY_INPUT): void {
    for (const e of this.world.with('transform')) {
      const t = e.transform;
      if (e.prevTransform) {
        e.prevTransform.x = t.x;
        e.prevTransform.y = t.y;
        e.prevTransform.z = t.z;
        e.prevTransform.yaw = t.yaw;
      } else {
        this.world.addComponent(e, 'prevTransform', { ...t });
      }
    }

    const ctx: SimContext = {
      world: this.world,
      events: this.events,
      tick: this.tickCount,
      input,
      grid: this.grid,
      squad: this.squad,
      rng: this.rng,
      objective: this.objective,
    };
    for (const system of this.systems) system.update(ctx, dt);

    this.events.flush();
    this.tickCount++;
  }
}
