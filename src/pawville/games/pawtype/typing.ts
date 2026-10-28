/**
 * PawType — a friendly typing duel (pure engine).
 *
 * Rules
 *   - Phrases are lowercase words separated by single spaces. Input is lowercased, so Caps Lock or
 *     autocapitalisation never counts against you.
 *   - Progress = the correctly typed prefix of the CURRENT phrase. A wrong key never moves your cat;
 *     fix it with Backspace (at most MAX_OVERFLOW wrong characters can pile up).
 *   - Input is ignored before the start time and after the race ends.
 *   - Race mode: finish all phrases. Timed modes (15/30 s): phrases are chained; only completed
 *     phrases count as completed, and the score is total correct characters.
 *
 * Metrics (identical in every mode)
 *   correct chars = characters of completed phrases (+1 per space between them) + current prefix
 *   accuracy      = correct keystrokes ÷ all keystrokes (backspaces excluded) × 100; 100 if no keys yet
 *   wpm           = correct chars ÷ 5 ÷ minutes (0 before 1 second has passed)
 *   ranking       = race: finished first wins, else more progress; timed: more correct chars;
 *                   ties are broken by accuracy. Mashing keys only lowers accuracy.
 */
import { seededRandom } from '../../world/geometry.ts';
import { ALL_PHRASES, PHRASES, type PhraseCategory } from './phrases.ts';

export const MAX_OVERFLOW = 4;
export type TypeMode = 'race' | 'timed15' | 'timed30';
export const MODE_SECONDS: Record<TypeMode, number | null> = { race: null, timed15: 15, timed30: 30 };

export interface TypeState {
  phrases: string[];
  index: number; // current phrase
  typed: string; // input for the current phrase
  completedChars: number;
  keystrokes: number;
  correctKeystrokes: number;
  errors: number;
  startAt: number;
  endAt: number | null; // fixed end for timed modes
  finishedAt: number | null;
}

/** Deterministic phrase selection: both players in a match get the same phrases from the same seed. */
export function pickPhrases(seed: number, category: PhraseCategory | 'mixed', count: number): string[] {
  const pool = category === 'mixed' ? ALL_PHRASES : PHRASES[category];
  const rand = seededRandom(seed);
  const out: string[] = [];
  let last = '';
  while (out.length < count) {
    const p = pool[Math.floor(rand() * pool.length)];
    if (p === last && pool.length > 1) continue;
    out.push(p);
    last = p;
  }
  return out;
}

export function createType(phrases: string[], startAt: number, mode: TypeMode): TypeState {
  const secs = MODE_SECONDS[mode];
  return {
    phrases, index: 0, typed: '', completedChars: 0, keystrokes: 0, correctKeystrokes: 0, errors: 0, startAt,
    endAt: secs === null ? null : startAt + secs * 1000, finishedAt: null,
  };
}

const prefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

export function isOver(s: TypeState, now: number): boolean {
  return s.finishedAt !== null || (s.endAt !== null && now >= s.endAt);
}

/** Apply the new value of the input box. */
export function typeInput(s: TypeState, rawValue: string, now: number): TypeState {
  if (now < s.startAt || isOver(s, now)) return s;
  const value = rawValue.toLowerCase();
  const target = s.phrases[s.index];
  if (value === s.typed) return s;
  if (!value.startsWith(s.typed)) {
    const k = prefix(value, s.typed);
    const base = { ...s, typed: s.typed.slice(0, k) };
    return value.length === k ? base : typeInput(base, value, now);
  }
  let { typed, keystrokes, correctKeystrokes, errors } = s;
  for (const ch of value.slice(s.typed.length)) {
    const good = prefix(target, typed);
    if (typed.length - good >= MAX_OVERFLOW) break;
    keystrokes++;
    if (good === typed.length && target[typed.length] === ch) correctKeystrokes++;
    else errors++;
    typed += ch;
    if (typed === target) break;
  }
  let next: TypeState = { ...s, typed, keystrokes, correctKeystrokes, errors };
  if (typed === target) {
    const completedChars = s.completedChars + target.length + (s.index > 0 ? 1 : 0);
    const index = s.index + 1;
    if (index >= s.phrases.length) next = { ...next, completedChars, index, typed: '', finishedAt: now };
    else next = { ...next, completedChars, index, typed: '' };
  }
  return next;
}

export interface TypeStats {
  correctChars: number;
  totalChars: number;
  progress: number; // 0..1 of the whole race (or of the current phrase in timed mode)
  phrasesDone: number;
  accuracy: number;
  wpm: number;
  errors: number;
  elapsed: number; // seconds
  finished: boolean;
}

export function totalChars(phrases: readonly string[]): number {
  return phrases.reduce((n, p) => n + p.length, 0) + Math.max(0, phrases.length - 1);
}

export function typeStats(s: TypeState, now: number): TypeStats {
  const current = s.phrases[s.index] ?? '';
  const curPrefix = s.index < s.phrases.length ? prefix(current, s.typed) : 0;
  const correctChars = s.completedChars + (curPrefix > 0 ? curPrefix + (s.index > 0 ? 1 : 0) : 0);
  const end = s.finishedAt ?? (s.endAt !== null ? Math.min(now, s.endAt) : now);
  const elapsed = Math.max(0, (end - s.startAt) / 1000);
  const total = totalChars(s.phrases);
  return {
    correctChars, totalChars: total,
    progress: s.endAt === null ? Math.min(1, total === 0 ? 0 : correctChars / total) : current.length ? curPrefix / current.length : 1,
    phrasesDone: s.index,
    accuracy: s.keystrokes === 0 ? 100 : (s.correctKeystrokes / s.keystrokes) * 100,
    wpm: elapsed < 1 ? 0 : correctChars / 5 / (elapsed / 60),
    errors: s.errors,
    elapsed,
    finished: s.finishedAt !== null,
  };
}

export type CharMark = 'correct' | 'wrong' | 'current' | 'pending';

export function charMarks(s: TypeState): CharMark[] {
  const target = s.phrases[s.index] ?? '';
  const good = prefix(target, s.typed);
  return [...target].map((_, i) => (i < good ? 'correct' : i < s.typed.length ? 'wrong' : i === s.typed.length ? 'current' : 'pending'));
}

export interface RaceResult {
  name: string;
  finished: boolean;
  finishMs: number | null; // ms after start
  correctChars: number;
  accuracy: number;
  wpm: number;
  phrasesDone: number;
}

export function resultOf(name: string, s: TypeState, now: number): RaceResult {
  const st = typeStats(s, now);
  return {
    name, finished: st.finished, finishMs: s.finishedAt === null ? null : s.finishedAt - s.startAt, correctChars: st.correctChars,
    accuracy: Math.round(st.accuracy * 10) / 10, wpm: Math.round(st.wpm * 10) / 10, phrasesDone: st.phrasesDone,
  };
}

/** Negative if a ranks ahead of b. */
export function compareResults(a: RaceResult, b: RaceResult, mode: TypeMode): number {
  if (mode === 'race') {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished && a.finishMs !== b.finishMs) return (a.finishMs ?? 0) - (b.finishMs ?? 0);
  }
  if (a.correctChars !== b.correctChars) return b.correctChars - a.correctChars;
  return b.accuracy - a.accuracy;
}

/** Plausibility check for a result reported by the other client (rejects obviously invalid ones). */
export function plausibleResult(r: RaceResult, phrases: readonly string[], mode: TypeMode): boolean {
  const total = totalChars(phrases);
  if (!(r.correctChars >= 0 && r.correctChars <= total)) return false;
  if (!(r.accuracy >= 0 && r.accuracy <= 100) || !(r.wpm >= 0 && r.wpm <= 250)) return false;
  if (r.finished && (r.finishMs === null || r.correctChars !== total)) return false;
  const limit = MODE_SECONDS[mode];
  const minMs = (r.correctChars / 5 / 250) * 60_000; // nobody types above 250 wpm
  if (r.finished && r.finishMs !== null && (r.finishMs < minMs || (limit !== null && r.finishMs > limit * 1000 + 500))) return false;
  return true;
}

/** Computer opponent: steady pace with small, deterministic stumbles. */
export function botChars(wpm: number, elapsedSeconds: number, seed: number): number {
  const rand = seededRandom(seed);
  let chars = 0;
  let t = 0;
  const perChar = 60 / (wpm * 5);
  while (t < elapsedSeconds) {
    t += perChar * (rand() < 0.06 ? 3.5 : 0.85 + rand() * 0.3);
    if (t <= elapsedSeconds) chars++;
    if (chars > 10_000) break;
  }
  return chars;
}
