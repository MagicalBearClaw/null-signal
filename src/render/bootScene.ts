import * as THREE from 'three';

/**
 * Temporary boot scene (MIC-62): a spinning wireframe block on a grid, in the
 * Sim Grid palette. Replaced by the real game loop (MIC-65) and theme renderer (MIC-71).
 */
export function createBootScene(root: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 5);
  camera.lookAt(0, 0.5, 0);

  const grid = new THREE.GridHelper(20, 20, 0x1de9b6, 0x0b3b33);
  scene.add(grid);

  const block = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  block.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x062a24 })));
  block.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x1de9b6 }),
    ),
  );
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

  renderer.setAnimationLoop((timeMs) => {
    block.rotation.y = timeMs * 0.0008;
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    renderer.dispose();
    geometry.dispose();
    root.removeChild(renderer.domElement);
  };
}
