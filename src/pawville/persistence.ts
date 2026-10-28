/**
 * One small, versioned persistence layer for every Pawville feature (instead of ad-hoc
 * localStorage calls). Each record:
 *   - is stored as { v: <version>, data: <payload> } under a "pawville:" key,
 *   - is migrated forward by `migrate` when an older version is found,
 *   - is repaired by `sanitize` (missing fields get defaults, bad values are dropped),
 *   - never throws: corrupted JSON or disabled storage fall back to defaults.
 * Large binary data (photos) does NOT go here — see memories/photoStore.ts (IndexedDB).
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Upper bound for any single record, so nothing unbounded ever lands in localStorage. */
export const MAX_RECORD_BYTES = 200_000;

export interface StoreSpec<T> {
  key: string;
  version: number;
  defaults: () => T;
  /** Repairs any (possibly partial/hostile) value into a valid T. */
  sanitize: (raw: unknown) => T;
  /** Converts data saved by an older version (or a legacy key) into the current shape. */
  migrate?: (oldVersion: number, raw: unknown, storage: KeyValueStorage) => unknown;
  /** A legacy key read once if the new key doesn't exist yet. */
  legacy?: (storage: KeyValueStorage) => unknown | undefined;
}

export interface Store<T> {
  load(): T;
  save(value: T): boolean;
  update(fn: (value: T) => T): T;
  reset(): void;
}

export function createStore<T>(spec: StoreSpec<T>, storageArg?: KeyValueStorage | null): Store<T> {
  const storage = () => (storageArg === undefined ? browserStorage() : storageArg);
  const fullKey = `pawville:${spec.key}`;
  const load = (): T => {
    const s = storage();
    if (!s) return spec.defaults();
    let raw: string | null = null;
    try {
      raw = s.getItem(fullKey);
    } catch {
      return spec.defaults();
    }
    if (raw === null) {
      const legacy = spec.legacy?.(s);
      return legacy === undefined ? spec.defaults() : spec.sanitize(legacy);
    }
    try {
      const parsed = JSON.parse(raw) as { v?: unknown; data?: unknown };
      const v = typeof parsed?.v === 'number' ? parsed.v : 0;
      const data = v < spec.version && spec.migrate ? spec.migrate(v, parsed?.data, s) : parsed?.data;
      return spec.sanitize(data);
    } catch {
      return spec.defaults();
    }
  };
  const save = (value: T): boolean => {
    const s = storage();
    if (!s) return false;
    const text = JSON.stringify({ v: spec.version, data: value });
    if (text.length > MAX_RECORD_BYTES) return false;
    try {
      s.setItem(fullKey, text);
      return true;
    } catch {
      return false;
    }
  };
  return {
    load,
    save,
    update(fn) {
      const next = fn(load());
      save(next);
      return next;
    },
    reset() {
      try {
        storage()?.removeItem?.(fullKey);
      } catch {
        /* ignore */
      }
    },
  };
}

// ---- tiny validators -------------------------------------------------------------------
export const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export const str = (x: unknown, fallback: string, max = 200): string => (typeof x === 'string' ? x.slice(0, max) : fallback);
export const num = (x: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback;
export const bool = (x: unknown, fallback = false): boolean => (typeof x === 'boolean' ? x : fallback);
export function oneOf<T extends string>(x: unknown, options: readonly T[], fallback: T): T {
  return options.includes(x as T) ? (x as T) : fallback;
}
export function arr<T>(x: unknown, each: (item: unknown) => T | null, max = 500): T[] {
  if (!Array.isArray(x)) return [];
  const out: T[] = [];
  for (const item of x.slice(0, max)) {
    const v = each(item);
    if (v !== null) out.push(v);
  }
  return out;
}
