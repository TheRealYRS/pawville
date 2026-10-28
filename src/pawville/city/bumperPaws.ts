/**
 * Bumper Paws — the funfair's bumper-car arena (pure physics, unit tested in tests/pawvilleFunfair.test.ts).
 *
 * A real little driving game, not a timer: you steer a car (heading + throttle), cars are round bodies that
 * collide with each other and with the arena wall, and three bots roam and ram. Everything is deterministic
 * given the seed and the inputs, so it can be tested without a browser.
 *
 *  - Steering: left/right turns the car (more when moving), up accelerates, down brakes/reverses.
 *  - Collisions: equal-mass circle impulses with restitution; positional correction so cars never end up
 *    inside each other or inside the wall; a "bump" is counted when the closing speed is high enough.
 *  - Nobody gets stuck: penetration is always resolved, a car pinned by others/the wall for a moment gets a
 *    gentle nudge towards the centre, and the wall is a hard clamp (cars can never escape the arena).
 */
export const ARENA = { w: 320, h: 200, wall: 8 } as const;
export const CAR_R = 11;
export const ROUND_MS = 60_000;
export const MAX_SPEED = 120;
export const BUMP_SPEED = 38;

export interface Car {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading in radians (0 = right, π/2 = down). */
  a: number;
  /** AI personality: 0 = player. */
  bot: number;
  /** Bumps this car dealt / received. */
  dealt: number;
  taken: number;
  /** ms since the last collision (drives the spark/wobble animation and the bump cooldown). */
  hitAge: number;
  /** Seconds this car has been (nearly) stationary while touching something. */
  pinned: number;
  /** Points this car has scored (hard hits count more). Only human drivers score. */
  score: number;
}
export interface Controls { steer: number; throttle: number }
export const NO_CONTROLS: Controls = { steer: 0, throttle: 0 };

export interface BumperEvent { kind: 'bump' | 'wall'; x: number; y: number; power: number; by: number | null; to: number | null }
export interface BumperState {
  cars: Car[];
  t: number;
  over: boolean;
  /** Score = bumps you dealt (a hard hit counts more). */
  score: number;
  events: BumperEvent[];
  seed: number;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START: readonly [number, number, number][] = [[160, 150, -Math.PI / 2], [60, 60, 0.4], [260, 60, Math.PI - 0.4], [160, 52, Math.PI / 2]];
/** Two human drivers side by side at the bottom, the two bots up top. */
const START_2P: readonly [number, number, number][] = [[100, 150, -Math.PI / 2], [220, 150, -Math.PI / 2], [60, 52, 0.4], [260, 52, Math.PI - 0.4]];

/** `humans` = 1 (you + three bots) or 2 (you, your partner and two bots; cars 0 and 1 are the humans). */
export function newBumper(seed = 1, humans: 1 | 2 = 1): BumperState {
  const start = humans === 2 ? START_2P : START;
  const cars: Car[] = start.map(([x, y, a], i) => ({ id: i, x, y, vx: 0, vy: 0, a, bot: i < humans ? 0 : i, dealt: 0, taken: 0, hitAge: 9999, pinned: 0, score: 0 }));
  return { cars, t: 0, over: false, score: 0, events: [], seed };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The AI: drive at the nearest rival with some wobble, back away from the wall, change target now and then. */
export function botControls(s: BumperState, car: Car): Controls {
  const r = rng(s.seed * 7919 + car.id * 131 + Math.floor(s.t / 700));
  let best: Car | null = null, bd = Infinity;
  for (const o of s.cars) {
    if (o.id === car.id) continue;
    const d = Math.hypot(o.x - car.x, o.y - car.y) + (r() * 40 - 20);
    if (d < bd) { bd = d; best = o; }
  }
  // every other "thought" a bot goes for a HUMAN (so there is always someone coming; with two humans they take turns), otherwise whoever is closest
  const humans = s.cars.filter((c) => c.bot === 0);
  const you = humans.length ? humans[(Math.floor(s.t / 4400) + car.id) % humans.length] : undefined;
  if (car.bot !== 0 && you && (Math.floor(s.t / 2200) + car.id) % 2 === 0) best = you;
  let tx = best ? best.x : ARENA.w / 2, ty = best ? best.y : ARENA.h / 2;
  const nearWall = car.x < ARENA.wall + 34 || car.x > ARENA.w - ARENA.wall - 34 || car.y < ARENA.wall + 34 || car.y > ARENA.h - ARENA.wall - 34;
  if (nearWall && (Math.floor(s.t / 400) + car.id) % 3 === 0) { tx = ARENA.w / 2; ty = ARENA.h / 2; }
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // bots are a little slower and less sharp than a good human driver
  const speedBias = [0, 0.78, 0.68, 0.72][car.bot] ?? 0.7;
  return { steer: clamp(diff * 1.6, -1, 1), throttle: Math.abs(diff) > 2.4 ? -0.6 : speedBias };
}

/** One Controls drives car 0 (solo); an array holds one Controls per car id (index = car id; cars without a human use their bot). */
export type Inputs = Controls | readonly Controls[];

/** Advance the simulation by `dtMs` (≤ 50 ms per call; larger steps are split). */
export function stepBumper(s0: BumperState, input: Inputs, dtMs: number): BumperState {
  if (s0.over) return s0;
  let s = s0;
  let left = Math.max(0, dtMs);
  while (left > 0) {
    const d = Math.min(16, left);
    s = stepOnce(s, input, d);
    left -= d;
    if (s.over) break;
  }
  return s;
}

function stepOnce(s: BumperState, input: Inputs, dtMs: number): BumperState {
  const inputs: readonly Controls[] = Array.isArray(input) ? (input as readonly Controls[]) : [input as Controls];
  const dt = dtMs / 1000;
  const events: BumperEvent[] = [];
  const cars = s.cars.map((c) => ({ ...c, hitAge: c.hitAge + dtMs }));
  // ---- driving ----
  for (const c of cars) {
    const ctl = c.bot === 0 ? inputs[c.id] ?? NO_CONTROLS : botControls(s, c);
    const speed = Math.hypot(c.vx, c.vy);
    const fwd = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    // steering needs some speed (but never zero, so you can always rotate out of a corner)
    c.a += clamp(ctl.steer, -1, 1) * (1.4 + Math.min(1, speed / 60) * 2.0) * dt * (fwd < -4 ? -1 : 1);
    const accel = ctl.throttle >= 0 ? 150 : 110;
    c.vx += Math.cos(c.a) * clamp(ctl.throttle, -1, 1) * accel * dt;
    c.vy += Math.sin(c.a) * clamp(ctl.throttle, -1, 1) * accel * dt;
    // tyre grip: sideways velocity is damped much harder than forward velocity (the car drives, not slides)
    const f2 = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    const sx = c.vx - Math.cos(c.a) * f2, sy = c.vy - Math.sin(c.a) * f2;
    const side = Math.exp(-5 * dt);
    c.vx = Math.cos(c.a) * f2 + sx * side;
    c.vy = Math.sin(c.a) * f2 + sy * side;
    const drag = Math.exp((ctl.throttle === 0 ? -1.6 : -0.45) * dt);
    c.vx *= drag; c.vy *= drag;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > MAX_SPEED) { c.vx *= MAX_SPEED / sp; c.vy *= MAX_SPEED / sp; }
    c.x += c.vx * dt; c.y += c.vy * dt;
  }
  // ---- walls (hard clamp + bounce) ----
  for (const c of cars) {
    const lo = ARENA.wall + CAR_R, hiX = ARENA.w - ARENA.wall - CAR_R, hiY = ARENA.h - ARENA.wall - CAR_R;
    let hit = 0;
    if (c.x < lo) { hit = Math.max(hit, -c.vx); c.x = lo; if (c.vx < 0) c.vx = -c.vx * 0.55; }
    if (c.x > hiX) { hit = Math.max(hit, c.vx); c.x = hiX; if (c.vx > 0) c.vx = -c.vx * 0.55; }
    if (c.y < lo) { hit = Math.max(hit, -c.vy); c.y = lo; if (c.vy < 0) c.vy = -c.vy * 0.55; }
    if (c.y > hiY) { hit = Math.max(hit, c.vy); c.y = hiY; if (c.vy > 0) c.vy = -c.vy * 0.55; }
    if (hit > 22) events.push({ kind: 'wall', x: c.x, y: c.y, power: Math.min(1, hit / 100), by: null, to: c.id });
  }
  // ---- car ↔ car (equal masses) ----
  const touching = new Set<number>();
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= CAR_R * 2) continue;
    if (dist < 0.001) { dx = Math.cos(a.a + 1.7); dy = Math.sin(a.a + 1.7); dist = 0.001; }
    const nx = dx / dist, ny = dy / dist;
    const overlap = CAR_R * 2 - dist;
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
    touching.add(a.id); touching.add(b.id);
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // < 0 = closing
    if (rv < 0) {
      // who drove INTO whom — judged on the speeds before the collision response
      const aInto = a.vx * nx + a.vy * ny, bInto = -(b.vx * nx + b.vy * ny);
      const impulse = -(1 + 0.88) * rv / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny;
      b.vx += impulse * nx; b.vy += impulse * ny;
      const closing = -rv;
      if (closing >= BUMP_SPEED && a.hitAge > 220 && b.hitAge > 220) {
        const dealer = aInto > bInto ? a : b, taker = dealer === a ? b : a;
        dealer.dealt++; taker.taken++;
        if (dealer.bot === 0) dealer.score += closing > 80 ? 3 : closing > 55 ? 2 : 1;
        events.push({ kind: 'bump', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: Math.min(1, closing / 110), by: dealer.id, to: taker.id });
        a.hitAge = 0; b.hitAge = 0;
      }
    }
  }
  // ---- the wall is final: pushing two cars apart must never push one of them through the wall ----
  for (const c of cars) {
    c.x = clamp(c.x, ARENA.wall + CAR_R, ARENA.w - ARENA.wall - CAR_R);
    c.y = clamp(c.y, ARENA.wall + CAR_R, ARENA.h - ARENA.wall - CAR_R);
  }
  // ---- nobody stays pinned: a car that is touching something and barely moving drifts towards the centre ----
  for (const c of cars) {
    const sp = Math.hypot(c.vx, c.vy);
    const atWall = c.x <= ARENA.wall + CAR_R + 0.5 || c.x >= ARENA.w - ARENA.wall - CAR_R - 0.5 || c.y <= ARENA.wall + CAR_R + 0.5 || c.y >= ARENA.h - ARENA.wall - CAR_R - 0.5;
    c.pinned = (touching.has(c.id) || atWall) && sp < 14 ? c.pinned + dt : 0;
    if (c.pinned > 0.7) {
      const cx = ARENA.w / 2 - c.x, cy = ARENA.h / 2 - c.y, l = Math.hypot(cx, cy) || 1;
      c.vx += (cx / l) * 60 * dt * 6; c.vy += (cy / l) * 60 * dt * 6;
    }
  }
  // ---- the speed limit is a promise at the end of every step too (a collision can briefly add speed) ----
  for (const c of cars) {
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > MAX_SPEED) { c.vx *= MAX_SPEED / sp; c.vy *= MAX_SPEED / sp; }
  }
  const t = s.t + dtMs;
  return { cars, t, over: t >= ROUND_MS, score: cars[0].score, events, seed: s.seed };
}

/** Bumper tokens: small and capped (the economy caps the day as well). */
export function bumperTokens(score: number): number {
  return score >= 18 ? 3 : score >= 9 ? 2 : score >= 4 ? 1 : 0;
}
