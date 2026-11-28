import { describe, expect, it } from 'vitest';
import { transform } from '../components';
import { Grid } from '../grid/grid';
import { EMPTY_INPUT, type InputSnapshot } from '../input';
import { PLAYER } from '../player/tuning';
import { Sim } from '../sim';
import { knockSystem } from './knock';

const DT = 1 / 60;
const press: InputSnapshot = { ...EMPTY_INPUT, held: new Set(['action']), pressed: new Set(['action']) };

function setup(yaw: number, stance: 'stand' | 'crouch' | 'crawl' = 'stand', x = 1.5) {
  const sim = new Sim([knockSystem]);
  sim.grid = Grid.fromRows(['#####', '#...#', '#####']);
  const p = sim.world.add({
    transform: transform(x, 1.5, yaw),
    collider: { halfWidth: 0.3, halfDepth: 0.3, height: 1.6 },
    stance,
    player: true as const,
  });
  const knocks = () => [...sim.events.ofType('noise')].filter((n) => n.kind === 'knock');
  return { sim, p, knocks };
}

describe('knockSystem', () => {
  it('knocks on the wall the player faces, at the wall', () => {
    const { sim, knocks } = setup(0); // facing north into the wall at z = 1
    sim.step(DT, press); // emitted and flushed this tick
    const k = knocks();
    expect(k).toHaveLength(1);
    expect(k[0]?.radius).toBe(PLAYER.knock.radius);
    expect(k[0]?.at.z).toBeCloseTo(1);
  });

  it('does nothing facing open floor, or while crawling', () => {
    const open = setup(-Math.PI / 2, 'stand', 2.5); // facing east, two tiles of floor ahead
    open.sim.step(DT, press);
    expect(open.knocks()).toHaveLength(0);

    const crawl = setup(0, 'crawl');
    crawl.sim.step(DT, press);
    expect(crawl.knocks()).toHaveLength(0);
  });

  it('waits out a cooldown between knocks', () => {
    const { sim, knocks } = setup(0);
    let total = 0;
    for (let i = 0; i < 10; i++) {
      sim.step(DT, press);
      total += knocks().length;
    }
    sim.step(DT);
    total += knocks().length;
    expect(total).toBe(1);
  });
});
