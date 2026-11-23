import { z } from 'zod';
import { RANKS } from '../sim/rating/rank';
import type { KeyValueStore } from './storage';

/**
 * The save file (DESIGN.md §4.1): progression, best result per level, and settings, as one
 * versioned JSON document in storage. Older versions are migrated on load; anything that
 * fails validation is set aside (`<key>.corrupt`) and replaced with a fresh save, so a bad
 * save can never stop the game from starting.
 */

export const SAVE_KEY = 'null-signal.save';
export const SAVE_VERSION = 1;

const RenderMode = z.enum(['modern', 'ps1']);
const Volume = z.number().min(0).max(1);

const SettingsSchema = z.object({
  renderMode: RenderMode.default('modern'),
  volume: z
    .object({ master: Volume.default(0.8), music: Volume.default(0.7), sfx: Volume.default(0.8) })
    .default({ master: 0.8, music: 0.7, sfx: 0.8 }),
  /** Serialized control bindings (`serializeBindings`), or null for the defaults. */
  bindings: z.string().nullable().default(null),
});

const BestResultSchema = z.object({
  rank: z.enum(RANKS),
  score: z.number().nonnegative(),
  /** Sim seconds. */
  time: z.number().nonnegative(),
  /** The run's stats, by name (kills, alerts, ...). */
  stats: z.record(z.string(), z.number()),
  /** The rating breakdown shown on the Records screen. */
  breakdown: z.array(z.object({ key: z.string(), value: z.number(), points: z.number() })),
});

const SaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  progress: z.object({
    /** The level the player is up to: Continue starts here. Null before the first Start. */
    furthestLevel: z.string().nullable(),
    completed: z.array(z.string()),
  }),
  records: z.record(z.string(), BestResultSchema),
  settings: SettingsSchema,
});

export type Settings = z.infer<typeof SettingsSchema>;
export type BestResult = z.infer<typeof BestResultSchema>;
export type SaveData = z.infer<typeof SaveSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

function freshSave(settings: Settings = defaultSettings()): SaveData {
  return { version: SAVE_VERSION, progress: { furthestLevel: null, completed: [] }, records: {}, settings };
}

/** Upgrades a save from version `n` to `n + 1`. */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version they upgrade from. Add one whenever SAVE_VERSION goes up. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type ParseResult = { ok: true; data: SaveData } | { ok: false; error: string };

/**
 * Runs migrations on a save document from its `version` up to `current`, rewriting the
 * version after each step. Rejects saves from a newer game rather than guessing.
 */
export function migrate(
  doc: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>>,
  current: number,
): { ok: true; doc: Record<string, unknown> } | { ok: false; error: string } {
  const version = doc.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'missing or invalid version' };
  }
  if (version > current) return { ok: false, error: `made by a newer version of the game (v${version})` };
  let out = doc;
  for (let v = version; v < current; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, error: `no migration from v${v}` };
    out = { ...step(out), version: v + 1 };
  }
  return { ok: true, doc: out };
}

/** Parses a save document: JSON, migrations up to {@link SAVE_VERSION}, then validation. */
export function parseSave(
  json: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  current = SAVE_VERSION,
): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc))
    return { ok: false, error: 'not a save file' };
  const m = migrate(doc as Record<string, unknown>, migrations, current);
  if (!m.ok) return m;
  const r = SaveSchema.safeParse(m.doc);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `${first?.path.join('.') || 'save'}: ${first?.message ?? 'invalid'}` };
  }
  return { ok: true, data: r.data };
}

/** Whether `a` beats `b`: higher score, then faster time. */
export function isBetter(a: BestResult, b: BestResult | undefined): boolean {
  if (!b) return true;
  return a.score !== b.score ? a.score > b.score : a.time < b.time;
}

/**
 * Progression and records over a {@link KeyValueStore}. `levelOrder` is the campaign
 * order of level ids; unlocks follow it. Every change is written through immediately.
 */
export class SaveGame {
  private d: SaveData;

  constructor(
    private readonly store: KeyValueStore,
    private readonly levelOrder: readonly string[],
    private readonly key = SAVE_KEY,
  ) {
    if (levelOrder.length === 0) throw new Error('SaveGame needs at least one level');
    this.d = this.load();
  }

  private load(): SaveData {
    const raw = this.store.get(this.key);
    if (raw === null) return freshSave();
    const r = parseSave(raw);
    if (r.ok) return r.data;
    console.warn(`Save unreadable (${r.error}); starting fresh. The old save is kept as ${this.key}.corrupt`);
    this.store.set(`${this.key}.corrupt`, raw);
    return freshSave();
  }

  private persist(): void {
    this.store.set(this.key, JSON.stringify(this.d));
  }

  get data(): Readonly<SaveData> {
    return this.d;
  }

  get settings(): Readonly<Settings> {
    return this.d.settings;
  }

  /** True once a game has been started: the menu offers Continue instead of Start. */
  hasSave(): boolean {
    return this.d.progress.furthestLevel !== null || this.d.progress.completed.length > 0;
  }

  /** Wipes progress and records, keeps settings, and puts the player on the first level. */
  newGame(): void {
    this.d = freshSave(this.d.settings);
    this.d.progress.furthestLevel = this.firstLevel;
    this.persist();
  }

  /** The level Continue starts: the furthest one reached. */
  continueLevel(): string {
    const f = this.d.progress.furthestLevel;
    return f !== null && this.levelOrder.includes(f) ? f : this.firstLevel;
  }

  /** Completed levels and the current one are selectable; later levels are locked. */
  isUnlocked(levelId: string): boolean {
    return this.d.progress.completed.includes(levelId) || levelId === this.continueLevel();
  }

  isCompleted(levelId: string): boolean {
    return this.d.progress.completed.includes(levelId);
  }

  bestResult(levelId: string): BestResult | undefined {
    return this.d.records[levelId];
  }

  /**
   * Records a cleared level: marks it completed, moves the furthest level on to the next
   * uncleared one, and keeps the result if it beats the record. Returns whether it did.
   */
  recordClear(levelId: string, result: BestResult): { newRecord: boolean } {
    const p = this.d.progress;
    if (!p.completed.includes(levelId)) p.completed.push(levelId);
    const next = this.levelOrder.find((id) => !p.completed.includes(id));
    p.furthestLevel = next ?? this.levelOrder[this.levelOrder.length - 1] ?? null;
    const newRecord = isBetter(result, this.d.records[levelId]);
    if (newRecord) this.d.records[levelId] = result;
    this.persist();
    return { newRecord };
  }

  updateSettings(patch: Partial<Settings>): void {
    this.d.settings = SettingsSchema.parse({ ...this.d.settings, ...patch });
    this.persist();
  }

  resetSettings(): void {
    this.d.settings = defaultSettings();
    this.persist();
  }

  /** The whole save as pretty JSON, for the Settings export button. */
  exportJson(): string {
    return JSON.stringify(this.d, null, 2);
  }

  /** Replaces the save with an exported one after validating (and migrating) it. */
  importJson(json: string): ParseResult {
    const r = parseSave(json);
    if (r.ok) {
      this.d = r.data;
      this.persist();
    }
    return r;
  }

  private get firstLevel(): string {
    return this.levelOrder[0] as string;
  }
}
