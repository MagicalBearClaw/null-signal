import { describe, expect, it } from 'vitest';
import { SaveGame } from '../../game/save';
import { memoryStore } from '../../game/storage';
import { formatTime, levelTiers, mainMenuItems } from './model';

const ids = Array.from({ length: 7 }, (_, i) => `l${i + 1}`);
const result = (rank: 'S' | 'B') => ({ rank, score: 1, time: 1, stats: {}, breakdown: [] });

describe('mainMenuItems', () => {
  it('offers Start on first launch, Continue and New Game once a save exists', () => {
    expect(mainMenuItems(false).map((i) => i.action)).toEqual([
      'start',
      'levelSelect',
      'records',
      'settings',
      'credits',
    ]);
    expect(
      mainMenuItems(true)
        .slice(0, 2)
        .map((i) => i.action),
    ).toEqual(['continue', 'newGame']);
    expect(mainMenuItems(true).some((i) => i.action === 'start')).toBe(false);
  });
});

describe('levelTiers', () => {
  it('groups levels into tiers of five with lock state and best rank', () => {
    const save = new SaveGame(memoryStore(), ids);
    save.recordClear('l1', result('S'));
    save.recordClear('l2', result('B'));
    const tiers = levelTiers(ids, save);
    expect(tiers.map((t) => [t.number, t.levels.length])).toEqual([
      [1, 5],
      [2, 2],
    ]);
    expect(tiers[0]?.levels.slice(0, 4).map((l) => [l.number, l.state, l.rank])).toEqual([
      [1, 'completed', 'S'],
      [2, 'completed', 'B'],
      [3, 'open', null],
      [4, 'locked', null],
    ]);
    expect(tiers[1]?.levels[0]).toMatchObject({ id: 'l6', number: 6, state: 'locked' });
  });

  it('opens only the first level for a new player', () => {
    const tiers = levelTiers(ids, new SaveGame(memoryStore(), ids));
    expect(
      tiers
        .flatMap((t) => t.levels)
        .filter((l) => l.state !== 'locked')
        .map((l) => l.id),
    ).toEqual(['l1']);
  });
});

describe('formatTime', () => {
  it.each([
    [0, '0:00.0'],
    [9.94, '0:09.9'],
    [75.25, '1:15.3'],
    [600, '10:00.0'],
  ])('%s → %s', (s, text) => {
    expect(formatTime(s)).toBe(text);
  });
});
