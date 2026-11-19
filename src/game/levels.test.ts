import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';

describe('LEVELS', () => {
  it('bundles every map under levels/maps, sorted by id', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids).toContain('fixture');
    expect([...ids].sort()).toEqual(ids);
  });

  it('loads every bundled level without validation errors, and caches it', () => {
    for (const entry of LEVELS) {
      const level = entry.load();
      expect(level.name).toBe(entry.id);
      expect(entry.load()).toBe(level);
    }
  });
});
