/**
 * Whack-a-Cat rules (pure, time-driven — the UI passes `now` in milliseconds).
 * Scoring: cat 10, golden cat 30, + combo bonus 2 × combo (max +20). Napping kitten or empty
 * box = miss (kitten −5, never below 0). Escaped cats reset the combo. Each target scores once;
 * nothing scores after the round. At most `maxUp` targets are visible at once.
 */
import { randomInt, type Rng } from '../shared.ts';

export type WhackLevel = 'easy' | 'medium' | 'hard';
export const HOLES = 9;
export const ROUND_MS = 30_000;

export const WHACK_LEVELS: Record<WhackLevel, { spawnStart: number; spawnEnd: number; lifeStart: number; lifeEnd: number; kittenChance: number; maxUp: number }> = {
  easy: { spawnStart: 950, spawnEnd: 700, lifeStart: 1500, lifeEnd: 1150, kittenChance: 0.08, maxUp: 2 },
  medium: { spawnStart: 800, spawnEnd: 520, lifeStart: 1250, lifeEnd: 850, kittenChance: 0.14, maxUp: 3 },
  hard: { spawnStart: 650, spawnEnd: 380, lifeStart: 1000, lifeEnd: 650, kittenChance: 0.2, maxUp: 4 },
};

export type TargetKind = 'cat' | 'gold' | 'kitten';

export interface Target {
  id: number;
  hole: number;
  kind: TargetKind;
  cat: 'T' | 'M';
  appearedAt: number;
  expiresAt: number;
  state: 'up' | 'hit' | 'gone';
  clearAt: number;
}

export interface WhackState {
  level: WhackLevel;
  startedAt: number;
  endsAt: number;
  over: boolean;
  targets: Target[];
  nextId: number;
  nextSpawnAt: number;
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  escaped: number;
  lastEvent: { kind: 'hit' | 'gold' | 'kitten' | 'whiff'; hole: number; points: number; at: number } | null;
}

export function createWhack(level: WhackLevel, startedAt: number): WhackState {
  return {
    level, startedAt, endsAt: startedAt + ROUND_MS, over: false, targets: [], nextId: 1, nextSpawnAt: startedAt + 300,
    score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, escaped: 0, lastEvent: null,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function difficultyAt(s: WhackState, now: number): { spawnEvery: number; life: number } {
  const cfg = WHACK_LEVELS[s.level];
  const t = Math.min(1, Math.max(0, (now - s.startedAt) / ROUND_MS));
  return { spawnEvery: lerp(cfg.spawnStart, cfg.spawnEnd, t), life: lerp(cfg.lifeStart, cfg.lifeEnd, t) };
}

export function tickWhack(s: WhackState, now: number, rng: Rng): WhackState {
  if (s.over) return s;
  let { combo, escaped, nextId, nextSpawnAt } = s;
  let targets = s.targets.map((t) => {
    if (t.state === 'up' && now >= t.expiresAt) {
      if (t.kind !== 'kitten') {
        combo = 0;
        escaped++;
      }
      return { ...t, state: 'gone' as const, clearAt: now + 180 };
    }
    return t;
  });
  targets = targets.filter((t) => t.state === 'up' || now < t.clearAt);
  if (now >= s.endsAt) {
    return { ...s, over: true, targets: targets.map((t) => (t.state === 'up' ? { ...t, state: 'gone' as const, clearAt: now } : t)), combo, escaped };
  }
  const cfg = WHACK_LEVELS[s.level];
  for (let guard = 0; now >= nextSpawnAt && guard < 3; guard++) {
    const { spawnEvery, life } = difficultyAt(s, nextSpawnAt);
    const busy = new Set(targets.map((t) => t.hole));
    const up = targets.filter((t) => t.state === 'up').length;
    const free = Array.from({ length: HOLES }, (_, i) => i).filter((h) => !busy.has(h));
    if (free.length > 0 && up < cfg.maxUp) {
      const roll = rng();
      const kind: TargetKind = roll < cfg.kittenChance ? 'kitten' : roll > 0.93 ? 'gold' : 'cat';
      const appearedAt = Math.max(nextSpawnAt, now - 50);
      targets = [...targets, {
        id: nextId++, hole: free[randomInt(rng, free.length)], kind, cat: rng() < 0.5 ? 'T' : 'M',
        appearedAt, expiresAt: appearedAt + life * (kind === 'gold' ? 0.75 : 1), state: 'up', clearAt: Infinity,
      }];
    }
    nextSpawnAt += spawnEvery * (0.75 + rng() * 0.5);
  }
  if (now >= nextSpawnAt) nextSpawnAt = now + difficultyAt(s, now).spawnEvery;
  return { ...s, targets, combo, escaped, nextId, nextSpawnAt };
}

export function comboBonus(combo: number): number {
  return Math.min(20, combo * 2);
}

export function whack(s: WhackState, hole: number, now: number): WhackState {
  if (s.over || now >= s.endsAt || hole < 0 || hole >= HOLES) return s;
  const t = s.targets.find((x) => x.hole === hole && x.state === 'up' && now < x.expiresAt);
  if (!t) return { ...s, combo: 0, misses: s.misses + 1, lastEvent: { kind: 'whiff', hole, points: 0, at: now } };
  const targets = s.targets.map((x) => (x.id === t.id ? { ...x, state: 'hit' as const, clearAt: now + 260 } : x));
  if (t.kind === 'kitten') {
    const score = Math.max(0, s.score - 5);
    return { ...s, targets, score, combo: 0, misses: s.misses + 1, lastEvent: { kind: 'kitten', hole, points: score - s.score, at: now } };
  }
  const points = (t.kind === 'gold' ? 30 : 10) + comboBonus(s.combo);
  const combo = s.combo + 1;
  return {
    ...s, targets, score: s.score + points, combo, maxCombo: Math.max(s.maxCombo, combo), hits: s.hits + 1,
    lastEvent: { kind: t.kind === 'gold' ? 'gold' : 'hit', hole, points, at: now },
  };
}

export function whackAccuracy(s: WhackState): number {
  const total = s.hits + s.misses;
  return total === 0 ? 0 : (s.hits / total) * 100;
}
