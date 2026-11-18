import * as THREE from 'three';
import type { ViewFactory } from './entityViews';

export interface Stage {
  readonly scene: THREE.Scene;
  render(): void;
  dispose(): void;
}

/**
 * Temporary stage: a camera, a grid and a renderer in the Sim Grid palette.
 * The overhead camera (MIC-72) and the theme renderer (MIC-71) replace it.
 */
export function createBootStage(root: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 5);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.GridHelper(20, 20, 0x1de9b6, 0x0b3b33));

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = root;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    scene,
    render: () => renderer.render(scene, camera),
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      root.removeChild(renderer.domElement);
    },
  };
}

/** Wireframe debug block, 1×1×1, sitting on the floor. */
export const debugBlockView: ViewFactory = () => {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x062a24 })));
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x1de9b6 }),
    ),
  );
  return group;
};
