import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILES, type Tile } from '../sim/grid/tiles';
import { createLevelView, type LevelLayout } from './levelView';
import { createSimGridTheme } from './themes/simGrid';

function layout(width: number, depth: number, pick: (x: number, z: number) => Tile): LevelLayout {
  const tiles: Tile[] = [];
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) tiles.push(pick(x, z));
  return { width, depth, tiles, theme: 'simGrid' };
}

const instanced = (root: THREE.Object3D) =>
  root.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

describe('createLevelView', () => {
  it('draws a 64×64 map with one instanced mesh per tile kind', () => {
    const kinds = TILES;
    const level = layout(64, 64, (x, z) => kinds[(x * 7 + z * 3) % kinds.length] ?? 'floor');
    const view = createLevelView(level);
    const meshes = instanced(view.root);
    // floor draws as the ground plane, every other kind as one instanced mesh
    expect(meshes.map((m) => m.name).sort()).toEqual(kinds.filter((k) => k !== 'floor').sort());
    expect(view.root.children.length).toBeLessThanOrEqual(TILES.length);
    for (const mesh of meshes) {
      expect(mesh.count).toBe(level.tiles.filter((t) => t === mesh.name).length);
    }
    view.dispose();
  });

  it('places each instance at its tile centre', () => {
    const level = layout(3, 2, (x, z) => (x === 2 && z === 1 ? 'wall' : 'floor'));
    const view = createLevelView(level);
    const [wall] = instanced(view.root);
    const m = new THREE.Matrix4();
    wall?.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect([p.x, p.z]).toEqual([2.5, 1.5]);
    view.dispose();
  });

  it('frees theme resources and detaches on dispose', () => {
    const theme = createSimGridTheme();
    const parent = new THREE.Group();
    const view = createLevelView(
      layout(2, 1, () => 'wall'),
      theme,
    );
    parent.add(view.root);
    let freed = 0;
    theme.tile('wall')?.material.addEventListener('dispose', () => freed++);
    view.dispose();
    expect(freed).toBe(1);
    expect(view.root.parent).toBeNull();
  });
});

describe('Sim Grid theme', () => {
  it('gives every blocking kind its own look and leaves plain floor to the ground plane', () => {
    const theme = createSimGridTheme();
    expect(theme.tile('floor')).toBeNull();
    const looks = TILES.filter((k) => k !== 'floor').map((k) => theme.tile(k));
    expect(looks.every((l) => l !== null)).toBe(true);
    expect(new Set(looks.map((l) => l?.material)).size).toBe(looks.length);
    theme.dispose();
  });

  it('builds block heights that match the cover rules', () => {
    const theme = createSimGridTheme();
    const top = (k: Tile) => {
      const g = theme.tile(k)?.geometry;
      g?.computeBoundingBox();
      return g?.boundingBox?.max.y ?? NaN;
    };
    expect(top('wall')).toBeGreaterThan(top('lowWall'));
    expect(top('lowWall')).toBeLessThan(0.9); // below crouch height: crouching hides you
    const crawl = theme.tile('crawlspace')?.geometry;
    crawl?.computeBoundingBox();
    expect(crawl?.boundingBox?.min.y).toBeGreaterThan(0.3); // a slab you crawl under
    theme.dispose();
  });

  it('reuses one look per kind', () => {
    const theme = createSimGridTheme();
    expect(theme.tile('wall')).toBe(theme.tile('wall'));
    theme.dispose();
  });
});
