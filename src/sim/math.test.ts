import { describe, expect, it } from 'vitest';
import { clamp, lerp, lerpAngle, wrapAngle } from './math';

describe('angles', () => {
  it('wrapAngle maps into [-π, π)', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(Math.PI / 2 + 4 * Math.PI)).toBeCloseTo(Math.PI / 2);
  });

  it('lerpAngle takes the short way across ±π', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(wrapAngle(mid))).toBeCloseTo(Math.PI);
  });
});

describe('clamp', () => {
  it.each([
    [5, 0, 10, 5],
    [-1, 0, 10, 0],
    [11, 0, 10, 10],
  ])('clamp(%d, %d, %d) = %d', (v, min, max, expected) => {
    expect(clamp(v, min, max)).toBe(expected);
  });
});

describe('lerp', () => {
  it('interpolates endpoints and midpoint', () => {
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 1)).toBe(6);
    expect(lerp(2, 6, 0.5)).toBe(4);
  });
});
