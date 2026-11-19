import * as THREE from 'three';
import type { Tile } from '../../sim/grid/tiles';
import type { Theme, TileLook } from './theme';

/*
 * Sim Grid: the training-simulation look. Dark blocks whose edges glow, on a glowing
 * floor grid. Everything is procedural: no textures, no third-party assets.
 *
 * The block shader finds each fragment's distance to the nearest edge of its box in world
 * units (the second-smallest distance to the box's faces), so edges keep the same width on
 * a 1.2-tall wall and a 0.02-thin floor plate, and instancing needs no extra attributes.
 */

/** Surface patterns layered on a block, picked per tile kind. */
const PATTERN = { none: 0, slats: 1, stripes: 2, pulse: 3 } as const;

interface BlockStyle {
  /** Bottom and top of the block, in world units. */
  readonly y0: number;
  readonly y1: number;
  readonly fill: number;
  readonly edge: number;
  readonly pattern: (typeof PATTERN)[keyof typeof PATTERN];
}

/** Heights match the sim's blocking rules: low walls hide crouchers, crawlspaces need crawling. */
const STYLES: Readonly<Record<Tile, BlockStyle | null>> = {
  floor: null,
  wall: { y0: 0, y1: 1.2, fill: 0x06201c, edge: 0x1de9b6, pattern: PATTERN.none },
  lowWall: { y0: 0, y1: 0.5, fill: 0x06201c, edge: 0x16b892, pattern: PATTERN.none },
  crawlspace: { y0: 0.45, y1: 0.55, fill: 0x08142c, edge: 0x4f86ff, pattern: PATTERN.none },
  vent: { y0: 0, y1: 0.6, fill: 0x140a26, edge: 0x9a5cff, pattern: PATTERN.slats },
  door: { y0: 0, y1: 1.2, fill: 0x261b04, edge: 0xffb321, pattern: PATTERN.stripes },
  doorOpen: { y0: 0, y1: 0.01, fill: 0x07110f, edge: 0x7a5a14, pattern: PATTERN.none },
  electrified: { y0: 0, y1: 0.02, fill: 0x2a0804, edge: 0xff4a24, pattern: PATTERN.pulse },
};

const BACKGROUND = 0x020605;
const FLOOR_BASE = 0x041210;
const FLOOR_LINE = 0x0f5c4e;

const BLOCK_VERTEX = /* glsl */ `
  uniform vec3 uCenter;
  varying vec3 vLocal;
  varying vec3 vWorld;
  void main() {
    vLocal = position - uCenter;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    vec4 world = modelMatrix * p;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLOCK_FRAGMENT = /* glsl */ `
  uniform vec3 uFill;
  uniform vec3 uEdge;
  uniform vec3 uHalf;
  uniform float uTime;
  uniform int uPattern;
  varying vec3 vLocal;
  varying vec3 vWorld;

  void main() {
    // Distance to each pair of faces; the smallest is the face we are on, the
    // second smallest is the distance to the nearest edge of that face.
    vec3 d = uHalf - abs(vLocal);
    float lo = min(d.x, min(d.y, d.z));
    float hi = max(d.x, max(d.y, d.z));
    float edgeDist = d.x + d.y + d.z - lo - hi;
    float px = fwidth(edgeDist);
    float core = 1.0 - smoothstep(0.02 - px, 0.02 + px, edgeDist);
    float halo = exp(-edgeDist * 14.0) * 0.5;
    bool top = d.y <= lo + 1e-4;

    vec3 col = uFill;
    if (uPattern == 1 && !top) {
      // vent slats: horizontal bands up the sides
      float s = abs(fract(vLocal.y * 12.0) - 0.5) * 2.0;
      col += uEdge * 0.35 * smoothstep(0.55, 0.8, s);
    } else if (uPattern == 2) {
      // door: diagonal warning stripes
      float s = fract((vWorld.x + vWorld.z + vWorld.y) * 2.5);
      col += uEdge * 0.18 * step(0.5, s);
    } else if (uPattern == 3) {
      // electrified: a crackling pulse running across the plate
      float wave = 0.5 + 0.5 * sin(uTime * 7.0 + (vWorld.x - vWorld.z) * 5.0);
      col += uEdge * (0.15 + 0.35 * wave * wave);
    }
    // faint scan line drifting upward through every block
    col += uEdge * 0.05 * smoothstep(0.9, 1.0, sin(vWorld.y * 30.0 - uTime * 3.0));

    gl_FragColor = vec4(col + uEdge * (core + halo), 1.0);
    #include <colorspace_fragment>
  }
`;

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vGround;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vGround = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLine;
  varying vec2 vGround;

  // 1 on the integer grid lines of p (anti-aliased to about a pixel), 0 elsewhere.
  float grid(vec2 p) {
    vec2 dist = 0.5 - abs(fract(p) - 0.5);
    vec2 w = fwidth(p) * 1.2;
    vec2 l = 1.0 - smoothstep(vec2(0.0), w, dist);
    return max(l.x, l.y);
  }

  void main() {
    vec2 dist = 0.5 - abs(fract(vGround) - 0.5);
    float halo = exp(-min(dist.x, dist.y) * 18.0) * 0.25;
    float minor = grid(vGround);
    float major = grid(vGround / 4.0);
    vec3 col = uBase + uLine * (minor * 0.7 + major * 0.6 + halo);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSimGridTheme(): Theme {
  const time = { value: 0 };
  const looks = new Map<Tile, TileLook>();
  const owned: { dispose(): void }[] = [];

  const lookFor = (kind: Tile): TileLook | null => {
    const s = STYLES[kind];
    if (!s) return null;
    const cached = looks.get(kind);
    if (cached) return cached;

    const h = s.y1 - s.y0;
    const geometry = new THREE.BoxGeometry(1, h, 1);
    geometry.translate(0, s.y0 + h / 2, 0);
    const material = new THREE.ShaderMaterial({
      name: `simGrid.${kind}`,
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, s.y0 + h / 2, 0) },
        uHalf: { value: new THREE.Vector3(0.5, h / 2, 0.5) },
        uFill: { value: new THREE.Color(s.fill) },
        uEdge: { value: new THREE.Color(s.edge) },
        uPattern: { value: s.pattern },
        uTime: time,
      },
    });
    const look = { geometry, material };
    looks.set(kind, look);
    owned.push(geometry, material);
    return look;
  };

  return {
    id: 'simGrid',
    background: BACKGROUND,
    tile: lookFor,
    floor(width, depth) {
      const geometry = new THREE.PlaneGeometry(width, depth);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(width / 2, 0, depth / 2);
      const material = new THREE.ShaderMaterial({
        name: 'simGrid.floor',
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
        uniforms: {
          uBase: { value: new THREE.Color(FLOOR_BASE) },
          uLine: { value: new THREE.Color(FLOOR_LINE) },
        },
      });
      owned.push(geometry, material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'floor';
      return mesh;
    },
    update(t) {
      time.value = t;
    },
    dispose() {
      for (const o of owned) o.dispose();
      owned.length = 0;
      looks.clear();
    },
  };
}
