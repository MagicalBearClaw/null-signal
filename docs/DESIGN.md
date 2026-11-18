# NULL SIGNAL — Design Analysis

Status: approved v1 scope (2026-11-17). This document is the source of truth for scope and architecture. Linear tickets reference sections here.

## 1. Concept

An original top-down stealth-action browser game set inside a VR training simulator. The player clears short, block-built levels in sequence. Each level has one objective and ends in a rated results screen.

**Originality rule.** No names, characters, story, art, audio, UI visuals, or level layouts from any existing game. Weapons use fictional names. Character designs are original.

## 2. Platform and stack

| Concern          | Decision                                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| Language / build | TypeScript, Vite                                                                  |
| Rendering        | three.js (view layer only)                                                        |
| Simulation       | Fixed 60 Hz timestep, decoupled from render; `miniplex` ECS                       |
| Physics          | None. Custom AABB-vs-tile-grid collision, DDA grid raycasts for sight and bullets |
| Tests            | Vitest for all pure simulation logic                                              |
| Input            | Keyboard + mouse and gamepad (Gamepad API), rebindable                            |
| Target           | Desktop browsers. No mobile                                                       |
| Persistence      | Versioned `localStorage`, JSON export/import. No backend                          |
| Hosting          | GitHub Pages via `actions/deploy-pages`                                           |

### 2.1 Architecture

```
input ─► sim (pure TS, fixed step) ─► render (three.js reads sim state)
            │
            ├─ ecs world (miniplex)
            ├─ systems: movement, collision, ai, weapons, hazards, objectives, rating
            ├─ level model (from Tiled JSON)
            └─ events bus (noise, alert, kill, pickup, ...)
```

- `src/sim/**` never imports three.js. This keeps it testable and enables deterministic replays later.
- `src/render/**` maps entities to meshes and reads interpolated sim state.
- `src/ui/**` holds the HUD and menus (DOM overlay).

## 3. Presentation

### 3.1 Camera

- Default: high overhead follow cam (~60° pitch), tight framing.
- First-person look/aim toggle (no movement while held; aim weapons).
- Wall-press peek: camera swings to look past corners.

### 3.2 Render modes (runtime toggle in Settings)

- **PS1 (default):** 320×240 render target, nearest upscale, vertex snapping, affine texture warping, ordered dither, no mipmaps, short fog, blob shadows, low-poly asset variants.
- **Modern:** native resolution, shadow maps, tone mapping, bloom, SMAA, PBR materials.

The scene graph is the same in both modes; only materials and post passes differ.

### 3.3 Themes

Tile semantics (wall, low wall, crawlspace, vent, door, floor types) are separate from visuals. A level declares its theme.

- **Sim Grid** (M1): glowing wireframe VR blocks.
- **Facility** (M5): cool teal industrial interior.

### 3.4 HUD (original visual design, restyled per render mode)

- Top-left: life bar.
- Top-right: alert / evasion status with countdown.
- Bottom-right: equipped weapon and ammo.
- Bottom-left: equipped item.
- Radar: shows guards and their vision cones. Jammed during Alert or by chaff.

### 3.5 Audio

Original only: jsfxr-generated or CC0 SFX, synth ambient loops, an original alert stinger. Music and SFX volume sliders.

## 4. Game flow

### 4.1 Menus

- First launch: **Start**. After that: **Continue** (furthest unlocked level) and **New Game**.
- **New Game** asks for confirmation, then resets progress, unlocks, and records. Settings are kept.
- **Level Select:** tier grid. Completed levels and the current level are selectable. Future levels are locked. Each tile shows its best rank.
- **Records:** per-level best breakdown.
- **Settings:** render mode, audio, control rebinding, save export/import, reset settings.
- **Credits:** includes every asset attribution from `ASSETS.md`.

### 4.2 In level

- Death: **Continue** (restart the level, continue counter +1) or **Exit**. No checkpoints.
- Clear: results screen with rank breakdown, then **Next / Retry / Menu**.

## 5. Levels

- Authored in **Tiled**, exported as JSON.
  - Tile layer: grid semantics.
  - Object layers: player spawn, goal, guards with patrol polylines, cameras, turrets, lasers, doors (keycard level), pickups, switches.
  - Map properties: `theme`, `objective`, `objectiveParams`, `parTime`, `rankThresholds`.
- **Objectives:** a registry of objective types behind one interface (`init`, `onEvent`, `isComplete`, `isFailed`). v1 set: `sneak` (no weapons), `weaponPractice` (one weapon), `eliminateAll`, `timeAttack`, `collectThenExit`. New scenarios are added by registering a type.
- **v1 content:** 15 levels in 3 tiers of 5.
  - Tier 1 (tutorial): movement and crawl, wall-press and knock, CQC, weapons basics, keycards and cameras.
  - Tier 2: mixed.
  - Tier 3: hard combinations of lasers, turrets, and time attack.

## 6. Rating

- **Inputs:** time vs par, kills (lethal), neutralized (KO: CQC, tranq, stun), alerts triggered, times spotted, damage taken, continues, items and ammo used.
- **Weights:** global config. Kills are penalised harder than KOs.
- **Thresholds:** per level → letter rank **S / A / B / C / D**.
- **Rule:** an S rank on a `sneak` level requires 0 kills and 0 alerts.
- The results screen shows the full breakdown. The best result per level is saved.

## 7. Player

Walk, run, crouch, crawl (under obstacles, through vents), wall-press and peek, knock on wall (noise lure), CQC grab → choke / throw / hold-up, punch-punch-kick combo, roll, drag body, disguise crate.

## 8. Enemy AI

Layered so the decision layer can grow into GOAP:

```
sensors (vision cone, hearing, body discovery, radio)
  ─► blackboard (per-guard + shared squad/alert state)
    ─► decision layer (v1: hierarchical FSM; later: GOAP planner)
      ─► actions (patrol, investigate, chase, shoot, search, call radio, return)
```

- **Global alert machine:** Normal → Suspicious (one guard investigates) → Alert (everyone hunts, reinforcements) → Evasion (search, countdown) → Caution → Normal.
- **Vision:** cone with distance, stance (crouch, crawl), and lighting modifiers. Grid raycast for occlusion.
- **Hearing:** noise events with radius (gunfire, running, knocking, explosions; suppressor reduces radius).
- **Bodies:** a found body triggers Alert.
- Footprints come after v1.

## 9. Arsenal

### 9.1 Weapons (fictional names to be finalised)

| #   | Weapon                  | Notes                                        |
| --- | ----------------------- | -------------------------------------------- |
| 1   | Pistol                  | Suppressor pickup attaches                   |
| 2   | Assault rifle           | Automatic, loud                              |
| 3   | Tranquilizer pistol     | Non-lethal KO                                |
| 4   | Frag grenade            | Lethal, throw arc                            |
| 5   | Stun grenade            | Non-lethal area KO                           |
| 6   | Chaff grenade           | Disables cameras, turrets, and radar briefly |
| 7   | Remote C4               | Place, detonate                              |
| 8   | Claymore                | Proximity mine                               |
| 9   | Guided missile launcher | First-person steering, destroys electronics  |
| 10  | Sniper rifle            | Scope with sway                              |

### 9.2 Items

Medkit, keycards L1–L5 (card N opens doors ≤ N), thermal goggles (reveal lasers and mines), mine detector (shows on radar), body armor, disguise crate, suppressor.

### 9.3 Select UX

Hold a button to open the weapon list (right) or the item list (left). The game is paused while a list is open. A tap toggles the last equipped item or weapon.

## 10. Hazards and enemies (v1)

Patrol guard, sentry guard, surveillance camera, gun camera, floor auto-turret, laser tripwire (alarm variant and damage variant), floor mine, keycard door, electrified floor (disabled by switch or chaff).

**Post-v1:** drones, guard dogs, armored heavy, boss, anti-air launcher.

## 11. Assets

| Kind                       | Source                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| Level geometry             | Procedural per theme                                                |
| Characters, weapons, props | Free **Fab** packs (Standard License only); CC0 Quaternius fallback |
| Animation                  | Mixamo                                                              |
| SFX                        | jsfxr / CC0                                                         |

### 11.1 Licensing and hosting

- The public code repo never contains Fab or Mixamo files.
- Source and converted assets live in the **private** repo `null-signal-assets`.
- `npm run bootstrap` clones the asset repo locally. Contributors without access get placeholders, but only in local dev.
- CI checks out the asset repo with a read-only fine-grained PAT (secret `ASSETS_REPO_TOKEN`), runs the pipeline, builds, and deploys through `actions/deploy-pages` (artifact upload, no `gh-pages` branch).
- **The CI build fails if assets are missing.** Pages never ships placeholders.
- Assets ship only as optimized bundles (meshopt `.glb`, KTX2), never raw source files.
- `ASSETS.md` lists each asset with its source URL, license tier, and attribution. Legacy and Reference-Only items are rejected.

### 11.2 Pipeline

Blender → glTF → `gltf-transform` (meshopt, KTX2, texture resize). It produces two variants per asset: `modern` and `ps1` (decimated, 64–128 px textures).

## 12. Infrastructure

- Code repo: `MagicalBearClaw/null-signal` (public).
- Asset repo: `MagicalBearClaw/null-signal-assets` (private).
- CI on PR: lint, typecheck, Vitest, build. Pushes to `main` deploy to Pages.
- Tracking: Linear project "NULL SIGNAL" in team MIC. One ticket ≈ one PR.

## 13. Milestones

| Milestone             | Scope                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 Foundation**     | Repo, Vite/TS, lint, CI, Pages deploy, ECS + fixed step, input (KB+M, gamepad), Tiled loader, grid collision, debug overlay                                                                 |
| **M1 Vertical slice** | Core moveset, Sim Grid theme, overhead cam, 1 level, patrol guard (vision + alert FSM), surveillance camera, keycard door, goal, objective system, rating, results, save/progression, menus |
| **M2 Stealth depth**  | Full moveset, noise and hearing, bodies, radar, first-person look, peek, all hazards                                                                                                        |
| **M3 Arsenal**        | 10 weapons, items, select menus, complete HUD                                                                                                                                               |
| **M4 Presentation**   | PS1 and Modern render modes, asset pipeline and private asset repo CI, characters and animations, audio                                                                                     |
| **M5 Content**        | 15 levels, rank tuning, Facility theme                                                                                                                                                      |
| **M6 Release**        | Playtesting, performance (PS1 at 60 fps), accessibility basics, v1.0 deploy                                                                                                                 |

## 14. Open items (tracked as tickets)

- Choose specific Fab packs (requires the owner's Epic account).
- Create the fine-grained read-only PAT and add it as a CI secret.
- Finalise fictional weapon names.
