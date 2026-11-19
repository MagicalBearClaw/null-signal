import { describe, expect, it } from 'vitest';
import fixtureRaw from '../../../levels/maps/fixture.tmj?raw';
import tilesetRaw from '../../../levels/tilesets/semantics.tsj?raw';
import { Block } from '../grid/tiles';
import { createGrid } from './model';
import { facingToYaw, LevelError, loadLevel } from './tiled';

const tileset = JSON.parse(tilesetRaw) as unknown;
const resolve = (source: string) => {
  if (source !== '../tilesets/semantics.tsj') throw new Error(`unexpected tileset ${source}`);
  return tileset;
};
/** Raw Tiled JSON, mutated freely by the validation tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawMap = Record<string, any>;
const fixture = () => JSON.parse(fixtureRaw) as RawMap;
const load = (map: unknown = fixture()) => loadLevel('fixture', map, resolve);

/** Runs the loader and returns its issue list (fails the test if it loads). */
function issuesOf(map: unknown): readonly string[] {
  try {
    load(map);
  } catch (e) {
    if (e instanceof LevelError) return e.issues;
    throw e;
  }
  throw new Error('expected the level to be rejected');
}

const objectById = (map: RawMap, id: number) =>
  map.layers[1].objects.find((o: { id: number }) => o.id === id);

describe('loadLevel: fixture map', () => {
  const level = load();

  it('reads size, theme, objective and rating data from map properties', () => {
    expect(level).toMatchObject({
      name: 'fixture',
      width: 10,
      depth: 8,
      theme: 'simGrid',
      objective: { type: 'collectThenExit', params: { items: ['keycard'] } },
      parTime: 90,
      rankThresholds: { S: 9000, A: 7000, B: 5000, C: 3000 },
    });
  });

  it('maps tile gids to semantics through the external tileset', () => {
    const at = (x: number, z: number) => level.tiles[z * level.width + x];
    expect(at(0, 0)).toBe('wall');
    expect(at(1, 1)).toBe('floor');
    expect(at(3, 2)).toBe('lowWall');
    expect(at(7, 3)).toBe('crawlspace');
    expect(at(4, 4)).toBe('door');
    expect(at(2, 5)).toBe('electrified');
    expect(at(6, 6)).toBe('vent');
  });

  it('builds a collision grid from the tiles', () => {
    const grid = createGrid(level);
    expect(grid.blocks(4, 4, Block.Stand)).toBe(true);
    expect(grid.blocks(1, 1, Block.Stand)).toBe(false);
  });

  it('converts object positions from pixels to tiles and facing to yaw', () => {
    expect(level.spawn).toMatchObject({ id: 1, x: 1.5, z: 1.5 });
    expect(level.spawn.yaw).toBeCloseTo(facingToYaw(90));
    expect(level.goals).toEqual([{ x: 7, z: 5, width: 2, depth: 1 }]);
  });

  it('attaches the referenced patrol route to the guard', () => {
    expect(level.guards).toHaveLength(1);
    expect(level.guards[0]?.patrol).toEqual([
      { x: 5.5, z: 1.5 },
      { x: 8.5, z: 1.5 },
      { x: 8.5, z: 2.5 },
      { x: 5.5, z: 2.5 },
    ]);
  });

  it('reads sweepers with explicit and default properties', () => {
    expect(level.cameras[0]).toMatchObject({ id: 5, range: 5 });
    expect(level.cameras[0]?.sweep).toBeCloseTo(Math.PI / 3);
    expect(level.turrets[0]).toMatchObject({ id: 6, range: 8 });
    expect(level.turrets[0]?.sweep).toBeCloseTo(Math.PI / 2);
  });

  it('reads lasers, doors, pickups and switches', () => {
    expect(level.lasers).toEqual([
      { id: 7, from: { x: 3, z: 5 }, to: { x: 3, z: 7 }, mode: 'damage', onSeconds: 2, offSeconds: 1 },
    ]);
    expect(level.doors).toEqual([{ id: 8, tileX: 4, tileZ: 4, keycard: 1 }]);
    expect(level.pickups).toEqual([
      { id: 9, x: 8.5, z: 3.5, item: 'keycard', amount: 1 },
      { id: 10, x: 1.5, z: 3.5, item: 'ration', amount: 1 },
    ]);
    expect(level.switches).toEqual([{ id: 11, x: 1.5, z: 5.5, target: 7 }]);
  });
});

describe('facingToYaw', () => {
  it('turns compass degrees (clockwise from north) into sim yaw', () => {
    // yaw 0 faces -Z; forward vector is (-sin yaw, -cos yaw)
    const forward = (deg: number) => {
      const y = facingToYaw(deg);
      return { x: Math.round(-Math.sin(y)) + 0, z: Math.round(-Math.cos(y)) + 0 }; // + 0 normalises -0
    };
    expect(forward(0)).toEqual({ x: 0, z: -1 });
    expect(forward(90)).toEqual({ x: 1, z: 0 });
    expect(forward(180)).toEqual({ x: 0, z: 1 });
    expect(forward(270)).toEqual({ x: -1, z: 0 });
  });
});

describe('loadLevel: validation', () => {
  it('rejects non-map input with a schema error', () => {
    expect(() => load({ hello: 'world' })).toThrow(LevelError);
  });

  it('rejects unsupported map formats with clear messages', () => {
    const m = fixture();
    m.infinite = true;
    m.orientation = 'isometric';
    const issues = issuesOf(m);
    expect(issues.join('\n')).toMatch(/only orthogonal maps/);
    expect(issues.join('\n')).toMatch(/infinite maps are not supported/);
  });

  it('reports bad map properties by name', () => {
    const m = fixture();
    m.properties = [
      { name: 'theme', type: 'string', value: 'jungle' },
      { name: 'objective', type: 'string', value: 'sneak' },
      { name: 'parTime', type: 'float', value: -5 },
      { name: 'rankThresholds', type: 'string', value: '{"S":1,"A":2,"B":3,"C":4}' },
    ];
    const text = issuesOf(m).join('\n');
    expect(text).toMatch(/map property theme/);
    expect(text).toMatch(/map property parTime/);
    expect(text).toMatch(/strictly descending/);
  });

  it('rejects invalid JSON in structured properties', () => {
    const m = fixture();
    m.properties.find((p: { name: string }) => p.name === 'objectiveParams').value = '{not json';
    expect(issuesOf(m).join('\n')).toMatch(/objectiveParams: must be a JSON object/);
  });

  it('reports tiles whose gid has no semantic', () => {
    const m = fixture();
    m.layers[0].data[11] = 99;
    expect(issuesOf(m)).toContain('tile (1, 1): gid 99 is not in any tileset');
  });

  it('strips Tiled flip flags from gids', () => {
    const m = fixture();
    m.layers[0].data[11] = (0x80000000 | 1) >>> 0; // floor, flipped horizontally
    expect(load(m).tiles[11]).toBe('floor');
  });

  it('requires exactly one spawn', () => {
    const m = fixture();
    m.layers[1].objects = m.layers[1].objects.filter((o: { type: string }) => o.type !== 'spawn');
    expect(issuesOf(m)).toContain('expected exactly one spawn, found 0');
  });

  it('rejects unknown and untyped objects', () => {
    const m = fixture();
    m.layers[1].objects.push({ id: 50, name: 'x', type: 'dragon', x: 32, y: 32 });
    m.layers[1].objects.push({ id: 51, name: '', x: 32, y: 32 });
    const text = issuesOf(m).join('\n');
    expect(text).toMatch(/dragon #50 "x": unknown object type "dragon"/);
    expect(text).toMatch(/object #51: object has no type/);
  });

  it('checks object references', () => {
    const m = fixture();
    objectById(m, 3).properties[1].value = 8; // guard.patrol → the door
    objectById(m, 11).properties[0].value = 9; // switch.target → a pickup
    const text = issuesOf(m).join('\n');
    expect(text).toMatch(/guard #3 "north patrol": "patrol" must reference a patrol polyline/);
    expect(text).toMatch(/switch #11: "target" must reference a door or laser/);
  });

  it('treats an unset object reference (0) as none', () => {
    const m = fixture();
    objectById(m, 3).properties[1].value = 0;
    expect(load(m).guards[0]?.patrol).toEqual([]);
  });

  it('keeps door tiles and door objects in one-to-one correspondence', () => {
    const m = fixture();
    objectById(m, 8).x = 1.5 * 32; // move the door object off its tile
    const issues = issuesOf(m);
    expect(issues).toContain('door #8: sits on tile (1, 4), which is not a door tile');
    expect(issues).toContain('door tile (4, 4) has 0 door objects, expected 1');
  });

  it('rejects objects outside the map and malformed shapes', () => {
    const m = fixture();
    objectById(m, 10).x = 99 * 32;
    objectById(m, 7).polyline.push({ x: 0, y: 32 });
    const text = issuesOf(m).join('\n');
    expect(text).toMatch(/pickup #10: position \(99, 3\.5\) is outside the map/);
    expect(text).toMatch(/laser #7: lasers must be polylines with exactly 2 points/);
  });

  it('reports property type errors with the object and property name', () => {
    const m = fixture();
    objectById(m, 8).properties[0].value = 'red';
    expect(issuesOf(m).join('\n')).toMatch(/door #8 keycard:/);
  });

  it('collects several problems into one error', () => {
    const m = fixture();
    m.layers[0].data[11] = 99;
    m.layers[1].objects.push({ id: 50, type: 'dragon', x: 0, y: 0 });
    expect(issuesOf(m).length).toBeGreaterThanOrEqual(2);
  });

  it('explains when an external tileset cannot be resolved', () => {
    const m = fixture();
    expect(() => loadLevel('fixture', m)).toThrow(/no tileset resolver was given/);
  });
});

describe('loadLevel: camera framing', () => {
  it('reads map camera settings, with defaults for missing ones', () => {
    const level = load();
    expect(level.camera).toEqual({ pitch: 60, distance: 9 }); // pitch defaulted, distance set
  });

  it('reads camera zones in tile units', () => {
    expect(load().cameraZones).toEqual([
      { x: 0, z: 5, width: 10, depth: 3, framing: { pitch: 75, distance: 8 } },
    ]);
  });

  it('fills zone framing from the map when a zone leaves a value out', () => {
    const m = fixture();
    objectById(m, 12).properties = [{ name: 'pitch', type: 'float', value: 80 }];
    expect(load(m).cameraZones[0]?.framing).toEqual({ pitch: 80, distance: 9 });
  });

  it('rejects out-of-range pitch and non-rectangle zones', () => {
    const m = fixture();
    objectById(m, 12).properties[0].value = 10;
    m.layers[1].objects.push({ id: 60, type: 'cameraZone', x: 32, y: 32 });
    const text = issuesOf(m).join('\n');
    expect(text).toMatch(/cameraZone #12 "south room" pitch:/);
    expect(text).toMatch(/cameraZone #60: camera zones must be rectangles/);
  });
});
