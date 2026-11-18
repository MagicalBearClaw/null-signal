import { describe, expect, it } from 'vitest';
import { BUTTON_ACTIONS } from '../../sim/input';
import {
  DEFAULT_BINDINGS,
  DIRECTIONS,
  parseBindings,
  rebind,
  serializeBindings,
  type Binding,
} from './bindings';

const all = (b: typeof DEFAULT_BINDINGS): Binding[] => [
  ...BUTTON_ACTIONS.flatMap((a) => b.buttons[a]),
  ...DIRECTIONS.flatMap((d) => b.move[d]),
];
const id = (b: Binding) => (b.device === 'key' ? `key:${b.code}` : `${b.device}:${b.button}`);

describe('DEFAULT_BINDINGS', () => {
  it('binds every action and direction for both keyboard/mouse and gamepad', () => {
    for (const list of [
      ...BUTTON_ACTIONS.map((a) => DEFAULT_BINDINGS.buttons[a]),
      ...DIRECTIONS.map((d) => DEFAULT_BINDINGS.move[d]),
    ]) {
      expect(list.some((b) => b.device !== 'pad')).toBe(true);
      expect(list.some((b) => b.device === 'pad')).toBe(true);
    }
  });

  it('never binds one physical input to two actions', () => {
    const ids = all(DEFAULT_BINDINGS).map(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('rebind', () => {
  it('adds the binding to the target and steals it from any other action', () => {
    const next = rebind(
      DEFAULT_BINDINGS,
      { kind: 'button', action: 'attack' },
      { device: 'key', code: 'KeyE' },
    );
    expect(next.buttons.attack).toContainEqual({ device: 'key', code: 'KeyE' });
    expect(next.buttons.action).not.toContainEqual({ device: 'key', code: 'KeyE' });
    expect(DEFAULT_BINDINGS.buttons.action).toContainEqual({ device: 'key', code: 'KeyE' }); // not mutated
  });

  it('works for movement directions and does not duplicate', () => {
    const b: Binding = { device: 'key', code: 'KeyI' };
    const once = rebind(DEFAULT_BINDINGS, { kind: 'move', direction: 'up' }, b);
    const twice = rebind(once, { kind: 'move', direction: 'up' }, b);
    expect(twice.move.up.filter((x) => id(x) === 'key:KeyI')).toHaveLength(1);
  });
});

describe('serialization', () => {
  it('round-trips', () => {
    const custom = rebind(
      DEFAULT_BINDINGS,
      { kind: 'button', action: 'pause' },
      { device: 'pad', button: 8 },
    );
    expect(parseBindings(serializeBindings(custom))).toEqual(custom);
  });

  it('fills actions missing from an older save with defaults', () => {
    const saved = JSON.stringify({
      version: 1,
      buttons: { run: [{ device: 'key', code: 'KeyZ' }] },
      move: {},
    });
    const b = parseBindings(saved);
    expect(b.buttons.run).toEqual([{ device: 'key', code: 'KeyZ' }]);
    expect(b.buttons.crouch).toEqual(DEFAULT_BINDINGS.buttons.crouch);
    expect(b.move.left).toEqual(DEFAULT_BINDINGS.move.left);
  });

  it('drops unknown actions and rejects malformed data', () => {
    const extra = JSON.stringify({ version: 1, buttons: { fly: [] }, move: {} });
    expect(Object.keys(parseBindings(extra).buttons)).toEqual([...BUTTON_ACTIONS]);
    expect(() => parseBindings('{')).toThrow();
    expect(() => parseBindings(JSON.stringify({ version: 2, buttons: {}, move: {} }))).toThrow();
    expect(() =>
      parseBindings(JSON.stringify({ version: 1, buttons: { run: [{ device: 'joystick' }] }, move: {} })),
    ).toThrow();
  });
});
