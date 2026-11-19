import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { transform } from '../sim/components';
import { Sim } from '../sim/sim';
import { movementSystem } from '../sim/systems/movement';
import { EntityViewSync, withUpdate } from './entityViews';

function setup() {
  const sim = new Sim([movementSystem]);
  const root = new Group();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const disposeGeo = vi.spyOn(geometry, 'dispose');
  const views = new EntityViewSync(sim.world, root, { box: () => new Mesh(geometry, material) });
  return { sim, root, views, disposeGeo };
}

describe('EntityViewSync', () => {
  it('creates a view when a renderable entity is added and disposes it on removal', () => {
    const { sim, root, views, disposeGeo } = setup();
    const e = sim.world.add({ transform: transform(), renderable: { kind: 'box' } });
    expect(views.size).toBe(1);
    expect(root.children).toHaveLength(1);
    sim.world.remove(e);
    expect(views.size).toBe(0);
    expect(root.children).toHaveLength(0);
    expect(disposeGeo).toHaveBeenCalled();
  });

  it('removes the view when the renderable component is removed', () => {
    const { sim, views } = setup();
    const e = sim.world.add({ transform: transform(), renderable: { kind: 'box' } });
    sim.world.removeComponent(e, 'renderable');
    expect(views.size).toBe(0);
  });

  it('ignores unknown kinds without throwing', () => {
    const { sim, views } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sim.world.add({ transform: transform(), renderable: { kind: 'nope' } });
    expect(views.size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('interpolates position between prevTransform and transform', () => {
    const { sim, views } = setup();
    const e = sim.world.add({
      transform: transform(0, 0),
      velocity: { x: 60, z: 0 },
      renderable: { kind: 'box' },
    });
    sim.step(1 / 60); // prev.x = 0, x = 1
    views.sync(0.25);
    expect(views.viewOf(e)?.position.x).toBeCloseTo(0.25);
    views.sync(1);
    expect(views.viewOf(e)?.position.x).toBeCloseTo(1);
  });
});

describe('withUpdate', () => {
  it('runs the view update every sync with the entity, after the pose', () => {
    const sim = new Sim([]);
    const root = new Group();
    const views = new EntityViewSync(sim.world, root, {
      squash: () => {
        const g = new Group();
        return withUpdate(g, (e) => {
          g.scale.y = e.collider?.height ?? 1;
        });
      },
    });
    const e = sim.world.add({
      transform: transform(),
      collider: { halfWidth: 0.3, halfDepth: 0.3, height: 0.5 },
      renderable: { kind: 'squash' },
    });
    views.sync(1);
    expect(views.viewOf(e)?.scale.y).toBe(0.5);
    e.collider.height = 0.9;
    views.sync(1);
    expect(views.viewOf(e)?.scale.y).toBe(0.9);
  });
});
