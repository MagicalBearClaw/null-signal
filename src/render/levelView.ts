import * as THREE from 'three';
import { TILES, type Tile } from '../sim/grid/tiles';
import type { Level } from '../sim/level/model';
import { createTheme, type Theme } from './themes/theme';

/** A door's tile and how far open it is (0..1), as the sim's door component has them. */
export interface DoorPose {
  readonly tileX: number;
  readonly tileZ: number;
  readonly openness: number;
}

/** How tall an open door still stands, as a fraction of its closed height. */
const OPEN_DOOR_SCALE = 0.03;

/** The parts of a level the view needs. */
export type LevelLayout = Pick<Level, 'width' | 'depth' | 'tiles' | 'theme'>;

export interface LevelView {
  readonly root: THREE.Group;
  readonly theme: Theme;
  /** Animates the theme. `time` is in seconds. */
  update(time: number): void;
  /** Poses each door for how far open it is (open doors sink into the floor). */
  syncDoors(doors: Iterable<DoorPose>): void;
  /** Frees everything the view and its theme created and detaches the root. */
  dispose(): void;
}

/**
 * Builds level geometry from tile semantics with the level's theme: the theme's floor,
 * then one `InstancedMesh` per tile kind present. Draw calls scale with the number of
 * tile kinds (at most 8), not with the map size.
 */
export function createLevelView(level: LevelLayout, theme: Theme = createTheme(level.theme)): LevelView {
  const root = new THREE.Group();
  root.name = 'level';
  root.add(theme.floor(level.width, level.depth));

  const byKind = new Map<Tile, number[]>();
  level.tiles.forEach((t, i) => {
    const list = byKind.get(t);
    if (list) list.push(i);
    else byKind.set(t, [i]);
  });

  const m = new THREE.Matrix4();
  let doorMesh: THREE.InstancedMesh | null = null;
  const doorInstance = new Map<number, number>(); // tile index → instance
  for (const kind of TILES) {
    const indices = byKind.get(kind);
    const look = indices && theme.tile(kind);
    if (!indices || !look) continue;
    const mesh = new THREE.InstancedMesh(look.geometry, look.material, indices.length);
    indices.forEach((idx, n) => {
      mesh.setMatrixAt(
        n,
        m.makeTranslation((idx % level.width) + 0.5, 0, Math.floor(idx / level.width) + 0.5),
      );
    });
    mesh.computeBoundingSphere();
    mesh.name = kind;
    if (kind === 'door') {
      doorMesh = mesh;
      indices.forEach((idx, n) => doorInstance.set(idx, n));
    }
    root.add(mesh);
  }

  return {
    root,
    theme,
    update: (time) => theme.update(time),
    syncDoors(doors) {
      if (!doorMesh) return;
      for (const d of doors) {
        const n = doorInstance.get(d.tileZ * level.width + d.tileX);
        if (n === undefined) continue;
        const sy = 1 - (1 - OPEN_DOOR_SCALE) * d.openness;
        m.makeScale(1, sy, 1).setPosition(d.tileX + 0.5, 0, d.tileZ + 0.5);
        doorMesh.setMatrixAt(n, m);
      }
      doorMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      // Geometry and materials belong to the theme; instanced meshes only own their matrices.
      root.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      theme.dispose();
      root.removeFromParent();
    },
  };
}

/** Lines along every tile boundary of a width × depth grid, at height y. */
export function gridLines(width: number, depth: number, y: number, color: number): THREE.LineSegments {
  const pts: number[] = [];
  for (let x = 0; x <= width; x++) pts.push(x, y, 0, x, y, depth);
  for (let z = 0; z <= depth; z++) pts.push(0, y, z, width, y, z);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color }));
}

/** Frees the geometry and materials of every mesh and line under `object`, then detaches it. */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) mat.dispose();
    }
  });
  object.removeFromParent();
}
