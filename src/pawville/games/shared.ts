/**
 * Shared, framework-free helpers for the Pawville games: seeded randomness, shuffling, time
 * formatting and personal-best records (localStorage on this device, same keys as Milestone 2).
 */
import { seededRandom } from '../world/geometry.ts';
import { memoryStorage as memStore, type KeyValueStorage } from '../persistence.ts';

export type Rng = () => number;
export { seededRandom };
export type { KeyValueStorage };
export const memoryStorage = memStore;

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** 83.4 -> "1:23.4" */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export type Better = 'higher' | 'lower';

export interface RecordResult {
  best: number;
  previous: number | null;
  isNewBest: boolean;
}

const PREFIX = 'pawville:best:';

export function readBest(game: string, key: string, storage: KeyValueStorage | null = defaultStorage()): number | null {
  try {
    const raw = storage?.getItem(`${PREFIX}${game}:${key}`);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function submitBest(game: string, key: string, value: number, better: Better, storage: KeyValueStorage | null = defaultStorage()): RecordResult {
  const previous = readBest(game, key, storage);
  const isNewBest = Number.isFinite(value) && (previous === null || (better === 'higher' ? value > previous : value < previous));
  if (isNewBest) {
    try {
      storage?.setItem(`${PREFIX}${game}:${key}`, String(value));
    } catch {
      /* storage full or disabled */
    }
  }
  return { best: isNewBest ? value : (previous ?? value), previous, isNewBest };
}

export function readFlag(key: string, storage: KeyValueStorage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(`pawville:${key}`) ?? null;
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string, storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(`pawville:${key}`, value);
  } catch {
    /* ignore */
  }
}
