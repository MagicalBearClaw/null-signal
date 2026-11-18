import { World } from 'miniplex';
import type { Entity } from './components';
import { EventBus } from './events';

/** Everything a system may touch during a tick. */
export interface SimContext {
  readonly world: World<Entity>;
  readonly events: EventBus;
  /** Number of completed ticks before this one (0 on the first tick). */
  readonly tick: number;
}

export interface System {
  /** Unique, used in debug tooling and order assertions. */
  readonly name: string;
  update(ctx: SimContext, dt: number): void;
}

/**
 * The simulation: an ECS world, an event bus, and an ordered list of systems.
 *
 * Each `step(dt)`:
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

  get tick(): number {
    return this.tickCount;
  }

  get systemNames(): readonly string[] {
    return this.systems.map((s) => s.name);
  }

  step(dt: number): void {
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

    const ctx: SimContext = { world: this.world, events: this.events, tick: this.tickCount };
    for (const system of this.systems) system.update(ctx, dt);

    this.events.flush();
    this.tickCount++;
  }
}
