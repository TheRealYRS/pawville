/**
 * Park activity rules (pure, deterministic, unit tested).
 * Shared versions are driven by a shared `startAt` timestamp from the activity coordinator, so
 * both players compute the SAME swing angle / seesaw tilt locally without streaming positions.
 */
import { seededRandom, hashString } from '../world/geometry.ts';
import type { Environment } from '../world/environment.ts';

// ------------------------------------------------------------------ swing
export const SWING_OMEGA = 2.4; // rad/s
export const SWING_MAX = 0.75;

export interface SwingSolo {
  amp: number;
  t0: number; // ms when the current oscillation started
}

export function swingAngleSolo(s: SwingSolo, now: number): number {
  return s.amp * Math.sin(((now - s.t0) / 1000) * SWING_OMEGA);
}

/** Pumping: pressing near the top of the arc adds energy; badly-timed pumps add almost none. */
export function pumpSwing(s: SwingSolo, now: number): { swing: SwingSolo; quality: 'great' | 'ok' | 'meh' } {
  const phase = Math.abs(Math.cos(((now - s.t0) / 1000) * SWING_OMEGA)); // 0 at peaks, 1 at bottom
  const quality = phase < 0.35 ? 'great' : phase < 0.7 ? 'ok' : 'meh';
  const add = quality === 'great' ? 0.12 : quality === 'ok' ? 0.06 : 0.015;
  const amp = Math.min(SWING_MAX, decaySwing(s, now).amp + add);
  // keep phase continuous: re-anchor so the current angle is preserved as best we can
  return { swing: { amp, t0: s.t0 }, quality };
}

export function decaySwing(s: SwingSolo, now: number, lastNow = now): SwingSolo {
  const dt = Math.max(0, (now - lastNow) / 1000);
  return { amp: Math.max(0, s.amp - dt * 0.03), t0: s.t0 };
}

/** Shared swinging: amplitude eases in over 4 s, both seats in step. */
export function swingAngleShared(startAt: number, now: number): number {
  const t = Math.max(0, (now - startAt) / 1000);
  const amp = SWING_MAX * 0.8 * Math.min(1, t / 4);
  return amp * Math.sin(t * SWING_OMEGA);
}

// ------------------------------------------------------------------ seesaw
export const SEESAW_PERIOD = 2.2; // s

/** Shared: smooth up/down, plus a little "bump" at the bottom of each swing. */
export function seesawTiltShared(startAt: number, now: number): number {
  const t = Math.max(0, (now - startAt) / 1000);
  const s = Math.sin((t / SEESAW_PERIOD) * Math.PI * 2);
  return Math.sign(s) * Math.min(1, Math.abs(s) * 1.25);
}

/** Solo: your side rests down; a hop lifts it briefly. */
export function seesawTiltSolo(side: -1 | 1, hopAt: number | null, now: number): number {
  if (hopAt === null) return side;
  const t = (now - hopAt) / 1000;
  if (t < 0 || t > 0.9) return side;
  return side * (1 - 2 * Math.sin((t / 0.9) * Math.PI) * 0.85);
}

// ------------------------------------------------------------------ fishing
export type FishId = 'sardine' | 'minnow' | 'goldfish' | 'koi' | 'moonfish' | 'raincarp' | 'snowtrout' | 'old-boot';

export interface FishDef {
  id: FishId;
  name: string;
  weight: number;
  needs?: 'night' | 'rain' | 'snow';
  color: string;
}

export const FISH: readonly FishDef[] = [
  { id: 'sardine', name: 'Silver sardine', weight: 30, color: '#c9d6e6' },
  { id: 'minnow', name: 'Tiny minnow', weight: 30, color: '#9cc3ff' },
  { id: 'goldfish', name: 'Lucky goldfish', weight: 10, color: '#ffc94a' },
  { id: 'koi', name: 'Spotted koi', weight: 6, color: '#ff8a35' },
  { id: 'moonfish', name: 'Moonfish', weight: 8, needs: 'night', color: '#c9bfe8' },
  { id: 'raincarp', name: 'Rain carp', weight: 10, needs: 'rain', color: '#5d93c9' },
  { id: 'snowtrout', name: 'Snow trout', weight: 10, needs: 'snow', color: '#f4f8ff' },
  { id: 'old-boot', name: 'An old boot', weight: 6, color: '#7a512f' },
];

export function fishAvailable(f: FishDef, env: Pick<Environment, 'darkness' | 'weather'>): boolean {
  if (f.needs === 'night') return env.darkness > 0.5;
  if (f.needs === 'rain') return env.weather === 'light-rain' || env.weather === 'heavy-rain';
  if (f.needs === 'snow') return env.weather === 'snow';
  return true;
}

export function rollFish(rand: () => number, env: Pick<Environment, 'darkness' | 'weather'>): FishDef {
  const pool = FISH.filter((f) => fishAvailable(f, env));
  const total = pool.reduce((n, f) => n + f.weight, 0);
  let r = rand() * total;
  for (const f of pool) {
    r -= f.weight;
    if (r < 0) return f;
  }
  return pool[0];
}

export const BITE_WINDOW_MS = 950;

export type FishingState =
  | { phase: 'idle' }
  | { phase: 'waiting'; castAt: number; biteAt: number; seed: number }
  | { phase: 'bite'; biteAt: number; seed: number }
  | { phase: 'caught'; fish: FishId; at: number }
  | { phase: 'missed'; reason: 'too-soon' | 'too-late'; at: number };

export function cast(now: number, seed: number): FishingState {
  const rand = seededRandom(seed);
  return { phase: 'waiting', castAt: now, biteAt: now + 1800 + rand() * 4500, seed };
}

export function tickFishing(s: FishingState, now: number): FishingState {
  let t = s;
  if (t.phase === 'waiting' && now >= t.biteAt) t = { phase: 'bite', biteAt: t.biteAt, seed: t.seed };
  if (t.phase === 'bite' && now > t.biteAt + BITE_WINDOW_MS) t = { phase: 'missed', reason: 'too-late', at: now };
  return t;
}

export function reel(s: FishingState, now: number, env: Pick<Environment, 'darkness' | 'weather'>): FishingState {
  const t = tickFishing(s, now);
  if (t.phase === 'waiting') return { phase: 'missed', reason: 'too-soon', at: now };
  if (t.phase === 'bite') return { phase: 'caught', fish: rollFish(seededRandom(t.seed ^ 0x5eed), env).id, at: now };
  return t;
}

// ------------------------------------------------------------------ garden
export type SeedId = 'tulip' | 'daisy' | 'sunflower' | 'bluebell' | 'rose';
export const SEEDS: readonly { id: SeedId; name: string; color: string }[] = [
  { id: 'tulip', name: 'Tulip', color: '#ff6fa1' },
  { id: 'daisy', name: 'Daisy', color: '#fff3e6' },
  { id: 'sunflower', name: 'Sunflower', color: '#ffc94a' },
  { id: 'bluebell', name: 'Bluebell', color: '#9cc3ff' },
  { id: 'rose', name: 'Rose', color: '#e0475c' },
];
export const GARDEN_PLOTS = 6;
/** A watering counts towards growth at most once per GROW_GAP_MS (no grinding by spam-clicking). */
export const GROW_GAP_MS = 10 * 60 * 1000;
export const STAGES_TO_BLOOM = 3;

export interface Plot {
  seed: SeedId;
  plantedBy: 'T' | 'M';
  plantedAt: number;
  growth: number; // 0..3
  lastGrowAt: number;
  wateredBy: ('T' | 'M')[];
}

export interface GardenOp {
  id: string;
  kind: 'plant' | 'water' | 'pick';
  plot: number;
  seed?: SeedId;
  by: 'T' | 'M';
  at: number;
}

export interface Garden {
  plots: (Plot | null)[];
  applied: string[]; // recent op ids (idempotency)
  bloomed: number; // total flowers grown (for achievements)
}

export const emptyGarden = (): Garden => ({ plots: new Array(GARDEN_PLOTS).fill(null), applied: [], bloomed: 0 });

export type GardenResult = { garden: Garden; ok: boolean; reason?: string };

/** Applies an operation. Idempotent (same op id twice = no-op), so ops can be shared over the network. */
export function applyGardenOp(g: Garden, op: GardenOp): GardenResult {
  if (g.applied.includes(op.id)) return { garden: g, ok: true, reason: 'duplicate' };
  if (!Number.isInteger(op.plot) || op.plot < 0 || op.plot >= GARDEN_PLOTS) return { garden: g, ok: false, reason: 'bad-plot' };
  const plots = g.plots.slice();
  const p = plots[op.plot];
  const mark = (next: Partial<Garden>): GardenResult => ({ garden: { ...g, ...next, plots, applied: [...g.applied, op.id].slice(-200) }, ok: true });
  switch (op.kind) {
    case 'plant':
      if (p) return { garden: g, ok: false, reason: 'occupied' };
      if (!op.seed || !SEEDS.some((s) => s.id === op.seed)) return { garden: g, ok: false, reason: 'bad-seed' };
      plots[op.plot] = { seed: op.seed, plantedBy: op.by, plantedAt: op.at, growth: 0, lastGrowAt: op.at - GROW_GAP_MS, wateredBy: [] };
      return mark({});
    case 'water': {
      if (!p) return { garden: g, ok: false, reason: 'empty' };
      if (p.growth >= STAGES_TO_BLOOM) return { garden: g, ok: false, reason: 'already-bloomed' };
      const grows = op.at - p.lastGrowAt >= GROW_GAP_MS;
      const wateredBy = p.wateredBy.includes(op.by) ? p.wateredBy : [...p.wateredBy, op.by];
      const growth = grows ? p.growth + 1 : p.growth;
      plots[op.plot] = { ...p, wateredBy, growth, lastGrowAt: grows ? op.at : p.lastGrowAt };
      return mark({ bloomed: g.bloomed + (growth >= STAGES_TO_BLOOM && p.growth < STAGES_TO_BLOOM ? 1 : 0) });
    }
    case 'pick':
      if (!p) return { garden: g, ok: false, reason: 'empty' };
      // Only the planter may clear a plot that hasn't bloomed — no undoing your partner's work.
      if (p.growth < STAGES_TO_BLOOM && p.plantedBy !== op.by) return { garden: g, ok: false, reason: 'not-yours' };
      plots[op.plot] = null;
      return mark({});
  }
}

export function nextGrowIn(p: Plot, now: number): number {
  return Math.max(0, GROW_GAP_MS - (now - p.lastGrowAt));
}

// ------------------------------------------------------------------ picnic
export const BLANKETS = ['gingham', 'lavender', 'mint', 'rose'] as const;
export type Blanket = (typeof BLANKETS)[number];
export const SNACKS = [
  { id: 'fish-sandwich', name: 'Fish sandwich' }, { id: 'milk', name: 'Warm milk' }, { id: 'strawberry-cake', name: 'Strawberry cake' },
  { id: 'onigiri', name: 'Tuna onigiri' }, { id: 'apple', name: 'Crunchy apple' }, { id: 'cookies', name: 'Paw cookies' },
] as const;
export type SnackId = (typeof SNACKS)[number]['id'];

// ------------------------------------------------------------------ stargazing
export interface Constellation {
  id: string;
  name: string;
  stars: [number, number][];
  lines: [number, number][];
}

export const CONSTELLATIONS: readonly Constellation[] = [
  { id: 'big-paw', name: 'The Big Paw', stars: [[20, 60], [32, 52], [44, 50], [56, 54], [38, 72]], lines: [[0, 4], [1, 4], [2, 4], [3, 4]] },
  { id: 'yarn', name: 'The Yarn Ball', stars: [[110, 30], [126, 24], [138, 36], [128, 50], [112, 46], [150, 60]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5]] },
  { id: 'twin-tails', name: 'Twin Tails', stars: [[190, 70], [200, 54], [214, 44], [230, 50], [242, 66]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { id: 'fish', name: 'The Leaping Fish', stars: [[70, 110], [92, 100], [114, 106], [128, 96], [128, 118]], lines: [[0, 1], [1, 2], [2, 3], [2, 4]] },
];

/** Deterministic shooting stars: one per ~40 s window, at a hashed moment. Same for everyone. */
export const SHOOTING_WINDOW_MS = 40_000;
export const SHOOTING_DURATION_MS = 1600;

export function shootingStarAt(now: number): number | null {
  const w = Math.floor(now / SHOOTING_WINDOW_MS);
  const offset = (hashString(`star:${w}`) % 30_000) + 4000;
  const start = w * SHOOTING_WINDOW_MS + offset;
  const p = (now - start) / SHOOTING_DURATION_MS;
  return p >= 0 && p <= 1 ? p : null;
}

export function nextShootingStar(now: number): number {
  for (let w = Math.floor(now / SHOOTING_WINDOW_MS); ; w++) {
    const start = w * SHOOTING_WINDOW_MS + (hashString(`star:${w}`) % 30_000) + 4000;
    if (start + SHOOTING_DURATION_MS > now) return start;
  }
}
