import { GameLoop } from './game/gameLoop';
import { createBootStage, debugBlockView } from './render/bootScene';
import { EntityViewSync } from './render/entityViews';
import { transform } from './sim/components';
import { Sim } from './sim/sim';
import { movementSystem } from './sim/systems/movement';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

const sim = new Sim([movementSystem]);
const stage = createBootStage(root);
const views = new EntityViewSync(sim.world, stage.scene, { debugBlock: debugBlockView });

// Placeholder content until levels load (MIC-68).
sim.world.add({ transform: transform(), angularVelocity: 0.8, renderable: { kind: 'debugBlock' } });

const loop = new GameLoop(
  (dt) => sim.step(dt),
  (alpha) => {
    views.sync(alpha);
    stage.render();
  },
);

// Don't simulate time spent in a background tab.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock();
});

loop.start();
