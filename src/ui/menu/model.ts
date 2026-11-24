import type { Rank } from '../../sim/rating/rank';

/** Levels per tier on the Level Select grid (DESIGN.md §5: 3 tiers of 5). */
export const TIER_SIZE = 5;

/** What the menus need from the save. */
export interface ProgressView {
  hasSave(): boolean;
  isUnlocked(levelId: string): boolean;
  isCompleted(levelId: string): boolean;
  bestResult(levelId: string): { readonly rank: Rank } | undefined;
}

export type MainAction =
  'start' | 'continue' | 'newGame' | 'levelSelect' | 'records' | 'settings' | 'credits';

export interface MenuItem {
  readonly action: MainAction;
  readonly label: string;
}

/** Main menu: Start on first launch; Continue and New Game once a save exists. */
export function mainMenuItems(hasSave: boolean): MenuItem[] {
  const play: MenuItem[] = hasSave
    ? [
        { action: 'continue', label: 'Continue' },
        { action: 'newGame', label: 'New Game' },
      ]
    : [{ action: 'start', label: 'Start' }];
  return [
    ...play,
    { action: 'levelSelect', label: 'Level Select' },
    { action: 'records', label: 'Records' },
    { action: 'settings', label: 'Settings' },
    { action: 'credits', label: 'Credits' },
  ];
}

export type TileState = 'locked' | 'open' | 'completed';

export interface LevelTile {
  readonly id: string;
  /** 1-based campaign number. */
  readonly number: number;
  readonly state: TileState;
  readonly rank: Rank | null;
}

export interface Tier {
  /** 1-based. */
  readonly number: number;
  readonly levels: readonly LevelTile[];
}

/** Groups the campaign into tiers with each level's lock state and best rank. */
export function levelTiers(levelIds: readonly string[], progress: ProgressView): Tier[] {
  const tiers: Tier[] = [];
  levelIds.forEach((id, i) => {
    const t = Math.floor(i / TIER_SIZE);
    const tier = (tiers[t] ??= { number: t + 1, levels: [] }) as { number: number; levels: LevelTile[] };
    const state: TileState = progress.isCompleted(id)
      ? 'completed'
      : progress.isUnlocked(id)
        ? 'open'
        : 'locked';
    tier.levels.push({ id, number: i + 1, state, rank: progress.bestResult(id)?.rank ?? null });
  });
  return tiers;
}

/** Seconds as m:ss.t for records. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
