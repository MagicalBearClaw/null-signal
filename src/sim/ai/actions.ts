import type { Vec2 } from '../events';
import { turnToward, yawOf } from '../systems/playerInput';
import { GUARD } from './tuning';
import type { Action, ActionName, ActionStatus, Agent } from './types';

/*
 * The six v1 guard actions. Movement is straight-line steering toward a point; the
 * movement system applies the velocity with collision. Grid pathfinding replaces the
 * steering in MIC-76 without changing these interfaces.
 */

function stop(agent: Agent): void {
  agent.velocity.x = 0;
  agent.velocity.z = 0;
}

/**
 * Steers toward `target` at `speed`. Returns true on arrival, or when the guard has made
 * no progress for `GUARD.stuckTime` (blocked), so a wall never traps an action forever.
 * Uses `memory.px/pz/stuck` to measure progress between ticks.
 */
export function moveTo(agent: Agent, target: Vec2, speed: number, dt: number): boolean {
  const { transform: t, ai } = agent;
  const m = ai.memory;
  const dx = target.x - t.x;
  const dz = target.z - t.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= GUARD.arriveRadius) {
    stop(agent);
    m.stuck = 0;
    return true;
  }

  if (m.px !== undefined && m.pz !== undefined) {
    const moved = Math.hypot(t.x - m.px, t.z - m.pz);
    m.stuck = moved < speed * dt * 0.1 ? (m.stuck ?? 0) + dt : 0;
    if (m.stuck >= GUARD.stuckTime) {
      stop(agent);
      m.stuck = 0;
      delete m.px;
      delete m.pz;
      return true;
    }
  }
  m.px = t.x;
  m.pz = t.z;

  // don't overshoot: land exactly on the point this tick if it is closer than a full step
  const step = Math.min(speed, dist / dt);
  agent.velocity.x = (dx / dist) * step;
  agent.velocity.z = (dz / dist) * step;
  t.yaw = turnToward(t.yaw, yawOf(dx, dz), GUARD.turnRate * dt);
  return false;
}

function nearestWaypoint(agent: Agent): number {
  const { route } = agent.ai;
  let best = 0;
  let bestDist = Infinity;
  route.forEach((p, i) => {
    const d = Math.hypot(p.x - agent.transform.x, p.z - agent.transform.z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function face(agent: Agent, target: Vec2, dt: number): void {
  const t = agent.transform;
  t.yaw = turnToward(t.yaw, yawOf(target.x - t.x, target.z - t.z), GUARD.turnRate * dt);
}

const noop = (): void => undefined;

/** Walks the route in a loop (resuming at the nearest waypoint), or holds the post. Never ends. */
const patrol: Action = {
  name: 'patrol',
  preconditions: { seesPlayer: false, heardNoise: false },
  effects: {},
  start(agent) {
    agent.ai.memory.waypoint = nearestWaypoint(agent);
  },
  tick(agent, _ctx, dt) {
    const { route, post, memory } = agent.ai;
    if (route.length === 0) {
      if (moveTo(agent, post, GUARD.speed.walk, dt)) {
        agent.transform.yaw = turnToward(agent.transform.yaw, post.yaw, GUARD.turnRate * dt);
      }
      return 'running';
    }
    const i = memory.waypoint ?? 0;
    const point = route[i % route.length];
    if (point && moveTo(agent, point, GUARD.speed.walk, dt)) memory.waypoint = (i + 1) % route.length;
    return 'running';
  },
  interrupt: stop,
};

/** Walks to the latest noise, looks around, then forgets it. */
const investigate: Action = {
  name: 'investigate',
  preconditions: { heardNoise: true },
  effects: { heardNoise: false },
  start: noop,
  tick(agent, _ctx, dt): ActionStatus {
    const { blackboard: bb, memory } = agent.ai;
    if (!bb.noiseAt) return 'failed';
    if (memory.looking === undefined) {
      if (moveTo(agent, bb.noiseAt, GUARD.speed.walk, dt)) memory.looking = 0;
      return 'running';
    }
    memory.looking += dt;
    agent.transform.yaw += GUARD.investigate.lookTurnRate * dt;
    if (memory.looking < GUARD.investigate.lookTime) return 'running';
    bb.noiseAt = null;
    return 'done';
  },
  interrupt: stop,
};

/** Runs to where the player was last seen (by this guard, else by the squad). */
const chase: Action = {
  name: 'chase',
  preconditions: {},
  effects: { seesPlayer: true },
  start: noop,
  tick(agent, ctx, dt) {
    const target = agent.ai.blackboard.playerSeenAt ?? ctx.squad.lastKnownPlayer;
    if (!target) return 'failed';
    return moveTo(agent, target, GUARD.speed.run, dt) ? 'done' : 'running';
  },
  interrupt: stop,
};

/** Stands and faces the player while in range. Firing arrives with guard combat (MIC-79). */
const shoot: Action = {
  name: 'shoot',
  preconditions: { seesPlayer: true, playerInRange: true },
  effects: {},
  start: stop,
  tick(agent, _ctx, dt) {
    const target = agent.ai.blackboard.playerSeenAt;
    if (!target) return 'failed';
    face(agent, target, dt);
    return 'running';
  },
  interrupt: noop,
};

/** Compass offsets visited in turn around the last known position. */
const SEARCH_OFFSETS: readonly Vec2[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

/** Sweeps four points around the last known player position, then ends. */
const search: Action = {
  name: 'search',
  preconditions: { seesPlayer: false },
  effects: {},
  start(agent) {
    agent.ai.memory.point = 0;
  },
  tick(agent, ctx, dt) {
    const centre = ctx.squad.lastKnownPlayer ?? agent.ai.blackboard.playerSeenAt;
    if (!centre) return 'failed';
    const m = agent.ai.memory;
    const offset = SEARCH_OFFSETS[m.point ?? 0];
    if (!offset) return 'done';
    const r = GUARD.search.radius;
    if (moveTo(agent, { x: centre.x + offset.x * r, z: centre.z + offset.z * r }, GUARD.speed.walk, dt)) {
      m.point = (m.point ?? 0) + 1;
    }
    return 'running';
  },
  interrupt: stop,
};

/** Walks back to the nearest point of the patrol route (or the post). */
const returnToRoute: Action = {
  name: 'return',
  preconditions: { seesPlayer: false },
  effects: {},
  start: noop,
  tick(agent, _ctx, dt) {
    const { route, post } = agent.ai;
    const target = route[nearestWaypoint(agent)] ?? post;
    return moveTo(agent, target, GUARD.speed.walk, dt) ? 'done' : 'running';
  },
  interrupt: stop,
};

export const GUARD_ACTIONS: Readonly<Record<ActionName, Action>> = {
  patrol,
  investigate,
  chase,
  shoot,
  search,
  return: returnToRoute,
};
