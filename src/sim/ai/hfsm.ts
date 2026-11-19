import { matches, type Condition, type Facts } from './blackboard';
import type { ActionName, DecisionLayer } from './types';

export interface Transition<S extends string> {
  readonly to: S;
  readonly when: Condition;
}

/**
 * A state of the machine. Leaves run an action; composite states (those named as a
 * `parent`) only group leaves and share transitions with them.
 */
export interface StateDef<S extends string> {
  readonly parent?: S;
  readonly action?: ActionName;
  readonly transitions?: readonly Transition<S>[];
}

/**
 * Hierarchical FSM decision layer.
 *
 * Each tick, transitions are checked from the outermost ancestor down to the current
 * leaf, and the first one whose condition matches wins. So a parent's transitions
 * (e.g. "seen the player → chase") override anything its children would do. At most one
 * transition fires per tick. Targets must be leaves. A transition to the current leaf
 * restarts its action.
 */
export class Hfsm<S extends string> implements DecisionLayer {
  private readonly chains = new Map<S, readonly S[]>();

  constructor(
    private readonly states: Readonly<Record<S, StateDef<S>>>,
    readonly initial: S,
  ) {
    const names = Object.keys(states) as S[];
    const parents = new Set(names.map((n) => states[n].parent).filter((p): p is S => p !== undefined));
    const problems: string[] = [];
    for (const name of names) {
      const def = states[name];
      if (def.parent !== undefined && !(def.parent in states)) {
        problems.push(`${name}: unknown parent "${def.parent}"`);
      }
      const leaf = !parents.has(name);
      if (leaf && !def.action) problems.push(`${name}: leaf state needs an action`);
      if (!leaf && def.action) problems.push(`${name}: composite state cannot run an action`);
      for (const t of def.transitions ?? []) {
        if (!(t.to in states) || parents.has(t.to))
          problems.push(`${name}: transition target "${t.to}" is not a leaf`);
      }
    }
    if (!(initial in states) || parents.has(initial)) problems.push(`initial "${initial}" is not a leaf`);
    if (problems.length) throw new Error(`Invalid HFSM:\n  ${problems.join('\n  ')}`);

    for (const name of names) {
      const chain: S[] = [];
      for (let s: S | undefined = name; s !== undefined; s = states[s].parent) {
        if (chain.includes(s)) throw new Error(`Invalid HFSM: parent cycle at "${s}"`);
        chain.unshift(s);
      }
      this.chains.set(name, chain);
    }
  }

  decide(current: string, facts: Facts): { state: S; restart: boolean } {
    const chain = this.chains.get(current as S);
    if (!chain) throw new Error(`Unknown HFSM state "${current}"`);
    for (const s of chain) {
      for (const t of this.states[s].transitions ?? []) {
        if (matches(facts, t.when)) return { state: t.to, restart: t.to === current };
      }
    }
    return { state: current as S, restart: false };
  }

  actionOf(state: string): ActionName {
    const action = this.states[state as S].action;
    if (!action) throw new Error(`HFSM state "${state}" has no action`);
    return action;
  }
}
