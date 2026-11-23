import type { DevTools } from './game/devTools';
import { DEFAULT_BINDINGS } from './game/input/bindings';
import { BrowserInput } from './game/input/browserInput';
import { mapInput, SnapshotTracker } from './game/input/mapping';
import { GameLoop } from './game/gameLoop';
import { LEVELS } from './game/levels';
import { cameraView, createBootStage, goalView, guardView, pickupView, playerView } from './render/bootScene';
import {
  CAMERA_TUNING,
  CameraController,
  framingAt,
  type CameraZone,
  type OverheadSettings,
} from './render/camera/cameraController';
import { EntityViewSync } from './render/entityViews';
import { Color } from 'three';
import { createLevelView, type LevelView } from './render/levelView';
import { Tracers } from './render/tracers';
import { GUARD_ACTIONS } from './sim/ai/actions';
import { alertSystem } from './sim/ai/alert';
import { cameraSystem } from './sim/hazards/camera';
import { doorSystem } from './sim/hazards/doors';
import { pickupSystem } from './sim/items/pickups';
import { objectiveSystem } from './sim/objectives/objectiveSystem';
import { StatsTracker } from './sim/rating/stats';
import { createAiSystem } from './sim/ai/aiSystem';
import { createGuardBrain } from './sim/ai/guardBrain';
import { createVisionSensor } from './sim/ai/visionSensor';
import { healthSystem } from './sim/combat/health';
import { playerWeaponSystem } from './sim/combat/playerWeapon';
import { startLevel } from './sim/level/spawn';
import { Sim } from './sim/sim';
import { footstepSystem } from './sim/systems/footsteps';
import { movementSystem } from './sim/systems/movement';
import { playerInputSystem } from './sim/systems/playerInput';
import { createGameOverOverlay } from './ui/gameOver';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

const guardAi = createAiSystem({
  sensors: [createVisionSensor()],
  decision: createGuardBrain(),
  actions: GUARD_ACTIONS,
});
const sim = new Sim([
  healthSystem,
  playerInputSystem,
  playerWeaponSystem,
  guardAi,
  cameraSystem,
  alertSystem,
  movementSystem,
  doorSystem,
  pickupSystem,
  objectiveSystem,
  footstepSystem,
]);
const stage = createBootStage(root);
const views = new EntityViewSync(sim.world, stage.scene, {
  player: playerView,
  guard: guardView,
  camera: cameraView,
  pickup: pickupView,
  goal: goalView,
});
const tracers = new Tracers(sim.events);
stage.scene.add(tracers.object);

const input = new BrowserInput({ keyTarget: window, view: root });
const snapshots = new SnapshotTracker();
const bindings = DEFAULT_BINDINGS; // Settings will load saved bindings here.

const camera = new CameraController();
let cameraDefault: OverheadSettings = { pitch: 60, distance: 10 };
let cameraZones: CameraZone[] = [];
let levelView: LevelView | null = null;
let dev: DevTools | null = null;
let currentLevelId = '';
/** Run stats for the rating; continues carry across restarts within one attempt. */
const stats = new StatsTracker();
stats.attach(sim.events);

/** Starts a level by id: fresh sim state, fresh themed geometry, camera snapped to the player. */
function selectLevel(id: string) {
  const entry = LEVELS.find((l) => l.id === id);
  if (!entry) throw new Error(`Unknown level "${id}"`);
  const level = entry.load();
  if (id !== currentLevelId) stats.beginAttempt();
  currentLevelId = id;
  startLevel(sim, level);
  levelView?.dispose();
  levelView = createLevelView(level);
  stage.scene.add(levelView.root);
  stage.scene.background = new Color(levelView.theme.background);
  cameraDefault = level.camera;
  cameraZones = level.cameraZones.map((zn) => ({ ...zn, settings: zn.framing }));
  camera.snap();
  tracers.clear();
  const grid = sim.grid;
  if (!grid) throw new Error('startLevel did not set a grid');
  return { level, grid };
}

let lastFrame = performance.now();

/** Seconds since the previous rendered frame (capped, so a stall doesn't jump effects). */
function frameDelta(): number {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  return dt;
}

function* doorPoses() {
  for (const e of sim.world.with('door')) yield e.door;
}

/** Moves the camera toward the player's interpolated (on-screen) position. */
function followPlayer(dt: number): void {
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
    stats.elapse(dt);
    dev?.recordStep(performance.now() - t0);
  },
  (alpha) => {
    views.sync(alpha);
    levelView?.update(performance.now() / 1000);
    levelView?.syncDoors(doorPoses());
    const dt = frameDelta();
    tracers.update(dt);
    followPlayer(dt);
    dev?.beforeRender();
    stage.render();
  },
);

// Death: freeze the level and offer Continue (restart, counted) or Exit.
// A cleared level reuses the panel (Replay / Exit) until the results screen lands.
let cleared = false;
const gameOver = createGameOverOverlay(root, {
  onContinue() {
    if (cleared)
      stats.beginAttempt(); // replaying a cleared level is a new attempt
    else stats.continued();
    restart(currentLevelId);
  },
  onExit() {
    // The main menu arrives with MIC-86; until then Exit starts the first level fresh.
    currentLevelId = '';
    restart(first.id);
  },
});
/** Reloads a level after the overlay closes and lets the sim run again. */
function restart(id: string): void {
  const { level, grid } = selectLevel(id);
  dev?.levelLoaded(level, grid);
  input.clear();
  loop.resume();
}
sim.events.on('playerDied', () => {
  loop.pause();
  cleared = false;
  gameOver.show(stats.stats.continues);
});
sim.events.on('objectiveComplete', () => {
  loop.pause();
  cleared = true;
  gameOver.showCleared();
});

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
      stats,
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
