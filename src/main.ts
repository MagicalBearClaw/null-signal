import { GameLoop } from './game/gameLoop';
import { createBootScene } from './render/bootScene';
import { lerp } from './sim/math';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

const view = createBootScene(root);

// Placeholder sim state until the ECS lands (MIC-66). Keeping prev + current
// lets render interpolate smoothly at any display refresh rate.
const SPIN_RAD_PER_SEC = 0.8;
const sim = { prevYaw: 0, yaw: 0 };

const loop = new GameLoop(
  (dt) => {
    sim.prevYaw = sim.yaw;
    sim.yaw += SPIN_RAD_PER_SEC * dt;
  },
  (alpha) => view.render(lerp(sim.prevYaw, sim.yaw, alpha)),
);

// Don't simulate time spent in a background tab.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock();
});

loop.start();
