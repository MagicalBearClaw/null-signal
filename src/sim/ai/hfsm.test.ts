import { describe, expect, it } from 'vitest';
import { createBlackboard, matches, type Facts } from './blackboard';
import { GUARD_STATES } from './guardBrain';
import { Hfsm } from './hfsm';

const facts = (f: Partial<Facts> = {}): Facts => ({ ...createBlackboard().facts, ...f });

describe('matches', () => {
  it('requires every listed fact and ignores the rest', () => {
    expect(matches(facts({ seesPlayer: true }), { seesPlayer: true })).toBe(true);
    expect(matches(facts(), { seesPlayer: true })).toBe(false);
    expect(matches(facts(), { seesPlayer: false, heardNoise: false })).toBe(true);
    expect(matches(facts(), {})).toBe(true);
  });
});

describe('Hfsm', () => {
  type S = 'root' | 'a' | 'b';
  const machine = () =>
    new Hfsm<S>(
      {
        root: { transitions: [{ to: 'b', when: { seesPlayer: true } }] },
        a: { parent: 'root', action: 'patrol', transitions: [{ to: 'a', when: { heardNoise: true } }] },
        b: { parent: 'root', action: 'chase', transitions: [{ to: 'a', when: { actionDone: true } }] },
      },
      'a',
    );

  it('stays put when nothing matches', () => {
    expect(machine().decide('a', facts())).toEqual({ state: 'a', restart: false });
  });

  it('lets parent transitions win over the leaf', () => {
    expect(machine().decide('a', facts({ seesPlayer: true, heardNoise: true })).state).toBe('b');
  });

  it('flags a transition to the current leaf as a restart', () => {
    expect(machine().decide('a', facts({ heardNoise: true }))).toEqual({ state: 'a', restart: true });
  });

  it('maps leaves to actions', () => {
    expect(machine().actionOf('b')).toBe('chase');
  });

  it('rejects malformed tables', () => {
    expect(
      () => new Hfsm<S>({ root: {}, a: { parent: 'root' }, b: { parent: 'root', action: 'chase' } }, 'b'),
    ).toThrow(/leaf state needs an action/);
    expect(
      () =>
        new Hfsm<S>(
          {
            root: {},
            a: { parent: 'root', action: 'patrol', transitions: [{ to: 'root', when: {} }] },
            b: {},
          },
          'a',
        ),
    ).toThrow(/not a leaf/);
    expect(() => new Hfsm<S>({ root: {}, a: { parent: 'root', action: 'patrol' }, b: {} }, 'root')).toThrow(
      /initial/,
    );
  });

  it('accepts the guard table', () => {
    expect(() => new Hfsm(GUARD_STATES, 'patrol')).not.toThrow();
  });
});
