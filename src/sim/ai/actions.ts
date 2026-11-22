import { fire } from '../combat/fire';
import type { Vec2 } from '../events';
import type { Grid } from '../grid/grid';
import { stanceMask } from '../grid/tiles';
import type { PatrolMode } from '../level/model';
import { wrapAngle } from '../math';
import { turnToward, yawOf } from '../systems/playerInput';
import { plannerGrid } from '../hazards/doors';
import { findPath, type PathBox } from './pathfinding';
import { GUARD } from './tuning';
import type { Action, ActionName, ActionStatus, Agent } from './types';

/*
 * The six v1 guard actions. Movement goes through `navigateTo` (A* on the level grid,
 * then steering along the path); the movement system applies the velocity with collision.
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

const DEFAULT_BOX: PathBox = { halfWidth: 0.3, halfDepth: 0.3 };

/**
 * Walks to `target` around walls: plans an A* path on the level grid (re-planned when the
 * target moves) and steers along it with `moveTo`. Without a grid, or when no path exists,
 * it falls back to a straight line, which `moveTo`'s stuck check eventually gives up on.
 * Returns true on arrival at `target`.
 */
export function navigateTo(
  agent: Agent,
  target: Vec2,
  speed: number,
  dt: number,
  grid: Grid | null,
): boolean {
  const ai = agent.ai;
  const goal = ai.pathGoal;
  if (!goal || Math.hypot(goal.x - target.x, goal.z - target.z) > 0.25) {
    const box = agent.collider ?? DEFAULT_BOX;
    const from = { x: agent.transform.x, z: agent.transform.z };
    // Plan through closed doors: guards open them on the way.
    const plan = grid && findPath(plannerGrid(grid), from, target, stanceMask('stand'), box);
    ai.path = plan ?? [{ ...target }];
    ai.pathGoal = { ...target };
  }
  while (ai.path.length > 0) {
    const next = ai.path[0] as Vec2;
    if (!moveTo(agent, next, speed, dt)) return false;
    ai.path.shift(); // reached this corner; steer toward the next one in the same tick
  }
  ai.pathGoal = null;
  return true;
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

/** Next waypoint index after `i`: wraps for `loop`, reverses at the ends for `pingpong`. */
export function nextWaypoint(
  i: number,
  dir: number,
  count: number,
  mode: PatrolMode,
): { i: number; dir: number } {
  if (count < 2) return { i: 0, dir: 1 };
  if (mode === 'loop') return { i: (i + 1) % count, dir: 1 };
  const d = i + dir < 0 || i + dir >= count ? -dir : dir;
  return { i: i + d, dir: d };
}

/**
 * Walks the route (resuming at the nearest waypoint), waiting `patrolStyle.wait` seconds
 * at each point and, with `lookAround`, sweeping its gaze while it waits. A guard with no
 * route holds its post. Never ends.
 */
const patrol: Action = {
  name: 'patrol',
  preconditions: { seesPlayer: false, heardNoise: false },
  effects: {},
  start(agent) {
    agent.ai.memory.waypoint = nearestWaypoint(agent);
    agent.ai.memory.dir = 1;
  },
  tick(agent, ctx, dt) {
    const { route, post, memory, patrolStyle: style } = agent.ai;
    if (route.length === 0) {
      if (navigateTo(agent, post, GUARD.speed.walk, dt, ctx.grid)) {
        agent.transform.yaw = turnToward(agent.transform.yaw, post.yaw, GUARD.turnRate * dt);
      }
      return 'running';
    }

    if (memory.waited !== undefined) {
      memory.waited += dt;
      if (style.lookAround) {
        const sweep = Math.sin((memory.waited / GUARD.patrol.lookPeriod) * Math.PI * 2);
        agent.transform.yaw = (memory.arrivedYaw ?? agent.transform.yaw) + sweep * GUARD.patrol.lookArc;
      }
      if (memory.waited < style.wait) return 'running';
      delete memory.waited;
      advance(memory, route.length, style.mode);
    }

    const point = route[memory.waypoint ?? 0];
    if (point && navigateTo(agent, point, GUARD.speed.walk, dt, ctx.grid)) {
      if (style.wait > 0) {
        memory.waited = 0;
        memory.arrivedYaw = agent.transform.yaw;
      } else {
        advance(memory, route.length, style.mode);
      }
    }
    return 'running';
  },
  interrupt: stop,
};

function advance(memory: Record<string, number>, count: number, mode: PatrolMode): void {
  const next = nextWaypoint(memory.waypoint ?? 0, memory.dir ?? 1, count, mode);
  memory.waypoint = next.i;
  memory.dir = next.dir;
}

/** Walks to the latest noise, looks around, then forgets it. */
const investigate: Action = {
  name: 'investigate',
  preconditions: { heardNoise: true },
  effects: { heardNoise: false },
  start: noop,
  tick(agent, ctx, dt): ActionStatus {
    const { blackboard: bb, memory } = agent.ai;
    if (!bb.noiseAt) return 'failed';
    if (memory.looking === undefined) {
      if (navigateTo(agent, bb.noiseAt, GUARD.speed.walk, dt, ctx.grid)) memory.looking = 0;
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

/** Runs to where the player is (if seen) or was last reported by the squad. */
const chase: Action = {
  name: 'chase',
  preconditions: {},
  effects: { seesPlayer: true },
  start: noop,
  tick(agent, ctx, dt) {
    // own eyes while they see the player; otherwise the squad's freshest report
    const bb = agent.ai.blackboard;
    const target =
      (bb.facts.seesPlayer ? bb.playerSeenAt : null) ?? ctx.squad.lastKnownPlayer ?? bb.playerSeenAt;
    if (!target) return 'failed';
    return navigateTo(agent, target, GUARD.speed.run, dt, ctx.grid) ? 'done' : 'running';
  },
  interrupt: stop,
};

/**
 * Stands, turns to the player and fires once aimed: after a short reaction delay, then
 * every `GUARD.combat.interval`. Aim error grows with distance, so far shots often miss.
 */
const shoot: Action = {
  name: 'shoot',
  preconditions: { seesPlayer: true, playerInRange: true },
  effects: {},
  start(agent) {
    stop(agent);
    agent.ai.memory.cooldown = GUARD.combat.reaction;
  },
  tick(agent, ctx, dt) {
    const target = agent.ai.blackboard.playerSeenAt;
    if (!target) return 'failed';
    face(agent, target, dt);
    const m = agent.ai.memory;
    m.cooldown = Math.max(0, (m.cooldown ?? 0) - dt);
    const t = agent.transform;
    const toTarget = yawOf(target.x - t.x, target.z - t.z);
    if (m.cooldown === 0 && Math.abs(wrapAngle(toTarget - t.yaw)) <= GUARD.combat.aimTolerance) {
      const distance = Math.hypot(target.x - t.x, target.z - t.z);
      const spread = GUARD.combat.spread.base + GUARD.combat.spread.perTile * distance;
      fire(ctx, agent, toTarget + ctx.rng.signed() * spread, GUARD.combat);
      m.cooldown = GUARD.combat.interval;
    }
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
    const point = { x: centre.x + offset.x * r, z: centre.z + offset.z * r };
    if (navigateTo(agent, point, GUARD.speed.walk, dt, ctx.grid)) {
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
  tick(agent, ctx, dt) {
    const { route, post } = agent.ai;
    const target = route[nearestWaypoint(agent)] ?? post;
    return navigateTo(agent, target, GUARD.speed.walk, dt, ctx.grid) ? 'done' : 'running';
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
