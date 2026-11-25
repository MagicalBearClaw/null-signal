import { describe, expect, it } from 'vitest';
import { CAMPAIGN, LEVELS, campaignLevels } from './levels';

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

describe('CAMPAIGN', () => {
  it('lists playable levels in order and keeps the test fixture out', () => {
    const ids = CAMPAIGN.map((l) => l.id);
    expect(ids[0]).toBe('intake');
    expect(ids).not.toContain('fixture');
  });

  it('rejects a campaign entry with no map', () => {
    expect(() => campaignLevels(['intake', 'nowhere'])).toThrow(/"nowhere"/);
  });

  it('makes the first level a sneak level with two guards, a camera and a keycard door', () => {
    const level = CAMPAIGN[0]?.load();
    expect(level?.objective.type).toBe('sneak');
    expect(level?.guards).toHaveLength(2);
    expect(level?.cameras).toHaveLength(1);
    expect(level?.doors.filter((d) => d.keycard > 0)).toHaveLength(1);
    expect(level?.pickups.some((p) => p.item === 'keycard' && p.amount >= 1)).toBe(true);
  });
});
