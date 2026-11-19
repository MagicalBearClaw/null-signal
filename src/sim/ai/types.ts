import type { Entity, Transform, Velocity } from '../components';
import type { Vec2 } from '../events';
import type { SimContext } from '../sim';
import { createBlackboard, type Blackboard, type Condition, type Facts } from './blackboard';

export const ACTION_NAMES = ['patrol', 'investigate', 'chase', 'shoot', 'search', 'return'] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

/** Per-guard AI component (`Entity.ai`). Plain data, so it serialises. */
export interface AiState {
  blackboard: Blackboard;
  /** Current decision-layer state, or null before the first tick. */
  state: string | null;
  /** Result of the current action's last tick. */
  status: ActionStatus;
  /** Scratch memory for the running action, reset on start. Numbers only. */
  memory: Record<string, number>;
  /** Patrol waypoints in order (loops). Empty: the guard holds `post`. */
  route: readonly Vec2[];
  post: { x: number; z: number; yaw: number };
}

export function createAiState(route: readonly Vec2[], post: AiState['post']): AiState {
  return {
    blackboard: createBlackboard(),
    state: null,
    status: 'running',
    memory: {},
    route: route.map((p) => ({ ...p })),
    post: { ...post },
  };
}

/** An entity the AI system drives. */
export type Agent = Entity & { transform: Transform; velocity: Velocity; ai: AiState };

/** Writes facts and data into a guard's blackboard (and the squad's) each tick. */
export interface Sensor {
  readonly name: string;
  sense(agent: Agent, ctx: SimContext): void;
}

export type ActionStatus = 'running' | 'done' | 'failed';

/**
 * A behaviour the guard performs. Actions are stateless singletons: per-guard state lives
 * in `agent.ai.memory`. `preconditions` and `effects` are not enforced by the FSM; they
 * document the action in the fact vocabulary so a GOAP planner can use it later.
 */
export interface Action {
  readonly name: ActionName;
  readonly preconditions: Condition;
  readonly effects: Condition;
  start(agent: Agent, ctx: SimContext): void;
  tick(agent: Agent, ctx: SimContext, dt: number): ActionStatus;
  /** Called when the decision layer switches away while the action is still running. */
  interrupt(agent: Agent, ctx: SimContext): void;
}

/** Picks what the guard should be doing. v1 is a hierarchical FSM; GOAP can replace it. */
export interface DecisionLayer {
  readonly initial: string;
  /** Next state given the current one and the guard's facts. Same state = keep going. */
  decide(current: string, facts: Facts): { state: string; restart: boolean };
  actionOf(state: string): ActionName;
}
