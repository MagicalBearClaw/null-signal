import { Hfsm, type StateDef } from './hfsm';

export type GuardState =
  'calm' | 'patrol' | 'investigate' | 'returning' | 'hostile' | 'chase' | 'shoot' | 'search';

/**
 * The guard's state table: what takes priority when.
 *
 * - `calm` (patrol / investigate / returning): seeing the player, or the squad going to
 *   Alert, beats everything, so those transitions sit on the parent.
 * - `hostile` (chase / shoot / search): chase until in range, shoot while in range, search
 *   once the trail goes cold. Only `search` leads back to calm, and only after the squad
 *   stands down, so a guard never drops a hunt the moment it loses sight.
 *
 * Within a state, transitions are tried in order; the first match wins.
 */
export const GUARD_STATES: Readonly<Record<GuardState, StateDef<GuardState>>> = {
  calm: {
    transitions: [
      { to: 'chase', when: { seesPlayer: true } },
      { to: 'chase', when: { squadAlert: true } },
      { to: 'search', when: { squadSearching: true } },
    ],
  },
  patrol: {
    parent: 'calm',
    action: 'patrol',
    transitions: [{ to: 'investigate', when: { heardNoise: true } }],
  },
  investigate: {
    parent: 'calm',
    action: 'investigate',
    transitions: [{ to: 'returning', when: { actionDone: true } }],
  },
  returning: {
    parent: 'calm',
    action: 'return',
    transitions: [
      { to: 'investigate', when: { heardNoise: true } },
      { to: 'patrol', when: { actionDone: true } },
    ],
  },

  hostile: {},
  chase: {
    parent: 'hostile',
    action: 'chase',
    transitions: [
      { to: 'shoot', when: { playerInRange: true } },
      { to: 'search', when: { actionDone: true } },
    ],
  },
  shoot: {
    parent: 'hostile',
    action: 'shoot',
    transitions: [{ to: 'chase', when: { playerInRange: false } }],
  },
  search: {
    parent: 'hostile',
    action: 'search',
    transitions: [
      { to: 'chase', when: { seesPlayer: true } },
      { to: 'chase', when: { squadAlert: true, actionDone: true } },
      { to: 'returning', when: { squadAlert: false, squadSearching: false, actionDone: true } },
      { to: 'search', when: { actionDone: true } },
    ],
  },
};

export function createGuardBrain(): Hfsm<GuardState> {
  return new Hfsm(GUARD_STATES, 'patrol');
}
