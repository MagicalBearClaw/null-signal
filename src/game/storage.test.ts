import { describe, expect, it } from 'vitest';
import { browserStore, memoryStore } from './storage';

function fakeStorage(fail = false): Storage {
  const m = new Map<string, string>();
  const guard = () => {
    if (fail) throw new DOMException('denied', 'SecurityError');
  };
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (guard(), m.get(k) ?? null),
    setItem: (k, v) => (guard(), void m.set(k, v)),
    removeItem: (k) => (guard(), void m.delete(k)),
  };
}

describe('browserStore', () => {
  it('reads and writes through to storage', () => {
    const backing = fakeStorage();
    const s = browserStore(() => backing);
    s.set('a', '1');
    expect(backing.getItem('a')).toBe('1');
    expect(s.get('a')).toBe('1');
    s.remove('a');
    expect(s.get('a')).toBeNull();
    expect(s.persistent).toBe(true);
  });

  it('falls back to memory when storage throws, and keeps working', () => {
    const s = browserStore(() => fakeStorage(true));
    expect(s.get('a')).toBeNull();
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
    expect(s.persistent).toBe(false);
  });

  it('falls back when storage is missing entirely', () => {
    const s = browserStore(() => {
      throw new ReferenceError('localStorage is not defined');
    });
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
  });

  it('keeps values written before storage started failing', () => {
    let fail = false;
    const backing = fakeStorage();
    const s = browserStore(() => {
      if (fail) throw new Error('quota');
      return backing;
    });
    s.set('a', '1');
    fail = true;
    expect(s.get('a')).toBe('1');
  });
});

describe('memoryStore', () => {
  it('is a plain map', () => {
    const s = memoryStore();
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
    expect(s.persistent).toBe(false);
  });
});
