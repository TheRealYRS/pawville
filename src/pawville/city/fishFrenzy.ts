/**
 * Fish Frenzy (Milestone 8.2) — an arcade cabinet in the Whiskerwick Arcade.
 *
 * Fish swim across four depth lanes under the pier. Move the hook between lanes (↑/↓ or W/S) and
 * SNAP (Space / the button) when a fish passes the hook. Catches in a row build a combo (×1…×4).
 * Golden fish are worth more; snapping on an old boot costs 5 seconds; a snap that catches nothing
 * resets the combo. 60 seconds.
 *
 * Pure and deterministic: time is passed in, randomness is injected. Unit tested.
 */

export const FRENZY_LANES = 4;
export const FRENZY_GAME_MS = 60_000;
/** The track is 0..100 wide; the hook hangs at the centre. */
export const HOOK_X = 50;
/** A fish whose centre is within this distance of the hook is caught by a snap. */
export const CATCH_WINDOW = 7;
export const BOOT_PENALTY_MS = 5000;

export type FrenzyKind = 'minnow' | 'sardine' | 'koi' | 'golden' | 'boot';
export const FRENZY_POINTS: Record<FrenzyKind, number> = { minnow: 1, sardine: 2, koi: 3, golden: 8, boot: 0 };

export interface FrenzyFish {
  id: number;
  lane: number;
  kind: FrenzyKind;
  /** Position 0..100 and speed in track units per second (sign = direction). */
  x: number;
  v: number;
}

export interface FrenzyState {
  t: number;
  /** Time limit (a boot snap shortens it). */
  limit: number;
  lane: number;
  fish: FrenzyFish[];
  score: number;
  combo: number;
  bestCombo: number;
  caught: number;
  golden: number;
  nextSpawn: number;
  nextId: number;
  over: boolean;
  last: null | { kind: 'catch'; fish: FrenzyKind; points: number; combo: number } | { kind: 'boot' } | { kind: 'miss' };
}

export function newFrenzy(): FrenzyState {
  return { t: 0, limit: FRENZY_GAME_MS, lane: 1, fish: [], score: 0, combo: 0, bestCombo: 0, caught: 0, golden: 0, nextSpawn: 300, nextId: 1, over: false, last: null };
}

export function comboMultiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(combo / 3));
}

function pickKind(r: number, t: number): FrenzyKind {
  const bootP = 0.08 + Math.min(0.08, t / 600000);
  if (r < 0.04) return 'golden';
  if (r < 0.04 + bootP) return 'boot';
  if (r < 0.45) return 'minnow';
  if (r < 0.78) return 'sardine';
  return 'koi';
}

export function tickFrenzy(s: FrenzyState, dt: number, rand: () => number): FrenzyState {
  if (s.over || dt <= 0) return s;
  const t = s.t + dt;
  const fish = s.fish.map((f) => ({ ...f, x: f.x + (f.v * dt) / 1000 })).filter((f) => f.x > -12 && f.x < 112);
  let { nextSpawn, nextId } = s;
  while (t >= nextSpawn) {
    const kind = pickKind(rand(), t);
    const dir = rand() < 0.5 ? 1 : -1;
    const speed = (kind === 'golden' ? 46 : kind === 'koi' ? 22 : kind === 'boot' ? 14 : kind === 'sardine' ? 30 : 26) * (1 + Math.min(0.6, t / 100000));
    fish.push({ id: nextId++, lane: Math.floor(rand() * FRENZY_LANES), kind, x: dir > 0 ? -10 : 110, v: dir * speed });
    nextSpawn += Math.round(Math.max(380, 900 - t / 120) * (0.7 + rand() * 0.6));
  }
  return { ...s, t, fish, nextSpawn, nextId, over: t >= s.limit, last: null };
}

export function moveHook(s: FrenzyState, d: -1 | 1): FrenzyState {
  if (s.over) return s;
  return { ...s, lane: Math.max(0, Math.min(FRENZY_LANES - 1, s.lane + d)) };
}
export function setHookLane(s: FrenzyState, lane: number): FrenzyState {
  if (s.over) return s;
  return { ...s, lane: Math.max(0, Math.min(FRENZY_LANES - 1, Math.floor(lane))) };
}

/** Snap the hook: catches the closest fish in the hook's lane within the window. */
export function snap(s: FrenzyState): FrenzyState {
  if (s.over) return s;
  let best: FrenzyFish | null = null;
  for (const f of s.fish) if (f.lane === s.lane && Math.abs(f.x - HOOK_X) <= CATCH_WINDOW && (!best || Math.abs(f.x - HOOK_X) < Math.abs(best.x - HOOK_X))) best = f;
  if (!best) return { ...s, combo: 0, last: { kind: 'miss' } };
  const fish = s.fish.filter((f) => f.id !== best!.id);
  if (best.kind === 'boot') {
    const limit = Math.max(s.t, s.limit - BOOT_PENALTY_MS);
    return { ...s, fish, combo: 0, limit, over: s.t >= limit, last: { kind: 'boot' } };
  }
  const combo = s.combo + 1;
  const points = FRENZY_POINTS[best.kind] * comboMultiplier(s.combo);
  return {
    ...s, fish, combo, bestCombo: Math.max(s.bestCombo, combo), score: s.score + points, caught: s.caught + 1, golden: s.golden + (best.kind === 'golden' ? 1 : 0),
    last: { kind: 'catch', fish: best.kind, points, combo },
  };
}

export function frenzyTokens(score: number): number {
  return score >= 120 ? 5 : score >= 80 ? 4 : score >= 50 ? 3 : score >= 25 ? 2 : score >= 8 ? 1 : 0;
}
