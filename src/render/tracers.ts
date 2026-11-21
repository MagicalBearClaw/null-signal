import * as THREE from 'three';
import type { EventBus } from '../sim/events';

const LIFETIME = 0.09; // seconds a tracer stays on screen
const HEIGHT = 1.2; // roughly gun height

/**
 * Brief bright lines for hitscan shots, fed by `shot` events. One merged line geometry,
 * rebuilt each frame from the live tracers (there are only ever a handful).
 */
export class Tracers {
  readonly object: THREE.LineSegments;
  private live: { from: THREE.Vector3; to: THREE.Vector3; age: number; hit: boolean }[] = [];
  private readonly unsubscribe: () => void;

  constructor(events: EventBus) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });
    this.object = new THREE.LineSegments(geometry, material);
    this.object.frustumCulled = false;
    this.object.name = 'tracers';
    this.unsubscribe = events.on('shot', (e) => {
      this.live.push({
        from: new THREE.Vector3(e.from.x, HEIGHT, e.from.z),
        to: new THREE.Vector3(e.to.x, HEIGHT, e.to.z),
        age: 0,
        hit: e.hit,
      });
    });
  }

  update(dt: number): void {
    for (const t of this.live) t.age += dt;
    this.live = this.live.filter((t) => t.age < LIFETIME);
    const pos: number[] = [];
    const col: number[] = [];
    for (const t of this.live) {
      const fade = 1 - t.age / LIFETIME;
      const [r, g, b] = t.hit ? [1, 0.45, 0.2] : [1, 0.9, 0.6];
      pos.push(t.from.x, t.from.y, t.from.z, t.to.x, t.to.y, t.to.z);
      col.push(r * fade * 0.3, g * fade * 0.3, b * fade * 0.3, r * fade, g * fade, b * fade);
    }
    const g = this.object.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }

  /** Drops tracers in flight, e.g. on level restart. */
  clear(): void {
    this.live = [];
  }

  dispose(): void {
    this.unsubscribe();
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
