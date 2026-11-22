import GUI from 'lil-gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Stage } from '../render/bootScene';
import type { CameraController } from '../render/camera/cameraController';
import { DebugDraw } from '../render/debug/debugDraw';
import { applyDamage } from '../sim/combat/health';
import type { Grid } from '../sim/grid/grid';
import { KEYCARD_LEVELS, type Level } from '../sim/level/model';
import type { Sim } from '../sim/sim';

/**
 * Development tools: a lil-gui panel with frame/sim stats, debug-draw toggles, a level
 * switcher, a free camera and player damage buttons.
 *
 * Only ever loaded through `import.meta.env.DEV`-guarded dynamic import in `main.ts`, so
 * this module, lil-gui and the debug renderer are absent from production bundles.
 */

export interface DevToolsHost {
  readonly sim: Sim;
  readonly stage: Stage;
  readonly camera: CameraController;
  readonly levelIds: readonly string[];
  readonly currentLevelId: string;
  /** Loads a level by id and returns it with its fresh grid. */
  selectLevel(id: string): { level: Level; grid: Grid };
}

export interface DevTools {
  /** Report how long one `sim.step` took. */
  recordStep(ms: number): void;
  /** Call right before each render, so overlays match the frame being drawn. */
  beforeRender(): void;
  /** Call when a level was (re)loaded from outside the panel. */
  levelLoaded(level: Level, grid: Grid): void;
}

export function installDevTools(host: DevToolsHost): DevTools {
  const { sim, stage } = host;
  const draw = new DebugDraw();
  stage.scene.add(draw.root);

  const stats = { fps: 0, simMs: 0, entities: 0 };
  const settings = { level: host.currentLevelId, freeCamera: false };

  const gui = new GUI({ title: 'NULL SIGNAL dev' });
  const s = gui.addFolder('Stats');
  s.add(stats, 'fps').listen().disable();
  s.add(stats, 'simMs').name('sim tick (ms)').listen().disable();
  s.add(stats, 'entities').listen().disable();

  const d = gui.addFolder('Draw');
  d.add(draw.layers, 'grid');
  d.add(draw.layers, 'colliders').name('collision boxes');
  d.add(draw.layers, 'vision').name('vision cones');
  d.add(draw.layers, 'patrols').name('patrol paths');

  // Free camera: orbit around what the gameplay camera was looking at; turning it off
  // hands control back to the follow camera, which snaps to the player.
  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.enabled = false;

  const w = gui.addFolder('World');
  w.add(settings, 'level', [...host.levelIds]).onChange((id: string) => {
    const { level, grid } = host.selectLevel(id);
    levelLoaded(level, grid);
  });
  w.add(settings, 'freeCamera')
    .name('free camera')
    .onChange((on: boolean) => {
      controls.enabled = on;
      host.camera.enabled = !on;
      if (on) {
        const t = host.camera.pose.target;
        controls.target.set(t.x, t.y, t.z);
        controls.update();
      } else {
        host.camera.snap();
      }
    });

  // Player: damage buttons for testing the death flow before anything can shoot.
  const playerOf = () => sim.world.with('player', 'health').first;
  const hp = { health: 0, keycard: 0 };
  const p = gui.addFolder('Player');
  p.add(hp, 'health').listen().disable();
  p.add(hp, 'keycard').listen().disable();
  p.add(
    {
      card: () => {
        const inv = sim.world.with('player', 'inventory').first?.inventory;
        if (inv) inv.keycard = KEYCARD_LEVELS;
      },
    },
    'card',
  ).name('give all keycards');
  p.add({ hurt: () => hurt(25) }, 'hurt').name('take 25 damage');
  p.add({ kill: () => hurt(Infinity) }, 'kill').name('kill player');
  function hurt(amount: number): void {
    const player = playerOf();
    if (player) applyDamage(sim.world, sim.events, player, Math.min(amount, player.health.current));
  }

  // Hazards: knock every camera out for a while (stands in for chaff until M3).
  const hz = gui.addFolder('Hazards');
  hz.add(
    {
      jam: () => {
        for (const c of sim.world.with('camera')) c.camera.disabledFor = 10;
      },
    },
    'jam',
  ).name('disable cameras 10 s');

  function levelLoaded(level: Level, grid: Grid): void {
    settings.level = level.name;
    draw.setLevel(level, grid);
  }

  let frames = 0;
  let windowStart = performance.now();

  return {
    recordStep(ms) {
      stats.simMs = Math.round((stats.simMs * 0.9 + ms * 0.1) * 1000) / 1000;
    },
    beforeRender() {
      draw.update(sim.world);
      if (controls.enabled) controls.update();
      frames++;
      const now = performance.now();
      if (now - windowStart >= 500) {
        stats.fps = Math.round((frames * 1000) / (now - windowStart));
        stats.entities = sim.world.size;
        hp.health = playerOf()?.health.current ?? 0;
        hp.keycard = playerOf()?.inventory?.keycard ?? 0;
        frames = 0;
        windowStart = now;
      }
    },
    levelLoaded,
  };
}
