/**
 * Gates A, B, C — exclusive seats. Pure rules (net/occupancy.ts, world/seatClaims.ts, world/seating.ts, city/funfair.ts) and a
 * multi-client simulation over the REAL town-presence code with an in-memory channel. The same scenarios were reproduced and fixed
 * in two real browser tabs (tests/browser/*.py); this file is what runs in CI.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_COATS } from '../src/pawville/appearance.ts';
import { RIDE_IDS, RIDE_SEATS, FAIR_LAYOUT, rideClaim, seatPose, startRide, stepRide, pickSeat, abortRide, requestLeave } from '../src/pawville/city/funfair.ts';
import { PROTOCOL_VERSION, applySnapshot, compactSnapshot, createSendGate, sanitizeSnapshot, snapshotsFromPresence, type PlayerSnapshot, type RemoteCat } from '../src/pawville/net/presenceProtocol.ts';
import { occupancy, outranks, pickFreeSeat, sanitizeClaim, seatKey, seatsTaken, lostSeat, claimSig, type SeatClaim } from '../src/pawville/net/occupancy.ts';
import { startTownPresence, type ChannelLike } from '../src/pawville/net/townPresence.ts';
import { renderCatFrame } from '../src/pawville/render/catSprites.ts';
import { SEAT_X_OFFSETS, seatSlots } from '../src/pawville/world/seating.ts';
import { keepSeat, releaseSeat, takeSeat, takenSlots, type SeatLive, type Slot } from '../src/pawville/world/seatClaims.ts';
import { BENCHES, benchFacing, benchSeatLift, benchSeats } from '../src/pawville/world/townMap.ts';
import { rasterFactory } from '../scripts/preview/raster.ts';

const claim = (id: string, seat: number, at: number, phase: SeatClaim['phase'] = 'seated', kind: SeatClaim['kind'] = 'seat'): SeatClaim => ({ kind, id, seat, phase, at });
const WORLD = { w: 768, h: 864 };
const snap = (id: string, x = 100, y = 100, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({ v: PROTOCOL_VERSION, id, name: id, cat: 'T', coat: 'tangerine', accessory: 'none', extra: 'none', x, y, facing: 'down', moving: false, pose: 'stand', lift: 0, emote: null, emoteAge: 0, emoteSeq: 0, run: false, pair: null, region: 'town', claim: null, ...extra });

// ------------------------------------------------------------------------------------------------ the rules
test('seats: claims are validated (hostile input is dropped) and survive the snapshot round trip; older payloads without a claim still work', () => {
  assert.deepEqual(sanitizeClaim(claim('town:bench-0', 1, 5)), claim('town:bench-0', 1, 5));
  for (const bad of [null, 3, {}, { ...claim('x', 0, 1), kind: 'boat' }, { ...claim('x', 0, 1), id: '<script>' }, { ...claim('x', 0, 1), id: 'a'.repeat(80) }, { ...claim('x', -1, 1) }, { ...claim('x', 99, 1) }, { ...claim('x', 1.5, 1) }, { ...claim('x', 0, 1), phase: 'flying' }, { ...claim('x', 0, 1), at: NaN }, { ...claim('x', 0, -4) }]) assert.equal(sanitizeClaim(bad), null);
  const c = claim('funfair:x', 2, 99, 'riding', 'ride');
  const wire = JSON.parse(JSON.stringify(compactSnapshot(snap('cat_abcdef12', 10, 20, { claim: c }))));
  assert.deepEqual(sanitizeSnapshot(wire, WORLD)!.claim, c);
  const old = { ...wire }; delete old.claim; assert.equal(sanitizeSnapshot(old, WORLD)!.claim, null, 'a v4 client that never heard of claims');
  assert.equal(sanitizeSnapshot({ ...wire, claim: { kind: 'seat', id: '../../x', seat: 0, phase: 'seated', at: 1 } }, WORLD)!.claim, null);
  assert.equal(PROTOCOL_VERSION, 4, 'additive field: no version bump, so older clients keep accepting our snapshots');
  // lift: a Cloud Swing rider is 31 px up (+ the hop arc); the old clamp of 16 sank remote riders into their chairs
  assert.equal(sanitizeSnapshot({ ...wire, lift: 31 }, WORLD)!.lift, 31);
  assert.equal(sanitizeSnapshot({ ...wire, lift: 900 }, WORLD)!.lift, 40);
});

test('seats: a claim change is broadcast at once (the send gate), and stays unchanged otherwise', () => {
  const gate = createSendGate(100, 4000);
  assert.ok(gate(0, snap('cat_aaaaaa')));
  assert.ok(!gate(200, snap('cat_aaaaaa')), 'nothing changed');
  assert.ok(gate(400, snap('cat_aaaaaa', 100, 100, { claim: claim('town:bench-0', 0, 5) })), 'sat down');
  assert.ok(!gate(600, snap('cat_aaaaaa', 100, 100, { claim: claim('town:bench-0', 0, 5) })));
  assert.ok(gate(800, snap('cat_aaaaaa', 100, 100, { claim: claim('town:bench-0', 1, 7) })), 'moved to the other seat');
  assert.ok(gate(1000, snap('cat_aaaaaa')), 'stood up');
  assert.notEqual(claimSig(claim('a', 0, 1)), claimSig(claim('a', 0, 2)));
});

test('seats: the conflict rule is a TOTAL order — for any two claimants exactly one outranks the other, identically on every client', () => {
  const ids = ['cat_a', 'cat_b', 'cat_c', 'cat_zz'];
  for (const a of ids) for (const b of ids) for (const [ta, tb] of [[1, 2], [2, 1], [5, 5]]) {
    if (a === b) continue;
    const x = outranks({ uid: a, at: ta }, { uid: b, at: tb }), y = outranks({ uid: b, at: tb }, { uid: a, at: ta });
    assert.notEqual(x, y, `${a}@${ta} vs ${b}@${tb}`);
  }
  assert.ok(outranks({ uid: 'cat_z', at: 1 }, { uid: 'cat_a', at: 2 }), 'earlier beats id');
  assert.ok(outranks({ uid: 'cat_a', at: 3 }, { uid: 'cat_b', at: 3 }), 'a tie goes to the smaller id');
});

test('seats: occupancy lists only OTHER players in THIS place, the earliest claimant holds a contested seat, a partner listed twice counts once', () => {
  const occ = occupancy([
    { id: 'cat_b', claim: claim('town:bench-0', 0, 10) },
    { id: 'cat_c', claim: claim('town:bench-0', 0, 5) },              // earlier: holds the seat
    { id: 'cat_d', claim: claim('town:bench-0', 1, 8), region: 'city' }, // another place
    { id: 'partner', uid: 'cat_e', claim: claim('town:bench-1', 0, 3) },
    { id: 'cat_e', claim: claim('town:bench-1', 0, 3) },             // the same partner again (pair link + plaza)
    { id: 'cat_f', claim: null },
  ], 'town');
  assert.equal(occ.size, 2);
  assert.equal(occ.get('seat:town:bench-0:0')!.uid, 'cat_c');
  assert.equal(occ.get('seat:town:bench-1:0')!.uid, 'cat_e');
  assert.deepEqual([...seatsTaken(occ, 'seat', 'town:bench-0')], [0]);
  assert.equal(seatKey(claim('town:bench-0', 0, 1)), 'seat:town:bench-0:0');
});

test('seats: pick the usual side if free, else the other free seat, else none', () => {
  assert.equal(pickFreeSeat(2, new Set(), 0), 0); assert.equal(pickFreeSeat(2, new Set(), 1), 1);
  assert.equal(pickFreeSeat(2, new Set([0]), 0), 1, 'two Tangerine cats: the second takes the other seat'); assert.equal(pickFreeSeat(2, new Set([1]), 1), 0);
  assert.equal(pickFreeSeat(2, new Set([0, 1]), 0), null); assert.equal(pickFreeSeat(1, new Set([0]), 0), null);
  assert.equal(pickFreeSeat(3, new Set([0, 2]), -1), 1);
});

// ------------------------------------------------------------------------------------------------ benches: two clients, simulated
const slots2: Slot[] = benchSeats(BENCHES[0]).map((s, i) => ({ index: i, x: s.x, y: s.y, lift: benchSeatLift(BENCHES[0]), facing: benchFacing(BENCHES[0], i === 0 ? 0 : 1) }));
/** Two local clients that see each other's claims (a perfect network, delivered between ticks). */
function world(ids: string[]) {
  const lives = new Map<string, SeatLive>(ids.map((id) => [id, { seat: null, claim: null, selfId: id, occupied: new Map() }]));
  const gone = new Set<string>();
  const deliver = () => { for (const [me, l] of lives) l.occupied = occupancy([...lives].filter(([id]) => id !== me && !gone.has(id)).map(([id, o]) => ({ id, claim: o.seat ? o.claim : null })), 'town'); };
  return { lives, gone, deliver, L: (id: string) => lives.get(id)! };
}

test('benches: one cat alone, then two cats side by side on SEPARATE seats (even when both are Tangerine and both prefer the left seat)', () => {
  const w = world(['cat_a', 'cat_b']);
  const a = takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, 100)!; w.deliver();
  assert.equal(a.index, 0); assert.equal(w.L('cat_a').seat!.x, slots2[0].x);
  const b = takeSeat(w.L('cat_b'), 'town:bench-0', slots2, 0, 400)!; w.deliver();   // same preference, seat 0 is taken
  assert.equal(b.index, 1, 'the second cat takes the OTHER seat'); assert.equal(w.L('cat_b').seat!.x, slots2[1].x);
  assert.ok(w.L('cat_b').seat!.x - w.L('cat_a').seat!.x >= 18, 'at least a sitting cat\'s width apart');
  assert.equal(w.L('cat_a').seat!.y, w.L('cat_b').seat!.y); assert.equal(w.L('cat_a').seat!.lift, w.L('cat_b').seat!.lift);
  // a third cat finds the bench full, and nobody is disturbed
  const c = world(['cat_a', 'cat_b', 'cat_c']);
  takeSeat(c.L('cat_a'), 'town:bench-0', slots2, 0, 1); takeSeat(c.L('cat_b'), 'town:bench-0', slots2, 1, 2); c.deliver();
  assert.equal(takeSeat(c.L('cat_c'), 'town:bench-0', slots2, 0, 3), null); assert.equal(c.L('cat_c').seat, null);
});

test('benches: both stand up independently — leaving frees ONLY your seat and never moves the other cat; repeated sit/stand never accumulates state', () => {
  const w = world(['cat_a', 'cat_b']);
  takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, 1); w.deliver(); takeSeat(w.L('cat_b'), 'town:bench-0', slots2, 0, 2); w.deliver();
  const bBefore = { ...w.L('cat_b').seat! }, bClaim = { ...w.L('cat_b').claim! };
  releaseSeat(w.L('cat_a')); w.deliver();           // the FIRST occupant leaves while the second stays
  assert.equal(w.L('cat_a').seat, null); assert.equal(w.L('cat_a').claim, null);
  assert.deepEqual(w.L('cat_b').seat, bBefore, 'the other cat was not moved'); assert.deepEqual(w.L('cat_b').claim, bClaim);
  assert.equal(keepSeat(w.L('cat_b'), slots2, 5), 'ok', 'and is not disturbed by the vacancy');
  assert.equal(takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, 6)!.index, 0, 'the freed seat can be taken again');
  w.deliver(); releaseSeat(w.L('cat_b')); w.deliver();   // now the SECOND occupant leaves while the first stays
  assert.equal(w.L('cat_a').seat?.x, slots2[0].x);
  releaseSeat(w.L('cat_a')); w.deliver();
  assert.equal(takenSlots(w.L('cat_b'), 'town:bench-0').size, 0, 'the bench is available again once both stood');
  for (let i = 0; i < 50; i++) { takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, i); w.deliver(); releaseSeat(w.L('cat_a')); w.deliver(); }
  assert.equal(w.L('cat_a').claim, null); assert.equal(w.L('cat_a').occupied!.size, 0);
  // releasing when you are not seated on a bench never touches a ride claim
  const l: SeatLive = { seat: null, claim: claim('ferris', 3, 1, 'riding', 'ride') };
  releaseSeat(l); assert.equal(l.claim!.kind, 'ride');
});

test('benches: two cats sit down in the SAME network round trip — everyone resolves it the same way and nobody ends up on top of the other', () => {
  for (const [ta, tb] of [[100, 100], [100, 101], [101, 100]]) {
    const w = world(['cat_a', 'cat_b']);
    // both decide before either has heard of the other (occupied is still empty on both)
    takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, ta); takeSeat(w.L('cat_b'), 'town:bench-0', slots2, 0, tb);
    assert.equal(w.L('cat_a').claim!.seat, w.L('cat_b').claim!.seat, 'the race: both picked seat 0');
    w.deliver();
    const ra = keepSeat(w.L('cat_a'), slots2, 200), rb = keepSeat(w.L('cat_b'), slots2, 200);
    assert.deepEqual([ra, rb].sort(), ['moved', 'ok'], `exactly one yields (${ta}/${tb})`);
    const loser = ra === 'moved' ? 'cat_a' : 'cat_b', winner = loser === 'cat_a' ? 'cat_b' : 'cat_a';
    assert.equal(outranks({ uid: winner, at: winner === 'cat_a' ? ta : tb }, { uid: loser, at: loser === 'cat_a' ? ta : tb }), true, 'the earlier claim (or the smaller id) kept the seat');
    w.deliver();
    assert.notEqual(w.L('cat_a').seat!.x, w.L('cat_b').seat!.x, 'different seats now');
    assert.equal(keepSeat(w.L('cat_a'), slots2, 300), 'ok'); assert.equal(keepSeat(w.L('cat_b'), slots2, 300), 'ok');
  }
  // a bench with ONE seat: the loser is told it is full
  const one = [slots2[0]];
  const w = world(['cat_a', 'cat_b']);
  takeSeat(w.L('cat_a'), 'town:x', one, 0, 1); takeSeat(w.L('cat_b'), 'town:x', one, 0, 2); w.deliver();
  assert.deepEqual([keepSeat(w.L('cat_a'), one, 9), keepSeat(w.L('cat_b'), one, 9)], ['ok', 'full']);
});

test('benches: a player who disconnects while seated frees the seat (no stale lock), and the survivor is never moved', () => {
  const w = world(['cat_a', 'cat_b', 'cat_c']);
  takeSeat(w.L('cat_a'), 'town:bench-0', slots2, 0, 1); w.deliver(); takeSeat(w.L('cat_b'), 'town:bench-0', slots2, 0, 2); w.deliver();
  w.gone.add('cat_a'); w.deliver();                                     // A's tab closes; presence drops them
  assert.equal(takenSlots(w.L('cat_c'), 'town:bench-0').size, 1, 'only B is still sitting');
  const c = takeSeat(w.L('cat_c'), 'town:bench-0', slots2, 0, 3)!; assert.equal(c.index, 0, 'C takes the seat A left behind');
  assert.equal(w.L('cat_b').seat!.x, slots2[1].x, 'B did not move');
});

// ------------------------------------------------------------------------------------------------ seats: geometry
const { factory } = rasterFactory();
const opaque = (k: Parameters<typeof renderCatFrame>[1]) => [...(renderCatFrame(factory as never, k) as unknown as { __r: { px: Map<string, string> } }).__r.px.keys()].map((p) => p.split(',').map(Number) as [number, number]);
function overlap(a: [number, number][], b: [number, number][], dx: number): number { const A = new Set(a.map(([x, y]) => `${x},${y}`)); let n = 0; for (const [x, y] of b) if (A.has(`${x + dx},${y}`)) n++; return n; }

test('benches: two sitting cats do not overlap AT ALL at the seat spacing — in every coat and every way they face (measured pixel by pixel)', () => {
  let worst = 0;
  for (const coat of ALL_COATS) for (const [fa, fb] of [['right', 'left'], ['down', 'down'], ['up', 'up'], ['left', 'right']] as const) {
    const A = opaque({ coat, accessory: 'none', extra: 'none', facing: fa, frame: 0, moving: false, pose: 'sit' });
    const B = opaque({ coat, accessory: 'none', extra: 'none', facing: fb, frame: 0, moving: false, pose: 'sit' });
    const [s0, s1] = benchSeats({ x: 330, y: 272 });
    worst = Math.max(worst, overlap(A, B, s1.x - s0.x));
  }
  assert.equal(worst, 0, 'no opaque pixel of one cat lands on the other');
  // and the OLD 12 px spacing really did overlap (the reported bug)
  const T = opaque({ coat: 'tangerine', accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'sit' });
  assert.ok(overlap(T, T, 12) >= 20, 'at 12 px the cats overlapped by dozens of pixels');
});

test('benches: every bench has two distinct, level seats on it; benches that face the viewer draw their cats in front, those seen from behind keep them behind', () => {
  for (const b of BENCHES) {
    const [l, r] = benchSeats(b);
    assert.equal(r.x - l.x, 18); assert.equal(l.y, r.y); assert.ok(Math.abs((l.x + r.x) / 2 - b.x) < 0.01, 'centred on the bench');
    assert.equal(l.y > b.y, b.faces !== 'up', `${b.id}: draw order`);
    assert.ok(benchSeatLift(b) > 0);
  }
});

test('seating: every multi-seat piece of furniture offers separate seats (a bench 2, a gazebo 2, a window seat 2, a blanket 2, a single chair 1)', () => {
  for (const [kind, n] of [['bench', 2], ['parkbench', 2], ['gazebo', 2], ['windowseat', 2], ['picnicblanket0', 2], ['cafetable', 1]] as const) {
    const s = seatSlots({ x: 200, y: 312 }, [{ kind, x: 200, y: 300 }]);
    assert.equal(s.length, n, kind); assert.deepEqual(s.map((x) => x.index), [...Array(n).keys()]);
    if (n === 2) { assert.ok(s[1].x - s[0].x >= 18, `${kind}: seats far enough apart`); assert.equal(s[0].y, s[1].y); assert.equal(s[0].lift, s[1].lift); }
    assert.ok(s.every((x) => x.y > 300), `${kind}: drawn in front of the prop's baseline (not sunk)`);
  }
  assert.ok(Object.values(SEAT_X_OFFSETS).every((o) => o.length >= 1));
  assert.equal(seatSlots({ x: 5, y: 5 }, []).length, 1, 'no furniture nearby: a single fallback seat');
});

// ------------------------------------------------------------------------------------------------ rides
test('rides: every ride seat has its OWN anchor — no two seats of any ride ever coincide, at any moment of the cycle', () => {
  for (const ride of RIDE_IDS) {
    let minD = Infinity;
    for (let ms = 0; ms < 60_000; ms += 250) {
      const P = Array.from({ length: RIDE_SEATS }, (_, i) => seatPose(ride, FAIR_LAYOUT[ride], i, ms));
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) minD = Math.min(minD, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y));
    }
    assert.ok(minD >= 5, `${ride}: closest two seats are ${minD.toFixed(1)} px apart on the ground (the rides are packed by design: 8 seats on a small ring)`);
  }
});

test('rides: the claim is derived from the session — constant seat and time from queueing to hopping out, gone once done', () => {
  let s = startRide('ferris', 3, 1000);
  assert.deepEqual(rideClaim(s), { kind: 'ride', id: 'ferris', seat: 3, phase: 'queued', at: 1000 });
  s = { ...s, phase: 'hopping-in' }; assert.equal(rideClaim(s)!.phase, 'queued');
  s = { ...s, phase: 'riding' }; assert.equal(rideClaim(s)!.phase, 'riding'); assert.equal(rideClaim({ ...s, leaving: true })!.phase, 'riding', 'still riding until the hop out');
  s = { ...s, phase: 'hopping-out' }; assert.equal(rideClaim(s)!.phase, 'leaving');
  assert.equal(rideClaim(abortRide(s)), null); assert.equal(rideClaim(null), null);
  assert.equal(rideClaim(startRide('swing', 7, 5))!.at, 5);
});

test('rides: two players on one ride resolve to different seats; the loser re-queues for another; a full ride says so', () => {
  const ms = 12_345;
  // both pick "the free seat that arrives first": the SAME seat
  const first = pickSeat('carousel', ms, new Set())!, again = pickSeat('carousel', ms, new Set())!;
  assert.equal(first.seat, again.seat, 'the race: identical picks');
  const winner = { uid: 'cat_a', claim: rideClaim(startRide('carousel', first.seat, ms))! }, loser = { uid: 'cat_b', claim: rideClaim(startRide('carousel', first.seat, ms + 40))! };
  const occ = occupancy([{ id: winner.uid, claim: winner.claim, region: 'funfair' }, { id: loser.uid, claim: loser.claim, region: 'funfair' }], 'funfair');
  assert.equal(lostSeat(loser, occ), true); assert.equal(lostSeat(winner, occ), false);
  const taken = seatsTaken(occ, 'ride', 'carousel'); taken.add(first.seat);
  const next = pickSeat('carousel', ms, taken)!;
  assert.notEqual(next.seat, first.seat, 'the loser gets another seat');
  const all = new Set<number>(Array.from({ length: RIDE_SEATS }, (_, i) => i));
  assert.equal(pickSeat('carousel', ms, all), null, 'every seat taken = the ride is full');
  for (const ride of RIDE_IDS) assert.ok(pickSeat(ride, ms, new Set())!.seat >= 0);
});

test('rides: leaving or an interrupted ride always ends in a safe, controllable state (every ride, every phase)', () => {
  for (const ride of RIDE_IDS) {
    // board and ride to the end: the cat hops out on the platform with the session done
    let s = startRide(ride, pickSeat(ride, 0, new Set())!.seat, 0), now = 0, exited = false;
    for (let i = 0; i < 4000 && s.phase !== 'done'; i++) { now += 50; const r = stepRide(s, FAIR_LAYOUT[ride], now); s = r.session; if (r.event === 'exited') exited = true; }
    assert.equal(s.phase, 'done', `${ride}: the ride finishes`); assert.ok(exited, `${ride}: and the rider is put back down`);
    // interrupted at any moment: abort is instant and idempotent
    for (const phase of ['queued', 'hopping-in', 'riding', 'hopping-out'] as const) {
      const a = abortRide({ ...startRide(ride, 0, 0), phase }); assert.equal(a.phase, 'done'); assert.equal(rideClaim(a), null); assert.deepEqual(stepRide(a, FAIR_LAYOUT[ride], 1).pose, null);
    }
    // asking to leave while queued ends at once; while riding it waits for the next stop
    assert.equal(stepRide(requestLeave(startRide(ride, 0, 0)), FAIR_LAYOUT[ride], 10).event, 'exited');
  }
});

// ------------------------------------------------------------------------------------------------ the real presence code, in-memory
class Hub {
  state = new Map<string, Record<string, unknown>>(); subs: { id: string; sync: () => void; move: (p: unknown) => void }[] = [];
  channel(id: string): ChannelLike {
    const hub = this; const handlers: { sync?: () => void; move?: (m: { payload: unknown }) => void } = {};
    const ch: ChannelLike = {
      on(type, _filter, cb) { if (type === 'presence') handlers.sync = cb as () => void; else handlers.move = cb as never; return ch; },
      subscribe(cb) { hub.subs.push({ id, sync: () => handlers.sync?.(), move: (p) => handlers.move?.({ payload: p }) }); queueMicrotask(() => { cb?.('SUBSCRIBED'); }); return ch; },
      async track(p) { hub.state.set(id, p); hub.subs.forEach((s) => s.sync()); return 'ok'; },
      async send(m) { hub.subs.filter((s) => s.id !== id).forEach((s) => s.move(m.payload)); return 'ok'; },
      presenceState() { const o: Record<string, unknown[]> = {}; for (const [k, v] of hub.state) o[k] = [v]; return o; },
      async unsubscribe() { hub.state.delete(id); hub.subs = hub.subs.filter((s) => s.id !== id); hub.subs.forEach((s) => s.sync()); return 'ok'; },
    };
    return ch;
  }
}
const tick = () => new Promise((r) => setTimeout(r, 15));

test('presence: a seat claim travels to everybody and frees itself when its owner leaves (real town-presence code, in-memory channel — NOT a live server)', async () => {
  const hub = new Hub(); let t = 0; const now = () => t;
  const start = (id: string, extra: Partial<PlayerSnapshot> = {}) => startTownPresence({ self: snap(id, 100, 100, extra), world: WORLD, factory: async (_t, key) => hub.channel(key), now });
  const A = start('cat_aaaaaa'), B = start('cat_bbbbbb'), C = start('cat_cccccc');
  await tick(); await tick();
  t += 500; A.update(snap('cat_aaaaaa', 100, 100, { pose: 'sit', claim: claim('town:bench-0', 0, 50) })); await tick();
  const seen = (P: { remotes: Map<string, RemoteCat> }) => occupancy(P.remotes.values(), 'town');
  assert.equal(seen(B).get('seat:town:bench-0:0')!.uid, 'cat_aaaaaa', 'B sees A holding seat 0');
  assert.equal(seen(C).get('seat:town:bench-0:0')!.uid, 'cat_aaaaaa', 'and so does C — not only a paired partner');
  assert.equal(seen(A).size, 0, 'A never lists itself as an occupant');
  t += 500; B.update(snap('cat_bbbbbb', 100, 100, { pose: 'sit', claim: claim('town:bench-0', 1, 90) })); await tick();
  assert.deepEqual([...seatsTaken(seen(C), 'seat', 'town:bench-0')].sort(), [0, 1], 'C sees the bench full');
  assert.equal(B.remotes.get('cat_aaaaaa')!.claim!.seat, 0, 'B still sees A on seat 0 — B\'s claim did not change A\'s');
  await A.stop(); await tick();                         // A disconnects while seated
  assert.deepEqual([...seatsTaken(seen(C), 'seat', 'town:bench-0')], [1], 'A\'s seat is free again, B\'s is untouched');
  assert.equal(C.remotes.has('cat_aaaaaa'), false);
  // A reconnects with the same id: gets its identity back, and a fresh claim is needed to hold a seat again
  const A2 = start('cat_aaaaaa'); await tick(); await tick();
  assert.equal(B.remotes.get('cat_aaaaaa')?.claim ?? null, null, 'the reconnected cat holds nothing until it sits again');
  assert.ok(A2.remotes.has('cat_bbbbbb') && A2.remotes.has('cat_cccccc'), 'and sees the others again');
  for (const p of [B, C, A2]) await p.stop();
});

test('presence: a late joiner sees seats that were taken before they arrived (the claim is part of the tracked presence state)', () => {
  const state = { cat_aaaaaa: [{ ...snap('cat_aaaaaa', 5, 5, { pose: 'sit', claim: claim('town:bench-2', 1, 7) }) }], cat_bbbbbb: [{ ...snap('cat_bbbbbb') }] };
  const snaps = snapshotsFromPresence(state, 'cat_new0000', WORLD);
  const remotes = new Map<string, RemoteCat>(); for (const s of snaps) applySnapshot(remotes, s, 0);
  assert.equal(occupancy(remotes.values(), 'town').get('seat:town:bench-2:1')!.uid, 'cat_aaaaaa');
});

test('ownership: applying remote snapshots can never change who the LOCAL cat is — remotes are render-only copies keyed by their own id', () => {
  const remotes = new Map<string, RemoteCat>();
  applySnapshot(remotes, snap('cat_bbbbbb', 10, 10, { name: 'Midnight', cat: 'M', coat: 'midnight' }), 0);
  applySnapshot(remotes, snap('cat_cccccc', 20, 20), 0);
  // a hostile peer replays OUR id: presence ignores our own echo (tests/pawvilleMultiplayer.test.ts), and a snapshot never carries control
  assert.deepEqual([...remotes.keys()].sort(), ['cat_bbbbbb', 'cat_cccccc']);
  const keys = Object.keys(remotes.get('cat_bbbbbb')!);
  for (const forbidden of ['controls', 'input', 'keys', 'body', 'isSelf', 'owner']) assert.ok(!keys.includes(forbidden), `a remote cat has no ${forbidden}`);
  // moving one remote never touches another
  applySnapshot(remotes, snap('cat_bbbbbb', 300, 300), 1);
  assert.equal(remotes.get('cat_cccccc')!.target.x, 20);
});
