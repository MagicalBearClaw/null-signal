# Levels

Levels are authored in [Tiled](https://www.mapeditor.org/) and loaded by `loadLevel` in `src/sim/level/tiled.ts`. Open `null-signal.tiled-project` in Tiled. It defines a class for each object type, with its properties and defaults.

## Map setup

- Orthogonal, fixed size (not infinite), 32×32 px tiles. Save as JSON (`.tmj`) under `maps/`.
- Use the shared tileset `tilesets/semantics.tsj`. Each tile's `semantic` property is what the game reads; its colour is only an editor aid. Visuals come from the level's theme.
- Exactly **one tile layer**. Unpainted cells count as walls.
- Any number of **object layers**. Group layers are not supported.

## Map properties

| Property          | Type   | Example                                                      |
| ----------------- | ------ | ------------------------------------------------------------ |
| `theme`           | string | `simGrid` or `facility`                                      |
| `objective`       | string | `sneak` or `collectThenExit` (see Objectives below)          |
| `objectiveParams` | string | JSON object, e.g. `{"item":"drive","count":3}` (optional)    |
| `parTime`         | float  | seconds, e.g. `90`                                           |
| `rankThresholds`  | string | `{"S":9000,"A":7000,"B":5000,"C":3000}`, strictly descending |
| `cameraPitch`     | float  | degrees above the horizon, 20–90 (optional, default 60)      |
| `cameraDistance`  | float  | tiles from the player (optional, default 10)                 |

## Objectives

Every objective finishes when the player steps into a `goal` zone, so each map needs at least one.

| `objective`       | `objectiveParams`                                                                   | Notes                                                     |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `sneak`           | none                                                                                | Weapons are disabled.                                     |
| `collectThenExit` | `item` (pickup item to collect), `count` (default: all of them), `label` (HUD name) | The goals stay locked until the player has `count` items. |

New objective types are registered in `src/sim/objectives/registry.ts`. The loader rejects unknown types and params that don't fit the type.

## Objects

Set the object's **Class** to one of the types below. Angles (`facing`, `sweep`) are in degrees: `facing` is clockwise from north (0 = up, 90 = right). Distances are in tiles.

| Class        | Shape                 | Properties (default)                                                                                                                     |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `spawn`      | point                 | `facing` (0). Exactly one per map.                                                                                                       |
| `goal`       | rectangle             | none                                                                                                                                     |
| `guard`      | point                 | `facing` (0), `patrol` → a `patrol` object (none = stands post)                                                                          |
| `patrol`     | polyline, 2+ points   | `mode` (`loop` / `pingpong`), `wait` (s at each point, 0), `lookAround` (false)                                                          |
| `camera`     | point on a floor tile | `facing` (0), `sweep` (90), `range` (6), `pause` (s at each end, 1.5). Put it on the floor tile in front of its wall.                    |
| `turret`     | point                 | `facing` (0), `sweep` (90), `range` (8), `pause` (1.5)                                                                                   |
| `laser`      | polyline, 2 points    | `mode` (`alarm` or `damage`), `onSeconds` (0), `offSeconds` (0 = always on)                                                              |
| `door`       | point on a door tile  | `keycard` (0 = no card needed, up to 5). Card N opens doors of level N or lower. Opens for any guard. Every door tile needs exactly one. |
| `pickup`     | point                 | `item` (required), `amount` (1). For `item` = `keycard`, `amount` is the card level, 1–5.                                                |
| `switch`     | point                 | `target` → a `door` or `laser` (optional)                                                                                                |
| `cameraZone` | rectangle             | `pitch`, `distance` (default: the map's camera settings). Later zones win where they overlap.                                            |

The loader reports every problem it finds at once, with the object's id and name.

## Campaign

`campaign.json` lists the playable levels in order. Only those appear in the menus, unlock in sequence and are saved; any other map (like the fixture) is reachable from the dev tools only. Adding a level means adding its map and its id here.

| #   | Map      | Objective | Notes                                                                                     |
| --- | -------- | --------- | ----------------------------------------------------------------------------------------- |
| 1   | `intake` | `sneak`   | Two patrols, a sweeping camera over the keycard, a level-1 door. Vent route for crawling. |

`maps/fixture.tmj` is the unit-test fixture. It uses every object type and every paintable tile (`doorOpen` only appears at runtime).
