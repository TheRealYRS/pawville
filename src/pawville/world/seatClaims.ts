/**
 * Taking, keeping and giving up a seat on the LOCAL player's behalf (benches, window seats, tables…). The rules live in
 * net/occupancy.ts; this file applies them to the live render state (`live.seat` = where the cat is drawn, `live.claim` =
 * what the world is told). Funfair rides have their own state machine (city/funfair.ts, adventure/useFunfair.tsx) but use
 * the same claim field and the same occupancy table.
 */
import type { Facing } from './movement.ts';
import type { CatPose } from '../render/catSprites.ts';
import { lostSeat, pickFreeSeat, seatsTaken, type Holder, type SeatClaim } from '../net/occupancy.ts';

export interface SeatLive {
  seat: { x: number; y: number; pose: CatPose; facing: Facing; lift: number; sortY?: number; noShadow?: boolean } | null;
  claim?: SeatClaim | null;
  /** Seats held by other players (computed every frame by the town canvas). */
  occupied?: ReadonlyMap<string, Holder>;
  /** The local player's own id. */
  selfId?: string;
}
export interface Slot { index: number; x: number; y: number; lift: number; facing: Facing }

const NO_ONE: ReadonlyMap<string, Holder> = new Map();

/** The seat numbers of this furniture that someone ELSE is holding right now. */
export function takenSlots(live: SeatLive, id: string): Set<number> {
  return seatsTaken(live.occupied ?? NO_ONE, 'seat', id);
}

/** Sit down: take the preferred seat if free, otherwise another free one. Returns the slot, or null if the furniture is full. */
export function takeSeat(live: SeatLive, id: string, slots: readonly Slot[], prefer: number, now: number, pose: CatPose = 'sit'): Slot | null {
  const idx = pickFreeSeat(slots.length, takenSlots(live, id), prefer);
  if (idx === null) return null;
  const s = slots[idx];
  live.seat = { x: s.x, y: s.y, pose, facing: s.facing, lift: s.lift };
  live.claim = { kind: 'seat', id, seat: idx, phase: 'seated', at: now };
  return s;
}

/** Stand up: releases ONLY this player's seat (never anyone else's). */
export function releaseSeat(live: SeatLive): void {
  if (live.claim?.kind === 'seat') { live.claim = null; live.seat = null; }
}

/**
 * Called a few times a second while seated. If another player outranks us on our seat (we both sat down within a
 * network round trip of each other) we move to a free seat; 'full' means there is none and the caller should stand up.
 */
export function keepSeat(live: SeatLive, slots: readonly Slot[], now: number): 'ok' | 'moved' | 'full' {
  const c = live.claim;
  if (!c || c.kind !== 'seat' || !live.selfId) return 'ok';
  const occ = live.occupied ?? NO_ONE;
  if (!lostSeat({ uid: live.selfId, claim: c }, occ)) return 'ok';
  const taken = seatsTaken(occ, 'seat', c.id);
  taken.add(c.seat);
  const idx = pickFreeSeat(slots.length, taken, -1);
  if (idx === null) return 'full';
  const s = slots[idx];
  const pose = live.seat?.pose ?? 'sit';
  live.seat = { x: s.x, y: s.y, pose, facing: s.facing, lift: s.lift };
  live.claim = { kind: 'seat', id: c.id, seat: idx, phase: 'seated', at: now };
  return 'moved';
}
