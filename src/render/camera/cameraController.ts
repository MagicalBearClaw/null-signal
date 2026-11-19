/**
 * Gameplay camera as plain math: a controller with modes that produces a pose each
 * frame. No three.js here, so it is unit-testable; `applyPose` in `stage` copies the pose
 * onto the real camera. First-person and peek modes join `overhead` in M2.
 *
 * Coordinates follow the sim: X/Z ground plane in tiles, Y up, yaw 0 looks north (-Z).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
}

/** Framing for the overhead mode. Levels and zones may override pitch and distance. */
export interface OverheadSettings {
  /** Degrees above the horizon (90 = straight down). */
  readonly pitch: number;
  /** Distance from the focus point, in tiles. */
  readonly distance: number;
}

export const DEFAULT_OVERHEAD: OverheadSettings = { pitch: 60, distance: 10 };

export const CAMERA_TUNING = {
  /** Camera yaw; the overhead view is north-up. */
  yaw: 0,
  /** Height of the focus point above the subject's feet. */
  focusHeight: 0.8,
  /** Look ahead along the subject's velocity by this many seconds of travel... */
  leadTime: 0.2,
  /** ...but never further than this. */
  maxLead: 1,
  /** Time for the camera to close half the gap to where it wants to be. */
  followHalfLife: 0.08,
  /** Same, for pitch/distance changes when entering a zone (slower, less jarring). */
  framingHalfLife: 0.25,
} as const;

/** What the camera follows this frame. */
export interface CameraSubject {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

export type CameraMode = 'overhead';

/**
 * Frame-rate independent exponential smoothing factor: the fraction of the remaining
 * gap to close this frame so that half of it is closed every `halfLife` seconds.
 */
export function smoothFactor(dt: number, halfLife: number): number {
  return halfLife <= 0 ? 1 : 1 - Math.pow(2, -dt / halfLife);
}

/** Pose for an overhead camera looking at `focus` with the given framing and yaw. */
export function overheadPose(focus: Vec3, settings: OverheadSettings, yaw: number): CameraPose {
  const pitch = (settings.pitch * Math.PI) / 180;
  const back = settings.distance * Math.cos(pitch);
  const up = settings.distance * Math.sin(pitch);
  // forward is (-sin yaw, -cos yaw); the camera sits behind the focus, opposite forward
  return {
    position: { x: focus.x + Math.sin(yaw) * back, y: focus.y + up, z: focus.z + Math.cos(yaw) * back },
    target: { ...focus },
  };
}

export class CameraController {
  mode: CameraMode = 'overhead';
  /** When false (dev free camera), `update` leaves the pose alone. */
  enabled = true;

  private focus: Vec3 = { x: 0, y: 0, z: 0 };
  private framing: OverheadSettings = { ...DEFAULT_OVERHEAD };
  private snapNext = true;
  private current: CameraPose = overheadPose(this.focus, this.framing, CAMERA_TUNING.yaw);

  get pose(): CameraPose {
    return this.current;
  }

  /** Jump straight to the desired pose on the next update (level start, respawn). */
  snap(): void {
    this.snapNext = true;
  }

  /**
   * Advances the camera toward framing `subject` with `settings` (the level default or
   * the zone the subject stands in). Returns the new pose.
   */
  update(subject: CameraSubject, settings: OverheadSettings, dt: number): CameraPose {
    if (!this.enabled) return this.current;

    const t = CAMERA_TUNING;
    let leadX = subject.velocityX * t.leadTime;
    let leadZ = subject.velocityZ * t.leadTime;
    const lead = Math.hypot(leadX, leadZ);
    if (lead > t.maxLead) {
      leadX *= t.maxLead / lead;
      leadZ *= t.maxLead / lead;
    }
    const want: Vec3 = { x: subject.x + leadX, y: subject.y + t.focusHeight, z: subject.z + leadZ };

    if (this.snapNext) {
      this.focus = want;
      this.framing = { ...settings };
      this.snapNext = false;
    } else {
      const f = smoothFactor(dt, t.followHalfLife);
      this.focus = {
        x: this.focus.x + (want.x - this.focus.x) * f,
        y: this.focus.y + (want.y - this.focus.y) * f,
        z: this.focus.z + (want.z - this.focus.z) * f,
      };
      const g = smoothFactor(dt, t.framingHalfLife);
      this.framing = {
        pitch: this.framing.pitch + (settings.pitch - this.framing.pitch) * g,
        distance: this.framing.distance + (settings.distance - this.framing.distance) * g,
      };
    }

    this.current = overheadPose(this.focus, this.framing, t.yaw);
    return this.current;
  }
}

/** A rectangle of the level with its own framing (Tiled `cameraZone` objects). */
export interface CameraZone {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly settings: OverheadSettings;
}

/**
 * Framing for a point: the last zone (in authoring order) containing it wins, so a small
 * zone drawn after a big one can carve out an exception. Falls back to `fallback`.
 */
export function framingAt(
  x: number,
  z: number,
  zones: readonly CameraZone[],
  fallback: OverheadSettings,
): OverheadSettings {
  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i];
    if (zone && x >= zone.x && x < zone.x + zone.width && z >= zone.z && z < zone.z + zone.depth) {
      return zone.settings;
    }
  }
  return fallback;
}
