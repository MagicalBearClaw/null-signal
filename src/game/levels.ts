import campaign from '../../levels/campaign.json';
import type { Level } from '../sim/level/model';
import { loadLevel } from '../sim/level/tiled';

/**
 * Every map under `levels/maps/`, bundled at build time and parsed on first use.
 * `LEVELS` is every map (dev tools), sorted by id; `CAMPAIGN` is the playable order from
 * `levels/campaign.json`, which is what the menus, unlocks and saves use. Maps not in
 * the campaign (the unit-test fixture) never appear to players.
 */

const maps = import.meta.glob<string>('../../levels/maps/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const tilesets = import.meta.glob<string>('../../levels/tilesets/*.tsj', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Map paths reference tilesets relatively (`../tilesets/x.tsj`); resolve by file name. */
function resolveTileset(source: string): unknown {
  const file = source.split('/').pop() ?? source;
  const hit = Object.entries(tilesets).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`tileset "${source}" not found under levels/tilesets/`);
  return JSON.parse(hit[1]) as unknown;
}

export interface LevelEntry {
  /** File name without extension, e.g. `fixture`. */
  readonly id: string;
  load(): Level;
}

const cache = new Map<string, Level>();

export const LEVELS: readonly LevelEntry[] = Object.entries(maps)
  .map(([path, raw]) => {
    const id =
      path
        .split('/')
        .pop()
        ?.replace(/\.tmj$/, '') ?? path;
    return {
      id,
      load() {
        let level = cache.get(id);
        if (!level) {
          level = loadLevel(id, JSON.parse(raw) as unknown, resolveTileset);
          cache.set(id, level);
        }
        return level;
      },
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

/** The campaign in play order (`levels/campaign.json`). Throws on an unknown id. */
export function campaignLevels(order: readonly string[] = campaign.levels): LevelEntry[] {
  return order.map((id) => {
    const entry = LEVELS.find((l) => l.id === id);
    if (!entry)
      throw new Error(`levels/campaign.json lists "${id}", but levels/maps/${id}.tmj does not exist`);
    return entry;
  });
}

export const CAMPAIGN: readonly LevelEntry[] = campaignLevels();
