import type * as THREE from 'three';
import type { Tile } from '../../sim/grid/tiles';
import type { Theme as ThemeId } from '../../sim/level/model';
import { createSimGridTheme } from './simGrid';

/** How one tile kind is drawn: geometry for a single tile centred on (0, y, 0), and its material. */
export interface TileLook {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

/**
 * Visual skin for level geometry (DESIGN.md §3.3). Tile semantics stay in the sim; a theme
 * only decides how each kind looks. The level view instances one `TileLook` per kind, so
 * a whole level costs a handful of draw calls whatever its size.
 */
export interface Theme {
  readonly id: ThemeId;
  /** Scene clear colour. */
  readonly background: number;
  /** Look for a tile kind, or null when the kind draws nothing beyond the floor. */
  tile(kind: Tile): TileLook | null;
  /** Ground covering the whole level, from (0, 0) to (width, depth). */
  floor(width: number, depth: number): THREE.Object3D;
  /** Advances animated materials. `time` is in seconds. */
  update(time: number): void;
  /** Frees the materials and geometry the theme created. */
  dispose(): void;
}

/**
 * Theme factories by level `theme` property. Facility lands in M5; until then its levels
 * draw with Sim Grid so authoring them is not blocked.
 */
const FACTORIES: Readonly<Record<ThemeId, () => Theme>> = {
  simGrid: createSimGridTheme,
  facility: createSimGridTheme,
};

export function createTheme(id: ThemeId): Theme {
  return FACTORIES[id]();
}
