/**
 * Whiskerwick Funfair: the rides (Ferris wheel, Moonbeam Carousel, Cloud Swing Ride), Bumper Paws, Ring Toss,
 * the park layout (every attraction reachable, nothing walkable through), partner seat sync and rewards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAROUSEL, FAIR_LAYOUT, HEARTBEAT_MS, HOP_MS, MAX_QUEUE_MS, PARTNER_FAIR_TTL_MS, RIDE_IDS, RIDE_MS, RIDE_NAMES, RIDE_SEATS, SWING,
  abortRide, carouselAngle, claimWins, exitPoint, ferrisCab, gateDeviation, livePartnerFair, msUntilGate, parseFairMessage, pickSeat,
  reducePartnerFair, requestLeave, reseat, rideStatusText, seatAtGate, seatPose, stand, startRide, stepRide, swingAngle, swingLift, swingLoadable, swingSpeed,
  type RideId, type RideSession,
} from '../src/pawville/city/funfair.ts';
import {
  ARENA, BUMP_SPEED, CAR_R, MAX_SPEED, NO_CONTROLS, ROUND_MS, bumperTokens, botControls, newBumper, stepBumper, type BumperState, type Controls,
} from '../src/pawville/city/bumperPaws.ts';
import {
  BOARD_W, PEGS, RINGS_PER_ROUND, RING_R, applyThrow, arcPoint, landing, newToss, pegX, resolveThrow, tossTokens,
} from '../src/pawville/city/ringToss.ts';
import { ARCADE_DAILY_CAP, earnArcade, setRecord } from '../src/pawville/city/economy.ts';
import { emptySave } from '../src/pawville/worldSave.ts';
import { regionDef } from '../src/pawville/adventure/regions.ts';
import { RTILE, groundSolids, reachableTiles, regionPropCollider } from '../src/pawville/adventure/regionKit.ts';
import { NEW_CITY_REGIONS } from '../src/pawville/city/cityDistricts.ts';
import { REGION_IDS } from '../src/pawville/adventure/state.ts';
import { CITY_FUNFAIR_GATE, CITY_FUNFAIR_RETURN, FUNFAIR_ARRIVAL } from '../src/pawville/city/funfairRegion.ts';

const T0 = 1_761_400_000_000; // a fixed "UTC now"

// ---- the rides ------------------------------------------------------------------------------------
test('every ride gets every seat to its gate within a minute, so nobody waits forever', () => {
  for (const ride of RIDE_IDS) for (let seat = 0; seat < RIDE_SEATS; seat++) {
    const w = msUntilGate(ride, seat, T0);
    assert.ok(w !== null && w <= 60_000, `${ride} seat ${seat} reaches the gate`);
    assert.ok(seatAtGate(ride, seat, T0 + (w as number)), `${ride} seat ${seat} is at the gate when promised`);
  }
});

test('the swing ride only loads while it is slow, and its spin is continuous', () => {
  let prev = swingSpeed(0);
  for (let ms = 0; ms < SWING.cycleMs; ms += 50) {
    const v = swingSpeed(ms);
    assert.ok(Math.abs(v - prev) < 0.05, 'no jumps in the spin speed');
    prev = v;
    if (swingLoadable(ms)) assert.ok(v <= SWING.wLoad + 0.2, 'loading happens while it is nearly still');
  }
  assert.ok(!swingLoadable(SWING.loadMs + 1000), 'not loadable at full spin');
  assert.ok(swingLift(SWING.loadMs + SWING.upMs + 1000) > swingLift(0), 'the chairs rise as it spins up');
  assert.ok(Number.isFinite(swingAngle(T0)));
});

test('the carousel and wheel are pure functions of the shared clock (identical on both screens)', () => {
  assert.equal(carouselAngle(T0), carouselAngle(T0 + CAROUSEL.periodMs));
  const a = ferrisCab(FAIR_LAYOUT.ferris, 3, T0), b = ferrisCab(FAIR_LAYOUT.ferris, 3, T0);
  assert.deepEqual(a, b);
  for (const ride of RIDE_IDS) assert.deepEqual(seatPose(ride, FAIR_LAYOUT[ride], 2, T0), seatPose(ride, FAIR_LAYOUT[ride], 2, T0));
});

test('a rider is carried by the seat: its position follows the seat pose every frame', () => {
  for (const ride of RIDE_IDS) {
    const seat = pickSeat(ride, T0, new Set());
    assert.ok(seat, `${ride} has a free seat`);
    let s: RideSession = startRide(ride, seat!.seat, T0);
    let now = T0, boarded = false, exited = false, rodeFrames = 0;
    for (let i = 0; i < 20_000 && !exited; i++) {
      now += 50;
      const r = stepRide(s, FAIR_LAYOUT[ride], now);
      s = r.session;
      if (r.event === 'boarded') boarded = true;
      if (s.phase === 'riding' && r.pose) {
        rodeFrames++;
        const p = seatPose(ride, FAIR_LAYOUT[ride], s.seat, now);
        assert.ok(Math.hypot(r.pose.x - p.x, r.pose.y - p.y) < 0.001, `${ride}: the cat IS where the seat is`);
        assert.equal(r.pose.pose, 'sit');
      }
      if (r.event === 'exited') exited = true;
    }
    assert.ok(boarded && exited, `${ride}: boards and gets off again`);
    assert.ok(rodeFrames > 30, `${ride}: actually rides for a while`);
    assert.equal(s.phase, 'done');
  }
});

test('"get off" leaves at the next stop; never-mind while queued leaves at once; abort is instant', () => {
  for (const ride of RIDE_IDS) {
    const pick = pickSeat(ride, T0, new Set())!;
    // never mind while queued
    let q = requestLeave(startRide(ride, pick.seat, T0));
    const r = stepRide(q, FAIR_LAYOUT[ride], T0 + 10);
    assert.equal(r.event, 'exited');
    // leave mid-ride
    let s = startRide(ride, pick.seat, T0), now = T0, left = false;
    for (let i = 0; i < 4000; i++) {
      now += 50;
      const f = stepRide(s, FAIR_LAYOUT[ride], now); s = f.session;
      if (s.phase === 'riding' && !left && now - s.boardedAt > 4000) { s = requestLeave(s); left = true; }
      if (f.event === 'exited') break;
    }
    assert.equal(s.phase, 'done', `${ride}: got off after asking`);
    assert.ok(now - T0 < RIDE_MS[ride] + MAX_QUEUE_MS, `${ride}: and did not take forever`);
    assert.equal(abortRide(startRide(ride, 0, T0)).phase, 'done');
  }
});

test('a clock that jumps, or an endless queue, ends the session safely instead of stranding the cat', () => {
  const s = startRide('swing', 0, T0);
  assert.equal(stepRide(s, FAIR_LAYOUT.swing, T0 - 60_000).event, 'timeout');
  assert.equal(stepRide(s, FAIR_LAYOUT.swing, T0 + RIDE_MS.swing * 3 + MAX_QUEUE_MS + 1).event, 'timeout');
  assert.ok(HOP_MS > 0 && HOP_MS < 2000);
});

test('boarding / exit points sit on free ground next to each ride', () => {
  const fair = regionDef('funfair');
  const solids = [...groundSolids(fair), ...fair.props.map(regionPropCollider).filter((c): c is NonNullable<typeof c> => !!c)];
  const inside = (p: { x: number; y: number }) => solids.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  for (const ride of RIDE_IDS) {
    assert.ok(!inside(stand(ride)), `${ride}: the boarding spot is not inside anything`);
    assert.ok(!inside(exitPoint(ride)), `${ride}: the exit is on free ground (you can walk away)`);
    assert.ok(Math.hypot(exitPoint(ride).x - stand(ride).x, exitPoint(ride).y - stand(ride).y) < 60);
  }
});

// ---- partner seats ------------------------------------------------------------------------------------
test('seat claims: the earlier claim wins, an exact tie goes to Tangerine, both screens agree', () => {
  const a = { ride: 'ferris' as RideId, seat: 3, at: 1000, role: 'T' as const }, b = { ride: 'ferris' as RideId, seat: 3, at: 1200, role: 'M' as const };
  assert.ok(claimWins(a, b) && !claimWins(b, a));
  const t1 = { ...a, at: 5000 }, t2 = { ...b, at: 5000 };
  assert.ok(claimWins(t1, t2) && !claimWins(t2, t1));
  const free = pickSeat('ferris', T0, new Set([3]));
  assert.ok(free && free.seat !== 3, 'the loser is given another seat');
  const s = reseat(startRide('ferris', 3, T0), free!.seat, T0 + 5);
  assert.equal(s.seat, free!.seat);
  assert.equal(reseat({ ...s, phase: 'riding' }, 1, T0).seat, s.seat, 'you cannot be re-seated mid-ride');
  assert.equal(pickSeat('ferris', T0, new Set([0, 1, 2, 3, 4, 5, 6, 7])), null, 'a full ride says so');
});

test('fair messages are validated, and a partner who stops talking expires (no ghost riders)', () => {
  assert.equal(parseFairMessage(null), null);
  assert.equal(parseFairMessage({ t: 'move' }), null);
  assert.equal(parseFairMessage({ t: 'fair', ride: 'roller', seat: 1, phase: 'riding', at: 1 }), null);
  assert.equal(parseFairMessage({ t: 'fair', ride: 'ferris', seat: 99, phase: 'riding', at: 1 }), null);
  assert.equal(parseFairMessage({ t: 'fair', ride: 'ferris', seat: null, phase: 'riding', at: 1 }), null);
  assert.equal(parseFairMessage({ t: 'fair', ride: 'ferris', seat: 1.5, phase: 'riding', at: 1 }), null);
  const ok = parseFairMessage({ t: 'fair', ride: 'carousel', seat: 4, phase: 'queued', at: 12 });
  assert.deepEqual(ok, { t: 'fair', ride: 'carousel', seat: 4, phase: 'queued', at: 12 });
  const off = parseFairMessage({ t: 'fair', ride: 'carousel', seat: null, phase: 'off', at: 13 })!;
  const p1 = reducePartnerFair(null, ok!, 1000);
  assert.ok(livePartnerFair(p1, 1000 + PARTNER_FAIR_TTL_MS));
  assert.equal(livePartnerFair(p1, 1000 + PARTNER_FAIR_TTL_MS + 1), null);
  assert.equal(reducePartnerFair(p1, off, 2000), null, 'an "off" message clears them');
  assert.ok(HEARTBEAT_MS * 2 < PARTNER_FAIR_TTL_MS, 'a missed heartbeat does not drop the partner');
});

test('ride status text always says something useful and never lies about the phase', () => {
  const s = startRide('ferris', 0, T0);
  assert.match(rideStatusText(s, T0), /seat|Hop/i);
  assert.match(rideStatusText({ ...s, phase: 'riding', boardedAt: T0 }, T0 + 1000), /Enjoy/);
  assert.match(rideStatusText({ ...s, phase: 'riding', boardedAt: T0, leaving: true }, T0 + 1000), /Getting off/);
  assert.equal(rideStatusText({ ...s, phase: 'done' }, T0), '');
  assert.ok(gateDeviation('ferris', 0, T0) >= -Math.PI && gateDeviation('ferris', 0, T0) <= Math.PI);
  for (const r of RIDE_IDS) assert.ok(RIDE_NAMES[r].length > 3);
});

// ---- the park ------------------------------------------------------------------------------------------
test('the funfair is registered, unlocked, reachable from the city, and every attraction can be walked up to', () => {
  assert.ok(REGION_IDS.includes('funfair'));
  assert.ok(NEW_CITY_REGIONS.includes('funfair'), 'a city district: always unlocked (the city is a short walk away)');
  const city = regionDef('city');
  const gate = city.spots.find((s) => s.id === 'city-funfair-gate')!;
  assert.equal(gate.to?.region, 'funfair');
  assert.deepEqual(gate.point, CITY_FUNFAIR_GATE);

  const fair = regionDef('funfair');
  const exit = fair.spots.find((s) => s.id === 'fair-gate-exit')!;
  assert.deepEqual(exit.to, { region: 'city', x: CITY_FUNFAIR_RETURN.x, y: CITY_FUNFAIR_RETURN.y });
  assert.deepEqual(fair.spawn, FUNFAIR_ARRIVAL);

  const ids = fair.spots.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'spot ids are unique');
  for (const id of ['fair-ferris', 'fair-carousel', 'fair-swing', 'fair-bumper', 'fair-ringtoss']) assert.ok(ids.includes(id), `${id} exists`);
  assert.equal(fair.spots.find((s) => s.id === 'fair-bumper')!.machine, 'bumper');
  assert.equal(fair.spots.find((s) => s.id === 'fair-ringtoss')!.machine, 'ringtoss');
  for (const ride of RIDE_IDS) assert.equal(fair.spots.find((s) => s.id === `fair-${ride}`)!.ride, ride);

  const colliders = fair.props.map(regionPropCollider).filter((c): c is NonNullable<typeof c> => !!c);
  const reach = reachableTiles(fair, fair.spawn, colliders);
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y / RTILE) * fair.cols + Math.floor(p.x / RTILE);
  assert.ok(reach.has(tileOf(fair.spawn)), 'the arrival point is walkable');
  for (const s of fair.spots) {
    assert.ok(reach.has(tileOf(s.point)), `${s.id} can be reached on foot`);
    assert.ok(!colliders.some((c) => s.point.x >= c.x && s.point.x <= c.x + c.w && s.point.y >= c.y && s.point.y <= c.y + c.h), `${s.id} is not inside a collider`);
  }
  for (const n of fair.npcs) assert.ok(reach.has(tileOf(n)), `${n.id} stands on walkable ground`);
});

test('the attractions are solid: you cannot walk through a ride or a booth', () => {
  const fair = regionDef('funfair');
  for (const kind of ['ferris', 'carousel', 'swingride', 'bumperarena', 'ringbooth']) {
    const p = fair.props.find((q) => q.kind === kind)!;
    assert.ok(p, `${kind} is placed`);
    const c = regionPropCollider(p);
    assert.ok(c && c.w >= 24 && c.h >= 8, `${kind} has a real collider`);
  }
});

// ---- Bumper Paws -----------------------------------------------------------------------------------------
const run = (s: BumperState, ctl: Controls | ((s: BumperState) => Controls), ms: number) => {
  for (let t = 0; t < ms && !s.over; t += 16) s = stepBumper(s, typeof ctl === 'function' ? ctl(s) : ctl, 16);
  return s;
};

test('bumper: deterministic for the same seed and inputs', () => {
  const a = run(newBumper(5), { steer: 0.3, throttle: 1 }, 8000), b = run(newBumper(5), { steer: 0.3, throttle: 1 }, 8000);
  assert.deepEqual(a.cars.map((c) => [c.x, c.y]), b.cars.map((c) => [c.x, c.y]));
  assert.equal(a.score, b.score);
});

test('bumper: cars never leave the arena, never overlap, and never exceed top speed — whatever you do', () => {
  const inputs: Controls[] = [{ steer: 1, throttle: 1 }, { steer: -1, throttle: 1 }, { steer: 0, throttle: 1 }, { steer: 1, throttle: -1 }, NO_CONTROLS];
  for (let seed = 1; seed <= 6; seed++) {
    let s = newBumper(seed);
    for (let t = 0; t < ROUND_MS; t += 16) {
      s = stepBumper(s, inputs[Math.floor(t / 1500 + seed) % inputs.length], 16);
      for (const c of s.cars) {
        assert.ok(c.x >= ARENA.wall + CAR_R - 0.01 && c.x <= ARENA.w - ARENA.wall - CAR_R + 0.01, `x in the arena (seed ${seed})`);
        assert.ok(c.y >= ARENA.wall + CAR_R - 0.01 && c.y <= ARENA.h - ARENA.wall - CAR_R + 0.01, `y in the arena (seed ${seed})`);
        assert.ok(Math.hypot(c.vx, c.vy) <= MAX_SPEED + 0.5);
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
      }
      for (let i = 0; i < s.cars.length; i++) for (let j = i + 1; j < s.cars.length; j++) {
        assert.ok(Math.hypot(s.cars[i].x - s.cars[j].x, s.cars[i].y - s.cars[j].y) > CAR_R * 2 - 3, 'bodies do not sit inside each other');
      }
    }
    assert.ok(s.over, 'the round ends at 60 s');
  }
});

test('bumper: a head-on hit is a bump that scores, a gentle touch is not', () => {
  const base = newBumper(1);
  const place = (speed: number): BumperState => ({
    ...base,
    cars: base.cars.map((c, i) => i === 0 ? { ...c, x: 100, y: 100, a: 0, vx: speed, vy: 0 } : i === 1 ? { ...c, x: 100 + CAR_R * 2 - 1, y: 100, a: Math.PI, vx: 0, vy: 0, bot: 0 + 1 } : { ...c, x: 280, y: 160, vx: 0, vy: 0 }),
  });
  const hard = stepBumper(place(100), { steer: 0, throttle: 0 }, 16);
  assert.ok(hard.score >= 2, 'a 100-speed ram scores');
  assert.ok(hard.events.some((e) => e.kind === 'bump' && e.by === 0 && e.to === 1));
  assert.ok(hard.cars[0].dealt === 1 && hard.cars[1].taken === 1);
  const soft = stepBumper(place(BUMP_SPEED - 20), { steer: 0, throttle: 0 }, 16);
  assert.equal(soft.score, 0, 'a nudge does not score');
  // one collision scores once (the cooldown stops a single touch counting twice)
  const again = stepBumper(hard, { steer: 0, throttle: 0 }, 16);
  assert.equal(again.score, hard.score);
});

test('bumper: the bots really do come for you — an idle player gets bumped; a chasing player scores', () => {
  const idle = run(newBumper(3), NO_CONTROLS, ROUND_MS);
  assert.ok(idle.cars[0].taken > 0, 'bots ram a parked player');
  const aggressive = (s: BumperState): Controls => {
    const me = s.cars[0];
    let best = s.cars[1], bd = Infinity;
    for (const o of s.cars.slice(1)) { const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < bd) { bd = d; best = o; } }
    let diff = Math.atan2(best.y - me.y, best.x - me.x) - me.a;
    while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    return { steer: Math.max(-1, Math.min(1, diff * 2)), throttle: 1 };
  };
  let total = 0;
  for (let seed = 1; seed <= 5; seed++) total += run(newBumper(seed), aggressive, ROUND_MS).score;
  assert.ok(total / 5 >= 6, `a player who chases scores (avg ${total / 5})`);
});

test('bumper: nobody stays stuck against the wall or each other', () => {
  let s = newBumper(2);
  let worstPinned = 0;
  // drive straight into a corner and hold the throttle
  s = { ...s, cars: s.cars.map((c, i) => i === 0 ? { ...c, x: 30, y: 30, a: Math.PI * 1.25 } : c) };
  for (let t = 0; t < 20_000 && !s.over; t += 16) {
    s = stepBumper(s, { steer: 0, throttle: 1 }, 16);
    worstPinned = Math.max(worstPinned, ...s.cars.map((c) => c.pinned));
  }
  assert.ok(worstPinned < 3, `pinned for at most ${worstPinned.toFixed(2)} s`);
  assert.ok(botControls(s, s.cars[1]).throttle !== undefined);
});

test('bumper: tokens are small, the record only goes up, and the daily arcade cap always applies', () => {
  assert.deepEqual([0, 3, 4, 9, 18, 50].map(bumperTokens), [0, 0, 1, 2, 3, 3]);
  let sv = emptySave();
  const r1 = setRecord(sv, 'bumper-paws', 10); assert.ok(r1.isNew);
  const r2 = setRecord(r1.save, 'bumper-paws', 4); assert.ok(!r2.isNew && r2.save.records['bumper-paws'] === 10);
  sv = r2.save;
  let earned = 0;
  for (let i = 0; i < 30; i++) { const e = earnArcade(sv, 3, '2026-10-25'); sv = e.save; earned += e.earned; }
  assert.equal(earned, ARCADE_DAILY_CAP, 'a day can never pay more than the cap');
});

// ---- Ring Toss -------------------------------------------------------------------------------------------
test('ring toss: aiming at a peg drops the ring over it; each depth is worth what the sign says', () => {
  const ms = T0;
  for (const peg of PEGS) {
    const px = pegX(peg, ms + 720);
    const power = (peg.d - 0.18) / 0.72;
    const r = resolveThrow(px, power, ms);
    assert.equal(r.kind, 'peg', `${peg.id} can be ringed`);
    if (r.kind === 'peg') { assert.equal(r.points, peg.points); assert.equal(r.peg, peg.id); }
  }
  assert.ok(PEGS.find((p) => p.golden)!.points > PEGS.find((p) => p.id === 'f1')!.points, 'the moving golden peg is the jackpot');
});

test('ring toss: near misses clink off the rim, far misses land on the table, a ringed peg is inactive', () => {
  const peg = PEGS.find((p) => p.id === 'n2')!;
  const power = (peg.d - 0.18) / 0.72;
  const rim = resolveThrow(peg.x + RING_R + 3, power, T0);
  assert.equal(rim.kind, 'rim');
  if (rim.kind === 'rim') assert.ok(rim.bounceX >= 8 && rim.bounceX <= BOARD_W - 8 && rim.bounceD >= 0.15 && rim.bounceD <= 0.97);
  assert.equal(resolveThrow(5, 0.05, T0).kind, 'miss');
  const taken = resolveThrow(peg.x, power, T0, new Set([peg.id]));
  assert.notEqual(taken.kind, 'peg', 'a peg wearing a ring cannot score again');
  const l = landing(-50, 3);
  assert.ok(l.x >= 8 && l.x <= BOARD_W - 8 && l.d <= 0.9 + 1e-9, 'throws are clamped onto the table');
  const arc = arcPoint({ x: 0, d: 0.1 }, { x: 100, d: 0.8 }, 0.5);
  assert.ok(arc.h > 0 && Math.abs(arcPoint({ x: 0, d: 0.1 }, { x: 100, d: 0.8 }, 1).h) < 1e-9, 'the ring arcs up and comes back down');
});

test('ring toss: six rings, every ring resolves exactly once, a finished round ignores more throws', () => {
  let s = newToss();
  assert.equal(s.rings, RINGS_PER_ROUND);
  const n1 = PEGS.find((p) => p.id === 'n1')!;
  const hit = resolveThrow(n1.x, (n1.d - 0.18) / 0.72, T0);
  s = applyThrow(s, hit);
  assert.equal(s.score, 1); assert.deepEqual(s.taken, ['n1']);
  // the same peg again: no double score
  s = applyThrow(s, { kind: 'peg', peg: 'n1', points: 1, x: n1.x, d: n1.d });
  assert.equal(s.score, 1, 'a peg scores once');
  for (let i = 0; i < 10; i++) s = applyThrow(s, { kind: 'miss', x: 20, d: 0.3 });
  assert.equal(s.rings, 0);
  assert.ok(s.over);
  assert.equal(s.history.length, RINGS_PER_ROUND, 'exactly six throws are recorded');
  assert.equal(applyThrow(s, hit), s, 'no more throws after the round');
});

test('ring toss: tokens are small and capped', () => {
  assert.deepEqual([0, 2, 3, 6, 7, 11, 12, 30].map(tossTokens), [0, 0, 1, 1, 2, 2, 3, 3]);
  const best = PEGS.reduce((a, p) => a + p.points, 0);
  assert.ok(best >= 12, 'the top token tier is reachable');
});
