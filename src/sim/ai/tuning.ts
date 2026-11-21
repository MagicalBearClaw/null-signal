/** Guard AI tuning. Distances in tiles, times in seconds, angles in radians. */
export const GUARD = {
  speed: {
    walk: 1.8,
    run: 4,
  },
  turnRate: 8,
  /** View cone for guards (`Entity.vision`). */
  vision: {
    fov: (90 * Math.PI) / 180,
    range: 7,
    /** Awareness at which a half-seen player becomes a spot to investigate. */
    glimpse: 0.35,
  },
  /** Furthest distance a guard opens fire from. */
  shootRange: 6,
  health: 100,
  combat: {
    /** Delay before the first shot after deciding to fire. */
    reaction: 0.5,
    /** Seconds between shots. */
    interval: 0.6,
    damage: 15,
    /** Bullets travel this far (a little past shootRange). */
    range: 9,
    /** Only fire when facing within this angle of the target. */
    aimTolerance: 0.2,
    /** Max aim error in radians: `base + perTile * distance` (uniform), so far shots miss more. */
    spread: { base: 0.03, perTile: 0.025 },
    /** How far a guard's gunfire carries. */
    noiseRadius: 14,
  },
  /** Close enough to a target point to count as arrived. */
  arriveRadius: 0.1,
  /** Giving up on a point after making no progress for this long (blocked by a wall or door). */
  stuckTime: 0.75,
  investigate: {
    /** How long the guard looks around at the noise before giving up. */
    lookTime: 3,
    lookTurnRate: 1.5,
  },
  patrol: {
    /** Half-width of the gaze sweep while waiting at a waypoint with lookAround. */
    lookArc: 1,
    /** Seconds for one full left-right-left sweep. */
    lookPeriod: 3,
  },
  search: {
    /** Search points are this far from the last known player position. */
    radius: 3,
  },
} as const;
