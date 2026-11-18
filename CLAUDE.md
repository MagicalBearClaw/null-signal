# CLAUDE.md

NULL SIGNAL: an original top-down stealth-action browser game (TypeScript, Vite, three.js). Scope and architecture live in `docs/DESIGN.md`, which is the source of truth. Work is tracked in Linear project "NULL SIGNAL" (team MIC). Name each branch after its ticket, e.g. `michaelmcmahondev/mic-62-...`.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # typecheck + production build (base: /null-signal/)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest (single run)
npx vitest run src/sim/math.test.ts   # single file
```

## Layout

| Path             | Contents                                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| `src/sim/`       | Pure TS simulation: ECS, systems, AI, rating, level model. Runs at a fixed 60 Hz. |
| `src/render/`    | three.js view layer. It reads sim state and never mutates it.                     |
| `src/ui/`        | DOM overlay: HUD and menus.                                                       |
| `src/game/`      | Wiring: loop, state flow, save system.                                            |
| `levels/`        | Tiled project and level JSON.                                                     |
| `docs/DESIGN.md` | Design source of truth.                                                           |
| `ASSETS.md`      | Manifest of every third-party asset, with its license.                            |

## Hard rules

- **`src/sim/**` must not import `three`, `src/render` or `src/ui`.** ESLint enforces this. It keeps the sim deterministic and testable in Node.
- **Originality.** No names, characters, story, art, audio, UI visuals or level layouts from any existing game. Weapons use fictional names.
- **Third-party assets** (Fab, Mixamo) never go in this repo. They live in the private `null-signal-assets` repo. `assets-src/` and `public/assets/` are gitignored. Every shipped asset must be listed in `ASSETS.md`.
- Pin exact dependency versions (`npm i --save-exact`).
- Sim logic gets Vitest tests next to the source (`*.test.ts`).
