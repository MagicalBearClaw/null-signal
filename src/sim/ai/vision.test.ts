import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import { Grid } from '../grid/grid';
import { Sim } from '../sim';
import type { Stance } from '../grid/tiles';
import { GUARD_ACTIONS } from './actions';
import { createAiSystem } from './aiSystem';
import { createGuardBrain } from './guardBrain';
import { createAiState, type Agent } from './types';
import { detectionRate, look, updateAwareness, VISION, type VisionCone } from './vision';
import { createVisionSensor } from './visionSensor';

const CONE: VisionCone = { fov: Math.PI / 2, range: 6 };
const NORTH = { x: 2.5, z: 5.5, yaw: 0 }; // looking toward -Z

describe('look', () => {
  const open = Grid.fromRows(['.....', '.....', '.....', '.....', '.....', '.....']);

  it('sees a target ahead, inside range and angle', () => {
    expect(look(open, NORTH, CONE, { x: 2.5, z: 1.5 }, 'stand')).toEqual({ visible: true, distance: 4 });
  });

  it('misses targets behind, outside the cone, or out of range', () => {
    expect(look(null, NORTH, CONE, { x: 2.5, z: 7 }, 'stand').visible).toBe(false); // behind
    expect(look(null, NORTH, CONE, { x: 5.5, z: 4.5 }, 'stand').visible).toBe(false); // 72° off axis
    expect(look(null, NORTH, CONE, { x: 2.5, z: -1 }, 'stand').visible).toBe(false); // 6.5 away
  });

  it('turns with the eye: yaw π/2 looks west', () => {
    expect(look(null, { x: 5, z: 5, yaw: Math.PI / 2 }, CONE, { x: 2, z: 5 }, 'stand').visible).toBe(true);
    expect(look(null, { x: 5, z: 5, yaw: Math.PI / 2 }, CONE, { x: 8, z: 5 }, 'stand').visible).toBe(false);
  });

  it('is blocked by walls', () => {
    const grid = Grid.fromRows(['.....', '.....', '..#..', '.....', '.....', '.....']);
    expect(look(grid, NORTH, CONE, { x: 2.5, z: 0.5 }, 'stand').visible).toBe(false);
  });

  it('follows the cover rule: a low wall hides a crouched target but not a standing one', () => {
    const grid = Grid.fromRows(['.....', '.....', '..=..', '.....', '.....', '.....']);
    expect(look(grid, NORTH, CONE, { x: 2.5, z: 0.5 }, 'stand').visible).toBe(true);
    expect(look(grid, NORTH, CONE, { x: 2.5, z: 0.5 }, 'crouch').visible).toBe(false);
    expect(look(grid, NORTH, CONE, { x: 2.5, z: 0.5 }, 'crawl').visible).toBe(false);
  });
});

describe('detection math', () => {
  it('is instant at point-blank range', () => {
    expect(detectionRate(VISION.instantRange, 6, 'crawl')).toBe(Infinity);
  });

  it('is faster up close and slower when low', () => {
    expect(detectionRate(2, 6, 'stand')).toBeGreaterThan(detectionRate(5, 6, 'stand'));
    const rates = (['stand', 'crouch', 'crawl'] as Stance[]).map((s) => detectionRate(4, 6, s));
    expect(rates[0]).toBeGreaterThan(rates[1] ?? 0);
    expect(rates[1]).toBeGreaterThan(rates[2] ?? 0);
  });

  it('equals the base rate at the edge of the cone, standing', () => {
    expect(detectionRate(6, 6, 'stand')).toBeCloseTo(VISION.baseRate);
  });

  it('fills while visible, drains while hidden, and stays in 0..1', () => {
    const seen = { visible: true, distance: 6 };
    const hidden = { visible: false, distance: 6 };
    expect(updateAwareness(0, seen, 6, 'stand', 0.5)).toBeCloseTo(VISION.baseRate * 0.5);
    expect(updateAwareness(0.5, hidden, 6, 'stand', 1)).toBeCloseTo(0.5 - VISION.decayRate);
    expect(updateAwareness(0.9, { visible: true, distance: 1 }, 6, 'stand', 0.016)).toBe(1);
    expect(updateAwareness(0.1, hidden, 6, 'stand', 10)).toBe(0);
  });
});

describe('guard vision sensor', () => {
  const DT = 1 / 60;

  function setup(rows: string[], player: { x: number; z: number; stance: Stance }) {
    const sim = new Sim([
      createAiSystem({
        sensors: [createVisionSensor()],
        decision: createGuardBrain(),
        actions: GUARD_ACTIONS,
      }),
    ]);
    sim.grid = Grid.fromRows(rows);
    const guard = sim.world.add({
      transform: transform(2.5, 6.5, 0),
      velocity: { x: 0, z: 0 },
      vision: { ...CONE },
      guard: true,
      ai: createAiState([], { x: 2.5, z: 6.5, yaw: 0 }),
    }) as Agent;
    const p = sim.world.add({
      transform: transform(player.x, player.z),
      stance: player.stance,
      player: true,
    });
    const spotted: number[] = [];
    sim.events.on('spotted', () => spotted.push(sim.tick));
    /** Seconds until the guard sees the player (Infinity if not within `limit`). */
    const timeToSpot = (limit = 10) => {
      for (let i = 0; i < limit / DT; i++) {
        sim.step(DT);
        if (guard.ai.blackboard.facts.seesPlayer) return (i + 1) * DT;
      }
      return Infinity;
    };
    return { sim, guard, p, spotted, timeToSpot };
  }

  const ROOM = ['.....', '.....', '.....', '.....', '.....', '.....', '.....'];

  it('spots a standing player after a moment, raising the squad and a spotted event', () => {
    const { sim, guard, spotted, timeToSpot } = setup(ROOM, { x: 2.5, z: 1.5, stance: 'stand' });
    const t = timeToSpot();
    expect(t).toBeGreaterThan(0.1);
    expect(t).toBeLessThan(2);
    expect(sim.squad.lastKnownPlayer).toEqual({ x: 2.5, z: 1.5 });
    sim.step(DT); // events from the spotting tick are flushed and dispatched
    expect(spotted).toHaveLength(1);
    expect(guard.ai.state).toBe('shoot'); // 5 tiles away: within firing range
  });

  it('takes longer to spot a crouched player at the same spot', () => {
    const stand = setup(ROOM, { x: 2.5, z: 1.5, stance: 'stand' }).timeToSpot();
    const crouch = setup(ROOM, { x: 2.5, z: 1.5, stance: 'crouch' }).timeToSpot();
    expect(crouch).toBeGreaterThan(stand * 1.5);
  });

  it('never spots a player crouched behind a low wall', () => {
    const rows = ['.....', '.....', '..=..', '.....', '.....', '.....', '.....'];
    expect(setup(rows, { x: 2.5, z: 1.5, stance: 'crouch' }).timeToSpot()).toBe(Infinity);
    expect(setup(rows, { x: 2.5, z: 1.5, stance: 'stand' }).timeToSpot()).toBeLessThan(2);
  });

  it('walks over to investigate a half-seen player before spotting them', () => {
    const { sim, guard } = setup(ROOM, { x: 2.5, z: 1.5, stance: 'crawl' });
    for (let i = 0; i < 2 / DT && !guard.ai.blackboard.noiseAt; i++) sim.step(DT);
    expect(guard.ai.blackboard.facts.seesPlayer).toBe(false);
    expect(guard.ai.blackboard.noiseAt).toEqual({ x: 2.5, z: 1.5 });
    sim.step(DT);
    expect(guard.ai.state).toBe('investigate');
  });

  it('flags the player in range only when close enough to shoot', () => {
    const near = setup(ROOM, { x: 2.5, z: 3.5, stance: 'stand' });
    near.timeToSpot();
    expect(near.guard.ai.blackboard.facts.playerInRange).toBe(true);
  });

  it('loses the player behind a wall and lets awareness drain', () => {
    const { sim, guard, p, timeToSpot } = setup(ROOM, { x: 2.5, z: 2.5, stance: 'stand' });
    timeToSpot();
    p.transform.x = 2.5;
    p.transform.z = 9; // out of range
    sim.step(DT);
    expect(guard.ai.blackboard.facts.seesPlayer).toBe(false);
    for (let i = 0; i < 60; i++) sim.step(DT);
    expect(guard.ai.blackboard.awareness).toBeLessThan(1);
  });
});
