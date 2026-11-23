/** Letter ranks, best first (DESIGN.md §6). */
export const RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Rank = (typeof RANKS)[number];
