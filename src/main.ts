import type { DevTools } from './game/devTools';
import { DEFAULT_BINDINGS } from './game/input/bindings';
import { BrowserInput } from './game/input/browserInput';
import { mapInput, SnapshotTracker } from './game/input/mapping';
import { GameLoop } from './game/gameLoop';
import { LEVELS } from './game/levels';
import { createBootStage, guardView, playerView } from './render/bootScene';
import {
  CAMERA_TUNING,
  CameraController,
  framingAt,
  type CameraZone,
  type OverheadSettings,
} from './render/camera/cameraController';
import { EntityViewSync } from './render/entityViews';
import type { Object3D } from 'three';
import { createLevelView, disposeLevelView } from './render/levelView';
import { startLevel } from './sim/level/spawn';
import { Sim } from './sim/sim';
import { footstepSystem } from './sim/systems/footsteps';
import { movementSystem } from './sim/systems/movement';
import { playerInputSystem } from './sim/systems/playerInput';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

const sim = new Sim([playerInputSystem, movementSystem, footstepSystem]);
const stage = createBootStage(root);
const views = new EntityViewSync(sim.world, stage.scene, { player: playerView, guard: guardView });

const input = new BrowserInput({ keyTarget: window, view: root });
const snapshots = new SnapshotTracker();
const bindings = DEFAULT_BINDINGS; // Settings will load saved bindings here.

const camera = new CameraController();
let cameraDefault: OverheadSettings = { pitch: 60, distance: 10 };
let cameraZones: CameraZone[] = [];
let levelView: Object3D | null = null;
let dev: DevTools | null = null;

/** Starts a level by id: fresh sim state, fresh placeholder geometry, camera snapped to the player. */
function selectLevel(id: string) {
  const entry = LEVELS.find((l) => l.id === id);
  if (!entry) throw new Error(`Unknown level "${id}"`);
  const level = entry.load();
  startLevel(sim, level);
  if (levelView) disposeLevelView(levelView);
  levelView = createLevelView(level);
  stage.scene.add(levelView);
  cameraDefault = level.camera;
  cameraZones = level.cameraZones.map((zn) => ({ ...zn, settings: zn.framing }));
  camera.snap();
  const grid = sim.grid;
  if (!grid) throw new Error('startLevel did not set a grid');
  return { level, grid };
}

let lastFrame = performance.now();

/** Moves the camera toward the player's interpolated (on-screen) position. */
function followPlayer(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!camera.enabled) return; // dev free camera owns the view
  const player = sim.world.with('player', 'transform').first;
  const view = player && views.viewOf(player);
  if (!player || !view) return;
  const { x, y, z } = view.position;
  const settings = framingAt(x, z, cameraZones, cameraDefault);
  const v = player.velocity ?? { x: 0, z: 0 };
  stage.applyPose(camera.update({ x, y, z, velocityX: v.x, velocityZ: v.z }, settings, dt));
}

const first = LEVELS[0];
if (!first) throw new Error('No levels found under levels/maps/');
selectLevel(first.id);

const loop = new GameLoop(
  (dt) => {
    const t0 = performance.now();
    sim.step(dt, snapshots.next(mapInput(input.sample(), bindings, undefined, CAMERA_TUNING.yaw)));
    dev?.recordStep(performance.now() - t0);
  },
  (alpha) => {
    views.sync(alpha);
    followPlayer();
    dev?.beforeRender();
    stage.render();
  },
);

// Don't simulate time spent in a background tab, and drop keys held while it was hidden.
// Clearing the devices (not the tracker) lets the sim see proper `released` edges.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.clear();
  else loop.resetClock();
});

// Dev tools are stripped from production: Vite replaces import.meta.env.DEV with false
// and Rollup drops the dead branch, dynamic import included.
if (import.meta.env.DEV) {
  void import('./game/devTools').then(({ installDevTools }) => {
    dev = installDevTools({
      sim,
      stage,
      camera,
      levelIds: LEVELS.map((l) => l.id),
      currentLevelId: first.id,
      selectLevel,
    });
    const grid = sim.grid;
    if (grid) dev.levelLoaded(first.load(), grid);
  });
}

loop.start();
