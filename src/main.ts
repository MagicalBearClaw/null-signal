import type { DevTools } from './game/devTools';
import { DEFAULT_BINDINGS } from './game/input/bindings';
import { BrowserInput } from './game/input/browserInput';
import { mapInput, SnapshotTracker } from './game/input/mapping';
import { GameLoop } from './game/gameLoop';
import { LEVELS } from './game/levels';
import { createBootStage, guardView, playerView } from './render/bootScene';
import { EntityViewSync } from './render/entityViews';
import { createLevelView, disposeLevelView } from './render/levelView';
import type { Object3D } from 'three';
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

let levelView: Object3D | null = null;
let dev: DevTools | null = null;

/** Starts a level by id: fresh sim state, fresh placeholder geometry, camera framed on it. */
function selectLevel(id: string) {
  const entry = LEVELS.find((l) => l.id === id);
  if (!entry) throw new Error(`Unknown level "${id}"`);
  const level = entry.load();
  startLevel(sim, level);
  if (levelView) disposeLevelView(levelView);
  levelView = createLevelView(level);
  stage.scene.add(levelView);
  stage.frame(level.width, level.depth);
  const grid = sim.grid;
  if (!grid) throw new Error('startLevel did not set a grid');
  return { level, grid };
}

const first = LEVELS[0];
if (!first) throw new Error('No levels found under levels/maps/');
selectLevel(first.id);

const loop = new GameLoop(
  (dt) => {
    const t0 = performance.now();
    sim.step(dt, snapshots.next(mapInput(input.sample(), bindings)));
    dev?.recordStep(performance.now() - t0);
  },
  (alpha) => {
    views.sync(alpha);
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
      levelIds: LEVELS.map((l) => l.id),
      currentLevelId: first.id,
      selectLevel,
    });
    const grid = sim.grid;
    if (grid) dev.levelLoaded(first.load(), grid);
  });
}

loop.start();
