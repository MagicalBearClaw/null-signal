import type { EventBus, SimEvent } from '../events';

/** What a run of a level produced, for the rating and results screen (DESIGN.md §6). */
export interface RunStats {
  /** Sim seconds from level start to the objective settling (or death). */
  time: number;
  /** Enemies the player killed. */
  kills: number;
  /** Enemies the player neutralized without killing (KO). */
  neutralized: number;
  /** Times the level entered Alert. */
  alerts: number;
  /** Times a guard or camera spotted the player. */
  spotted: number;
  /** Health the player lost. */
  damageTaken: number;
  /** Deaths continued from in this attempt. Kept across restarts. */
  continues: number;
  itemsUsed: number;
  /** Rounds fired. */
  ammoUsed: number;
}

export function emptyStats(): RunStats {
  return {
    time: 0,
    kills: 0,
    neutralized: 0,
    alerts: 0,
    spotted: 0,
    damageTaken: 0,
    continues: 0,
    itemsUsed: 0,
    ammoUsed: 0,
  };
}

/**
 * Turns sim events into {@link RunStats}. It never looks at the ECS: who the player is
 * comes from `levelStarted`, everything else from the event that describes it. The only
 * input that isn't an event is time, which the game loop feeds in with {@link elapse}
 * once per sim step; it only counts while the level is running.
 *
 * An attempt is one go at a level, including any continues. `levelStarted` resets the
 * run's stats but keeps the continue count; {@link beginAttempt} clears that too.
 */
export class StatsTracker {
  private s = emptyStats();
  private player: number | null = null;
  private running = false;

  get stats(): Readonly<RunStats> {
    return this.s;
  }

  /** A fresh attempt: every stat, continues included, back to zero. */
  beginAttempt(): void {
    this.s = emptyStats();
    this.running = false;
  }

  /** The player continued after a death; the level restarts within the same attempt. */
  continued(): void {
    this.s.continues++;
  }

  elapse(dt: number): void {
    if (this.running) this.s.time += dt;
  }

  record(e: SimEvent): void {
    const s = this.s;
    switch (e.type) {
      case 'levelStarted':
        this.s = { ...emptyStats(), continues: s.continues };
        this.player = e.player;
        this.running = true;
        break;
      case 'objectiveComplete':
      case 'objectiveFailed':
      case 'playerDied':
        this.running = false;
        break;
      case 'kill':
        if (e.source === this.player) s.kills++;
        break;
      case 'ko':
        if (e.source === this.player) s.neutralized++;
        break;
      case 'alertChanged':
        if (e.to === 'alert') s.alerts++;
        break;
      case 'spotted':
        if (e.target === this.player) s.spotted++;
        break;
      case 'damage':
        if (e.target === this.player) s.damageTaken += e.amount;
        break;
      case 'itemUsed':
        s.itemsUsed++;
        break;
      case 'ammoUsed':
        s.ammoUsed += e.amount;
        break;
      default:
        break;
    }
  }

  /** Records every event the bus dispatches. Returns the unsubscribe function. */
  attach(events: EventBus): () => void {
    return events.onAny((e) => this.record(e));
  }
}
