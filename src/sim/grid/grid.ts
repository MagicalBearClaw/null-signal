import { TILE_BLOCKS, type BlockMask, type Tile } from './tiles';

/**
 * The level's tile grid on the X/Z plane. Tile (tx, tz) covers world
 * x ∈ [tx, tx + 1) and z ∈ [tz, tz + 1); the grid's north-west corner is the world origin.
 *
 * Anything outside the grid is a wall, so nothing can walk or see off the map.
 */
export class Grid {
  private readonly tiles: Tile[];

  constructor(
    readonly width: number,
    readonly depth: number,
    tiles: readonly Tile[],
    /** Defaults to the game's rule table; tests can pass their own. */
    private readonly rules: Readonly<Record<Tile, BlockMask>> = TILE_BLOCKS,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(depth) || width <= 0 || depth <= 0) {
      throw new RangeError(`Grid size must be positive integers, got ${width}×${depth}`);
    }
    if (tiles.length !== width * depth) {
      throw new RangeError(`Expected ${width * depth} tiles, got ${tiles.length}`);
    }
    this.tiles = [...tiles];
  }

  /**
   * Builds a grid from ASCII rows (north row first). Handy for tests and debug levels:
   * `.` floor, `#` wall, `=` low wall, `~` crawlspace, `v` vent.
   */
  static fromRows(rows: readonly string[], rules: Readonly<Record<Tile, BlockMask>> = TILE_BLOCKS): Grid {
    const depth = rows.length;
    const width = rows[0]?.length ?? 0;
    const tiles: Tile[] = [];
    rows.forEach((row, z) => {
      if (row.length !== width) throw new RangeError(`Row ${z} has length ${row.length}, expected ${width}`);
      for (const ch of row) {
        const tile = ASCII[ch];
        if (!tile) throw new RangeError(`Unknown tile character '${ch}' in row ${z}`);
        tiles.push(tile);
      }
    });
    return new Grid(width, depth, tiles, rules);
  }

  inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.width && tz < this.depth;
  }

  tileAt(tx: number, tz: number): Tile {
    return this.inBounds(tx, tz) ? (this.tiles[tz * this.width + tx] ?? 'wall') : 'wall';
  }

  /** Runtime changes (doors opening, destructible cover) go through here. */
  set(tx: number, tz: number, tile: Tile): void {
    if (!this.inBounds(tx, tz)) throw new RangeError(`Tile (${tx}, ${tz}) is outside the grid`);
    this.tiles[tz * this.width + tx] = tile;
  }

  /** True when the tile blocks any channel in `mask`. */
  blocks(tx: number, tz: number, mask: BlockMask): boolean {
    return (this.rules[this.tileAt(tx, tz)] & mask) !== 0;
  }
}

const ASCII: Readonly<Record<string, Tile>> = {
  '.': 'floor',
  '#': 'wall',
  '=': 'lowWall',
  '~': 'crawlspace',
  v: 'vent',
};
