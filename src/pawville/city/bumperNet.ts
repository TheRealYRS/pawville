/**
 * Bumper Paws for two (pure, unit tested in tests/pawvilleBumperCouple.test.ts).
 *
 * The same host-runs-the-match design as Cat Boxing: the HOST simulates the arena (so there is exactly one truth), the
 * GUEST sends its steering and receives ~20 snapshots a second, which it smooths so the cars glide instead of jumping.
 *
 *   guest → host   bump:in  { sid, rd, st, th, co }      steering, throttle, the guest's coat (sent a few times a second)
 *   host  → guest  bump:st  { sid, rd, snap }            the whole arena: 4 cars, the clock, new bumps, who wears which coat
 *
 * Everything arriving over the network is validated here (shape, finite numbers, bounds) and clamped, so a broken or
 * hostile message can never put a car outside the arena, give it a crazy speed or crash the other player's game.
 * Car 0 is always Tangerine's, car 1 Midnight's (like Cat Boxing); cars 2 and 3 are bots.
 */
import { COAT_INFO, type CoatId } from '../appearance.ts';
import {
  ARENA, CAR_R, MAX_SPEED, NO_CONTROLS, ROUND_MS, type BumperEvent, type BumperState, type Car, type Controls,
} from './bumperPaws.ts';

export const CARS = 4;
/** Host → guest snapshot rate, and guest → host input heartbeat. */
export const SNAP_MS = 50;
export const INPUT_MS = 100;
/** A guest input older than this is treated as "hands off the wheel" (a closed laptop must not leave a car flooring it). */
export const INPUT_TTL_MS = 600;
/** The guest never extrapolates further than this past the newest snapshot. */
export const MAX_EXTRAPOLATE_MS = 150;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------------------------
// Steering messages (guest → host)
// ---------------------------------------------------------------------------------------------
export interface BumpInput { controls: Controls; coat: CoatId | null; round: number }

export function sanitizeControls(steer: unknown, throttle: unknown): Controls {
  return { steer: num(steer) ? clamp(steer, -1, 1) : 0, throttle: num(throttle) ? clamp(throttle, -1, 1) : 0 };
}

export const isCoat = (v: unknown): v is CoatId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(COAT_INFO, v);

export function parseBumpInput(raw: unknown): BumpInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t !== 'bump:in') return null;
  return { controls: sanitizeControls(m.st, m.th), coat: isCoat(m.co) ? m.co : null, round: num(m.rd) ? Math.floor(m.rd) : 0 };
}

/** The wheel as the host last saw it: stale input means hands off. */
export function freshControls(last: { c: Controls; at: number } | null, nowMs: number): Controls {
  if (!last || nowMs - last.at > INPUT_TTL_MS || nowMs < last.at - 5_000) return NO_CONTROLS;
  return last.c;
}

/** Should the guest send now? (on any change, and as a heartbeat so a lost message heals itself) */
export function shouldSendInput(prev: Controls | null, cur: Controls, sinceLastMs: number): boolean {
  return !prev || prev.steer !== cur.steer || prev.throttle !== cur.throttle || sinceLastMs >= INPUT_MS;
}

// ---------------------------------------------------------------------------------------------
// Snapshots (host → guest)
// ---------------------------------------------------------------------------------------------
/** Compact: each car is [x, y, vx, vy, heading, dealt, taken, score, hitAge]; each event [kind 0 bump / 1 wall, x, y, power×100, by (-1 none), to (-1 none)]. */
export interface BumperSnap {
  t: number;
  o: boolean;
  c: number[][];
  e: number[][];
  /** Coat ids of the two human drivers [car 0, car 1] (null = not known yet). */
  co: (CoatId | null)[];
}

export function snapshotBumper(s: BumperState, events: readonly BumperEvent[], coats: readonly (CoatId | null)[]): BumperSnap {
  return {
    t: Math.round(s.t),
    o: s.over,
    c: s.cars.map((c) => [r1(c.x), r1(c.y), r1(c.vx), r1(c.vy), r2(c.a), c.dealt, c.taken, c.score, Math.min(9999, Math.round(c.hitAge))]),
    e: events.slice(-12).map((e) => [e.kind === 'bump' ? 0 : 1, r1(e.x), r1(e.y), Math.round(clamp(e.power, 0, 1) * 100), e.by ?? -1, e.to ?? -1]),
    co: [coats[0] ?? null, coats[1] ?? null],
  };
}

export function parseSnapshot(raw: unknown): BumperSnap | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!num(m.t) || m.t < 0 || m.t > ROUND_MS + 10_000) return null;
  if (!Array.isArray(m.c) || m.c.length !== CARS) return null;
  const lo = ARENA.wall + CAR_R, hiX = ARENA.w - ARENA.wall - CAR_R, hiY = ARENA.h - ARENA.wall - CAR_R;
  const cars: number[][] = [];
  for (const row of m.c) {
    if (!Array.isArray(row) || row.length !== 9 || !row.every(num)) return null;
    const [x, y, vx, vy, a, dealt, taken, score, hit] = row as number[];
    cars.push([
      clamp(x, lo, hiX), clamp(y, lo, hiY), clamp(vx, -MAX_SPEED * 1.5, MAX_SPEED * 1.5), clamp(vy, -MAX_SPEED * 1.5, MAX_SPEED * 1.5), a,
      clamp(Math.floor(dealt), 0, 999), clamp(Math.floor(taken), 0, 999), clamp(Math.floor(score), 0, 9999), clamp(Math.floor(hit), 0, 9999),
    ]);
  }
  const events: number[][] = [];
  if (Array.isArray(m.e)) {
    for (const row of m.e.slice(0, 12)) {
      if (!Array.isArray(row) || row.length !== 6 || !row.every(num)) continue;
      const [k, x, y, p, by, to] = row as number[];
      events.push([k === 0 ? 0 : 1, clamp(x, 0, ARENA.w), clamp(y, 0, ARENA.h), clamp(p, 0, 100), clamp(Math.floor(by), -1, 3), clamp(Math.floor(to), -1, 3)]);
    }
  }
  const co = Array.isArray(m.co) ? [isCoat(m.co[0]) ? m.co[0] : null, isCoat(m.co[1]) ? m.co[1] : null] : [null, null];
  return { t: Math.round(m.t), o: m.o === true, c: cars, e: events, co };
}

/** Rebuild a full arena state from a snapshot (cars 0 and 1 are the humans). */
export function stateFromSnapshot(sn: BumperSnap, seed = 1): BumperState {
  const cars: Car[] = sn.c.map((r, i) => ({
    id: i, x: r[0], y: r[1], vx: r[2], vy: r[3], a: r[4], bot: i < 2 ? 0 : i, dealt: r[5], taken: r[6], hitAge: r[8], pinned: 0, score: r[7],
  }));
  const events: BumperEvent[] = sn.e.map((e) => ({ kind: e[0] === 0 ? 'bump' : 'wall', x: e[1], y: e[2], power: e[3] / 100, by: e[4] < 0 ? null : e[4], to: e[5] < 0 ? null : e[5] }));
  return { cars, t: sn.t, over: sn.o, score: cars[0].score, events, seed };
}

/** Carry the cars a little way along their velocity (visual only): hides the gap between snapshots without ever leaving the arena. */
export function extrapolate(s: BumperState, ageMs: number): BumperState {
  const age = clamp(ageMs, 0, MAX_EXTRAPOLATE_MS) / 1000;
  if (age === 0) return s;
  const lo = ARENA.wall + CAR_R, hiX = ARENA.w - ARENA.wall - CAR_R, hiY = ARENA.h - ARENA.wall - CAR_R;
  return { ...s, cars: s.cars.map((c) => ({ ...c, x: clamp(c.x + c.vx * age, lo, hiX), y: clamp(c.y + c.vy * age, lo, hiY) })) };
}

const angLerp = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** Move the cars drawn on screen `k` (0..1) of the way to where they should be: smooth, and snaps when something big happened (a long jump). */
export function blendCars(prev: BumperState | null, target: BumperState, k: number): BumperState {
  if (!prev) return target;
  const kk = clamp(k, 0, 1);
  return {
    ...target,
    cars: target.cars.map((t, i) => {
      const p = prev.cars[i];
      if (!p || Math.hypot(t.x - p.x, t.y - p.y) > 60) return t; // a restart or a big collision: don't slide across the arena
      return { ...t, x: p.x + (t.x - p.x) * kk, y: p.y + (t.y - p.y) * kk, a: angLerp(p.a, t.a, kk) };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Who won
// ---------------------------------------------------------------------------------------------
export type Verdict = 'win' | 'lose' | 'tie';
export function verdict(s: Pick<BumperState, 'cars'>, myCar: 0 | 1): Verdict {
  const mine = s.cars[myCar]?.score ?? 0, theirs = s.cars[1 - myCar]?.score ?? 0;
  return mine > theirs ? 'win' : mine < theirs ? 'lose' : 'tie';
}

/** A stable seed from the session id and round (both devices could derive the same arena; only the host actually simulates). */
export function seedFor(sid: string, round: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < sid.length; i++) h = Math.imul(h ^ sid.charCodeAt(i), 16777619) >>> 0;
  return ((h ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0) % 100000 + 1;
}

/** Message builders (so the panel and the tests agree on the exact shape). */
export const inputMsg = (sid: string, round: number, c: Controls, coat: CoatId) => ({ t: 'bump:in', sid, rd: round, st: r2(c.steer), th: r2(c.throttle), co: coat });
export const stateMsg = (sid: string, round: number, snap: BumperSnap) => ({ t: 'bump:st', sid, rd: round, snap });
