import type { AlertState, Vec2 } from '../events';
import { createAlertMachine, type AlertMachine } from './alert';

/**
 * Boolean facts the decision layer reads. Conditions are written as partial fact sets
 * (`{ seesPlayer: true }`) rather than code, so the same vocabulary can later serve as
 * GOAP preconditions and effects (DESIGN.md §8).
 */
export const FACTS = [
  /** The guard has line of sight to the player right now. */
  'seesPlayer',
  /** A noise is waiting to be investigated (`Blackboard.noiseAt` is set). */
  'heardNoise',
  /** The player is visible and within firing range. */
  'playerInRange',
  /** The squad is in Alert: everyone hunts. */
  'squadAlert',
  /** The squad is in Evasion: everyone searches. */
  'squadSearching',
  /** The current action finished (done or failed) on the previous tick. */
  'actionDone',
] as const;

export type Fact = (typeof FACTS)[number];
export type Facts = Record<Fact, boolean>;
/** A declarative condition: every listed fact must have the given value. */
export type Condition = Partial<Facts>;

export function matches(facts: Facts, condition: Condition): boolean {
  for (const key of FACTS) {
    const want = condition[key];
    if (want !== undefined && facts[key] !== want) return false;
  }
  return true;
}

/** What one guard knows. Sensors write it; the decision layer and actions read it. */
export interface Blackboard {
  facts: Facts;
  /** Where this guard last saw the player with its own eyes. */
  playerSeenAt: Vec2 | null;
  /** The noise to investigate next. Cleared by the investigate action once checked. */
  noiseAt: Vec2 | null;
  /** Vision meter, 0..1. Fills while the player is in view; full means spotted. */
  awareness: number;
}

/** State every guard shares: the global alert level and the last known player position. */
export interface SquadBlackboard {
  /** Current level alert state; mirrors `machine.state` (written by `alertSystem`). */
  alert: AlertState;
  machine: AlertMachine;
  lastKnownPlayer: Vec2 | null;
  /** Sim tick at which `lastKnownPlayer` was written (-1 when never). */
  lastKnownTick: number;
}

export function createBlackboard(): Blackboard {
  const facts = Object.fromEntries(FACTS.map((f) => [f, false])) as Facts;
  return { facts, playerSeenAt: null, noiseAt: null, awareness: 0 };
}

export function createSquad(): SquadBlackboard {
  return { alert: 'normal', machine: createAlertMachine(), lastKnownPlayer: null, lastKnownTick: -1 };
}

/** Facts derived from blackboard data rather than sensed directly. */
export function deriveFacts(bb: Blackboard, squad: SquadBlackboard): void {
  bb.facts.heardNoise = bb.noiseAt !== null;
  bb.facts.squadAlert = squad.alert === 'alert';
  bb.facts.squadSearching = squad.alert === 'evasion';
}
