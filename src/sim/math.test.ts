import { describe, expect, it } from 'vitest';
import { clamp, lerp } from './math';

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
