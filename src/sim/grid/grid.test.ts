import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { TEST_RULES } from './testRules';
import { Block } from './tiles';

describe('Grid', () => {
  it('parses ASCII rows with the north row first', () => {
    const g = Grid.fromRows(['#.=', '~v.']);
    expect([g.width, g.depth]).toEqual([3, 2]);
    expect(g.tileAt(0, 0)).toBe('wall');
    expect(g.tileAt(2, 0)).toBe('lowWall');
    expect(g.tileAt(0, 1)).toBe('crawlspace');
    expect(g.tileAt(1, 1)).toBe('vent');
  });

  it('treats everything outside the grid as wall', () => {
    const g = Grid.fromRows(['.'], TEST_RULES);
    expect(g.tileAt(-1, 0)).toBe('wall');
    expect(g.tileAt(0, 1)).toBe('wall');
    expect(g.blocks(5, 5, Block.Sight)).toBe(true);
    expect(g.blocks(0, 0, Block.Sight)).toBe(false);
  });

  it('answers blocking per channel from the rule table', () => {
    const g = Grid.fromRows(['=~'], TEST_RULES);
    expect(g.blocks(0, 0, Block.Stand)).toBe(true);
    expect(g.blocks(0, 0, Block.Sight)).toBe(false);
    expect(g.blocks(1, 0, Block.Crawl)).toBe(false);
    expect(g.blocks(1, 0, Block.Crawl | Block.Crouch)).toBe(true);
  });

  it('supports runtime tile changes inside the grid only', () => {
    const g = Grid.fromRows(['#'], TEST_RULES);
    g.set(0, 0, 'floor');
    expect(g.blocks(0, 0, Block.Stand)).toBe(false);
    expect(() => g.set(1, 0, 'floor')).toThrow(RangeError);
  });

  it('rejects malformed input', () => {
    expect(() => Grid.fromRows(['..', '.'])).toThrow(/Row 1/);
    expect(() => Grid.fromRows(['.x'])).toThrow(/Unknown tile/);
    expect(() => new Grid(2, 2, ['floor'])).toThrow(/Expected 4/);
    expect(() => new Grid(0, 1, [])).toThrow(RangeError);
  });
});
