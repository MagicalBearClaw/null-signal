import { describe, expect, it } from 'vitest';
import { formatCountdown, hudView, ObjectiveBanner, OBJECTIVE_SHOW_SECONDS } from './model';

const base = {
  health: { current: 100, max: 100 },
  alert: { state: 'normal' as const, timer: 0 },
  objective: 'Reach the exit',
};

describe('hudView', () => {
  it('scales life to 0..1 and clamps it', () => {
    expect(hudView({ ...base, health: { current: 40, max: 100 } }).life).toBe(0.4);
    expect(hudView({ ...base, health: { current: -5, max: 100 } }).life).toBe(0);
    expect(hudView({ ...base, health: null }).life).toBe(0);
  });

  it.each([
    ['normal', null],
    ['suspicious', null],
    ['alert', 'ALERT'],
    ['evasion', 'EVASION'],
    ['caution', 'CAUTION'],
  ] as const)('%s shows %s', (state, label) => {
    expect(hudView({ ...base, alert: { state, timer: 12.5 } }).status?.label ?? null).toBe(label);
  });

  it('shows the countdown with the status', () => {
    expect(hudView({ ...base, alert: { state: 'evasion', timer: 19.874 } }).status).toEqual({
      label: 'EVASION',
      tone: 'evasion',
      countdown: '19.88',
    });
  });
});

describe('formatCountdown', () => {
  it.each([
    [0, '00.00'],
    [4, '04.00'],
    [0.001, '00.01'],
    [29.999, '30.00'],
    [-1, '00.00'],
  ])('%s → %s', (s, text) => {
    expect(formatCountdown(s)).toBe(text);
  });
});

describe('ObjectiveBanner', () => {
  it('shows the line at start, hides it after a while, and shows it again when it changes', () => {
    const b = new ObjectiveBanner();
    expect(b.update('Collect drives 0/2', 0.016)).toBe('Collect drives 0/2');
    expect(b.update('Collect drives 0/2', OBJECTIVE_SHOW_SECONDS)).toBeNull();
    expect(b.update('Collect drives 1/2', 0.016)).toBe('Collect drives 1/2');
  });

  it('replays the same line for a new run', () => {
    const b = new ObjectiveBanner();
    b.update('Reach the exit', 0);
    b.update('Reach the exit', 10);
    b.replay();
    expect(b.update('Reach the exit', 0.016)).toBe('Reach the exit');
  });

  it('shows nothing outside a level', () => {
    expect(new ObjectiveBanner().update(null, 0)).toBeNull();
  });
});
