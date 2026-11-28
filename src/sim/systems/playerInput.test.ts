import { describe, expect, it } from 'vitest';
import { transform, type Entity } from '../components';
import { Grid } from '../grid/grid';
import { EMPTY_INPUT, type ButtonAction, type InputSnapshot } from '../input';
import { PLAYER } from '../player/tuning';
import { Sim } from '../sim';
import { footstepSystem } from './footsteps';
import { movementSystem } from './movement';
import { playerInputSystem, turnToward, yawOf } from './playerInput';

const DT = 1 / 60;

function input(
  move: { x: number; z: number },
  held: ButtonAction[] = [],
  pressed: ButtonAction[] = [],
): InputSnapshot {
  return { ...EMPTY_INPUT, move, held: new Set(held), pressed: new Set(pressed) };
}

function setup(rows?: string[]) {
  const sim = new Sim([playerInputSystem, movementSystem, footstepSystem]);
  if (rows) sim.grid = Grid.fromRows(rows);
  type Player = Entity &
    Required<Pick<Entity, 'transform' | 'velocity' | 'collider' | 'stance' | 'locomotion'>>;
  const player: Player = {
    transform: transform(1.5, 1.5),
    velocity: { x: 0, z: 0 },
    collider: { halfWidth: 0.3, halfDepth: 0.3, height: PLAYER.collider.standHeight },
    stance: 'stand',
    locomotion: { running: false, travelled: 0 },
    player: true,
  };
  const p = sim.world.add(player);
  return { sim, p };
}

describe('yawOf / turnToward', () => {
  it('yawOf inverts the forward vector convention', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0); // north
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2); // east
    expect(Math.abs(yawOf(0, 1))).toBeCloseTo(Math.PI); // south
  });

  it('turns by at most maxStep along the shorter arc, then snaps', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
    // 170° → -170° is 20° the short way (through 180°), not 340°
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const step = turnToward(from, to, (5 * Math.PI) / 180);
    expect(step).toBeCloseTo((175 * Math.PI) / 180);
  });
});

describe('playerInputSystem: speed', () => {
  it('walks at walk speed with full deflection', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: 1, z: 0 }));
    expect(p.velocity.x).toBeCloseTo(PLAYER.speed.walk);
  });

  it('scales with analog deflection', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: 0, z: 0.5 }));
    expect(p.velocity.z).toBeCloseTo(PLAYER.speed.walk * 0.5);
  });

  it('runs while run is held and standing', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: -1, z: 0 }, ['run']));
    expect(p.velocity.x).toBeCloseTo(-PLAYER.speed.run);
    expect(p.locomotion.running).toBe(true);
  });

  it('stops dead with no input, inside the stick threshold', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: 1, z: 0 }));
    sim.step(DT, input({ x: 0.01, z: 0 }, ['run']));
    expect(p.velocity).toEqual({ x: 0, z: 0 });
    expect(p.locomotion.running).toBe(false);
  });

  it('turns to face the move direction over several ticks, then keeps facing when idle', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: 1, z: 0 })); // want east = -π/2
    expect(p.transform.yaw).toBeCloseTo(-PLAYER.turnRate * DT);
    for (let i = 0; i < 30; i++) sim.step(DT, input({ x: 1, z: 0 }));
    expect(p.transform.yaw).toBeCloseTo(-Math.PI / 2);
    sim.step(DT, EMPTY_INPUT);
    expect(p.transform.yaw).toBeCloseTo(-Math.PI / 2);
  });
});

describe('playerInputSystem: stance', () => {
  it('crouch toggles on press, shrinking the collider and slowing down; run is ignored', () => {
    const { sim, p } = setup();
    sim.step(DT, input({ x: 1, z: 0 }, ['crouch', 'run'], ['crouch']));
    expect(p.stance).toBe('crouch');
    expect(p.collider.height).toBe(PLAYER.collider.crouchHeight);
    expect(p.velocity.x).toBeCloseTo(PLAYER.speed.crouch);
    expect(p.locomotion.running).toBe(false);

    sim.step(DT, input({ x: 0, z: 0 }, ['crouch'])); // still held: no second toggle
    expect(p.stance).toBe('crouch');

    sim.step(DT, input({ x: 0, z: 0 }, ['crouch'], ['crouch']));
    expect(p.stance).toBe('stand');
    expect(p.collider.height).toBe(PLAYER.collider.standHeight);
  });

  it('cannot stand up without headroom', () => {
    const { sim, p } = setup(['.....', '.....', '.....']);
    p.stance = 'crouch';
    p.collider.height = PLAYER.collider.crouchHeight;
    sim.grid?.set(1, 1, 'crawlspace'); // something low over the player's head
    sim.step(DT, input({ x: 0, z: 0 }, ['crouch'], ['crouch']));
    expect(p.stance).toBe('crouch');
    sim.grid?.set(1, 1, 'floor');
    sim.step(DT, input({ x: 0, z: 0 }, ['crouch'], ['crouch']));
    expect(p.stance).toBe('stand');
  });
});

describe('footstepSystem', () => {
  const footsteps = (sim: Sim) => [...sim.events.ofType('noise')].filter((n) => n.kind === 'footstep');

  it('emits a footstep each stride while running, at the runner', () => {
    const { sim, p } = setup();
    const ticksPerStride = PLAYER.footsteps.stride / (PLAYER.speed.run * DT);
    let count = 0;
    for (let i = 0; i < Math.ceil(ticksPerStride * 3); i++) {
      sim.step(DT, input({ x: 1, z: 0 }, ['run']));
      const fs = footsteps(sim);
      count += fs.length;
      for (const n of fs) {
        expect(n.radius).toBe(PLAYER.footsteps.runRadius);
        expect(n.at.x).toBeCloseTo(p.transform.x);
        expect(n.source).toBe(sim.world.id(p));
      }
    }
    expect(count).toBe(3);
  });

  it('makes quieter footsteps walking than running', () => {
    const { sim } = setup(['..........', '..........', '..........']);
    const radii: number[] = [];
    for (let i = 0; i < 120; i++) {
      sim.step(DT, input({ x: 1, z: 0 }));
      radii.push(...footsteps(sim).map((n) => n.radius));
    }
    expect(radii.length).toBeGreaterThan(0);
    expect(new Set(radii)).toEqual(new Set([PLAYER.footsteps.walkRadius]));
    expect(PLAYER.footsteps.walkRadius).toBeLessThan(PLAYER.footsteps.runRadius);
  });

  it('is silent while crouching or crawling', () => {
    for (const stance of ['crouch', 'crawl'] as const) {
      const { sim, p } = setup(['..........', '..........', '..........']);
      p.stance = stance;
      let count = 0;
      for (let i = 0; i < 120; i++) {
        sim.step(DT, input({ x: 1, z: 0 }));
        count += footsteps(sim).length;
      }
      expect(count).toBe(0);
    }
  });

  it('makes no noise running into a wall (no distance covered)', () => {
    const { sim } = setup(['#####', '#...#', '#####']);
    let count = 0;
    for (let i = 0; i < 120; i++) {
      sim.step(DT, input({ x: -1, z: 0 }, ['run']));
      count += footsteps(sim).length;
    }
    expect(count).toBe(0);
  });
});
