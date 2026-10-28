import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { lostSeat, pickFreeSeat, type SeatClaim } from '../net/occupancy.ts';
import { keepSeat, releaseSeat, takeSeat, takenSlots, type Slot } from '../world/seatClaims.ts';
import type { TownLive } from './TownCanvas';

/**
 * Sit on a multi-seat piece of furniture (a bench, the pond bank…): takes a FREE seat (your usual side if it is free), keeps
 * checking that nobody outranks you for it, moves you to the other seat if two players sat down within one network round trip,
 * and releases exactly your seat when you get up or the component goes away. `null` while the furniture is full (onFull runs).
 */
export function useSeatClaim(live: MutableRefObject<TownLive>, o: { id: string; slots: readonly Slot[]; prefer: number; onFull: () => void }): number | null {
  const [index, setIndex] = useState<number | null>(null);
  const latest = useRef(o);
  latest.current = o;
  useEffect(() => {
    const { id, slots, prefer } = latest.current;
    const slot = takeSeat(live.current, id, slots, prefer, Date.now());
    if (!slot) { setIndex(null); latest.current.onFull(); return undefined; }
    setIndex(slot.index);
    const timer = window.setInterval(() => {
      const r = keepSeat(live.current, latest.current.slots, Date.now());
      if (r === 'moved') setIndex(live.current.claim?.seat ?? null);
      else if (r === 'full') latest.current.onFull();
    }, 200);
    return () => { window.clearInterval(timer); releaseSeat(live.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);
  return index;
}

/**
 * For the park activities that draw the seat themselves (swing, seesaw, picnic, stargazing, fishing): picks a free seat NUMBER
 * (your usual one if free) and publishes the claim so other players see it as taken. If you lose a seat to someone who outranks
 * you, `onLost` runs (the dock closes with a friendly note) — you are never left on top of another cat.
 */
export function useSeatIndex(live: MutableRefObject<TownLive>, o: { id: string; count: number; prefer: number; onLost: () => void }): number {
  const [idx] = useState<number>(() => pickFreeSeat(o.count, takenSlots(live.current, o.id), o.prefer) ?? Math.max(0, Math.min(o.count - 1, o.prefer)));
  const latest = useRef(o);
  latest.current = o;
  useEffect(() => {
    const l = live.current;
    const full = pickFreeSeat(o.count, takenSlots(l, o.id), o.prefer) === null;
    const mine: SeatClaim = { kind: 'seat', id: o.id, seat: idx, phase: 'seated', at: Date.now() };
    if (full) { window.setTimeout(() => latest.current.onLost(), 0); return undefined; }
    l.claim = mine;
    const timer = window.setInterval(() => {
      const cur = live.current;
      if (cur.selfId && cur.claim && lostSeat({ uid: cur.selfId, claim: cur.claim }, cur.occupied ?? new Map())) latest.current.onLost();
    }, 200);
    return () => { window.clearInterval(timer); if (live.current.claim === mine) live.current.claim = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);
  return idx;
}
