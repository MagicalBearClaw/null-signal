import type { Vec2 } from '../events';
import { Grid } from '../grid/grid';
import type { Tile } from '../grid/tiles';

/**
 * The typed, validated level model the sim runs on. Built from Tiled JSON by
 * `loadLevel` (see `tiled.ts`); nothing here knows about Tiled or about visuals.
 *
 * All positions are in world tile units on the X/Z plane (1 unit = 1 tile, +X east,
 * +Z south). Yaw follows the sim convention: radians about +Y, 0 faces north (-Z).
 */

export const THEMES = ['simGrid', 'facility'] as const;
export type Theme = (typeof THEMES)[number];

/** The v1 objective set (DESIGN.md §5). New scenarios register a new type here. */
export const OBJECTIVE_TYPES = [
  'sneak',
  'weaponPractice',
  'eliminateAll',
  'timeAttack',
  'collectThenExit',
] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

/** Score needed for each rank; anything below C is a D. */
export interface RankThresholds {
  readonly S: number;
  readonly A: number;
  readonly B: number;
  readonly C: number;
}

export interface Rect {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

/** Something placed at a point, facing a direction. `id` is the Tiled object id. */
export interface Placement {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface GuardDef extends Placement {
  /** Patrol waypoints in order (the route loops). Empty: the guard stands post. */
  readonly patrol: readonly Vec2[];
}

export interface SweeperDef extends Placement {
  /** Total sweep arc in radians, centred on `yaw`. 0 = fixed. */
  readonly sweep: number;
  /** Detection / firing range in tiles. */
  readonly range: number;
}

export type LaserMode = 'alarm' | 'damage';

export interface LaserDef {
  readonly id: number;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly mode: LaserMode;
  /** On/off cycle in seconds. `offSeconds` 0 = always on. */
  readonly onSeconds: number;
  readonly offSeconds: number;
}

export interface DoorDef {
  readonly id: number;
  readonly tileX: number;
  readonly tileZ: number;
  /** Keycard level needed to open it. 0 = opens for anyone. */
  readonly keycard: number;
}

export interface PickupDef {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly item: string;
  readonly amount: number;
}

export interface SwitchDef {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Id of the door or laser this switch toggles, or null for an unwired switch. */
  readonly target: number | null;
}

/** Overhead camera framing (render reads it; the sim never does). */
export interface CameraFraming {
  /** Degrees above the horizon. */
  readonly pitch: number;
  /** Distance from the player, in tiles. */
  readonly distance: number;
}

export interface CameraZoneDef extends Rect {
  readonly framing: CameraFraming;
}

export interface Level {
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  /** Row-major (index = z * width + x), north row first. */
  readonly tiles: readonly Tile[];
  readonly theme: Theme;
  readonly objective: { readonly type: ObjectiveType; readonly params: Readonly<Record<string, unknown>> };
  /** Par time in seconds, for the rating. */
  readonly parTime: number;
  readonly rankThresholds: RankThresholds;
  readonly spawn: Placement;
  readonly goals: readonly Rect[];
  readonly guards: readonly GuardDef[];
  readonly cameras: readonly SweeperDef[];
  readonly turrets: readonly SweeperDef[];
  readonly lasers: readonly LaserDef[];
  readonly doors: readonly DoorDef[];
  readonly pickups: readonly PickupDef[];
  readonly switches: readonly SwitchDef[];
  /** Default camera framing for the level. */
  readonly camera: CameraFraming;
  /** Areas with their own framing; later entries win where they overlap. */
  readonly cameraZones: readonly CameraZoneDef[];
}

/** A fresh, mutable collision grid for a run of this level (doors change it). */
export function createGrid(level: Level): Grid {
  return new Grid(level.width, level.depth, level.tiles);
}
