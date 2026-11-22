import { collectThenExit } from './collectThenExit';
import type { Objective, ObjectiveLevel, ObjectiveType } from './objective';
import { sneak } from './sneak';

/**
 * Every objective type a level can name in its `objective` map property. Adding a scenario
 * means writing an {@link ObjectiveType} and listing it here; nothing else changes.
 */
export const OBJECTIVES: Readonly<Record<string, ObjectiveType<unknown>>> = {
  sneak,
  collectThenExit,
};

export const objectiveTypes = (): string[] => Object.keys(OBJECTIVES);

export interface ObjectiveSpec {
  readonly type: string;
  readonly params: unknown;
}

/**
 * Checks a level's objective: known type, valid params, and anything the type needs from
 * the level. Returns the parsed params, or the problems found.
 */
export function validateObjective(
  spec: ObjectiveSpec,
  level: ObjectiveLevel,
): { ok: true; params: unknown } | { ok: false; issues: string[] } {
  const def = OBJECTIVES[spec.type];
  if (!def) {
    return {
      ok: false,
      issues: [`objective: unknown type "${spec.type}" (known: ${objectiveTypes().join(', ')})`],
    };
  }
  const r = def.params.safeParse(spec.params);
  if (!r.success) {
    return {
      ok: false,
      issues: r.error.issues.map(
        (i) => `objectiveParams${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`,
      ),
    };
  }
  const issues = def.check?.(level, r.data) ?? [];
  return issues.length ? { ok: false, issues } : { ok: true, params: r.data };
}

/** Creates the objective for a level that passed {@link validateObjective}. */
export function createObjective(spec: ObjectiveSpec, level: ObjectiveLevel): Objective {
  const def = OBJECTIVES[spec.type];
  if (!def) throw new Error(`Unknown objective type "${spec.type}"`);
  return def.init(level, def.params.parse(spec.params));
}
