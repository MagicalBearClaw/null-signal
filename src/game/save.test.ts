import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, SaveGame, isBetter, migrate, parseSave, type BestResult, type Migration } from './save';
import { memoryStore } from './storage';

const LEVELS = ['l1', 'l2', 'l3'];
const result = (score: number, time = 60, rank: BestResult['rank'] = 'A'): BestResult => ({
  rank,
  score,
  time,
  stats: { kills: 0 },
  breakdown: [{ key: 'base', value: 1, points: score }],
});

afterEach(() => vi.restoreAllMocks());

describe('SaveGame progression', () => {
  it('starts with no save: Start, first level only', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    expect(save.hasSave()).toBe(false);
    expect(save.continueLevel()).toBe('l1');
    expect(LEVELS.map((l) => save.isUnlocked(l))).toEqual([true, false, false]);
  });

  it('counts as a save once a game is started', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    save.newGame();
    expect(save.hasSave()).toBe(true);
  });

  it('unlocks completed levels plus the furthest one', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    save.newGame();
    save.recordClear('l1', result(5000));
    expect(save.continueLevel()).toBe('l2');
    expect(LEVELS.map((l) => save.isUnlocked(l))).toEqual([true, true, false]);
    save.recordClear('l2', result(5000));
    save.recordClear('l3', result(5000));
    expect(save.continueLevel()).toBe('l3'); // all done: Continue sits on the last level
    expect(LEVELS.every((l) => save.isUnlocked(l))).toBe(true);
  });

  it('does not move progress backwards when replaying an earlier level', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    save.recordClear('l1', result(5000));
    save.recordClear('l2', result(5000));
    save.recordClear('l1', result(9000));
    expect(save.continueLevel()).toBe('l3');
  });

  it('keeps the best result: higher score, then faster time', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    expect(save.recordClear('l1', result(5000, 80)).newRecord).toBe(true);
    expect(save.recordClear('l1', result(4000, 30)).newRecord).toBe(false);
    expect(save.recordClear('l1', result(5000, 70)).newRecord).toBe(true);
    expect(save.bestResult('l1')).toMatchObject({ score: 5000, time: 70 });
  });

  it('new game wipes progress and records but keeps settings', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    save.updateSettings({ renderMode: 'ps1' });
    save.recordClear('l1', result(5000));
    save.newGame();
    expect(save.data.progress).toEqual({ furthestLevel: 'l1', completed: [] });
    expect(save.data.records).toEqual({});
    expect(save.settings.renderMode).toBe('ps1');
  });

  it('survives a reload from the same store', () => {
    const store = memoryStore();
    const a = new SaveGame(store, LEVELS);
    a.recordClear('l1', result(6000));
    a.updateSettings({ volume: { master: 0.5, music: 0.1, sfx: 1 } });
    const b = new SaveGame(store, LEVELS);
    expect(b.data).toEqual(a.data);
  });
});

describe('SaveGame settings', () => {
  it('validates updates and can reset to defaults', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    expect(() => save.updateSettings({ volume: { master: 2, music: 0, sfx: 0 } })).toThrow();
    save.updateSettings({ renderMode: 'ps1' });
    save.resetSettings();
    expect(save.settings.renderMode).toBe('modern');
  });
});

describe('export / import', () => {
  it('round-trips a save', () => {
    const a = new SaveGame(memoryStore(), LEVELS);
    a.recordClear('l1', result(7000, 50, 'A'));
    const b = new SaveGame(memoryStore(), LEVELS);
    expect(b.importJson(a.exportJson())).toMatchObject({ ok: true });
    expect(b.data).toEqual(a.data);
  });

  it('rejects bad imports and leaves the current save alone', () => {
    const save = new SaveGame(memoryStore(), LEVELS);
    save.recordClear('l1', result(7000));
    const before = save.exportJson();
    for (const bad of [
      'nope',
      '[]',
      '{"version":1}',
      '{"version":99}',
      JSON.stringify({ ...save.data, records: { l1: { rank: 'Z' } } }),
    ]) {
      expect(save.importJson(bad).ok).toBe(false);
    }
    expect(save.exportJson()).toBe(before);
  });

  it('explains why an import failed', () => {
    expect(parseSave('{"version":99}')).toEqual({
      ok: false,
      error: 'made by a newer version of the game (v99)',
    });
    expect(parseSave('{')).toEqual({ ok: false, error: 'not valid JSON' });
  });
});

describe('corrupt saves', () => {
  it('starts fresh and keeps the unreadable save aside', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore();
    store.set(SAVE_KEY, '{garbage');
    const save = new SaveGame(store, LEVELS);
    expect(save.hasSave()).toBe(false);
    expect(store.get(`${SAVE_KEY}.corrupt`)).toBe('{garbage');
  });
});

describe('migrate', () => {
  // A pretend history to exercise the chain: v1 had one flat `volume`, v2 split it into
  // channels under settings, v3 added a completed list.
  const migrations: Record<number, Migration> = {
    1: ({ volume, ...rest }) => {
      const v = typeof volume === 'number' ? volume : 0.8;
      return { ...rest, settings: { volume: { master: v, music: v, sfx: v } } };
    },
    2: (old) => ({ ...old, completed: [] }),
  };

  it('runs every step in order and rewrites the version', () => {
    const r = migrate({ version: 1, volume: 0.25 }, migrations, 3);
    expect(r).toEqual({
      ok: true,
      doc: { version: 3, settings: { volume: { master: 0.25, music: 0.25, sfx: 0.25 } }, completed: [] },
    });
  });

  it('starts from the stored version, skipping steps already applied', () => {
    const r = migrate({ version: 2, settings: {} }, migrations, 3);
    expect(r).toEqual({ ok: true, doc: { version: 3, settings: {}, completed: [] } });
  });

  it('leaves a current save untouched', () => {
    expect(migrate({ version: 3, x: 1 }, migrations, 3)).toEqual({ ok: true, doc: { version: 3, x: 1 } });
  });

  it('fails on a gap in the chain, a newer save, or no version', () => {
    expect(migrate({ version: 1 }, { 2: migrations[2] as Migration }, 3)).toEqual({
      ok: false,
      error: 'no migration from v1',
    });
    expect(migrate({ version: 4 }, migrations, 3)).toMatchObject({ ok: false });
    expect(migrate({}, migrations, 3)).toEqual({ ok: false, error: 'missing or invalid version' });
  });

  it('validates whatever comes out of the chain against the current schema', () => {
    expect(parseSave('{"version":1}')).toEqual({
      ok: false,
      error: 'progress: Invalid input: expected object, received undefined',
    });
  });
});

describe('isBetter', () => {
  it('prefers score, then time, and anything beats no record', () => {
    expect(isBetter(result(1), undefined)).toBe(true);
    expect(isBetter(result(2), result(1))).toBe(true);
    expect(isBetter(result(1, 10), result(1, 20))).toBe(true);
    expect(isBetter(result(1, 20), result(1, 20))).toBe(false);
  });
});
