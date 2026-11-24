import * as THREE from 'three';
import type { World } from 'miniplex';
import type { Entity } from '../../sim/components';
import type { Grid } from '../../sim/grid/grid';
import { sightMask, type Tile } from '../../sim/grid/tiles';
import type { Level } from '../../sim/level/model';
import { disposeObject, gridLines } from '../levelView';
import { visionFan } from './visionFan';

/**
 * Placeholder turret cone angle, shown by the overlay only, until the turret system gives
 * turrets a `vision` component. Guards and cameras draw their live cones.
 */
export const DEBUG_VISION = {
  turret: { fov: (40 * Math.PI) / 180 },
  rays: 48,
} as const;

export interface DebugLayers {
  grid: boolean;
  colliders: boolean;
  vision: boolean;
  patrols: boolean;
}

const TILE_TINT: Record<Tile, number | null> = {
  floor: null,
  wall: 0x1de9b6,
  lowWall: 0x128f70,
  crawlspace: 0x3a5a9e,
  vent: 0x6a3a9e,
  door: 0xe9b61d,
  doorOpen: 0x6b5514,
  electrified: 0xe93d1d,
};

const Y = { grid: 0.01, patrol: 0.03, vision: 0.02 } as const;

/** Debug geometry drawn over the level. Dev builds only (see `game/devTools.ts`). */
export class DebugDraw {
  readonly root = new THREE.Group();
  readonly layers: DebugLayers = { grid: false, colliders: true, vision: true, patrols: true };

  private gridLayer: THREE.Object3D | null = null;
  private patrolLayer: THREE.Object3D | null = null;
  private readonly colliderLines: THREE.LineSegments;
  private readonly visionMesh: THREE.Mesh;
  private level: Level | null = null;
  private grid: Grid | null = null;

  constructor() {
    this.root.name = 'debug';
    this.root.renderOrder = 10;
    this.colliderLines = new THREE.LineSegments(
      emptyGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false }),
    );
    this.visionMesh = new THREE.Mesh(
      emptyGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xff4040,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.root.add(this.colliderLines, this.visionMesh);
  }

  setLevel(level: Level, grid: Grid): void {
    this.level = level;
    this.grid = grid;
    for (const layer of [this.gridLayer, this.patrolLayer]) if (layer) disposeObject(layer);
    this.gridLayer = buildGridLayer(level);
    this.patrolLayer = buildPatrolLayer(level);
    this.root.add(this.gridLayer, this.patrolLayer);
  }

  /** Call once per rendered frame. */
  update(world: World<Entity>): void {
    if (this.gridLayer) this.gridLayer.visible = this.layers.grid;
    if (this.patrolLayer) this.patrolLayer.visible = this.layers.patrols;
    this.colliderLines.visible = this.layers.colliders;
    this.visionMesh.visible = this.layers.vision;
    if (this.layers.colliders) this.updateColliders(world);
    if (this.layers.vision) this.updateVision(world);
  }

  dispose(): void {
    disposeObject(this.root);
  }

  private updateColliders(world: World<Entity>): void {
    const pts: number[] = [];
    for (const e of world.with('transform', 'collider')) {
      const { x, y, z } = e.transform;
      const { halfWidth: hw, halfDepth: hd, height: h } = e.collider;
      const corners = [
        [x - hw, z - hd],
        [x + hw, z - hd],
        [x + hw, z + hd],
        [x - hw, z + hd],
      ] as const;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i] as readonly [number, number];
        const [bx, bz] = corners[(i + 1) % 4] as readonly [number, number];
        pts.push(ax, y, az, bx, y, bz); // bottom
        pts.push(ax, y + h, az, bx, y + h, bz); // top
        pts.push(ax, y, az, ax, y + h, az); // upright
      }
    }
    setPositions(this.colliderLines.geometry, pts);
  }

  private updateVision(world: World<Entity>): void {
    const tris: number[] = [];
    const grid = this.grid;
    if (grid) {
      const mask = sightMask('stand');
      const fan = (x: number, z: number, yaw: number, fov: number, range: number) => {
        const p = visionFan(grid, { x, z }, yaw, fov, range, DEBUG_VISION.rays, mask);
        const o = p[0];
        if (!o) return;
        for (let i = 1; i < p.length - 1; i++) {
          const a = p[i];
          const b = p[i + 1];
          if (a && b) tris.push(o.x, Y.vision, o.z, a.x, Y.vision, a.z, b.x, Y.vision, b.z);
        }
      };
      for (const e of world.with('transform', 'vision')) {
        fan(e.transform.x, e.transform.z, e.transform.yaw, e.vision.fov, e.vision.range);
      }
      // Turrets: full coverage (sweep arc plus view cone) until they get a live cone.
      for (const t of this.level?.turrets ?? [])
        fan(t.x, t.z, t.yaw, t.sweep + DEBUG_VISION.turret.fov, t.range);
    }
    setPositions(this.visionMesh.geometry, tris);
  }
}

/** A geometry with nothing in it yet, bounded so the renderer can cull it without NaNs. */
function emptyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.boundingSphere = new THREE.Sphere();
  return g;
}

function setPositions(geom: THREE.BufferGeometry, pts: number[]): void {
  const attr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (attr && attr.array.length >= pts.length) {
    (attr.array as Float32Array).set(pts);
    attr.needsUpdate = true;
  } else {
    // Grow with headroom so a few more entities don't reallocate every frame.
    const buf = new Float32Array(Math.max(pts.length * 2, 64));
    buf.set(pts);
    geom.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  }
  geom.setDrawRange(0, pts.length / 3);
  // Nothing to draw (e.g. no level loaded yet): bounds of an empty buffer are NaN, so
  // give it an empty sphere, which the renderer culls without recomputing.
  if (pts.length > 0) geom.computeBoundingSphere();
  else geom.boundingSphere = new THREE.Sphere();
}

function buildGridLayer(level: Level): THREE.Group {
  const g = new THREE.Group();
  g.add(gridLines(level.width, level.depth, Y.grid, 0x3a6a60));
  const quad = new THREE.PlaneGeometry(0.9, 0.9);
  quad.rotateX(-Math.PI / 2);
  const materials = new Map<number, THREE.MeshBasicMaterial>();
  level.tiles.forEach((t, i) => {
    const tint = TILE_TINT[t];
    if (tint === null) return;
    let mat = materials.get(tint);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.35, depthTest: false });
      materials.set(tint, mat);
    }
    const m = new THREE.Mesh(quad, mat);
    m.position.set((i % level.width) + 0.5, Y.grid, Math.floor(i / level.width) + 0.5);
    g.add(m);
  });
  return g;
}

function buildPatrolLayer(level: Level): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffa040, depthTest: false });
  for (const guard of level.guards) {
    if (guard.patrol.length < 2) continue;
    const pts = guard.patrol.map((p) => new THREE.Vector3(p.x, Y.patrol, p.z));
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return g;
}
