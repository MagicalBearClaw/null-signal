import * as THREE from 'three';

export interface BootScene {
  /** Draws one frame with the block at the given (already interpolated) yaw. */
  render(yaw: number): void;
  dispose(): void;
}

/**
 * Temporary boot scene: a spinning wireframe block on a grid, in the Sim Grid
 * palette. It has no loop of its own; the GameLoop drives it. Replaced by the
 * theme renderer (MIC-71).
 */
export function createBootScene(root: HTMLElement): BootScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 5);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.GridHelper(20, 20, 0x1de9b6, 0x0b3b33));

  const block = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  block.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x062a24 })));
  block.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1de9b6 })));
  block.position.y = 0.5;
  scene.add(block);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = root;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    render(yaw) {
      block.rotation.y = yaw;
      renderer.render(scene, camera);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      geometry.dispose();
      edges.dispose();
      root.removeChild(renderer.domElement);
    },
  };
}
