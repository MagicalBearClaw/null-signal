/**
 * Typed simulation event bus (DESIGN.md §2.1).
 *
 * Systems `emit` during a tick. At the end of the tick the Sim calls `flush()`, which:
 *   1. publishes that tick's events as `lastTick`, so systems can read them on the next tick
 *      (e.g. the hearing sensor reads `noise`), and
 *   2. dispatches them to external listeners (stats tracker, HUD, audio).
 *
 * Events emitted *during* dispatch go to the next tick's batch. That stops a listener
 * from causing an infinite emit loop within one flush.
 */

export type Vec2 = { x: number; z: number };

export type NoiseKind = 'footstep' | 'knock' | 'gunfire' | 'explosion' | 'bodyDrop';
export type AlertState = 'normal' | 'suspicious' | 'alert' | 'evasion' | 'caution';

export type SimEvent =
  | { type: 'noise'; kind: NoiseKind; at: Vec2; radius: number; source?: number }
  | { type: 'alertChanged'; from: AlertState; to: AlertState }
  | { type: 'spotted'; by: number; target: number }
  | { type: 'damage'; target: number; amount: number; lethal: boolean; source?: number }
  | { type: 'kill'; target: number; source?: number }
  | { type: 'ko'; target: number; source?: number }
  | { type: 'playerDied' }
  /** A hitscan shot, for tracers and muzzle flashes. */
  | { type: 'shot'; from: Vec2; to: Vec2; hit: boolean; source?: number }
  | { type: 'pickup'; entity: number; item: string }
  | { type: 'itemUsed'; item: string }
  | { type: 'ammoUsed'; weapon: string; amount: number };

export type SimEventType = SimEvent['type'];
export type EventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;

type Listener<E> = (event: E) => void;

export class EventBus {
  private pending: SimEvent[] = [];
  private published: readonly SimEvent[] = [];
  private readonly listeners = new Map<SimEventType, Set<Listener<never>>>();
  private readonly anyListeners = new Set<Listener<SimEvent>>();

  emit(event: SimEvent): void {
    this.pending.push(event);
  }

  /** Events flushed at the end of the previous tick, for systems to read. */
  get lastTick(): readonly SimEvent[] {
    return this.published;
  }

  /** Iterate last tick's events of one type. */
  *ofType<T extends SimEventType>(type: T): Iterable<EventOf<T>> {
    for (const e of this.published) if (e.type === type) yield e as EventOf<T>;
  }

  on<T extends SimEventType>(type: T, listener: Listener<EventOf<T>>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  onAny(listener: Listener<SimEvent>): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  /** Called once per tick by the Sim, after all systems have run. */
  flush(): readonly SimEvent[] {
    const batch = this.pending;
    this.pending = [];
    this.published = batch;
    for (const event of batch) {
      const set = this.listeners.get(event.type);
      if (set) for (const l of set) (l as Listener<SimEvent>)(event);
      for (const l of this.anyListeners) l(event);
    }
    return batch;
  }

  /** Drops queued and published events, e.g. on level restart. Listeners stay attached. */
  clear(): void {
    this.pending = [];
    this.published = [];
  }
}
