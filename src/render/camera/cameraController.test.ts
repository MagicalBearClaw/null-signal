import { describe, expect, it } from 'vitest';
import {
  CAMERA_TUNING,
  CameraController,
  DEFAULT_OVERHEAD,
  framingAt,
  overheadPose,
  smoothFactor,
  type CameraSubject,
  type CameraZone,
} from './cameraController';

const still = (x: number, z: number): CameraSubject => ({ x, y: 0, z, velocityX: 0, velocityZ: 0 });

describe('smoothFactor', () => {
  it('closes half the gap per half-life, independent of frame rate', () => {
    expect(smoothFactor(0.1, 0.1)).toBeCloseTo(0.5);
    // two 50 ms frames close the same total gap as one 100 ms frame
    const f = smoothFactor(0.05, 0.1);
    expect(1 - (1 - f) * (1 - f)).toBeCloseTo(0.5);
    expect(smoothFactor(0.1, 0)).toBe(1);
  });
});

describe('overheadPose', () => {
  it('sits behind (south of) and above the focus at yaw 0', () => {
    const p = overheadPose({ x: 5, y: 0, z: 5 }, { pitch: 60, distance: 10 }, 0);
    expect(p.target).toEqual({ x: 5, y: 0, z: 5 });
    expect(p.position.x).toBeCloseTo(5);
    expect(p.position.y).toBeCloseTo(10 * Math.sin(Math.PI / 3));
    expect(p.position.z).toBeCloseTo(5 + 10 * Math.cos(Math.PI / 3));
  });

  it('looks straight down at 90° pitch', () => {
    const p = overheadPose({ x: 0, y: 0, z: 0 }, { pitch: 90, distance: 8 }, 0);
    expect(p.position.z).toBeCloseTo(0);
    expect(p.position.y).toBeCloseTo(8);
  });

  it('keeps the requested distance from the focus', () => {
    const p = overheadPose({ x: 1, y: 2, z: 3 }, { pitch: 47, distance: 7 }, 0.7);
    const d = Math.hypot(p.position.x - 1, p.position.y - 2, p.position.z - 3);
    expect(d).toBeCloseTo(7);
  });
});

describe('CameraController', () => {
  it('snaps to the subject on the first update', () => {
    const cam = new CameraController();
    const pose = cam.update(still(4, 6), DEFAULT_OVERHEAD, 1 / 60);
    expect(pose.target.x).toBeCloseTo(4);
    expect(pose.target.z).toBeCloseTo(6);
    expect(pose.target.y).toBeCloseTo(CAMERA_TUNING.focusHeight);
  });

  it('follows smoothly afterwards, converging on the subject', () => {
    const cam = new CameraController();
    cam.update(still(0, 0), DEFAULT_OVERHEAD, 1 / 60);
    const first = cam.update(still(10, 0), DEFAULT_OVERHEAD, 1 / 60);
    expect(first.target.x).toBeGreaterThan(0);
    expect(first.target.x).toBeLessThan(10);
    for (let i = 0; i < 120; i++) cam.update(still(10, 0), DEFAULT_OVERHEAD, 1 / 60);
    expect(cam.pose.target.x).toBeCloseTo(10, 3);
  });

  it('leads ahead of a moving subject, capped at maxLead', () => {
    const cam = new CameraController();
    const slow = cam.update({ x: 0, y: 0, z: 0, velocityX: 2, velocityZ: 0 }, DEFAULT_OVERHEAD, 1 / 60);
    expect(slow.target.x).toBeCloseTo(2 * CAMERA_TUNING.leadTime);
    cam.snap();
    const fast = cam.update({ x: 0, y: 0, z: 0, velocityX: 0, velocityZ: -50 }, DEFAULT_OVERHEAD, 1 / 60);
    expect(fast.target.z).toBeCloseTo(-CAMERA_TUNING.maxLead);
  });

  it('eases into new framing instead of jumping', () => {
    const cam = new CameraController();
    cam.update(still(0, 0), { pitch: 60, distance: 10 }, 1 / 60);
    const before = cam.pose.position.y;
    cam.update(still(0, 0), { pitch: 80, distance: 6 }, 1 / 60);
    const after = cam.pose.position.y;
    expect(after).not.toBeCloseTo(before);
    for (let i = 0; i < 300; i++) cam.update(still(0, 0), { pitch: 80, distance: 6 }, 1 / 60);
    expect(cam.pose.position.y).toBeCloseTo(
      CAMERA_TUNING.focusHeight + 6 * Math.sin((80 * Math.PI) / 180),
      3,
    );
  });

  it('holds its pose while disabled (dev free camera) and snaps when re-enabled', () => {
    const cam = new CameraController();
    cam.update(still(0, 0), DEFAULT_OVERHEAD, 1 / 60);
    cam.enabled = false;
    const held = cam.update(still(20, 20), DEFAULT_OVERHEAD, 1 / 60);
    expect(held.target.x).toBeCloseTo(0);
    cam.enabled = true;
    cam.snap();
    expect(cam.update(still(20, 20), DEFAULT_OVERHEAD, 1 / 60).target.x).toBeCloseTo(20);
  });
});

describe('framingAt', () => {
  const zones: CameraZone[] = [
    { x: 0, z: 0, width: 10, depth: 10, settings: { pitch: 70, distance: 8 } },
    { x: 2, z: 2, width: 2, depth: 2, settings: { pitch: 85, distance: 6 } },
  ];

  it('falls back outside every zone', () => {
    expect(framingAt(15, 15, zones, DEFAULT_OVERHEAD)).toBe(DEFAULT_OVERHEAD);
  });

  it('uses the containing zone, with later zones winning on overlap', () => {
    expect(framingAt(5, 5, zones, DEFAULT_OVERHEAD).pitch).toBe(70);
    expect(framingAt(3, 3, zones, DEFAULT_OVERHEAD).pitch).toBe(85);
  });

  it('treats the far edge as outside (half-open rectangles)', () => {
    expect(framingAt(10, 5, zones, DEFAULT_OVERHEAD)).toBe(DEFAULT_OVERHEAD);
  });
});
