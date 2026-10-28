/**
 * The funfair rides' controller (Ferris wheel, carousel, swing ride). One hook owns the local rider's state
 * machine (city/funfair.ts), moves the cat along its seat EVERY frame (so the cat, the seat and the ride can
 * never drift apart), keeps the camera calm, tells the partner which seat is taken over the existing couple
 * channel, and ends everything safely when the scene changes, the page unmounts or the partner disappears.
 *
 * There is no new networking: a small `fair` message rides the same pair channel as emotes and positions, and the
 * ride animations themselves come from the shared UTC clock, so there is nothing to keep in sync but the seats.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PanelSheet } from '../components/PanelSheet';
import { onPairMessage, sendPair } from '../couple/pairHub.ts';
import {
  FAIR_LAYOUT, HEARTBEAT_MS, RIDE_IDS, RIDE_NAMES, abortRide, rideClaim, claimWins, fairClock, livePartnerFair, parseFairMessage, pickSeat, reducePartnerFair, requestLeave, reseat,
  rideStatusText, seatPose, startRide, stepRide, stand, exitPoint, type FairMessage, type PartnerFair, type RideId, type RideSession,
} from '../city/funfair.ts';
import { fairSfx } from '../city/funfairSound.ts';
import { lostSeat, seatsTaken, type SeatClaim } from '../net/occupancy.ts';
import { speak } from '../city/voices.ts';
import type { CoatId } from '../appearance.ts';
import type { TownControls, TownLive } from '../components/TownCanvas';
import { recordMemory, type WorldSave } from '../worldSave.ts';
import type { Vec2 } from '../world/geometry.ts';
import type { RegionId } from './state.ts';

type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;

export interface FairApi {
  /** The local player is queued for / riding a ride (movement is locked while they are). */
  active: boolean;
  board(ride: RideId): void;
  /** Leave at the next stop (the safe way to get off a moving ride). */
  leave(): void;
  /** End everything right now (scene change, unmount). */
  abort(): void;
  /** The ride sheet (status, who you ride with, "Get off"). */
  bar: ReactNode;
}

const anchorOf = (ride: RideId): Vec2 => FAIR_LAYOUT[ride];
const noOccupants = new Map<string, { uid: string; claim: SeatClaim }>();

const focusOf = (ride: RideId): Vec2 => { const a = anchorOf(ride); return ride === 'ferris' ? { x: a.x, y: a.y - 56 } : ride === 'carousel' ? { x: a.x, y: a.y - 10 } : { x: a.x, y: a.y - 30 }; };

export function useFunfair(o: {
  region: RegionId;
  live: MutableRefObject<TownLive>;
  controls: MutableRefObject<TownControls>;
  playerPos: MutableRefObject<Vec2>;
  notify: Notify;
  update: (fn: (s: WorldSave) => WorldSave) => void;
  partnerOnline: boolean;
  /** The partner's Tangerine/Midnight role, to break an exact tie when both claim a seat in the same millisecond. */
  myRole: 'T' | 'M';
  coat: CoatId;
  darkness: () => number;
}): FairApi {
  const latest = useRef(o);
  latest.current = o;
  const session = useRef<RideSession | null>(null);
  const startPos = useRef<Vec2>({ x: 0, y: 0 });
  const startAt = useRef(0);
  const partner = useRef<PartnerFair | null>(null);
  const pname = () => latest.current.live.current.partner?.name || 'Your partner';
  const lastBeat = useRef(0);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  /** Tell the partner (idempotent; they ignore stale messages). */
  const announce = useCallback((phase: FairMessage['phase']) => {
    const s = session.current;
    if (!latest.current.partnerOnline) return;
    const msg: FairMessage = phase === 'off' || !s ? { t: 'fair', ride: s?.ride ?? 'ferris', seat: null, phase: 'off', at: Date.now() } : { t: 'fair', ride: s.ride, seat: s.seat, phase, at: s.claimAt };
    sendPair({ ...msg });
    lastBeat.current = performance.now();
  }, []);

  const publish = useCallback(() => {
    const l = latest.current.live.current;
    const s = session.current;
    const occ: Partial<Record<RideId, number[]>> = {};
    const add = (ride: RideId, seat: number) => { (occ[ride] ??= []).push(seat); };
    if (s && s.phase !== 'done') add(s.ride, s.seat);
    const pf = livePartnerFair(partner.current, performance.now());
    const partnerHere = !!pf && (l.partnerRegion ?? 'town') === 'funfair' && latest.current.partnerOnline;
    if (pf && partnerHere) add(pf.ride, pf.seat);
    // everybody else in the park (not only the paired partner): their claimed seats light up and can't be picked
    for (const h of (l.occupied ?? noOccupants).values()) if (h.claim.kind === 'ride' && (RIDE_IDS as readonly string[]).includes(h.claim.id)) add(h.claim.id as RideId, h.claim.seat);
    l.fair = { occupied: occ, waiting: s && s.phase === 'queued' ? { ride: s.ride, seat: s.seat } : null };
    // partner in their seat (deterministic from the shared clock → pixel-identical on both screens)
    l.partnerSeat = pf && partnerHere && pf.phase !== 'queued'
      ? (() => { const p = seatPose(pf.ride, anchorOf(pf.ride), pf.seat, fairClock()); return { x: p.x, y: p.y, lift: p.lift, facing: p.facing, sortY: p.sortY, noShadow: pf.ride === 'ferris' }; })()
      : null;
  }, []);

  const finish = useCallback((why: 'exited' | 'aborted' | 'timeout') => {
    const l = latest.current.live.current;
    const s = session.current;
    if (!s) return;
    const out = exitPoint(s.ride);
    l.seat = null;
    l.focus = null;
    l.claim = null;
    latest.current.controls.current.teleport = out; // the body is moved to where the cat stepped out: free ground, free to move
    announce('off');
    session.current = null;
    publish();
    rerender();
    if (why === 'timeout') latest.current.notify('The ride is taking a break — hop on again!', 'info');
  }, [announce, publish, rerender]);

  const abort = useCallback(() => {
    if (session.current) { session.current = abortRide(session.current); finish('aborted'); }
  }, [finish]);

  const leave = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = requestLeave(s);
    announce('leaving');
    rerender();
  }, [announce, rerender]);

  const board = useCallback((ride: RideId) => {
    const now = fairClock();
    if (session.current) { if (session.current.ride === ride) leave(); return; }
    const l = latest.current.live.current;
    const pf = livePartnerFair(partner.current, performance.now());
    const taken = new Set<number>(seatsTaken(l.occupied ?? noOccupants, 'ride', ride));
    if (pf && pf.ride === ride && (l.partnerRegion ?? 'town') === 'funfair' && latest.current.partnerOnline) taken.add(pf.seat);
    const pick = pickSeat(ride, now, taken);
    if (!pick) { latest.current.notify('Every seat is taken right now — try again in a moment.', 'info'); return; }
    session.current = startRide(ride, pick.seat, now);
    startPos.current = { ...latest.current.playerPos.current };
    startAt.current = performance.now();
    l.seat = { x: startPos.current.x, y: startPos.current.y, pose: 'stand', facing: 'up', lift: 0 };
    l.focus = focusOf(ride);
    announce('queued');
    fairSfx('bell');
    rerender();
  }, [announce, leave, rerender]);

  // ---- the per-frame driver: moves the cat with its seat ----
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const l = latest.current.live.current;
      const s = session.current;
      const now = fairClock();
      // The seat I hold is published with every snapshot (net/occupancy.ts) so ALL players see it as taken. It is derived from the
      // session every frame, so it can never be stale: no session = no claim.
      if (s) l.claim = rideClaim(session.current); else if (l.claim?.kind === 'ride') l.claim = null;
      // Two players can pick the same seat inside one network round trip. Everyone resolves it the same way (earlier claim wins,
      // then the smaller player id); the loser is moved to another free seat, or told the ride is full — never left on top of someone.
      const mineClaim = rideClaim(session.current);
      if (s && mineClaim && l.selfId && lostSeat({ uid: l.selfId, claim: mineClaim }, l.occupied ?? noOccupants)) {
        const taken = new Set<number>(seatsTaken(l.occupied ?? noOccupants, 'ride', s.ride)); taken.add(s.seat);
        // Before the cat is actually riding (waiting at the gate, or in the 0.5 s hop) it simply takes another free seat.
        const pick = s.phase === 'queued' || s.phase === 'hopping-in' ? pickSeat(s.ride, now, taken) : null;
        if (pick) {
          if (s.phase === 'queued') session.current = reseat(s, pick.seat, now);
          else { // mid-hop: step back to the gate and queue for the other seat
            if (l.seat) startPos.current = { x: l.seat.x, y: l.seat.y };
            startAt.current = performance.now();
            session.current = startRide(s.ride, pick.seat, now);
          }
          latest.current.notify('Someone else got that seat first — switching to another one.', 'info');
          announce('queued');
        } else {
          session.current = abortRide(s);
          finish('aborted');
          latest.current.notify(s.phase === 'queued' || s.phase === 'hopping-in' ? 'That ride is full right now — try again in a moment.' : 'Someone else had that seat first — you’re back on the platform.', 'info');
          publish();
          return;
        }
      }
      if (s) {
        const r = stepRide(s, anchorOf(s.ride), now);
        if (r.session !== s) { session.current = r.session; }
        if (r.session.phase === 'queued' && s.phase === 'queued') {
          // walk the last few pixels to the gate instead of snapping there
          const k = Math.min(1, (performance.now() - startAt.current) / 320);
          const st = stand(s.ride);
          l.seat = { x: startPos.current.x + (st.x - startPos.current.x) * k, y: startPos.current.y + (st.y - startPos.current.y) * k, pose: 'stand', facing: 'up', lift: 0 };
        } else if (r.pose) {
          l.seat = { x: r.pose.x, y: r.pose.y, pose: r.pose.pose, facing: r.pose.facing, lift: r.pose.lift, sortY: r.pose.sortY, noShadow: s.ride === 'ferris' && r.pose.onRide };
        }
        if (r.event === 'boarded') {
          fairSfx('hop');
          speak(latest.current.coat, 'happy');
          if (s.ride === 'ferris') {
            const dark = latest.current.darkness() > 0.5;
            latest.current.update((sv) => sv.memories.some((m) => m.id === 'ride-ferris') ? sv
              : recordMemory(sv, { id: 'ride-ferris', kind: 'city', title: 'Up on the Ferris wheel', detail: dark ? 'The whole funfair lit up below us.' : 'All of Whiskerwick from the very top.', at: Date.now(), place: 'Whiskerwick Funfair', withPartner: latest.current.partnerOnline }));
          }
          announce('riding');
        }
        if (r.session.phase === 'riding' && s.phase === 'hopping-in') rerender();
        if (r.event === 'exited') { fairSfx('hop'); finish('exited'); latest.current.notify(s.ride === 'ferris' ? 'What a view! Back on the platform.' : 'That was fun!', 'success'); }
        else if (r.event === 'timeout') finish('timeout');
        else if (r.session.phase === 'done') finish('aborted');
        // heartbeat so a lost message or a late-joining partner always converges
        if (session.current && performance.now() - lastBeat.current > HEARTBEAT_MS) announce(session.current.leaving ? 'leaving' : session.current.phase === 'queued' ? 'queued' : 'riding');
      }
      publish();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [announce, finish, publish, rerender]);

  // status text refresh (4 Hz is plenty)
  useEffect(() => {
    const id = window.setInterval(() => { if (session.current) rerender(); }, 250);
    return () => window.clearInterval(id);
  }, [rerender]);

  // ---- the partner's messages ----
  useEffect(() => onPairMessage((m) => {
    const msg = parseFairMessage(m);
    if (!msg) return;
    const theirRole: 'T' | 'M' = latest.current.myRole === 'T' ? 'M' : 'T';
    partner.current = reducePartnerFair(partner.current, msg, performance.now());
    const s = session.current;
    // the same seat claimed twice: the earlier claim keeps it (deterministic on both screens)
    if (s && msg.seat !== null && msg.phase !== 'off' && msg.ride === s.ride && msg.seat === s.seat && s.phase === 'queued') {
      const mine = { ride: s.ride, seat: s.seat, at: s.claimAt, role: latest.current.myRole };
      const theirs = { ride: msg.ride, seat: msg.seat, at: msg.at, role: theirRole };
      if (!claimWins(mine, theirs)) {
        const pick = pickSeat(s.ride, fairClock(), new Set([msg.seat]));
        if (pick) {
          session.current = reseat(s, pick.seat, fairClock());
          latest.current.notify(`${pname()} got that seat first — switching to another one.`, 'info');
          announce('queued');
        } else finish('aborted');
      }
    }
    publish();
  }), [announce, finish, publish]);

  // partner left / reconnecting: never leave a ghost rider behind
  useEffect(() => {
    if (!o.partnerOnline) { partner.current = null; latest.current.live.current.partnerSeat = null; publish(); }
    else if (session.current) announce(session.current.phase === 'queued' ? 'queued' : session.current.leaving ? 'leaving' : 'riding'); // tell a (re)connected partner where we are
  }, [o.partnerOnline, announce, publish]);

  // ---- leaving the park (or the page) ends every ride safely ----
  useEffect(() => {
    if (o.region !== 'funfair' && session.current) { session.current = abortRide(session.current); const l = latest.current.live.current; l.seat = null; l.focus = null; l.claim = null; announce('off'); session.current = null; rerender(); }
    if (o.region !== 'funfair') { latest.current.live.current.fair = undefined; latest.current.live.current.partnerSeat = null; }
  }, [o.region, announce, rerender]);
  useEffect(() => () => {
    const l = latest.current.live.current;
    if (session.current) { announce('off'); session.current = null; }
    l.seat = null; l.focus = null; l.fair = undefined; l.partnerSeat = null; if (l.claim?.kind === 'ride') l.claim = null;
  }, [announce]);
  // a hidden tab keeps its place on the ride (the ride is clock-driven); nothing to do there.

  // Esc = get off at the next stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && session.current) { e.preventDefault(); leave(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave]);

  const s = session.current;
  const pf = livePartnerFair(partner.current, performance.now());
  const together = !!s && !!pf && pf.ride === s.ride && pf.phase !== 'queued';
  const bar = s ? (
    <PanelSheet label={`Riding: ${RIDE_NAMES[s.ride]}`} className="pv-sitbar pv-ridebar" title={RIDE_NAMES[s.ride]}
      actions={<button type="button" className="pill-btn" onClick={() => (s.phase === 'queued' ? abort() : leave())} disabled={s.leaving && s.phase !== 'queued'}>{s.phase === 'queued' ? 'Never mind' : s.leaving ? 'Getting off…' : 'Get off (Esc)'}</button>}>
      <p role="status">{rideStatusText(s, fairClock())}{together ? ` You’re riding with ${pname()}.` : ''}</p>
    </PanelSheet>
  ) : null;
  return { active: !!s, board, leave, abort, bar };
}
