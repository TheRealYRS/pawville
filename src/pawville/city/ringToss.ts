/**
 * Ring Toss — the funfair's carnival game (pure model, unit tested in tests/pawvilleFunfair.test.ts).
 *
 * The booth has a row of pegs at three depths (near / middle / far) plus a golden peg that slides side to
 * side. You aim (left/right), charge the throw (hold) and release; the ring flies in a visible arc and lands
 * on the table in front of the pegs, where it either drops over a peg (score), clinks off a rim and bounces
 * away (a near miss — shown), or just lands on the table (a miss). Every ring resolves exactly once.
 *
 * Coordinates: x = sideways (0..BOARD_W), d = depth from the player (0 = at the counter, 1 = the back wall).
 */
export const BOARD_W = 200;
export const RINGS_PER_ROUND = 6;
export const RING_R = 9;
export const PEG_R = 4;
export const FLIGHT_MS = 720;

export interface Peg { id: string; x: number; d: number; points: number; golden: boolean }

/** Pegs at three depths; farther = worth more. The golden peg's x is animated (see `pegX`). */
export const PEGS: readonly Peg[] = [
  { id: 'n1', x: 40, d: 0.36, points: 1, golden: false }, { id: 'n2', x: 100, d: 0.36, points: 1, golden: false }, { id: 'n3', x: 160, d: 0.36, points: 1, golden: false },
  { id: 'm1', x: 70, d: 0.58, points: 2, golden: false }, { id: 'm2', x: 130, d: 0.58, points: 2, golden: false },
  { id: 'f1', x: 100, d: 0.8, points: 3, golden: false },
  { id: 'gold', x: 100, d: 0.69, points: 5, golden: true },
];

/** The golden peg glides back and forth along the whole board. */
export function pegX(p: Peg, ms: number): number {
  return p.golden ? BOARD_W / 2 + Math.sin(ms / 1500) * 62 : p.x;
}

export type ThrowResult =
  | { kind: 'peg'; peg: string; points: number; x: number; d: number }
  | { kind: 'rim'; peg: string; x: number; d: number; bounceX: number; bounceD: number }
  | { kind: 'miss'; x: number; d: number };

/** Where a throw lands (before the peg check): aim is the sideways position, power 0..1 the depth. */
export function landing(aim: number, power: number): { x: number; d: number } {
  const p = Math.max(0, Math.min(1, power));
  return { x: Math.max(8, Math.min(BOARD_W - 8, aim)), d: 0.18 + p * 0.72 };
}

/** Depth is foreshortened: one unit of depth is "worth" this many sideways pixels when measuring distances. */
const DEPTH_SCALE = 90;

/**
 * Resolves a throw against the pegs at time `ms`. A ring must land within a few pixels of a peg's centre to drop over
 * it. A peg that already wears a ring is INACTIVE (`taken`): a second ring only clinks off it, so a peg scores once.
 */
export function resolveThrow(aim: number, power: number, ms: number, taken: ReadonlySet<string> = new Set()): ThrowResult {
  const { x, d } = landing(aim, power);
  let best: { peg: Peg; dist: number; px: number } | null = null;
  for (const peg of PEGS) {
    const px = pegX(peg, ms + FLIGHT_MS); // the golden peg keeps moving while the ring is in the air
    const dist = Math.hypot(x - px, (d - peg.d) * DEPTH_SCALE);
    if (!best || dist < best.dist) best = { peg, dist, px };
  }
  if (best && best.dist <= RING_R - 1 && !taken.has(best.peg.id)) return { kind: 'peg', peg: best.peg.id, points: best.peg.points, x: best.px, d: best.peg.d };
  if (best && best.dist <= RING_R + PEG_R + 4) {
    // clink off the rim: bounces away from the peg
    const ang = Math.atan2((d - best.peg.d) * DEPTH_SCALE, x - best.px);
    return { kind: 'rim', peg: best.peg.id, x, d, bounceX: Math.max(8, Math.min(BOARD_W - 8, x + Math.cos(ang) * 16)), bounceD: Math.max(0.15, Math.min(0.97, d + (Math.sin(ang) * 16) / DEPTH_SCALE)) };
  }
  return { kind: 'miss', x, d };
}

export interface TossState {
  rings: number;
  score: number;
  /** Pegs that already wear a ring (inactive for the rest of the round). */
  taken: string[];
  /** Throws resolved so far (kept for the results screen and tests). */
  history: { result: ThrowResult; points: number }[];
  over: boolean;
}
export const newToss = (): TossState => ({ rings: RINGS_PER_ROUND, score: 0, taken: [], history: [], over: false });

/** Applies one throw. A finished round ignores further throws (no extra rings, no double scoring). */
export function applyThrow(s: TossState, result: ThrowResult): TossState {
  if (s.over || s.rings <= 0) return s;
  const points = result.kind === 'peg' ? result.points : 0;
  const rings = s.rings - 1;
  const taken = result.kind === 'peg' && !s.taken.includes(result.peg) ? [...s.taken, result.peg] : s.taken;
  return { rings, score: s.score + (result.kind === 'peg' && s.taken.includes(result.peg) ? 0 : points), taken, history: [...s.history, { result, points }], over: rings === 0 };
}

/** The arc a ring follows (for drawing the preview and the flight): progress k 0..1 → screen-space offsets. */
export function arcPoint(from: { x: number; d: number }, to: { x: number; d: number }, k: number): { x: number; d: number; h: number } {
  return { x: from.x + (to.x - from.x) * k, d: from.d + (to.d - from.d) * k, h: Math.sin(k * Math.PI) * (0.22 + 0.3 * to.d) };
}

/** Tokens for a finished round: capped small; the economy's daily cap applies on top. */
export function tossTokens(score: number): number {
  return score >= 12 ? 3 : score >= 7 ? 2 : score >= 3 ? 1 : 0;
}
