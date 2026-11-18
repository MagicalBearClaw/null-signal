import { DEFAULT_BINDINGS } from './game/input/bindings';
import { BrowserInput } from './game/input/browserInput';
import { mapInput, SnapshotTracker } from './game/input/mapping';
import { GameLoop } from './game/gameLoop';
import { createBootStage, debugBlockView } from './render/bootScene';
import { EntityViewSync } from './render/entityViews';
import { transform } from './sim/components';
import { Sim } from './sim/sim';
import { movementSystem } from './sim/systems/movement';
import { playerInputSystem } from './sim/systems/playerInput';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

const sim = new Sim([playerInputSystem, movementSystem]);
const stage = createBootStage(root);
const views = new EntityViewSync(sim.world, stage.scene, { debugBlock: debugBlockView });

const input = new BrowserInput({ keyTarget: window, view: root });
const snapshots = new SnapshotTracker();
const bindings = DEFAULT_BINDINGS; // Settings will load saved bindings here.

// Placeholder until the first real level loads: a block you can steer (WASD / left stick).
sim.world.add({
  transform: transform(),
  velocity: { x: 0, z: 0 },
  player: true,
  renderable: { kind: 'debugBlock' },
});

const loop = new GameLoop(
  (dt) => sim.step(dt, snapshots.next(mapInput(input.sample(), bindings))),
  (alpha) => {
    views.sync(alpha);
    stage.render();
  },
);

// Don't simulate time spent in a background tab, and drop keys held while it was hidden.
// Clearing the devices (not the tracker) lets the sim see proper `released` edges.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.clear();
  else loop.resetClock();
});

loop.start();
