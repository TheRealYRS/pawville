/**
 * Whiskerwick Funfair — the rides (pure model, unit tested in tests/pawvilleFunfair.test.ts).
 *
 * Everything that moves is a function of ONE shared clock (UTC milliseconds). Both partners compute the
 * same wheel angle / carousel angle / swing spin from `Date.now()`, so the rides look identical on both
 * screens with nothing streamed. What IS shared (over the existing couple channel) is only who sits where:
 * a tiny "fair" message with the seat a player claimed, so the same seat can never be taken twice.
 *
 * A rider is a small state machine (`RideSession`):
 *   queued  →  hopping-in  →  riding  →  hopping-out  →  done
 * The cat walks to the ride's gate, waits for the seat it claimed to come round, hops in, is carried by the
 * seat for the whole ride (its position IS the seat's position every frame — no teleporting, nothing
 * faked), and hops out at the gate. `abort` ends a session instantly (scene change, disconnect…).
 */
import type { Vec2 } from '../world/geometry.ts';
import type { Facing } from '../world/movement.ts';
import type { SeatClaim } from '../net/occupancy.ts';

export type RideId = 'ferris' | 'carousel' | 'swing';
export const RIDE_IDS: readonly RideId[] = ['ferris', 'carousel', 'swing'];
export const RIDE_NAMES: Record<RideId, string> = { ferris: 'Whiskerwick Ferris Wheel', carousel: 'Moonbeam Carousel', swing: 'Cloud Swing Ride' };
export const RIDE_SEATS = 8;

/** The shared clock (UTC ms). */
export const fairClock = (): number => Date.now();

const TAU = Math.PI * 2;
/** Smallest signed angle a−b in (−π, π]. */
export const angDiff = (a: number, b: number): number => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
};

// ---------------------------------------------------------------------------------------------
// Where everything stands in the funfair region (ground anchors, feet-centred)
// ---------------------------------------------------------------------------------------------
export const FAIR_LAYOUT = {
  gate: { x: 320, y: 496 },
  spawn: { x: 320, y: 458 },
  ferris: { x: 140, y: 290 },
  carousel: { x: 500, y: 290 },
  swing: { x: 500, y: 440 },
  bumper: { x: 140, y: 440 },
  ring: { x: 320, y: 168 },
  ticket: { x: 232, y: 462 },
} as const;

// ---------------------------------------------------------------------------------------------
// Ferris wheel: 8 gondolas on a 52 px wheel, one gentle turn every 28 s
// ---------------------------------------------------------------------------------------------
export const FERRIS = { radius: 52, hubRise: 80, periodMs: 28_000, cabDrop: 31, gateWindow: 0.15 } as const;
export const ferrisAngle = (ms: number): number => (((ms % FERRIS.periodMs) + FERRIS.periodMs) % FERRIS.periodMs / FERRIS.periodMs) * TAU;
export const ferrisHub = (anchor: Vec2): Vec2 => ({ x: anchor.x, y: anchor.y - FERRIS.hubRise });
/** Gondola `i`: its hanging pivot on the rim and the point where its rider's feet rest. a = 0 is the bottom. */
export function ferrisCab(anchor: Vec2, i: number, ms: number): { a: number; pivot: Vec2; seat: Vec2 } {
  const a = ferrisAngle(ms) + (i * TAU) / RIDE_SEATS;
  const hub = ferrisHub(anchor);
  const pivot = { x: hub.x + Math.sin(a) * FERRIS.radius, y: hub.y + Math.cos(a) * FERRIS.radius };
  return { a, pivot, seat: { x: pivot.x, y: pivot.y + FERRIS.cabDrop } };
}

// ---------------------------------------------------------------------------------------------
// Moonbeam Carousel: 8 mounts on a turning platform, one turn every 20 s
// ---------------------------------------------------------------------------------------------
export const CAROUSEL = { radius: 30, squash: 0.5, periodMs: 20_000, gateWindow: 0.22, mountRise: 9, bob: 3 } as const;
export const carouselAngle = (ms: number): number => (((ms % CAROUSEL.periodMs) + CAROUSEL.periodMs) % CAROUSEL.periodMs / CAROUSEL.periodMs) * TAU;
export function carouselMount(anchor: Vec2, i: number, ms: number): { a: number; x: number; y: number; lift: number } {
  const a = carouselAngle(ms) + (i * TAU) / RIDE_SEATS;
  const bob = Math.sin(a * 2 + i) * CAROUSEL.bob; // each mount rises and falls on its own pole
  return { a, x: anchor.x + Math.cos(a) * CAROUSEL.radius, y: anchor.y - 4 + Math.sin(a) * CAROUSEL.radius * CAROUSEL.squash, lift: CAROUSEL.mountRise + bob + CAROUSEL.bob };
}

// ---------------------------------------------------------------------------------------------
// Cloud Swing Ride: load (slow) → spin up → full speed (seats swing outwards) → spin down, a 30 s cycle
// ---------------------------------------------------------------------------------------------
export const SWING = { cycleMs: 30_000, loadMs: 8_000, upMs: 4_000, holdMs: 14_000, downMs: 4_000, wLoad: 0.28, wMax: 2.1, maxTilt: 0.72, ring: 18, chain: 44, height: 64, gateWindow: 0.3 } as const;
/** Angular speed (rad/s) at `t` ms into the cycle. */
export function swingSpeed(t: number): number {
  const { loadMs, upMs, holdMs, downMs, wLoad, wMax } = SWING;
  if (t < loadMs) return wLoad;
  if (t < loadMs + upMs) return wLoad + (wMax - wLoad) * easeInOut((t - loadMs) / upMs);
  if (t < loadMs + upMs + holdMs) return wMax;
  if (t < loadMs + upMs + holdMs + downMs) return wMax - (wMax - wLoad) * easeInOut((t - loadMs - upMs - holdMs) / downMs);
  return wLoad;
}
const easeInOut = (k: number) => k * k * (3 - 2 * k);
/** Rotation (rad) accumulated by the start of each 50 ms slice of one cycle (built once; exact integral of swingSpeed). */
const SWING_STEP = 50;
let swingTable: Float64Array | null = null;
function swingTab(): Float64Array {
  if (swingTable) return swingTable;
  const n = SWING.cycleMs / SWING_STEP;
  const t = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) t[i + 1] = t[i] + swingSpeed(i * SWING_STEP + SWING_STEP / 2) * (SWING_STEP / 1000);
  return (swingTable = t);
}
function swingCycleAngle(t: number): number {
  const i = Math.min(SWING.cycleMs / SWING_STEP - 1, Math.floor(t / SWING_STEP));
  return swingTab()[i] + swingSpeed(i * SWING_STEP + (t - i * SWING_STEP) / 2) * ((t - i * SWING_STEP) / 1000);
}
/** Ring rotation at the shared clock: continuous across cycles, identical on every device. */
export function swingAngle(ms: number): number {
  const c = Math.floor(ms / SWING.cycleMs);
  const t = ms - c * SWING.cycleMs;
  return ((c * swingTab()[SWING.cycleMs / SWING_STEP]) % TAU + swingCycleAngle(t)) % TAU;
}
/** 0 while loading, 1 at full speed: how far the chairs fly out. */
export const swingLift = (ms: number): number => {
  const w = swingSpeed(((ms % SWING.cycleMs) + SWING.cycleMs) % SWING.cycleMs);
  return Math.max(0, (w - SWING.wLoad) / (SWING.wMax - SWING.wLoad));
};
/** True during the slow loading phase (and while the ring is still easing up/down within it). */
export const swingLoadable = (ms: number): boolean => ((ms % SWING.cycleMs) + SWING.cycleMs) % SWING.cycleMs < SWING.loadMs;
export function swingChair(anchor: Vec2, i: number, ms: number): { a: number; x: number; y: number; lift: number; ringX: number; ringY: number } {
  const a = swingAngle(ms) + (i * TAU) / RIDE_SEATS;
  const tilt = SWING.maxTilt * swingLift(ms);
  const reach = SWING.ring + Math.sin(tilt) * SWING.chain;
  const z = SWING.height - Math.cos(tilt) * SWING.chain; // feet height above the ground
  return {
    a, x: anchor.x + Math.cos(a) * reach, y: anchor.y - 4 + Math.sin(a) * reach * 0.5, lift: z,
    ringX: anchor.x + Math.cos(a) * SWING.ring, ringY: anchor.y - 4 + Math.sin(a) * SWING.ring * 0.5 - SWING.height,
  };
}

// ---------------------------------------------------------------------------------------------
// Seats: one pose function for every ride
// ---------------------------------------------------------------------------------------------
export interface SeatPose {
  x: number;
  y: number;
  /** Pixels the cat's feet are above (x, y). */
  lift: number;
  facing: Facing;
  /** Draw order: the cat is drawn at this y (so it sits in front of the seat back and behind the front rail). */
  sortY: number;
}

/** Where the seat's feet are, in world pixels, at shared-clock time `ms`. */
export function seatPose(ride: RideId, anchor: Vec2, seat: number, ms: number): SeatPose {
  switch (ride) {
    case 'ferris': {
      const c = ferrisCab(anchor, seat, ms);
      return { x: c.seat.x, y: c.seat.y, lift: 0, facing: 'down', sortY: anchor.y + 0.5 };
    }
    case 'carousel': {
      const m = carouselMount(anchor, seat, ms);
      // face along the direction of travel (counter-clockwise on screen)
      const vx = -Math.sin(m.a), vy = Math.cos(m.a) * CAROUSEL.squash;
      const facing: Facing = Math.abs(vx) > Math.abs(vy) * 1.4 ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      return { x: m.x, y: m.y, lift: m.lift, facing, sortY: m.y + 0.2 };
    }
    case 'swing': {
      const c = swingChair(anchor, seat, ms);
      const vx = -Math.sin(c.a), vy = Math.cos(c.a) * 0.5;
      const facing: Facing = Math.abs(vx) > Math.abs(vy) * 1.4 ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      return { x: c.x, y: c.y, lift: c.lift, facing, sortY: c.y + 0.2 };
    }
  }
}

/** How far (rad) seat `seat` is from the gate (the front-centre loading spot). 0 = exactly at the gate. */
export function gateDeviation(ride: RideId, seat: number, ms: number): number {
  switch (ride) {
    case 'ferris': return angDiff(ferrisAngle(ms) + (seat * TAU) / RIDE_SEATS, 0);
    case 'carousel': return angDiff(carouselAngle(ms) + (seat * TAU) / RIDE_SEATS, Math.PI / 2);
    case 'swing': return angDiff(swingAngle(ms) + (seat * TAU) / RIDE_SEATS, Math.PI / 2);
  }
}
const GATE_WINDOW: Record<RideId, number> = { ferris: FERRIS.gateWindow, carousel: CAROUSEL.gateWindow, swing: SWING.gateWindow };
/** Can people get on / off right now? (The swing ride only loads while it is slow.) */
export const rideLoadable = (ride: RideId, ms: number): boolean => (ride === 'swing' ? swingLoadable(ms) : true);
export const seatAtGate = (ride: RideId, seat: number, ms: number): boolean => rideLoadable(ride, ms) && Math.abs(gateDeviation(ride, seat, ms)) <= GATE_WINDOW[ride];

/** Milliseconds until `seat` is next at the gate (0 if it is there now); null if it won't be within a minute. */
export function msUntilGate(ride: RideId, seat: number, ms: number): number | null {
  for (let d = 0; d <= 60_000; d += 100) if (seatAtGate(ride, seat, ms + d)) return d;
  return null;
}

/**
 * Milliseconds until a rider on `seat` can step off. The wheel and carousel stop at the gate seat by seat; the swing ride
 * lets EVERYONE off as soon as it slows into its loading phase (its chairs only reach the gate every few cycles, so waiting
 * for one particular chair could take over a minute).
 */
export function msUntilStop(ride: RideId, seat: number, ms: number): number | null {
  if (ride === 'swing') return swingLoadable(ms) ? 0 : SWING.cycleMs - (((ms % SWING.cycleMs) + SWING.cycleMs) % SWING.cycleMs);
  return msUntilGate(ride, seat, ms);
}
const canStepOff = (ride: RideId, seat: number, ms: number): boolean => (ride === 'swing' ? swingLoadable(ms) : seatAtGate(ride, seat, ms));

/** Ride length: a full turn of the wheel, two of the carousel, one whole cycle of the swing ride. */
export const RIDE_MS: Record<RideId, number> = { ferris: FERRIS.periodMs, carousel: CAROUSEL.periodMs * 2, swing: SWING.cycleMs };
/** The ride a player stands at to board, and where they step out (feet positions). */
export function stand(ride: RideId): Vec2 {
  const a = FAIR_LAYOUT[ride];
  return ride === 'ferris' ? { x: a.x, y: a.y + 14 } : ride === 'carousel' ? { x: a.x, y: a.y + 40 } : { x: a.x, y: a.y + 24 };
}
export function exitPoint(ride: RideId): Vec2 {
  const s = stand(ride);
  return { x: s.x + 26, y: s.y + 8 };
}

// ---------------------------------------------------------------------------------------------
// Seat claims (the only thing shared with a partner)
// ---------------------------------------------------------------------------------------------
export interface FairClaim { ride: RideId; seat: number; at: number; role: 'T' | 'M' }

/** The same seat claimed twice: the earlier claim wins; an exact tie goes to Tangerine. Deterministic on both sides. */
export function claimWins(a: FairClaim, b: FairClaim): boolean {
  if (a.at !== b.at) return a.at < b.at;
  return a.role === 'T' && b.role === 'M';
}

/**
 * The free seat that will reach the gate soonest (the cat does not have to time anything — it simply
 * waits at the gate for its seat). `taken` = seats held by anybody else.
 */
export function pickSeat(ride: RideId, ms: number, taken: ReadonlySet<number>): { seat: number; waitMs: number } | null {
  let best: { seat: number; waitMs: number } | null = null;
  for (let s = 0; s < RIDE_SEATS; s++) {
    if (taken.has(s)) continue;
    const w = msUntilGate(ride, s, ms);
    if (w !== null && (!best || w < best.waitMs)) best = { seat: s, waitMs: w };
  }
  return best;
}

export type FairPhase = 'queued' | 'riding' | 'leaving' | 'off';
export interface FairMessage { t: 'fair'; ride: RideId; seat: number | null; phase: FairPhase; at: number }

export function parseFairMessage(raw: unknown): FairMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t !== 'fair') return null;
  if (typeof m.ride !== 'string' || !(RIDE_IDS as readonly string[]).includes(m.ride)) return null;
  if (m.phase !== 'queued' && m.phase !== 'riding' && m.phase !== 'leaving' && m.phase !== 'off') return null;
  const seat = m.seat === null ? null : typeof m.seat === 'number' && Number.isInteger(m.seat) && m.seat >= 0 && m.seat < RIDE_SEATS ? m.seat : undefined;
  if (seat === undefined) return null;
  if (m.phase !== 'off' && seat === null) return null;
  if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  return { t: 'fair', ride: m.ride as RideId, seat, phase: m.phase, at: m.at };
}

/** What the partner last told us. Expires on its own if their heartbeats stop (disconnect, closed tab, crash). */
export interface PartnerFair { ride: RideId; seat: number; phase: 'queued' | 'riding' | 'leaving'; at: number; seen: number }
export const PARTNER_FAIR_TTL_MS = 7_000;
export const HEARTBEAT_MS = 2_000;
export function reducePartnerFair(prev: PartnerFair | null, msg: FairMessage, nowMs: number): PartnerFair | null {
  if (msg.phase === 'off' || msg.seat === null) return prev && prev.ride === msg.ride ? null : prev;
  return { ride: msg.ride, seat: msg.seat, phase: msg.phase, at: msg.at, seen: nowMs };
}
export function livePartnerFair(p: PartnerFair | null, nowMs: number): PartnerFair | null {
  return p && nowMs - p.seen <= PARTNER_FAIR_TTL_MS ? p : null;
}

// ---------------------------------------------------------------------------------------------
// The rider state machine
// ---------------------------------------------------------------------------------------------
export const HOP_MS = 550;
export const MAX_QUEUE_MS = 45_000;

export interface RideSession {
  ride: RideId;
  seat: number;
  phase: 'queued' | 'hopping-in' | 'riding' | 'hopping-out' | 'done';
  /** Shared-clock time this phase began. */
  since: number;
  /** When the seat was claimed (for conflict resolution). */
  claimAt: number;
  boardedAt: number;
  /** The rider asked to get off: they leave at the next stop. */
  leaving: boolean;
}

export type RideEvent = 'boarded' | 'exited' | 'timeout' | null;
export interface RideFrame {
  session: RideSession;
  /** Where the cat is this frame (feet), its pose and draw order. null = the session is over. */
  pose: { x: number; y: number; lift: number; facing: Facing; pose: 'stand' | 'sit'; sortY: number; onRide: boolean } | null;
  event: RideEvent;
}

export const startRide = (ride: RideId, seat: number, nowMs: number): RideSession => ({ ride, seat, phase: 'queued', since: nowMs, claimAt: nowMs, boardedAt: 0, leaving: false });
export const requestLeave = (s: RideSession): RideSession => (s.phase === 'done' ? s : { ...s, leaving: true });
/** Instantly ends a session (scene change, disconnect, page unmount). */
export const abortRide = (s: RideSession): RideSession => ({ ...s, phase: 'done' });
/** Changes the seat of a queued session (the first claim lost a conflict). */
export const reseat = (s: RideSession, seat: number, nowMs: number): RideSession => (s.phase === 'queued' ? { ...s, seat, claimAt: nowMs } : s);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

export function stepRide(s: RideSession, anchor: Vec2, nowMs: number): RideFrame {
  if (s.phase === 'done') return { session: s, pose: null, event: null };
  const st = stand(s.ride);
  const out = exitPoint(s.ride);
  // A clock that jumped (system time changed) must never strand a rider.
  if (nowMs < s.since - 5_000 || nowMs - s.since > RIDE_MS[s.ride] * 3 + MAX_QUEUE_MS) return { session: { ...s, phase: 'done' }, pose: null, event: 'timeout' };
  switch (s.phase) {
    case 'queued': {
      if (nowMs - s.since > MAX_QUEUE_MS) return { session: { ...s, phase: 'done' }, pose: null, event: 'timeout' };
      if (s.leaving) return { session: { ...s, phase: 'done' }, pose: null, event: 'exited' };
      if (seatAtGate(s.ride, s.seat, nowMs)) {
        const next = { ...s, phase: 'hopping-in' as const, since: nowMs };
        return { session: next, pose: { x: st.x, y: st.y, lift: 0, facing: 'up', pose: 'stand', sortY: st.y, onRide: false }, event: null };
      }
      return { session: s, pose: { x: st.x, y: st.y, lift: 0, facing: 'up', pose: 'stand', sortY: st.y, onRide: false }, event: null };
    }
    case 'hopping-in': {
      const k = Math.min(1, (nowMs - s.since) / HOP_MS);
      const p = seatPose(s.ride, anchor, s.seat, nowMs);
      const arc = Math.sin(k * Math.PI) * 9;
      const pose = { x: lerp(st.x, p.x, easeOut(k)), y: lerp(st.y, p.y, easeOut(k)), lift: lerp(0, p.lift, easeOut(k)) + arc, facing: p.facing, pose: (k > 0.55 ? 'sit' : 'stand') as 'sit' | 'stand', sortY: Math.max(p.sortY, st.y), onRide: false };
      if (k >= 1) return { session: { ...s, phase: 'riding', since: nowMs, boardedAt: nowMs }, pose: { ...pose, pose: 'sit', sortY: p.sortY, onRide: true }, event: 'boarded' };
      return { session: s, pose, event: null };
    }
    case 'riding': {
      const p = seatPose(s.ride, anchor, s.seat, nowMs);
      const rode = nowMs - s.boardedAt;
      const done = (rode >= RIDE_MS[s.ride] - 1_500 || s.leaving) && canStepOff(s.ride, s.seat, nowMs) && rode > 2_500;
      const pose = { x: p.x, y: p.y, lift: p.lift, facing: p.facing, pose: 'sit' as const, sortY: p.sortY, onRide: true };
      if (done) return { session: { ...s, phase: 'hopping-out', since: nowMs }, pose, event: null };
      return { session: s, pose, event: null };
    }
    case 'hopping-out': {
      const k = Math.min(1, (nowMs - s.since) / HOP_MS);
      const p = seatPose(s.ride, anchor, s.seat, s.since); // leave from where the seat was when they stood up
      const arc = Math.sin(k * Math.PI) * 9;
      const pose = { x: lerp(p.x, out.x, easeOut(k)), y: lerp(p.y, out.y, easeOut(k)), lift: lerp(p.lift, 0, easeOut(k)) + arc, facing: 'down' as Facing, pose: (k < 0.45 ? 'sit' : 'stand') as 'sit' | 'stand', sortY: Math.max(out.y, p.sortY), onRide: false };
      if (k >= 1) return { session: { ...s, phase: 'done', since: nowMs }, pose: null, event: 'exited' };
      return { session: s, pose, event: null };
    }
  }
}

/** Human text for the ride bar. */
export function rideStatusText(s: RideSession, nowMs: number): string {
  const name = RIDE_NAMES[s.ride];
  switch (s.phase) {
    case 'queued': {
      const w = msUntilGate(s.ride, s.seat, nowMs);
      if (s.ride === 'swing' && !swingLoadable(nowMs)) return `The ${name} is spinning — boarding opens in ${Math.ceil((SWING.cycleMs - (nowMs % SWING.cycleMs)) / 1000)} s.`;
      return w === null ? 'Waiting for your seat…' : `Your seat arrives in ${Math.max(1, Math.ceil(w / 1000))} s…`;
    }
    case 'hopping-in': return 'Hop in!';
    case 'riding': {
      if (s.leaving) {
        const w = msUntilStop(s.ride, s.seat, nowMs);
        return w === null ? 'Getting off at the next stop…' : `Getting off at the next stop in ${Math.max(1, Math.ceil(w / 1000))} s.`;
      }
      const left = Math.max(0, RIDE_MS[s.ride] - (nowMs - s.boardedAt));
      return left > 1500 ? `Enjoy the ride! ${Math.ceil(left / 1000)} s to go.` : 'Coming back to the platform…';
    }
    case 'hopping-out': return 'Mind the step!';
    case 'done': return '';
  }
}

/**
 * What the world is told about my ride seat (net/occupancy.ts): the claim keeps the same seat and claim time from queueing to
 * hopping out, so every player can tell who holds which seat and who got there first. `phase` says where I am: 'queued' (waiting at
 * the gate or hopping in — drawn from my own snapshot), 'riding' (everyone draws me from the shared ride clock), 'leaving'.
 */
export function rideClaim(s: RideSession | null): SeatClaim | null {
  if (!s || s.phase === 'done') return null;
  return { kind: 'ride', id: s.ride, seat: s.seat, phase: s.phase === 'queued' || s.phase === 'hopping-in' ? 'queued' : s.phase === 'hopping-out' ? 'leaving' : 'riding', at: s.claimAt };
}
