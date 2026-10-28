import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRACE_MS, canStart, idleSession, reduce, toMsg, type Event, type Msg, type Session } from '../src/pawville/couple/activitySession.ts';
import { codeFromInput, normalizeInviteCode, pairErrorText, randomInviteCode } from '../src/pawville/couple/pairModel.ts';
import { DemoPairTransport, parseMessage, type BroadcastLike } from '../src/pawville/couple/transport.ts';
import { BREAK_DISTANCE, holdStep, sideSpot } from '../src/pawville/couple/pawHold.ts';
import { EMOTES, emoteActive } from '../src/pawville/couple/emotes.ts';

/** Two coordinators wired together, delivering each other's messages. */
function pair() {
  let T = idleSession(true);
  let M = idleSession(true);
  const deliver = (from: 'T' | 'M', out: Msg[], now: number) => {
    for (const msg of out) {
      if (from === 'T') M = reduce(M, { type: 'remote', msg, now }, 'M').s;
      else T = reduce(T, { type: 'remote', msg, now }, 'T').s;
    }
  };
  const act = (who: 'T' | 'M', e: Event, now = 1000) => {
    const r = reduce(who === 'T' ? T : M, e, who);
    if (who === 'T') T = r.s; else M = r.s;
    deliver(who, r.out, now);
    return r;
  };
  return { act, get T() { return T; }, get M() { return M; }, set T(v: Session) { T = v; }, set M(v: Session) { M = v; } };
}

test('invite → accept → both ready → host starts → both run at the same time', () => {
  const p = pair();
  p.act('T', { type: 'invite', sid: 'sess-1', kind: 'swing' });
  assert.equal(p.T.phase, 'inviting');
  assert.equal(p.M.phase, 'invited');
  p.act('M', { type: 'accept' });
  assert.equal(p.T.phase, 'lobby');
  assert.equal(canStart(p.T, 'T'), false, 'nobody ready yet');
  p.act('T', { type: 'ready', ready: true });
  p.act('M', { type: 'ready', ready: true });
  assert.equal(canStart(p.T, 'T'), true);
  assert.equal(canStart(p.M, 'M'), false, 'only the host starts');
  p.act('T', { type: 'start', now: 5000 });
  assert.equal(p.T.startAt, 8000);
  assert.equal(p.M.startAt, 8000, 'same start time on both sides');
  p.T = reduce(p.T, { type: 'tick', now: 8000 }, 'T').s;
  p.M = reduce(p.M, { type: 'tick', now: 8000 }, 'M').s;
  assert.equal(p.T.phase, 'running');
  assert.equal(p.M.phase, 'running');
});

test('duplicate start is ignored; a start for another session or from the guest is rejected', () => {
  const p = pair();
  p.act('T', { type: 'invite', sid: 'sess-2', kind: 'pawtype' });
  p.act('M', { type: 'accept' });
  p.act('T', { type: 'ready', ready: true });
  p.act('M', { type: 'ready', ready: true });
  const first = p.act('T', { type: 'start', now: 1000 });
  const second = p.act('T', { type: 'start', now: 1500 });
  assert.equal(first.out.length, 1);
  assert.equal(second.out.length, 0, 'second start produces nothing');
  assert.equal(p.M.startAt, 4000);
  const fresh = reduce({ ...idleSession(true), sid: 'x1', host: 'T', phase: 'lobby', kind: 'swing', ready: { T: true, M: true } },
    { type: 'remote', msg: { t: 'act:start', sid: 'other', startAt: 2000, round: 0 }, now: 1000 }, 'M');
  assert.equal(fresh.s.phase, 'lobby');
  const fromGuest = reduce({ ...idleSession(true), sid: 'x1', host: 'M', phase: 'lobby', kind: 'swing' },
    { type: 'remote', msg: { t: 'act:start', sid: 'x1', startAt: 2000, round: 0 }, now: 1000 }, 'M');
  assert.equal(fromGuest.s.phase, 'lobby', "a host can't receive a start from the guest");
});

test('cancel and decline end the session on both sides', () => {
  const p = pair();
  p.act('T', { type: 'invite', sid: 'sess-3', kind: 'picnic' });
  p.act('M', { type: 'decline' });
  assert.equal(p.T.phase, 'cancelled');
  assert.equal(p.T.reason, 'declined');
  const q = pair();
  q.act('T', { type: 'invite', sid: 'sess-4', kind: 'picnic' });
  q.act('M', { type: 'accept' });
  q.act('M', { type: 'cancel' });
  assert.equal(q.T.phase, 'cancelled');
  assert.equal(q.T.reason, 'cancelled-by-partner');
});

test('partner disconnect: waits for a grace period, rejoin resumes, otherwise cancels', () => {
  let s: Session = { ...idleSession(true), sid: 'a1', host: 'T', phase: 'running', kind: 'swing' };
  s = reduce(s, { type: 'partner', present: false, now: 1000 }, 'T').s;
  assert.equal(s.phase, 'running');
  s = reduce(s, { type: 'tick', now: 1000 + GRACE_MS - 1 }, 'T').s;
  assert.equal(s.phase, 'running', 'still waiting inside the grace period');
  const rejoined = reduce(s, { type: 'partner', present: true, now: 2000 }, 'T').s;
  assert.equal(rejoined.awaySince, null);
  s = reduce(s, { type: 'tick', now: 1000 + GRACE_MS }, 'T').s;
  assert.equal(s.phase, 'cancelled');
  assert.equal(s.reason, 'partner-left');
  const invite = reduce({ ...idleSession(true), sid: 'a2', host: 'T', phase: 'inviting', kind: 'swing' }, { type: 'partner', present: false, now: 5 }, 'T').s;
  assert.equal(invite.phase, 'inviting', 'Milestone 5: a presence blip no longer erases a pending invitation');
  assert.equal(reduce(invite, { type: 'tick', now: 5 + GRACE_MS }, 'T').s.phase, 'cancelled', '…but it does close after the grace period');
});

test('cannot invite an offline partner; start blocked while partner absent; rematch resets readiness', () => {
  const off = reduce(idleSession(false), { type: 'invite', sid: 'b1', kind: 'swing' }, 'T');
  assert.equal(off.s.phase, 'idle');
  assert.equal(off.out.length, 0);
  const lobby: Session = { ...idleSession(false), sid: 'b2', host: 'T', phase: 'lobby', kind: 'boxing', ready: { T: true, M: true } };
  assert.equal(canStart(lobby, 'T'), false);
  const ended: Session = { ...idleSession(true), sid: 'b3', host: 'T', phase: 'ended', kind: 'boxing', round: 0 };
  const r = reduce(ended, { type: 'rematch' }, 'T');
  assert.equal(r.s.phase, 'lobby');
  assert.deepEqual(r.s.ready, { T: false, M: false });
  const guest = reduce({ ...ended, host: 'T' }, { type: 'remote', msg: r.out[0], now: 0 }, 'M');
  assert.equal(guest.s.phase, 'lobby');
  assert.equal(guest.s.round, 1);
});

test('simultaneous invites resolve deterministically (Tangerine wins the tie)', () => {
  const t = reduce(idleSession(true), { type: 'invite', sid: 'c1', kind: 'swing' }, 'T');
  const m = reduce(idleSession(true), { type: 'invite', sid: 'c2', kind: 'seesaw' }, 'M');
  const tAfter = reduce(t.s, { type: 'remote', msg: m.out[0], now: 0 }, 'T').s;
  const mAfter = reduce(m.s, { type: 'remote', msg: t.out[0], now: 0 }, 'M').s;
  assert.equal(tAfter.sid, 'c1');
  assert.equal(mAfter.sid, 'c1');
  assert.equal(mAfter.phase, 'invited');
});

test('message validation drops malformed or spoofed messages', () => {
  assert.equal(toMsg({ t: 'act:start', sid: 'ok-sid', startAt: 'soon', round: 0 }), null);
  assert.equal(toMsg({ t: 'act:invite', sid: 'ok-sid', kind: 'laser-tag' }), null);
  assert.equal(toMsg({ t: 'act:hack', sid: 'ok-sid' }), null);
  assert.deepEqual(toMsg({ t: 'act:ready', sid: 'ok-sid', ready: true }), { t: 'act:ready', sid: 'ok-sid', ready: true });
  assert.equal(parseMessage({ t: 'act:ready', from: 'T', at: 1 }, 'M'), null, 'a member can only speak as themselves');
  assert.equal(parseMessage({ t: 'BAD TYPE', from: 'M', at: 1 }, 'M'), null);
  assert.ok(parseMessage({ t: 'act:ready', from: 'M', at: 1 }, 'M'));
});

test('invite codes: normalisation, links, alphabet without look-alikes; friendly errors', () => {
  assert.equal(normalizeInviteCode('abc 234'), 'ABC234');
  assert.equal(normalizeInviteCode('ABC10O'), null, '1, 0 and O are excluded');
  assert.equal(codeFromInput('https://pawville.example/pair/xyz789'), 'XYZ789');
  assert.match(randomInviteCode(() => 0.5), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(pairErrorText('invite_expired'), /expired/);
  assert.match(pairErrorText('something weird'), /connection/);
});

/** In-memory BroadcastChannel hub to test the two-tab demo transport. */
function hub() {
  const subs = new Map<string, Set<(e: { data: unknown }) => void>>();
  return (name: string): BroadcastLike => {
    const mine = new Set<(e: { data: unknown }) => void>();
    if (!subs.has(name)) subs.set(name, new Set());
    return {
      postMessage(data) { for (const [, set] of subs) void set; for (const cb of subs.get(name)!) if (!mine.has(cb)) cb({ data: structuredClone(data) }); },
      addEventListener(_t, cb) { mine.add(cb); subs.get(name)!.add(cb); },
      removeEventListener(_t, cb) { mine.delete(cb); subs.get(name)!.delete(cb); },
      close() { for (const cb of mine) subs.get(name)!.delete(cb); mine.clear(); },
    };
  };
}

test('demo transport: two tabs see each other, exchange messages, and notice a goodbye', async () => {
  const make = hub();
  const a = new DemoPairTransport('T', 'ABC234', make);
  const b = new DemoPairTransport('M', 'ABC234', make);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(a.partnerOnline(), true);
  assert.equal(b.partnerOnline(), true);
  const got: string[] = [];
  b.onMessage((m) => got.push(`${m.from}:${m.t}`));
  a.send({ t: 'act:ready', sid: 'zz-1', ready: true });
  assert.deepEqual(got, ['T:act:ready']);
  await a.close();
  assert.equal(b.partnerOnline(), false);
  await b.close();
});

test('paw-holding: follows to your side, slows when stretched, releases when separated', () => {
  const partner = { x: 100, y: 100 };
  assert.deepEqual(sideSpot(partner, 'T'), { x: 87, y: 100 });
  const idle = holdStep({ x: 60, y: 100 }, partner, 'T', { x: 0, y: 0, run: false });
  assert.ok(idle.input.x > 0, 'walks towards the partner');
  const stretched = holdStep({ x: 50, y: 100 }, partner, 'T', { x: -1, y: 0, run: false });
  assert.ok(stretched.speedScale < 1, 'pulling away slows you down');
  const own = holdStep({ x: 87, y: 100 }, partner, 'T', { x: 0, y: 1, run: false });
  assert.deepEqual(own.input, { x: 0, y: 1, run: false }, 'your own input always wins');
  assert.equal(holdStep({ x: 100 + BREAK_DISTANCE + 1, y: 100 }, partner, 'T', { x: 0, y: 0, run: false }).release, true);
});

test('emotes: shared ones need range; durations end', () => {
  assert.ok(EMOTES.filter((e) => e.shared).every((e) => typeof e.range === 'number'));
  assert.equal(emoteActive(1000, 'wave', 2000), true);
  assert.equal(emoteActive(1000, 'wave', 5000), false);
});
