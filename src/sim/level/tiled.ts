import { z } from 'zod';
import type { Vec2 } from '../events';
import { TILES, type Tile } from '../grid/tiles';
import { wrapAngle } from '../math';
import {
  OBJECTIVE_TYPES,
  THEMES,
  type DoorDef,
  type GuardDef,
  type LaserDef,
  type Level,
  type PickupDef,
  type Placement,
  type Rect,
  type SweeperDef,
  type SwitchDef,
} from './model';

/**
 * Loads a Tiled JSON map (`.tmj`) into a validated {@link Level}.
 *
 * Authoring conventions (see `levels/README.md`):
 * - One tile layer. Each tileset tile carries a string property `semantic` naming a
 *   {@link Tile}. Unpainted cells are walls.
 * - Object layers hold typed objects (Tiled "Class"): spawn, goal, guard, patrol, camera,
 *   turret, laser, door, pickup, switch.
 * - Map properties: theme, objective, objectiveParams, parTime, rankThresholds.
 *
 * All problems found are reported together in one {@link LevelError}.
 */

export class LevelError extends Error {
  constructor(
    readonly level: string,
    readonly issues: readonly string[],
  ) {
    super(`Level "${level}" is invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'LevelError';
  }
}

/** Resolves an external tileset `source` path (as written in the map) to its parsed JSON. */
export type TilesetResolver = (source: string) => unknown;

// ---------------------------------------------------------------------------
// Tiled JSON schema (the subset we use)
// ---------------------------------------------------------------------------

const PropertySchema = z.object({ name: z.string(), type: z.string().optional(), value: z.unknown() });
const Properties = z.array(PropertySchema).default([]);

const PointSchema = z.object({ x: z.number(), y: z.number() });

const ObjectSchema = z.object({
  id: z.number().int(),
  name: z.string().default(''),
  type: z.string().optional(),
  class: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  rotation: z.number().default(0),
  gid: z.number().optional(),
  polyline: z.array(PointSchema).optional(),
  polygon: z.array(PointSchema).optional(),
  properties: Properties,
});
type TiledObject = z.infer<typeof ObjectSchema>;

const LayerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tilelayer'),
    name: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    encoding: z
      .literal('csv', { error: 'tile layers must use CSV (or array) encoding, not base64' })
      .optional(),
    compression: z.undefined({ error: 'tile layers must not be compressed' }).optional(),
    data: z.array(z.number().int().nonnegative()),
  }),
  z.object({ type: z.literal('objectgroup'), name: z.string(), objects: z.array(ObjectSchema) }),
  z.object({ type: z.literal('imagelayer') }),
  z.object({
    type: z.literal('group'),
    layers: z.never({ error: 'group layers are not supported; move their layers to the top level' }),
  }),
]);

const TilesetSchema = z.object({
  name: z.string(),
  tilecount: z.number().int().nonnegative(),
  tiles: z.array(z.object({ id: z.number().int(), properties: Properties })).default([]),
});
type Tileset = z.infer<typeof TilesetSchema>;

const TilesetRefSchema = z.looseObject({
  firstgid: z.number().int().positive(),
  source: z.string().optional(),
});

const MapSchema = z.object({
  orientation: z.literal('orthogonal', { error: 'only orthogonal maps are supported' }),
  infinite: z.literal(false, { error: 'infinite maps are not supported' }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  properties: Properties,
  tilesets: z.array(TilesetRefSchema).min(1, 'the map needs a tileset'),
  layers: z.array(LayerSchema),
});

// ---------------------------------------------------------------------------
// Property schemas
// ---------------------------------------------------------------------------

/** Tiled stores structured values as JSON strings (or as class-typed properties). */
const json = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return v;
    }
  }, schema);

const MapPropsSchema = z.object({
  theme: z.enum(THEMES),
  objective: z.enum(OBJECTIVE_TYPES),
  objectiveParams: json(z.record(z.string(), z.unknown(), { error: 'must be a JSON object' })).default({}),
  parTime: z.number().positive(),
  rankThresholds: json(
    z.object(
      { S: z.number(), A: z.number(), B: z.number(), C: z.number() },
      { error: 'must be a JSON object' },
    ),
  ).refine((t) => t.S > t.A && t.A > t.B && t.B > t.C, 'must be strictly descending: S > A > B > C'),
});

const degrees = (fallback: number) => z.number().default(fallback);
const objectRef = z.number().int().positive().optional(); // Tiled "object" properties; 0 = unset

const FacingProps = z.object({ facing: degrees(0) });
const GuardProps = FacingProps.extend({ patrol: objectRef });
const SweeperProps = (range: number) =>
  FacingProps.extend({
    sweep: z.number().min(0).max(360).default(90),
    range: z.number().positive().default(range),
  });
const LaserProps = z.object({
  mode: z.enum(['alarm', 'damage']).default('alarm'),
  onSeconds: z.number().nonnegative().default(0),
  offSeconds: z.number().nonnegative().default(0),
});
const DoorProps = z.object({ keycard: z.number().int().nonnegative().default(0) });
const PickupProps = z.object({ item: z.string().min(1), amount: z.number().int().positive().default(1) });
const SwitchProps = z.object({ target: objectRef });

const OBJECT_KINDS = [
  'spawn',
  'goal',
  'guard',
  'patrol',
  'camera',
  'turret',
  'laser',
  'door',
  'pickup',
  'switch',
] as const;
type ObjectKind = (typeof OBJECT_KINDS)[number];

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const GID_MASK = 0x0fffffff; // strips Tiled's flip/rotation flags

/** Compass degrees clockwise from north (what level authors write) → sim yaw. */
export function facingToYaw(degreesClockwiseFromNorth: number): number {
  return wrapAngle((-degreesClockwiseFromNorth * Math.PI) / 180);
}

export function loadLevel(
  name: string,
  mapJson: unknown,
  resolveTileset: TilesetResolver = noExternal,
): Level {
  const issues: string[] = [];
  const fail = () => new LevelError(name, issues);

  const parsed = MapSchema.safeParse(mapJson);
  if (!parsed.success) {
    issues.push(...formatIssues('map', parsed.error));
    throw fail();
  }
  const map = parsed.data;
  if (map.tilewidth !== map.tileheight) issues.push('tiles must be square');
  const unit = map.tilewidth;

  // Tilesets → gid lookup
  const tilesets = resolveTilesets(map.tilesets, resolveTileset, issues);

  // Tile layer → semantics
  const tileLayers = map.layers.flatMap((l) => (l.type === 'tilelayer' ? [l] : []));
  if (tileLayers.length !== 1) {
    issues.push(`expected exactly one tile layer, found ${tileLayers.length}`);
    throw fail();
  }
  const [layer] = tileLayers as [(typeof tileLayers)[number]];
  if (
    layer.width !== map.width ||
    layer.height !== map.height ||
    layer.data.length !== map.width * map.height
  ) {
    issues.push(`tile layer "${layer.name}" must cover the whole ${map.width}×${map.height} map`);
    throw fail();
  }
  const tiles: Tile[] = layer.data.map((raw, i) => {
    const gid = raw & GID_MASK;
    if (gid === 0) return 'wall';
    const tile = lookupSemantic(tilesets, gid);
    if (typeof tile === 'string') return tile;
    issues.push(`tile (${i % map.width}, ${Math.floor(i / map.width)}): ${tile.error}`);
    return 'wall';
  });

  // Map properties
  const props = MapPropsSchema.safeParse(propertyBag(map.properties));
  if (!props.success) issues.push(...formatIssues('map property', props.error));

  // Objects
  const objects = map.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects : []));
  const byId = new Map(objects.map((o) => [o.id, o]));
  const kindOf = (o: TiledObject): ObjectKind | null => {
    const k = o.type || o.class || '';
    return (OBJECT_KINDS as readonly string[]).includes(k) ? (k as ObjectKind) : null;
  };

  const ctx: ObjectContext = { unit, width: map.width, depth: map.height, issues };
  const spawns: Placement[] = [];
  const goals: Rect[] = [];
  const guards: GuardDef[] = [];
  const cameras: SweeperDef[] = [];
  const turrets: SweeperDef[] = [];
  const lasers: LaserDef[] = [];
  const doors: DoorDef[] = [];
  const pickups: PickupDef[] = [];
  const switches: SwitchDef[] = [];

  for (const o of objects) {
    const kind = kindOf(o);
    const where = describe(o);
    if (!kind) {
      const k = o.type || o.class;
      issues.push(
        k
          ? `${where}: unknown object type "${k}" (expected one of ${OBJECT_KINDS.join(', ')})`
          : `${where}: object has no type`,
      );
      continue;
    }
    if (o.gid !== undefined || o.polygon || o.rotation !== 0) {
      issues.push(`${where}: tile objects, polygons and rotated objects are not supported`);
      continue;
    }

    switch (kind) {
      case 'spawn': {
        const p = parseProps(FacingProps, o, ctx);
        const at = position(o, ctx);
        if (p && at) spawns.push({ id: o.id, ...at, yaw: facingToYaw(p.facing) });
        break;
      }
      case 'goal': {
        if (o.width <= 0 || o.height <= 0 || o.polyline) {
          issues.push(`${where}: goals must be rectangles`);
          break;
        }
        const r = { x: o.x / unit, z: o.y / unit, width: o.width / unit, depth: o.height / unit };
        if (inBounds(r.x, r.z, ctx) && inBounds(r.x + r.width, r.z + r.depth, ctx)) goals.push(r);
        else issues.push(`${where}: goal is outside the map`);
        break;
      }
      case 'guard': {
        const p = parseProps(GuardProps, o, ctx);
        const at = position(o, ctx);
        if (!p || !at) break;
        let patrol: Vec2[] = [];
        if (p.patrol !== undefined) {
          const route = byId.get(p.patrol);
          if (!route || kindOf(route) !== 'patrol' || !route.polyline) {
            issues.push(`${where}: "patrol" must reference a patrol polyline (got object ${p.patrol})`);
          } else {
            patrol = polyline(route, ctx) ?? [];
          }
        }
        guards.push({ id: o.id, ...at, yaw: facingToYaw(p.facing), patrol });
        break;
      }
      case 'patrol': {
        if (!o.polyline || o.polyline.length < 2)
          issues.push(`${where}: patrols must be polylines with 2+ points`);
        else polyline(o, ctx); // bounds check; consumed through the guard that references it
        break;
      }
      case 'camera':
      case 'turret': {
        const p = parseProps(SweeperProps(kind === 'camera' ? 6 : 8), o, ctx);
        const at = position(o, ctx);
        if (!p || !at) break;
        const def = {
          id: o.id,
          ...at,
          yaw: facingToYaw(p.facing),
          sweep: (p.sweep * Math.PI) / 180,
          range: p.range,
        };
        (kind === 'camera' ? cameras : turrets).push(def);
        break;
      }
      case 'laser': {
        const p = parseProps(LaserProps, o, ctx);
        const pts = o.polyline?.length === 2 ? polyline(o, ctx) : null;
        if (!o.polyline || o.polyline.length !== 2)
          issues.push(`${where}: lasers must be polylines with exactly 2 points`);
        if (p && pts) {
          const [from, to] = pts as [Vec2, Vec2];
          lasers.push({ id: o.id, from, to, ...p });
        }
        break;
      }
      case 'door': {
        const p = parseProps(DoorProps, o, ctx);
        const at = position(o, ctx);
        if (!p || !at) break;
        const tileX = Math.floor(at.x);
        const tileZ = Math.floor(at.z);
        if (tiles[tileZ * map.width + tileX] !== 'door') {
          issues.push(`${where}: sits on tile (${tileX}, ${tileZ}), which is not a door tile`);
          break;
        }
        doors.push({ id: o.id, tileX, tileZ, keycard: p.keycard });
        break;
      }
      case 'pickup': {
        const p = parseProps(PickupProps, o, ctx);
        const at = position(o, ctx);
        if (p && at) pickups.push({ id: o.id, ...at, ...p });
        break;
      }
      case 'switch': {
        const p = parseProps(SwitchProps, o, ctx);
        const at = position(o, ctx);
        if (!p || !at) break;
        if (p.target !== undefined) {
          const t = byId.get(p.target);
          const tk = t && kindOf(t);
          if (tk !== 'door' && tk !== 'laser') {
            issues.push(`${where}: "target" must reference a door or laser (got object ${p.target})`);
            break;
          }
        }
        switches.push({ id: o.id, ...at, target: p.target ?? null });
        break;
      }
    }
  }

  if (spawns.length !== 1) issues.push(`expected exactly one spawn, found ${spawns.length}`);

  // Every door tile needs exactly one door object (for its keycard level).
  tiles.forEach((t, i) => {
    if (t !== 'door') return;
    const x = i % map.width;
    const z = Math.floor(i / map.width);
    const n = doors.filter((d) => d.tileX === x && d.tileZ === z).length;
    if (n !== 1) issues.push(`door tile (${x}, ${z}) has ${n} door objects, expected 1`);
  });

  if (issues.length > 0 || !props.success) throw fail();
  const [spawn] = spawns as [Placement];
  const mp = props.data;

  return {
    name,
    width: map.width,
    depth: map.height,
    tiles,
    theme: mp.theme,
    objective: { type: mp.objective, params: mp.objectiveParams },
    parTime: mp.parTime,
    rankThresholds: mp.rankThresholds,
    spawn,
    goals,
    guards,
    cameras,
    turrets,
    lasers,
    doors,
    pickups,
    switches,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ObjectContext {
  readonly unit: number;
  readonly width: number;
  readonly depth: number;
  readonly issues: string[];
}

interface ResolvedTileset {
  readonly firstgid: number;
  readonly name: string;
  readonly tilecount: number;
  readonly semantics: ReadonlyMap<number, Tile>;
}

function noExternal(source: string): never {
  throw new Error(`no tileset resolver was given for external tileset "${source}"`);
}

function resolveTilesets(
  refs: readonly z.infer<typeof TilesetRefSchema>[],
  resolve: TilesetResolver,
  issues: string[],
): ResolvedTileset[] {
  const out: ResolvedTileset[] = [];
  for (const ref of refs) {
    let raw: unknown = ref;
    if (ref.source !== undefined) {
      try {
        raw = resolve(ref.source);
      } catch (e) {
        issues.push(`tileset "${ref.source}": ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    const label = ref.source ?? `firstgid ${ref.firstgid}`;
    const ts = TilesetSchema.safeParse(raw);
    if (!ts.success) {
      issues.push(...formatIssues(`tileset "${label}"`, ts.error));
      continue;
    }
    out.push({ firstgid: ref.firstgid, ...semanticsOf(ts.data, label, issues) });
  }
  return out.sort((a, b) => b.firstgid - a.firstgid); // highest firstgid first, for lookup
}

function semanticsOf(ts: Tileset, label: string, issues: string[]) {
  const semantics = new Map<number, Tile>();
  for (const tile of ts.tiles) {
    const value = tile.properties.find((p) => p.name === 'semantic')?.value;
    if (value === undefined) continue;
    if (typeof value === 'string' && (TILES as readonly string[]).includes(value)) {
      semantics.set(tile.id, value as Tile);
    } else {
      issues.push(`tileset "${label}" tile ${tile.id}: unknown semantic ${JSON.stringify(value)}`);
    }
  }
  return { name: ts.name, tilecount: ts.tilecount, semantics };
}

function lookupSemantic(tilesets: readonly ResolvedTileset[], gid: number): Tile | { error: string } {
  const ts = tilesets.find((t) => gid >= t.firstgid);
  if (!ts || gid - ts.firstgid >= ts.tilecount) return { error: `gid ${gid} is not in any tileset` };
  const tile = ts.semantics.get(gid - ts.firstgid);
  return tile ?? { error: `tile ${gid - ts.firstgid} of tileset "${ts.name}" has no "semantic" property` };
}

function propertyBag(props: readonly { name: string; value: unknown }[]): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const p of props) {
    // Tiled writes 0 for an unset object reference.
    bag[p.name] = p.value === 0 && (p as { type?: string }).type === 'object' ? undefined : p.value;
  }
  return bag;
}

function parseProps<T extends z.ZodType>(schema: T, o: TiledObject, ctx: ObjectContext): z.infer<T> | null {
  const r = schema.safeParse(propertyBag(o.properties));
  if (r.success) return r.data;
  ctx.issues.push(...formatIssues(describe(o), r.error));
  return null;
}

/** Point objects use their position; rectangles and ellipses use their centre. */
function position(o: TiledObject, ctx: ObjectContext): { x: number; z: number } | null {
  if (o.polyline) {
    ctx.issues.push(`${describe(o)}: expected a point or rectangle, not a polyline`);
    return null;
  }
  const x = (o.x + o.width / 2) / ctx.unit;
  const z = (o.y + o.height / 2) / ctx.unit;
  if (!inBounds(x, z, ctx)) {
    ctx.issues.push(`${describe(o)}: position (${x}, ${z}) is outside the map`);
    return null;
  }
  return { x, z };
}

function polyline(o: TiledObject, ctx: ObjectContext): Vec2[] | null {
  const pts = (o.polyline ?? []).map((p) => ({ x: (o.x + p.x) / ctx.unit, z: (o.y + p.y) / ctx.unit }));
  const outside = pts.find((p) => !inBounds(p.x, p.z, ctx));
  if (outside) {
    ctx.issues.push(`${describe(o)}: point (${outside.x}, ${outside.z}) is outside the map`);
    return null;
  }
  return pts;
}

function inBounds(x: number, z: number, ctx: ObjectContext): boolean {
  return x >= 0 && z >= 0 && x <= ctx.width && z <= ctx.depth;
}

function describe(o: TiledObject): string {
  const kind = o.type || o.class || 'object';
  return `${kind} #${o.id}${o.name ? ` "${o.name}"` : ''}`;
}

function formatIssues(where: string, error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.length > 0 ? ` ${i.path.join('.')}` : '';
    return `${where}${path}: ${i.message}`;
  });
}
