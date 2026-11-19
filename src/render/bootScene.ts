import * as THREE from 'three';
import { withUpdate, type ViewFactory } from './entityViews';

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Points the camera at a level of the given size (in tiles). */
  frame(width: number, depth: number): void;
  render(): void;
  dispose(): void;
}

/**
 * Temporary stage: renderer, scene and a fixed camera framing the level, in the Sim Grid
 * palette. The overhead camera (MIC-72) and the theme renderer (MIC-71) replace it.
 */
export function createBootStage(root: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = root;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const frame = (width: number, depth: number): void => {
    const size = Math.max(width, depth);
    camera.position.set(width / 2, size * 0.95, depth / 2 + size * 0.55);
    camera.lookAt(width / 2, 0, depth / 2);
  };
  frame(10, 10);

  return {
    scene,
    camera,
    canvas: renderer.domElement,
    frame,
    render: () => renderer.render(scene, camera),
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      root.removeChild(renderer.domElement);
    },
  };
}

function block(width: number, height: number, depth: number, fill: number, edge: number): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: fill })));
  group.add(
    new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: edge })),
  );
  return group;
}

const PLAYER_STAND_HEIGHT = 1.6;

/**
 * Placeholder player: a teal capsule with a visor showing where it faces (-Z at yaw 0).
 * It squashes to the collider height, so crouching is visible.
 */
export const playerView: ViewFactory = () => {
  const radius = 0.3;
  const body = new THREE.Group();
  const capsule = new THREE.CapsuleGeometry(radius, PLAYER_STAND_HEIGHT - radius * 2, 4, 12);
  capsule.translate(0, PLAYER_STAND_HEIGHT / 2, 0);
  body.add(new THREE.Mesh(capsule, new THREE.MeshBasicMaterial({ color: 0x0d4f43 })));
  body.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(capsule, 30),
      new THREE.LineBasicMaterial({ color: 0x1de9b6 }),
    ),
  );
  const visor = block(0.36, 0.12, 0.12, 0x1de9b6, 0xffffff);
  visor.position.set(0, 1.3, -0.26);
  body.add(visor);
  return withUpdate(body, (e) => {
    body.scale.y = (e.collider?.height ?? PLAYER_STAND_HEIGHT) / PLAYER_STAND_HEIGHT;
  });
};

/** Placeholder guard: a red pillar with a nose pointing where it faces (-Z at yaw 0). */
export const guardView: ViewFactory = () => {
  const g = block(0.6, 1.7, 0.6, 0x4a1010, 0xe93d1d);
  const nose = block(0.2, 0.2, 0.3, 0xe93d1d, 0xffffff);
  nose.position.set(0, 1.35, -0.4);
  g.add(nose);
  return g;
};
