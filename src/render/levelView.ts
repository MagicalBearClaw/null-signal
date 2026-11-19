import * as THREE from 'three';
import type { Tile } from '../sim/grid/tiles';
import type { Level } from '../sim/level/model';

/**
 * Placeholder level geometry in the Sim Grid palette: one box per solid tile, with
 * glowing edges. The theme renderer (MIC-71) replaces this; it exists so levels are
 * visible (and walkable) before then.
 */

interface TileStyle {
  /** Bottom and top of the box, in world units. */
  readonly y0: number;
  readonly y1: number;
  readonly fill: number;
  readonly edge: number;
}

const STYLES: Partial<Record<Tile, TileStyle>> = {
  wall: { y0: 0, y1: 1.2, fill: 0x0a2a25, edge: 0x1de9b6 },
  lowWall: { y0: 0, y1: 0.5, fill: 0x0a2a25, edge: 0x128f70 },
  crawlspace: { y0: 0.45, y1: 0.55, fill: 0x101c33, edge: 0x3a5a9e },
  vent: { y0: 0, y1: 0.6, fill: 0x1b1033, edge: 0x6a3a9e },
  door: { y0: 0, y1: 1.2, fill: 0x2e2408, edge: 0xe9b61d },
  electrified: { y0: 0, y1: 0.02, fill: 0x3a0f08, edge: 0xe93d1d },
};

export function createLevelView(level: Level): THREE.Group {
  const root = new THREE.Group();
  root.name = 'level';

  // Floor plane and tile lines.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(level.width, level.depth),
    new THREE.MeshBasicMaterial({ color: 0x07110f }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(level.width / 2, 0, level.depth / 2);
  root.add(floor);
  root.add(gridLines(level.width, level.depth, 0.001, 0x0b3b33));

  // Group tiles by kind so each kind shares one geometry and two materials.
  const byKind = new Map<Tile, number[]>();
  level.tiles.forEach((t, i) => {
    if (!STYLES[t]) return;
    const list = byKind.get(t) ?? [];
    list.push(i);
    byKind.set(t, list);
  });

  const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const edgeSource = edgeGeom.getAttribute('position');
  for (const [kind, indices] of byKind) {
    const s = STYLES[kind];
    if (!s) continue;
    const h = s.y1 - s.y0;

    const fill = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, h, 1),
      new THREE.MeshBasicMaterial({ color: s.fill }),
      indices.length,
    );
    const m = new THREE.Matrix4();
    const edges: number[] = [];
    indices.forEach((idx, n) => {
      const x = (idx % level.width) + 0.5;
      const z = Math.floor(idx / level.width) + 0.5;
      const y = s.y0 + h / 2;
      fill.setMatrixAt(n, m.makeTranslation(x, y, z));
      for (let v = 0; v < edgeSource.count; v++) {
        edges.push(edgeSource.getX(v) + x, edgeSource.getY(v) * h + y, edgeSource.getZ(v) + z);
      }
    });
    fill.name = kind;
    root.add(fill);

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    root.add(new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: s.edge })));
  }
  edgeGeom.dispose();
  return root;
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

/** Frees GPU resources of a view built by {@link createLevelView}. */
export function disposeLevelView(view: THREE.Object3D): void {
  view.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) mat.dispose();
    }
  });
  view.removeFromParent();
}
