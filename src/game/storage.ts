/**
 * Key/value storage that never throws. `localStorage` can be missing or fail (private
 * mode, storage disabled, quota, sandboxed iframes); when it does, values live in memory
 * for the session so the game keeps working, just without persistence.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** False once a storage call has failed and the store fell back to memory. */
  readonly persistent: boolean;
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    persistent: false,
  };
}

/** `localStorage` with an in-memory fallback. `backing` is injectable for tests. */
export function browserStore(backing: () => Storage = () => window.localStorage): KeyValueStore {
  const memory = memoryStore();
  let ok = true;
  const attempt = <T>(fn: (s: Storage) => T, fallback: () => T): T => {
    if (ok) {
      try {
        return fn(backing());
      } catch {
        ok = false; // stop retrying: half-persisted state is worse than none
      }
    }
    return fallback();
  };
  return {
    get: (k) =>
      attempt(
        (s) => s.getItem(k),
        () => memory.get(k),
      ),
    set: (k, v) => {
      memory.set(k, v); // keep the fallback in step so a later failure loses nothing
      attempt(
        (s) => s.setItem(k, v),
        () => undefined,
      );
    },
    remove: (k) => {
      memory.remove(k);
      attempt(
        (s) => s.removeItem(k),
        () => undefined,
      );
    },
    get persistent() {
      return ok;
    },
  };
}
