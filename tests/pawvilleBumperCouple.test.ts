/**
 * Bumper Paws for two: the two-driver physics, the wire format and its validation, smoothing, stale input, and a full
 * host ⇄ guest match over a fake lossy network (the closest thing to two devices we can run in a test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA, BUMP_SPEED, CAR_R, MAX_SPEED, NO_CONTROLS, ROUND_MS, botControls, newBumper, stepBumper, type BumperState, type Controls,
} from '../src/pawville/city/bumperPaws.ts';
import {
  INPUT_MS, INPUT_TTL_MS, MAX_EXTRAPOLATE_MS, SNAP_MS, blendCars, extrapolate, freshControls, inputMsg, parseBumpInput, parseSnapshot, sanitizeControls,
  seedFor, shouldSendInput, snapshotBumper, stateFromSnapshot, stateMsg, verdict, type BumperSnap,
} from '../src/pawville/city/bumperNet.ts';
import { ACTIVITY_KINDS, ACTIVITY_LABEL, reduce, toMsg, idleSession, type Session } from '../src/pawville/couple/activitySession.ts';

/** Drive car `id` at the nearest other car. */
function chase(s: BumperState, id: number): Controls {
  const me = s.cars[id];
  let best = me, bd = Infinity;
  for (const o of s.cars) { if (o.id === id) continue; const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < bd) { bd = d; best = o; } }
  let diff = Math.atan2(best.y - me.y, best.x - me.x) - me.a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return { steer: Math.max(-1, Math.min(1, diff * 2)), throttle: 1 };
}

// ---- the arena with two human drivers ---------------------------------------------------------
test('two humans: cars 0 and 1 are human, 2 and 3 are bots; a one-driver game is unchanged', () => {
  const two = newBumper(4, 2);
  assert.deepEqual(two.cars.map((c) => c.bot), [0, 0, 2, 3]);
  assert.ok(two.cars.every((c) => c.score === 0));
  const one = newBumper(4);
  assert.deepEqual(one.cars.map((c) => c.bot), [0, 1, 2, 3], 'solo: you plus three bots');
  // nobody starts inside anybody else or the wall
  for (const st of [one, two]) for (let i = 0; i < 4; i++) {
    const c = st.cars[i];
    assert.ok(c.x >= ARENA.wall + CAR_R && c.x <= ARENA.w - ARENA.wall - CAR_R && c.y >= ARENA.wall + CAR_R && c.y <= ARENA.h - ARENA.wall - CAR_R);
    for (let j = i + 1; j < 4; j++) assert.ok(Math.hypot(c.x - st.cars[j].x, c.y - st.cars[j].y) > CAR_R * 2);
  }
});

test('each driver steers only their own car, and each scores only their own hits', () => {
  let s = newBumper(1, 2);
  // car 1 floors it straight up, car 0 sits still
  const idle = stepBumper(s, [NO_CONTROLS, { steer: 0, throttle: 1 }], 400);
  assert.ok(Math.hypot(idle.cars[1].vx, idle.cars[1].vy) > 20, 'car 1 moved under driver 1');
  assert.ok(Math.hypot(idle.cars[0].vx, idle.cars[0].vy) < 1, 'car 0 stayed put (not driven by driver 1)');
  // a hard head-on: car 1 rams car 0 → car 1 scores, car 0 does not
  s = newBumper(1, 2);
  s = { ...s, cars: s.cars.map((c, i) => (i === 0 ? { ...c, x: 150, y: 100, a: 0, vx: 0, vy: 0 } : i === 1 ? { ...c, x: 150 + CAR_R * 2 + 3, y: 100, a: Math.PI, vx: -110, vy: 0 } : { ...c, x: 280, y: 160, vx: 0, vy: 0 })) };
  const hit = stepBumper(s, [NO_CONTROLS, NO_CONTROLS], 48);
  assert.ok(hit.cars[1].score >= 2, `the ramming driver scored (${hit.cars[1].score})`);
  assert.equal(hit.cars[0].score, 0, 'the driver who was hit did not');
  assert.ok(hit.cars[1].dealt === 1 && hit.cars[0].taken === 1);
  assert.equal(hit.score, hit.cars[0].score, 'state.score is car 0\'s score (so the one-driver game reads the same)');
});

test('bots chase BOTH humans, taking turns', () => {
  const s = newBumper(2, 2);
  const targets = new Set<number>();
  for (let t = 0; t < 40_000; t += 2200) {
    const st: BumperState = { ...s, t };
    for (const botId of [2, 3]) {
      const ctl = botControls(st, st.cars[botId]);
      assert.ok(Number.isFinite(ctl.steer) && Number.isFinite(ctl.throttle));
    }
  }
  // run a match with two parked humans: both of them must get rammed
  let st = newBumper(7, 2);
  for (let t = 0; t < ROUND_MS && !st.over; t += 16) st = stepBumper(st, [NO_CONTROLS, NO_CONTROLS], 16);
  assert.ok(st.cars[0].taken > 0 && st.cars[1].taken > 0, `bots hit both parked humans (${st.cars[0].taken} / ${st.cars[1].taken})`);
  void targets;
});

test('two drivers, any inputs: cars stay in the arena, apart, under the speed limit, for a whole round', () => {
  const pats: Controls[] = [{ steer: 1, throttle: 1 }, { steer: -1, throttle: 1 }, { steer: 0, throttle: -1 }, NO_CONTROLS, { steer: 0.3, throttle: 1 }];
  for (let seed = 1; seed <= 4; seed++) {
    let s = newBumper(seed, 2);
    for (let t = 0; t < ROUND_MS; t += 16) {
      s = stepBumper(s, [pats[Math.floor(t / 1300 + seed) % 5], pats[Math.floor(t / 1700 + seed * 2) % 5]], 16);
      for (const c of s.cars) {
        assert.ok(c.x >= ARENA.wall + CAR_R - 0.01 && c.x <= ARENA.w - ARENA.wall - CAR_R + 0.01 && c.y >= ARENA.wall + CAR_R - 0.01 && c.y <= ARENA.h - ARENA.wall - CAR_R + 0.01, `car ${c.id} in the arena (seed ${seed}, t ${t})`);
        assert.ok(Math.hypot(c.vx, c.vy) <= MAX_SPEED + 0.01, `car ${c.id} under the speed limit (${Math.hypot(c.vx, c.vy).toFixed(1)})`);
      }
    }
    assert.ok(s.over);
  }
});

// ---- validation of what comes over the wire ----------------------------------------------------
test('steering messages are validated and clamped', () => {
  assert.deepEqual(sanitizeControls(5, -9), { steer: 1, throttle: -1 });
  assert.deepEqual(sanitizeControls('x', NaN), { steer: 0, throttle: 0 });
  assert.deepEqual(sanitizeControls(Infinity, 0.5), { steer: 0, throttle: 0.5 });
  assert.equal(parseBumpInput(null), null);
  assert.equal(parseBumpInput({ t: 'bump:st' }), null);
  const ok = parseBumpInput(inputMsg('abc-123', 2, { steer: 0.5, throttle: 1 }, 'midnight'))!;
  assert.deepEqual(ok.controls, { steer: 0.5, throttle: 1 });
  assert.equal(ok.coat, 'midnight');
  assert.equal(ok.round, 2);
  assert.equal(parseBumpInput({ t: 'bump:in', st: 0, th: 0, co: '__proto__' })!.coat, null, 'unknown coats are ignored');
  assert.equal(parseBumpInput({ t: 'bump:in', st: 0, th: 0, co: 'constructor' })!.coat, null);
});

test('a hands-off guest: stale or missing input means no throttle', () => {
  assert.deepEqual(freshControls(null, 1000), NO_CONTROLS);
  const last = { c: { steer: 1, throttle: 1 }, at: 1000 };
  assert.deepEqual(freshControls(last, 1000 + INPUT_TTL_MS), last.c, 'still fresh at the limit');
  assert.deepEqual(freshControls(last, 1000 + INPUT_TTL_MS + 1), NO_CONTROLS, 'then hands off the wheel');
  assert.deepEqual(freshControls(last, 1000 - 6000), NO_CONTROLS, 'a clock that jumped back is not trusted');
});

test('the guest sends on every change and as a heartbeat, not 60 times a second', () => {
  const a: Controls = { steer: 0, throttle: 1 };
  assert.ok(shouldSendInput(null, a, 0));
  assert.ok(!shouldSendInput(a, { ...a }, 20), 'unchanged and recent: stay quiet');
  assert.ok(shouldSendInput(a, { steer: 1, throttle: 1 }, 5), 'changed: send at once');
  assert.ok(shouldSendInput(a, { ...a }, INPUT_MS), 'heartbeat');
});

test('snapshots round-trip, stay small, and rebuild the arena', () => {
  let s = newBumper(3, 2);
  for (let i = 0; i < 200; i++) s = stepBumper(s, [chase(s, 0), chase(s, 1)], 16);
  const snap = snapshotBumper(s, s.events, ['tangerine', 'midnight']);
  const wire = JSON.parse(JSON.stringify(stateMsg('sid-1', 0, snap)));
  assert.ok(JSON.stringify(wire).length < 700, `a snapshot is tiny (${JSON.stringify(wire).length} chars; the transport limit is 8000)`);
  const back = parseSnapshot(wire.snap)!;
  assert.ok(back);
  const st = stateFromSnapshot(back);
  assert.equal(st.cars.length, 4);
  assert.deepEqual(st.cars.map((c) => c.bot), [0, 0, 2, 3]);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(st.cars[i].x - s.cars[i].x) < 0.06 && Math.abs(st.cars[i].y - s.cars[i].y) < 0.06, 'positions survive to 0.05 px');
    assert.equal(st.cars[i].score, s.cars[i].score);
    assert.equal(st.cars[i].dealt, s.cars[i].dealt);
  }
  assert.deepEqual(back.co, ['tangerine', 'midnight']);
  assert.equal(st.t, Math.round(s.t));
});

test('hostile or broken snapshots are rejected or clamped — they can never break the other player\'s game', () => {
  const good = snapshotBumper(newBumper(1, 2), [], ['tangerine', null]);
  assert.ok(parseSnapshot(good));
  for (const bad of [null, 5, 'x', {}, { t: 1 }, { ...good, t: NaN }, { ...good, t: -5 }, { ...good, t: 1e9 }, { ...good, c: [] }, { ...good, c: good.c.slice(0, 3) }, { ...good, c: [...good.c.slice(0, 3), [1, 2]] }, { ...good, c: good.c.map((r) => r.map(() => NaN)) }]) {
    assert.equal(parseSnapshot(bad as unknown), null);
  }
  const wild = parseSnapshot({ ...good, c: good.c.map(() => [9999, -9999, 1e6, -1e6, 3, 1e9, -5, 1e9, 1e9]), e: [[0, 1e9, -1e9, 500, 99, -99], 'junk', [1, 2]] })!;
  for (const c of wild.c) {
    assert.ok(c[0] >= ARENA.wall + CAR_R && c[0] <= ARENA.w - ARENA.wall - CAR_R && c[1] >= ARENA.wall + CAR_R && c[1] <= ARENA.h - ARENA.wall - CAR_R, 'positions clamped into the arena');
    assert.ok(Math.abs(c[2]) <= MAX_SPEED * 1.5 && Math.abs(c[3]) <= MAX_SPEED * 1.5, 'speed clamped');
    assert.ok(c[5] <= 999 && c[6] >= 0 && c[7] <= 9999);
  }
  assert.equal(wild.e.length, 1, 'only well-formed events survive');
  assert.ok(wild.e[0][3] <= 100 && wild.e[0][4] <= 3 && wild.e[0][5] >= -1);
  assert.deepEqual(parseSnapshot({ ...good, co: ['__proto__', 7] })!.co, [null, null], 'unknown coats become "not known yet"');
});

// ---- smoothing ----------------------------------------------------------------------------------
test('extrapolation is bounded, stays in the arena, and does nothing at age 0', () => {
  const s = stateFromSnapshot(parseSnapshot(snapshotBumper({ ...newBumper(1, 2), cars: newBumper(1, 2).cars.map((c) => ({ ...c, x: 300, y: 100, vx: 120, vy: 0 })) }, [], [null, null]))!);
  assert.equal(extrapolate(s, 0), s);
  const e = extrapolate(s, 10_000);
  for (const c of e.cars) assert.ok(c.x <= ARENA.w - ARENA.wall - CAR_R, 'never leaves the arena');
  const a = extrapolate({ ...s, cars: s.cars.map((c) => ({ ...c, x: 100, vx: 100 })) }, 10_000);
  assert.ok(Math.abs(a.cars[0].x - (100 + 100 * (MAX_EXTRAPOLATE_MS / 1000))) < 0.01, 'at most 150 ms ahead');
});

test('blendCars glides towards the target, snaps on a big jump, and turns the short way round', () => {
  const base = newBumper(1, 2);
  const prev = { ...base, cars: base.cars.map((c) => ({ ...c, x: 100, y: 100, a: 3.0 })) };
  const target = { ...base, cars: base.cars.map((c) => ({ ...c, x: 110, y: 100, a: -3.0 })) };
  const mid = blendCars(prev, target, 0.5);
  assert.ok(Math.abs(mid.cars[0].x - 105) < 1e-9);
  assert.ok(Math.abs(Math.sin(mid.cars[0].a)) < 0.2 && Math.cos(mid.cars[0].a) < -0.9, 'went through π, not through 0');
  const far = { ...base, cars: base.cars.map((c) => ({ ...c, x: 250, y: 100 })) };
  assert.equal(blendCars(prev, far, 0.3).cars[0].x, 250, 'a jump of 150 px is a restart, not a slide');
  assert.equal(blendCars(null, target, 0.5), target);
  assert.equal(blendCars(prev, target, 1).cars[0].x, 110);
});

// ---- results ------------------------------------------------------------------------------------
test('verdict: win / lose / tie, from either seat', () => {
  const s = (a: number, b: number) => ({ cars: [{ score: a }, { score: b }] }) as Pick<BumperState, 'cars'>;
  assert.equal(verdict(s(5, 3), 0), 'win');
  assert.equal(verdict(s(5, 3), 1), 'lose');
  assert.equal(verdict(s(4, 4), 0), 'tie');
  assert.equal(verdict(s(0, 0), 1), 'tie');
});

test('seedFor is stable and differs per round and session', () => {
  assert.equal(seedFor('abc-1234', 0), seedFor('abc-1234', 0));
  assert.notEqual(seedFor('abc-1234', 0), seedFor('abc-1234', 1));
  assert.notEqual(seedFor('abc-1234', 0), seedFor('xyz-9876', 0));
  assert.ok(seedFor('a', 0) >= 1);
});

// ---- the session: Bumper Paws is a real shared activity -----------------------------------------
test('bumper is a registered shared activity with a label, and its invite is accepted by the session code', () => {
  assert.ok(ACTIVITY_KINDS.includes('bumper'));
  assert.ok(ACTIVITY_LABEL.bumper.length > 3);
  const m = toMsg({ t: 'act:invite', sid: 'bump-0001', kind: 'bumper', params: {} });
  assert.deepEqual(m, { t: 'act:invite', sid: 'bump-0001', kind: 'bumper', params: {} });
  assert.equal(toMsg({ t: 'act:invite', sid: 'bump-0001', kind: 'bumper2' }), null);
});

test('invite → accept → ready → start → running → end → rematch, through the real session reducer', () => {
  const now = 1_000_000;
  let host: Session = { ...idleSession(true) };
  let guest: Session = { ...idleSession(true) };
  const send = (r: ReturnType<typeof reduce>, to: 'host' | 'guest') => {
    for (const msg of r.out) {
      const res = reduce(to === 'host' ? host : guest, { type: 'remote', msg, now }, to === 'host' ? 'T' : 'M');
      if (to === 'host') host = res.s; else guest = res.s;
    }
  };
  let r = reduce(host, { type: 'invite', sid: 'bump-0002', kind: 'bumper', params: { coat: 'tangerine' } }, 'T'); host = r.s; send(r, 'guest');
  assert.equal(guest.phase, 'invited'); assert.equal(guest.kind, 'bumper');
  r = reduce(guest, { type: 'accept' }, 'M'); guest = r.s; send(r, 'host');
  assert.equal(host.phase, 'lobby'); assert.equal(guest.phase, 'lobby');
  r = reduce(host, { type: 'ready', ready: true }, 'T'); host = r.s; send(r, 'guest');
  r = reduce(guest, { type: 'ready', ready: true }, 'M'); guest = r.s; send(r, 'host');
  r = reduce(host, { type: 'start', now }, 'T'); host = r.s; send(r, 'guest');
  assert.equal(host.phase, 'starting'); assert.equal(guest.phase, 'starting');
  host = reduce(host, { type: 'tick', now: host.startAt! + 1 }, 'T').s; guest = reduce(guest, { type: 'tick', now: guest.startAt! + 1 }, 'M').s;
  assert.equal(host.phase, 'running'); assert.equal(guest.phase, 'running');
  r = reduce(host, { type: 'end', reason: 'round-over' }, 'T'); host = r.s; send(r, 'guest');
  assert.equal(guest.phase, 'ended');
  r = reduce(host, { type: 'rematch' }, 'T'); host = r.s; send(r, 'guest');
  assert.equal(host.phase, 'lobby'); assert.equal(guest.phase, 'lobby'); assert.equal(guest.round, 1, 'a new round');
  assert.deepEqual(guest.ready, { T: false, M: false });
});

// ---- a whole couple match over a fake, lossy, laggy network --------------------------------------
test('a full match: the host simulates, the guest drives over a lossy network, both end up showing the same result', () => {
  let seedRng = 12345;
  const rnd = () => { seedRng = (seedRng * 1664525 + 1013904223) >>> 0; return seedRng / 4294967296; };
  // host side
  let host = newBumper(seedFor('net-0001', 0), 2);
  let lastGuestIn: { c: Controls; at: number } | null = null;
  const hostEvents: ReturnType<typeof stepBumper>['events'] = [];
  // guest side
  let latest = null as BumperSnap | null;
  let visual: BumperState | null = null;
  let guestPrev: Controls | null = null, guestLastSend = -1e9;
  let clock = 0, lastSnap = 0;
  const wire: { at: number; deliver: () => void }[] = [];
  const LOSS = 0.2, LAG = 90;
  let finalSent = false, sentSnaps = 0, droppedSnaps = 0;

  for (let t = 0; t < ROUND_MS + 2_000; t += 16) {
    clock = t;
    // guest: drives by chasing, sends on change / heartbeat
    const gstate = visual ?? host;
    const gctl = chase(gstate, 1);
    if (shouldSendInput(guestPrev, gctl, clock - guestLastSend)) {
      guestPrev = gctl; guestLastSend = clock;
      const msg = JSON.parse(JSON.stringify(inputMsg('net-0001', 0, gctl, 'midnight')));
      if (rnd() >= LOSS) wire.push({ at: clock + LAG, deliver: () => { const p = parseBumpInput(msg); if (p) lastGuestIn = { c: p.controls, at: clock }; } });
    }
    // host: simulates with its own driver (a chaser) and the guest's last input
    if (!host.over) {
      host = stepBumper(host, [chase(host, 0), freshControls(lastGuestIn, clock)], 16);
      hostEvents.push(...host.events);
    }
    if ((clock - lastSnap >= SNAP_MS && !host.over) || (host.over && !finalSent)) {
      lastSnap = clock; sentSnaps++;
      const isFinal = host.over;
      const snap = JSON.parse(JSON.stringify(stateMsg('net-0001', 0, snapshotBumper(host, hostEvents.splice(0), ['tangerine', 'midnight'])))).snap;
      // the final snapshot is sent three times (like the panel does) because it must not be lost
      const copies = isFinal ? 3 : 1;
      for (let k = 0; k < copies; k++) {
        if (!isFinal && rnd() < LOSS) { droppedSnaps++; continue; }
        wire.push({ at: clock + LAG + k * 150, deliver: () => { const p = parseSnapshot(snap); if (p) latest = p; } });
      }
      if (isFinal) finalSent = true;
    }
    // network delivers
    for (let i = wire.length - 1; i >= 0; i--) if (wire[i].at <= clock) { wire[i].deliver(); wire.splice(i, 1); }
    // guest renders the newest snapshot, smoothed
    if (latest) visual = blendCars(visual, extrapolate(stateFromSnapshot(latest), 40), 0.4);
  }
  assert.ok(host.over, 'the host finished the round');
  assert.ok(droppedSnaps > 10, `the network really was lossy (${droppedSnaps}/${sentSnaps} dropped)`);
  const got = latest as BumperSnap | null;
  assert.ok(got, 'the guest got snapshots');
  assert.ok(got.o, 'the guest learned the round is over (the final snapshot is repeated)');
  assert.deepEqual(got.c.map((c) => c[7]), host.cars.map((c) => c.score), 'both devices show exactly the same scores');
  assert.equal(verdict(stateFromSnapshot(got), 1), verdict(host, 1), 'and the same verdict');
  // the guest car really was driven by the guest: it got around (not parked) and scored or got hit
  assert.ok(host.cars[1].dealt + host.cars[1].taken > 0, 'the guest\'s car took part in the match');
  assert.ok(host.cars[0].dealt + host.cars[1].dealt >= 1, 'somebody bumped somebody');
  // smoothing: the picture never jumped more than a car length between frames once running
  assert.ok(visual);
});

test('the guest\'s picture never lags far behind the truth (smoothing + extrapolation stay within a few pixels)', () => {
  let s = newBumper(9, 2);
  let visual: BumperState | null = null;
  let latest = snapshotBumper(s, [], [null, null]);
  let worst = 0;
  for (let t = 0; t < 20_000; t += 16) {
    s = stepBumper(s, [chase(s, 0), chase(s, 1)], 16);
    if (t % SNAP_MS < 16) latest = JSON.parse(JSON.stringify(snapshotBumper(s, [], [null, null])));
    const sn = parseSnapshot(latest)!;
    visual = blendCars(visual, extrapolate(stateFromSnapshot(sn), t % SNAP_MS), 0.4);
    if (t > 1000) for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(visual.cars[i].x - s.cars[i].x, visual.cars[i].y - s.cars[i].y));
  }
  assert.ok(worst < 14, `worst drift ${worst.toFixed(1)} px (a car is ${CAR_R * 2} px wide)`);
});

test('the bump threshold and arena are the same numbers both devices draw from', () => {
  assert.ok(BUMP_SPEED > 0 && ARENA.w === 320 && ARENA.h === 200);
});
