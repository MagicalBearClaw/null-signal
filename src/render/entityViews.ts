import type { Object3D } from 'three';
import type { World } from 'miniplex';
import type { Entity } from '../sim/components';
import { lerp, lerpAngle } from '../sim/math';

/**
 * Builds the three.js view for one renderable kind. A view that reflects more than pose
 * (e.g. crouch height) can set `view.userData.update = (entity) => ...`; it runs every
 * `sync` after the pose is applied. Use {@link withUpdate} for type safety.
 */
export type ViewFactory = (entity: Entity) => Object3D;

type ViewUpdate = (entity: Entity) => void;

/** Attaches a per-frame update to a view (see {@link ViewFactory}). */
export function withUpdate<T extends Object3D>(view: T, update: ViewUpdate): T {
  view.userData.update = update;
  return view;
}

type Rendered = Entity & Required<Pick<Entity, 'transform' | 'renderable'>>;

/**
 * Keeps a three.js scene graph in step with the ECS: it creates a view when an entity
 * gains `transform` + `renderable`, and disposes it when the entity loses them or is
 * removed. `sync(alpha)` interpolates each view between `prevTransform` and `transform`.
 *
 * Render reads sim state; it never writes it.
 */
export class EntityViewSync {
  private readonly views = new Map<Entity, Object3D>();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly query;

  constructor(
    world: World<Entity>,
    private readonly parent: Object3D,
    private readonly factories: Readonly<Record<string, ViewFactory>>,
  ) {
    this.query = world.with('transform', 'renderable');
    for (const e of this.query) this.add(e);
    this.unsubscribe.push(
      this.query.onEntityAdded.subscribe((e) => this.add(e)),
      this.query.onEntityRemoved.subscribe((e) => this.remove(e)),
    );
  }

  get size(): number {
    return this.views.size;
  }

  viewOf(entity: Entity): Object3D | undefined {
    return this.views.get(entity);
  }

  sync(alpha: number): void {
    for (const e of this.query) {
      const view = this.views.get(e);
      if (!view) continue;
      const cur = e.transform;
      const prev = e.prevTransform ?? cur;
      view.position.set(lerp(prev.x, cur.x, alpha), lerp(prev.y, cur.y, alpha), lerp(prev.z, cur.z, alpha));
      view.rotation.y = lerpAngle(prev.yaw, cur.yaw, alpha);
      (view.userData.update as ViewUpdate | undefined)?.(e);
    }
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    for (const e of [...this.views.keys()]) this.remove(e);
  }

  private add(e: Rendered): void {
    if (this.views.has(e)) return;
    const factory = this.factories[e.renderable.kind];
    if (!factory) {
      console.warn(`No view factory for renderable kind "${e.renderable.kind}"`);
      return;
    }
    const view = factory(e);
    this.views.set(e, view);
    this.parent.add(view);
  }

  private remove(e: Entity): void {
    const view = this.views.get(e);
    if (!view) return;
    this.views.delete(e);
    view.removeFromParent();
    view.traverse((o) => {
      const disposable = o as Object3D & {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | { dispose(): void }[];
      };
      disposable.geometry?.dispose();
      const m = disposable.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
  }
}
