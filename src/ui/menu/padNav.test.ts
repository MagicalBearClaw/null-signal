import { describe, expect, it } from 'vitest';
import { PadNavigator, type PadState } from './padNav';

function pad(pressed: number[] = [], axes: number[] = [0, 0]): PadState {
  return { buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })), axes };
}

describe('PadNavigator', () => {
  it('fires confirm and back once per press', () => {
    const n = new PadNavigator();
    expect(n.update([pad([0])], 0.016)).toEqual(['confirm']);
    expect(n.update([pad([0])], 0.016)).toEqual([]);
    expect(n.update([pad()], 0.016)).toEqual([]);
    expect(n.update([pad([1])], 0.016)).toEqual(['back']);
  });

  it('repeats a held direction after a delay, like a key', () => {
    const n = new PadNavigator();
    const fired: string[] = [];
    for (let t = 0; t < 0.7; t += 0.02) fired.push(...n.update([pad([13])], 0.02));
    expect(fired[0]).toBe('down');
    expect(fired.length).toBeGreaterThanOrEqual(2); // first press plus repeats after 0.4 s
    expect(fired.length).toBeLessThanOrEqual(4);
  });

  it('reads the left stick as a d-pad and ignores small tilts', () => {
    const n = new PadNavigator();
    expect(n.update([pad([], [0.2, -0.3])], 0.016)).toEqual([]);
    expect(n.update([pad([], [0.9, 0])], 0.016)).toEqual(['right']);
  });

  it('combines every connected pad and skips empty slots', () => {
    const n = new PadNavigator();
    expect(n.update([null, pad([12])], 0.016)).toEqual(['up']);
  });
});
