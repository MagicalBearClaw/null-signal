/**
 * Player movement tuning. One place to tweak feel; tests read these instead of
 * hard-coding numbers. Distances in tiles, times in seconds, angles in radians.
 */
export const PLAYER = {
  speed: {
    walk: 2.5,
    run: 5,
    crouch: 1.2,
  },
  /** How fast the body turns to face the move direction. */
  turnRate: 14,
  /** Below this stick deflection the player stands still (keeps facing). */
  moveThreshold: 0.05,
  collider: {
    halfWidth: 0.3,
    halfDepth: 0.3,
    standHeight: 1.6,
    crouchHeight: 0.9,
  },
  health: {
    max: 100,
    /** Seconds of invulnerability after taking a hit. */
    invulnerableFor: 1,
  },
  footsteps: {
    /** Distance between footstep noises while running. */
    stride: 1.4,
    /** How far a running footstep carries. Walking and crouching are silent. */
    radius: 4,
  },
} as const;
