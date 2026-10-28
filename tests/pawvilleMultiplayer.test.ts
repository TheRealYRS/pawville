/**
 * Milestone 5 — multiplayer repair: end-to-end tests of the REAL controller, transport, presence
 * and channel-registry code against an in-memory Realtime server + pairing backend.
 *
 * The fake server reproduces the behaviours that caused the reported bugs:
 *   - realtime-js returns the EXISTING channel for a topic that is still registered (topic
 *     de-duplication) and removes channels asynchronously;
 *   - private pair channels only admit pair members (RLS on realtime.messages);
 *   - presence is keyed, broadcasts can be dropped, connections can blink.
 * The pairing backend mirrors the SQL functions (pv_create/accept/decline, pv_my_pair,
 * pv_my_pair_invite) including row locking semantics (single-threaded here) and expiry.
 *
 * These are NOT live tests against Supabase; see PAWVILLE_MULTIPLAYER_REPAIR.md for the
 * two-device acceptance checklist that still has to be run on real devices.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coupleView, townLabel } from '../src/pawville/couple/coupleView.ts';
import { PARTNER_GRACE_MS, PairController, type ControllerDeps, type PairServiceLike } from '../src/pawville/couple/pairController.ts';
import { GRACE_MS } from '../src/pawville/couple/activitySession.ts';
import { otherRole, type PairInfo, type Role } from '../src/pawville/couple/pairModel.ts';
import { SupabasePairTransport } from '../src/pawville/couple/transport.ts';
import { acquireChannel, type RealtimeClientLike } from '../src/pawville/net/channelRegistry.ts';
import { presenceChannelFactory, startTownPresence, wrapChannel, type ChannelLike } from '../src/pawville/net/townPresence.ts';
import { PROTOCOL_VERSION, type PlayerSnapshot } from '../src/pawville/net/presenceProtocol.ts';

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// =====================================================================================
// In-memory Realtime server
// =====================================================================================
type Handler = (payload: unknown) => void;

class FakeServer {
  joined = new Map<string, Set<FakeChannel>>();
  dropFrom = new Set<string>(); // uids whose next broadcasts are dropped
  dropCount = new Map<string, number>();
  authorize: (topic: string, uid: string) => boolean = () => true;
  join(ch: FakeChannel) {
    if (!this.joined.has(ch.topic)) this.joined.set(ch.topic, new Set());
    this.joined.get(ch.topic)!.add(ch);
  }
  leave(ch: FakeChannel) {
    this.joined.get(ch.topic)?.delete(ch);
    this.syncAll(ch.topic);
  }
  presenceState(topic: string): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const c of this.joined.get(topic) ?? []) {
      if (!c.meta) continue;
      (out[c.key] ??= []).push(c.meta);
    }
    return out;
  }
  syncAll(topic: string) {
    for (const c of [...(this.joined.get(topic) ?? [])]) c.fire('presence:sync', {});
  }
  broadcast(from: FakeChannel, event: string, payload: unknown) {
    const n = this.dropCount.get(from.client.uid) ?? 0;
    if (n > 0) { this.dropCount.set(from.client.uid, n - 1); return; }
    for (const c of this.joined.get(from.topic) ?? []) if (c !== from) c.fire(`broadcast:${event}`, { payload: structuredClone(payload) });
  }
}

class FakeChannel {
  handlers = new Map<string, Handler[]>();
  meta: Record<string, unknown> | null = null;
  key: string;
  subscribeCb: ((s: string) => void) | null = null;
  removed = false;
  readonly topic: string;
  readonly client: FakeClient;
  constructor(topic: string, client: FakeClient, opts: { config?: { presence?: { key?: string } } }) {
    this.topic = topic;
    this.client = client;
    this.key = opts?.config?.presence?.key ?? 'anon';
  }
  on(type: string, filter: { event: string }, cb: Handler) {
    const k = `${type}:${filter.event}`;
    this.handlers.set(k, [...(this.handlers.get(k) ?? []), cb]);
    return this;
  }
  fire(k: string, p: unknown) { for (const h of this.handlers.get(k) ?? []) h(p); }
  subscribe(cb?: (s: string) => void) {
    this.subscribeCb = cb ?? null;
    queueMicrotask(() => {
      if (this.removed) return;
      if (!this.client.online || !this.client.server.authorize(this.topic, this.client.uid)) { cb?.('CHANNEL_ERROR'); return; }
      this.client.server.join(this);
      cb?.('SUBSCRIBED');
    });
    return this;
  }
  async track(meta: Record<string, unknown>) {
    if (this.removed || !this.client.online) return 'error';
    this.meta = meta;
    this.client.server.syncAll(this.topic);
    return 'ok';
  }
  async send(m: { event: string; payload: unknown }) {
    if (this.removed || !this.client.online) return 'error';
    this.client.server.broadcast(this, m.event, m.payload);
    return 'ok';
  }
  presenceState() { return this.client.online ? this.client.server.presenceState(this.topic) : {}; }
  /** Network blip: drop from the server, then re-join (as supabase-js does). */
  blip() {
    this.client.server.joined.get(this.topic)?.delete(this);
    this.client.server.syncAll(this.topic);
    this.subscribeCb?.('CHANNEL_ERROR');
  }
  rejoin() {
    this.client.server.join(this);
    this.subscribeCb?.('SUBSCRIBED');
  }
}

/** Mimics realtime-js: channel() de-duplicates by topic; removeChannel is async. */
class FakeClient implements RealtimeClientLike {
  registered: FakeChannel[] = [];
  online = true;
  readonly uid: string;
  readonly server: FakeServer;
  constructor(uid: string, server: FakeServer) {
    this.uid = uid;
    this.server = server;
  }
  channel(topic: string, opts?: unknown) {
    const existing = this.registered.find((c) => c.topic === topic);
    if (existing) return existing; // ← the realtime-js behaviour behind the bug
    const c = new FakeChannel(topic, this, opts as never);
    this.registered.push(c);
    return c;
  }
  async removeChannel(ch: unknown) {
    await new Promise((r) => setTimeout(r, 1));
    const c = ch as FakeChannel;
    c.removed = true;
    this.registered = this.registered.filter((x) => x !== c);
    this.server.leave(c);
    return 'ok';
  }
  getChannels() { return this.registered.map((c) => ({ topic: `realtime:${c.topic}`, __c: c })).map((x) => x.__c); }
}
// realtime-js reports topics with the "realtime:" prefix
Object.defineProperty(FakeChannel.prototype, 'topicPrefixed', { get() { return `realtime:${this.topic}`; } });

// =====================================================================================
// In-memory pairing backend mirroring 20261024000001 + 20261026000001
// =====================================================================================
interface PairRow { id: string; T: string | null; M: string | null; Tn: string; Mn: string }
interface InviteRow { code: string; pair: string; by: string; status: 'open' | 'accepted' | 'declined' | 'cancelled'; expires: number; created: number }

class FakeDb {
  pairs: PairRow[] = [];
  invites: InviteRow[] = [];
  seq = 0;
  clock: () => number;
  constructor(clock: () => number) { this.clock = clock; }
  myPair(uid: string) { return this.pairs.find((p) => p.T === uid || p.M === uid); }
  isMember(pairId: string, uid: string) { const p = this.pairs.find((x) => x.id === pairId); return !!p && (p.T === uid || p.M === uid); }
  svc(uid: string): PairServiceLike {
    const fail = (c: string) => { throw new Error(c); };
    const info = (p: PairRow): PairInfo => {
      const me: Role = p.T === uid ? 'T' : 'M';
      return { pairId: p.id, source: 'backend', myRole: me, partnerName: me === 'T' ? p.Mn : p.Tn, partnerJoined: me === 'T' ? p.M !== null : p.T !== null };
    };
    return {
      fetchMyPair: async () => { await flush(1); const p = this.myPair(uid); return p ? info(p) : null; },
      fetchMyInvite: async () => {
        await flush(1);
        const p = this.myPair(uid);
        if (!p) return null;
        const inv = this.invites.filter((i) => i.pair === p.id).sort((a, b) => b.created - a.created)[0];
        if (!inv) return null;
        const st = inv.status === 'open' && inv.expires < this.clock() ? 'expired' : inv.status;
        return { code: inv.code, status: st, expiresAt: new Date(inv.expires).toISOString(), mine: inv.by === uid };
      },
      createInvite: async (role, name) => {
        await flush(1);
        let p = this.myPair(uid);
        if (!p) { p = { id: `pair-${++this.seq}`, T: role === 'T' ? uid : null, M: role === 'M' ? uid : null, Tn: role === 'T' ? name : '', Mn: role === 'M' ? name : '' }; this.pairs.push(p); }
        else if (p.T && p.M) fail('pair_full');
        for (const i of this.invites) if (i.pair === p.id && i.status === 'open') i.status = 'cancelled';
        const code = `C${String(++this.seq).padStart(5, '0')}`;
        this.invites.push({ code, pair: p.id, by: uid, status: 'open', expires: this.clock() + 48 * 3600_000, created: this.clock() + this.seq });
        return { code, pairId: p.id, myRole: p.T === uid ? 'T' : 'M', expiresAt: new Date(this.clock() + 48 * 3600_000).toISOString() };
      },
      acceptInvite: async (code, name) => {
        await flush(1);
        // the whole body runs without awaiting = one transaction with the row locked
        const inv = this.invites.find((i) => i.code === code);
        if (!inv) fail('invite_not_found');
        if (inv!.status !== 'open') fail('invite_closed');
        if (inv!.expires < this.clock()) fail('invite_expired');
        if (inv!.by === uid) fail('own_invite');
        if (this.myPair(uid)) fail('already_paired');
        const p = this.pairs.find((x) => x.id === inv!.pair)!;
        if (p.T === null) { p.T = uid; p.Tn = name; } else if (p.M === null) { p.M = uid; p.Mn = name; } else fail('pair_full');
        inv!.status = 'accepted';
        return info(p);
      },
      declineInvite: async (code) => {
        await flush(1);
        const inv = this.invites.find((i) => i.code === code && i.status === 'open' && i.expires >= this.clock() && i.by !== uid);
        if (inv) inv.status = 'declined';
      },
      cancelInvites: async () => { await flush(1); for (const i of this.invites) if (i.status === 'open' && this.isMember(i.pair, uid)) i.status = 'cancelled'; },
      leavePair: async () => {
        await flush(1);
        for (const p of this.pairs) { if (p.T === uid) { p.T = null; p.Tn = ''; } if (p.M === uid) { p.M = null; p.Mn = ''; } }
        this.pairs = this.pairs.filter((p) => p.T || p.M);
      },
    };
  }
}

function memStore<T>(init: T | null = null) {
  let v = init;
  return { load: () => v as T, save: (x: T) => { v = x; }, reset: () => { v = null; } };
}

interface World { server: FakeServer; db: FakeDb; now: { t: number } }
function world(): World {
  const now = { t: 1_000_000 };
  const server = new FakeServer();
  const db = new FakeDb(() => now.t);
  server.authorize = (topic, uid) => !topic.startsWith('pv-pair:') || db.isMember(topic.slice(8), uid);
  return { server, db, now };
}

interface Device { uid: string; client: FakeClient; ctl: PairController; transports: SupabasePairTransport[] }
function device(w: World, uid: string): Device {
  const client = new FakeClient(uid, w.server);
  const transports: SupabasePairTransport[] = [];
  const deps: ControllerDeps = {
    backend: () => 'ready',
    svc: w.db.svc(uid),
    makeTransport: (p) => { const t = new SupabasePairTransport(p.myRole, p.pairId, async () => client); transports.push(t); return t; },
    pairCache: memStore<PairInfo | null>(),
    demoPair: memStore<PairInfo | null>(),
    demoRoles: { get: () => null, set: () => undefined },
    now: () => w.now.t,
    setInterval: () => 1,
    clearInterval: () => undefined,
    errorCode: (e) => (e instanceof Error ? e.message : 'network'),
  };
  return { uid, client, ctl: new PairController(deps), transports };
}

async function run(w: World, devices: Device[], ms: number, step = 250) {
  for (let t = 0; t < ms; t += step) {
    w.now.t += step;
    for (const d of devices) d.ctl.tick();
    await flush(3);
  }
}

const view = (d: Device) => coupleView(d.ctl.state).label;

// =====================================================================================
// Tests
// =====================================================================================

test('ROOT CAUSE reproduced: realtime topic de-duplication hands a new owner the channel being removed', async () => {
  const server = new FakeServer();
  const client = new FakeClient('u1', server);
  // Old behaviour: create, start removing, create again immediately (screen change / Strict Mode)
  const a = client.channel('pawville:plaza', { config: { presence: { key: 'first' } } });
  const removing = client.removeChannel(a);
  const b = client.channel('pawville:plaza', { config: { presence: { key: 'second' } } });
  assert.equal(a, b, 'the "new" channel is the old object (old presence key, old handlers)');
  await removing;
  assert.equal((b as FakeChannel).removed, true, '…and it is then removed under the new owner → presence silently dies');
  // Fixed behaviour: the registry serialises owners per topic.
  const c1 = await acquireChannel(client, 'pawville:plaza', { config: { presence: { key: 'first' } } });
  const rel = c1.release();
  const c2 = await acquireChannel(client, 'pawville:plaza', { config: { presence: { key: 'second' } } });
  await rel;
  assert.notEqual(c1.channel, c2.channel);
  assert.equal((c2.channel as FakeChannel).removed, false, 'the new owner keeps a live channel');
  assert.equal((c2.channel as FakeChannel).key, 'second');
  await c1.release(); // releasing twice never touches the newer owner
  assert.equal((c2.channel as FakeChannel).removed, false);
});

function snap(id: string, x = 100, y = 100, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return { v: PROTOCOL_VERSION, id, name: id, cat: 'T', coat: 'tangerine', accessory: 'none', extra: 'none', x, y, facing: 'down', moving: false, pose: 'stand', lift: 0, emote: null, emoteAge: 0, emoteSeq: 0, run: false, pair: null, ...extra };
}

test('town presence: identity-keyed, own echo ignored, hidden (idle) players are not pruned, Strict-Mode remount survives', async () => {
  const server = new FakeServer();
  const ca = new FakeClient('ua', server);
  const cb = new FakeClient('ub', server);
  let t = 0;
  const now = () => t;
  const world0 = { w: 768, h: 864 };
  // Strict-Mode style: mount, unmount immediately, mount again on the SAME client
  const first = startTownPresence({ self: snap('cat_aaaaaa'), world: world0, factory: presenceChannelFactory('u', 'k', ca), now });
  void first.stop();
  const A = startTownPresence({ self: snap('cat_aaaaaa'), world: world0, factory: presenceChannelFactory('u', 'k', ca), now });
  const statusB: string[] = [];
  const B = startTownPresence({ self: snap('cat_bbbbbb', 300, 300), world: world0, factory: presenceChannelFactory('u', 'k', cb), now, onStatus: (s) => statusB.push(s) });
  await new Promise((r) => setTimeout(r, 20));
  await flush();
  assert.deepEqual([...A.remotes.keys()], ['cat_bbbbbb'], 'A sees exactly B (keyed by B’s id)');
  assert.deepEqual([...B.remotes.keys()], ['cat_aaaaaa'], 'B sees exactly A — the remount did not kill A’s presence');
  assert.equal(server.joined.get('pawville:plaza')?.size, 2, 'exactly one live channel per client');
  // A moves; B's idle player sends nothing for a minute (hidden tab) → still present everywhere
  for (let i = 0; i < 240; i++) {
    t += 250;
    A.update(snap('cat_aaaaaa', 100 + i, 100, { moving: true }));
  }
  assert.ok(A.remotes.has('cat_bbbbbb'), 'an idle/hidden player stays visible while presence lists them');
  assert.ok(B.remotes.get('cat_aaaaaa')!.target.x > 300, 'B receives A’s movement');
  // A forged packet with B's own id never becomes a remote cat on B
  const chA = ca.registered[0];
  chA.client.server.broadcast(chA, 'move', snap('cat_bbbbbb', 1, 1));
  assert.ok(!B.remotes.has('cat_bbbbbb'), 'own id is never a remote cat (no local control hijack)');
  // network blip on B: B keeps A while reconnecting, then reconciles
  const chB = cb.registered[0];
  chB.blip();
  assert.ok(B.remotes.has('cat_aaaaaa'), 'last known cats kept during reconnect');
  assert.equal(statusB.at(-1), 'reconnecting');
  chB.rejoin();
  await flush();
  assert.equal(statusB.at(-1), 'online');
  assert.ok(A.remotes.has('cat_bbbbbb'), 'B re-announced itself after the re-join');
  await A.stop();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(!B.remotes.has('cat_aaaaaa'), 'leaving removes the player for others');
  await B.stop();
});

test('old wrapChannel path is still exported for compatibility but the factory uses leases', () => {
  const c = wrapChannel({ removeChannel: async () => 'ok' }, { on() { return this; } } as unknown as ChannelLike);
  assert.equal(typeof c.unsubscribe, 'function');
});

test('INVITE → ACCEPT: the inviter is acknowledged, both see each other, nobody is "away"', async () => {
  const w = world();
  const A = device(w, 'uid-a');
  const B = device(w, 'uid-b');
  await A.ctl.init();
  await B.ctl.init();
  await A.ctl.createInvite('T', 'Ann');
  await A.ctl.createInvite('T', 'Ann'); // double click / retry → still ONE open invite
  await flush();
  assert.equal(w.db.invites.filter((i) => i.status === 'open').length, 1);
  assert.equal(view(A), 'Invite pending');
  assert.equal(A.ctl.state.transport, 'online', 'the inviter is already on the couple channel while pending');
  const code = A.ctl.state.invite!.code;
  const [ok1, ok2] = await Promise.all([B.ctl.acceptInvite(code, 'Ben'), B.ctl.acceptInvite(code, 'Ben')]);
  assert.deepEqual([ok1, ok2], [true, true], 'double-click accept: one accept, both report success');
  assert.equal(w.db.pairs.length, 1);
  await run(w, [A, B], 1000);
  assert.equal(A.ctl.state.pair!.partnerJoined, true, 'inviter learned about the acceptance');
  assert.equal(A.ctl.state.invite!.status, 'accepted');
  assert.equal(view(A), 'Partner here');
  assert.equal(view(B), 'Partner here');
  assert.equal(A.ctl.state.pair!.myRole, 'T');
  assert.equal(B.ctl.state.pair!.myRole, 'M', 'roles come from the server, never from local choice');
  assert.equal(A.transports.length, 1, 'acknowledgement did not tear down and re-open the channel');
  assert.equal(B.ctl.state.error, null);
});

test('acknowledgement survives a LOST event: inviter offline while partner accepts, then refreshes', async () => {
  const w = world();
  const A = device(w, 'uid-a');
  const B = device(w, 'uid-b');
  await A.ctl.init();
  await B.ctl.init();
  await A.ctl.createInvite('M', 'Ann');
  await flush();
  const code = A.ctl.state.invite!.code;
  // A loses its connection completely (no presence, no events)
  A.client.online = false;
  A.transports[0] && (A.client.registered[0] as FakeChannel).blip();
  await B.ctl.acceptInvite(code, 'Ben');
  await run(w, [B], 500);
  assert.equal(view(A), 'Invite pending', 'A truly does not know yet');
  // A comes back: the bounded reconcile (or focus/online) reads the server
  A.client.online = true;
  (A.client.registered[0] as FakeChannel).rejoin();
  await run(w, [A, B], 5000);
  assert.equal(A.ctl.state.pair!.partnerJoined, true);
  assert.equal(view(A), 'Partner here');
  // A refreshes the page: a brand-new controller for the same user recovers everything
  A.ctl.dispose();
  await new Promise((r) => setTimeout(r, 5));
  const A2 = device(w, 'uid-a');
  await A2.ctl.init();
  await run(w, [A2, B], 1000);
  assert.equal(A2.ctl.state.pair!.myRole, 'M');
  assert.equal(view(A2), 'Partner here');
  assert.equal(view(B), 'Partner here');
});

test('decline, cancel, expiry and stale codes are reported truthfully to the inviter', async () => {
  const w = world();
  const A = device(w, 'uid-a');
  const B = device(w, 'uid-b');
  await A.ctl.init();
  await B.ctl.init();
  await A.ctl.createInvite('T', 'Ann');
  const code = A.ctl.state.invite!.code;
  await B.ctl.declineInvite(code);
  await A.ctl.declineInvite(code); // the inviter can't "decline" their own invite
  await run(w, [A], 5000);
  assert.equal(A.ctl.state.invite!.status, 'declined');
  assert.equal(view(A), 'Invite declined');
  assert.equal(await B.ctl.acceptInvite(code, 'Ben'), false);
  assert.equal(B.ctl.state.error, 'invite_closed', 'a declined invite cannot be accepted');
  // new invite, then expiry
  await A.ctl.createInvite('T', 'Ann');
  const code2 = A.ctl.state.invite!.code;
  w.now.t += 49 * 3600_000;
  assert.equal(await B.ctl.acceptInvite(code2, 'Ben'), false);
  assert.equal(B.ctl.state.error, 'invite_expired');
  await A.ctl.requestReconcile();
  assert.equal(view(A), 'Invite expired');
  // cancel
  await A.ctl.createInvite('T', 'Ann');
  const code3 = A.ctl.state.invite!.code;
  await A.ctl.cancelInvite();
  assert.equal(A.ctl.state.invite!.status, 'cancelled');
  assert.equal(await B.ctl.acceptInvite(code3, 'Ben'), false, 'a cancelled invite cannot be accepted');
  assert.equal(B.ctl.state.pair, null, 'B is not in any couple');
});

test('a stranger cannot join the couple channel (membership enforced by the server)', async () => {
  const w = world();
  const A = device(w, 'uid-a');
  const B = device(w, 'uid-b');
  await A.ctl.init();
  await B.ctl.init();
  await A.ctl.createInvite('T', 'Ann');
  await B.ctl.acceptInvite(A.ctl.state.invite!.code, 'Ben');
  await run(w, [A, B], 500);
  const pairId = A.ctl.state.pair!.pairId;
  const evil = new FakeClient('uid-evil', w.server);
  const statuses: string[] = [];
  const t = new SupabasePairTransport('M', pairId, async () => evil);
  t.onStatus((s) => statuses.push(s));
  await flush();
  assert.ok(statuses.includes('error'), 'join refused');
  assert.equal(w.server.joined.get(`pv-pair:${pairId}`)?.size, 2, 'only the two members are on the channel');
  await t.close();
});

async function paired(): Promise<{ w: World; A: Device; B: Device }> {
  const w = world();
  const A = device(w, 'uid-a');
  const B = device(w, 'uid-b');
  await A.ctl.init();
  await B.ctl.init();
  await A.ctl.createInvite('T', 'Ann');
  await B.ctl.acceptInvite(A.ctl.state.invite!.code, 'Ben');
  await run(w, [A, B], 1000);
  return { w, A, B };
}

test('SHARED ACTIVITY: invite → accept → ready → start; both run the SAME session at the SAME time', async () => {
  const { w, A, B } = await paired();
  A.ctl.dispatch({ type: 'invite', sid: 's-swing-1', kind: 'swing' });
  A.ctl.dispatch({ type: 'invite', sid: 's-swing-2', kind: 'swing' }); // duplicate click → ignored
  await run(w, [A, B], 250);
  assert.equal(B.ctl.state.session.phase, 'invited');
  assert.equal(B.ctl.state.session.sid, 's-swing-1', 'exactly one invitation');
  assert.equal(A.ctl.state.session.phase, 'inviting');
  B.ctl.dispatch({ type: 'accept' });
  B.ctl.dispatch({ type: 'accept' }); // duplicate
  await run(w, [A, B], 250);
  assert.equal(A.ctl.state.session.phase, 'lobby', 'the host sees the acceptance');
  B.ctl.dispatch({ type: 'ready', ready: true });
  A.ctl.dispatch({ type: 'ready', ready: true });
  await run(w, [A, B], 250);
  A.ctl.dispatch({ type: 'start', now: w.now.t });
  await run(w, [A, B], 250);
  assert.equal(A.ctl.state.session.startAt, B.ctl.state.session.startAt, 'same start time on both devices');
  await run(w, [A, B], 3500);
  assert.equal(A.ctl.state.session.phase, 'running');
  assert.equal(B.ctl.state.session.phase, 'running');
  assert.equal(A.ctl.state.session.sid, B.ctl.state.session.sid);
  assert.ok(A.ctl.state.partnerOnline && B.ctl.state.partnerOnline, 'nobody became "away" during the flow');
});

test('a LOST accept message no longer leaves the host stuck: periodic sync reconciles', async () => {
  const { w, A, B } = await paired();
  A.ctl.dispatch({ type: 'invite', sid: 's-pic-1', kind: 'picnic' });
  await run(w, [A, B], 250);
  w.server.dropCount.set('uid-b', 1); // the act:accept broadcast is lost
  B.ctl.dispatch({ type: 'accept' });
  await run(w, [A, B], 250);
  assert.equal(A.ctl.state.session.phase, 'inviting', 'reproduces the old stuck state');
  await run(w, [A, B], 2500);
  assert.equal(A.ctl.state.session.phase, 'lobby', 'recovered from B’s sync snapshot');
  // a lost INVITE is recovered too
  A.ctl.dispatch({ type: 'cancel' });
  await run(w, [A, B], 500);
  B.ctl.dispatch({ type: 'reset' });
  A.ctl.dispatch({ type: 'reset' });
  w.server.dropCount.set('uid-a', 1);
  A.ctl.dispatch({ type: 'invite', sid: 's-fish-1', kind: 'fishing' });
  await run(w, [A, B], 2500);
  assert.equal(B.ctl.state.session.phase, 'invited');
  assert.equal(B.ctl.state.session.sid, 's-fish-1');
  // the old, cancelled session can never be resurrected by a late message
  B.ctl.dispatch({ type: 'remote', now: w.now.t, msg: { t: 'act:invite', sid: 's-pic-1', kind: 'picnic', params: {} } });
  assert.equal(B.ctl.state.session.sid, 's-fish-1');
});

test('presence blips do not flip "partner away" or cancel activities; real disconnects do, after the grace period', async () => {
  const { w, A, B } = await paired();
  A.ctl.dispatch({ type: 'invite', sid: 's-star-1', kind: 'stargaze' });
  await run(w, [A, B], 250);
  const chB = B.client.registered.find((c) => c.topic.startsWith('pv-pair:'))!;
  chB.blip();
  await run(w, [A, B], 2000);
  assert.equal(A.ctl.state.partnerOnline, true, 'a 2-second blip is not "away"');
  assert.equal(view(A), 'partner reconnecting…');
  chB.rejoin();
  await run(w, [A, B], 500);
  assert.equal(view(A), 'Partner here');
  assert.equal(A.ctl.state.session.phase, 'inviting', 'the pending invitation survived the blip');
  assert.equal(B.ctl.state.session.phase, 'invited');
  // a real disconnect
  B.client.online = false;
  chB.blip();
  await run(w, [A], PARTNER_GRACE_MS + 500);
  assert.equal(A.ctl.state.partnerOnline, false);
  assert.equal(view(A), 'Partner away');
  await run(w, [A], GRACE_MS);
  assert.equal(A.ctl.state.session.phase, 'cancelled', 'cleaned up after the grace period');
  assert.equal(A.ctl.state.session.reason, 'partner-left');
});

test('leaving the couple closes the channel; the partner sees "away"; channels never multiply', async () => {
  const { w, A, B } = await paired();
  for (let i = 0; i < 5; i++) await A.ctl.requestReconcile(); // repeated reconciles: same pair → same channel
  assert.equal(A.transports.length, 1);
  assert.equal(w.server.joined.get(`pv-pair:${A.ctl.state.pair!.pairId}`)?.size, 2);
  await B.ctl.leavePair();
  await new Promise((r) => setTimeout(r, 5));
  await run(w, [A, B], PARTNER_GRACE_MS + 500);
  assert.equal(B.ctl.state.pair, null);
  assert.equal(A.ctl.state.partnerOnline, false);
  await A.ctl.requestReconcile();
  assert.equal(A.ctl.state.pair!.partnerJoined, false, 'server truth: the partner left');
});

test('demo couple: the joiner always gets the OTHER role (old bug: both tabs became Tangerine)', () => {
  const roles = new Map<string, Role>();
  const mk = () => new PairController({
    backend: () => 'not-configured', svc: {} as PairServiceLike,
    makeTransport: () => ({ kind: 'demo', send() {}, onMessage: () => () => {}, onStatus: () => () => {}, onPartner: () => () => {}, partnerOnline: () => false, close: async () => {} }),
    pairCache: memStore(), demoPair: memStore(), demoRoles: { get: (c) => roles.get(c) ?? null, set: (c, r) => void roles.set(c, r) },
    now: () => 0, setInterval: () => 1, clearInterval: () => {}, errorCode: () => 'network',
  });
  const a = mk();
  const b = mk();
  const code = a.createDemoPair('T', () => 0.3);
  assert.equal(b.joinDemoPair(code), true);
  assert.equal(b.state.pair!.myRole, otherRole(a.state.pair!.myRole));
  assert.equal(mk().joinDemoPair('ZZZZZZ'), false, 'unknown demo code is refused, not guessed');
});

test('UI labels are derived from canonical state and never contradict each other', () => {
  const base = { backend: 'ready' as const, invite: null, transport: 'online' as const, partner: 'online' as const, partnerOnline: true };
  const p = (joined: boolean): PairInfo => ({ pairId: 'p', source: 'backend', myRole: 'T', partnerName: '', partnerJoined: joined });
  assert.equal(coupleView({ ...base, pair: null }).label, 'Couple');
  assert.equal(coupleView({ ...base, pair: p(false) }).label, 'Invite pending');
  assert.equal(coupleView({ ...base, pair: p(true) }).label, 'Partner here');
  assert.equal(coupleView({ ...base, pair: p(true), partner: 'away' }).label, 'partner reconnecting…');
  assert.equal(coupleView({ ...base, pair: p(true), partner: 'offline', partnerOnline: false }).label, 'Partner away');
  assert.equal(coupleView({ ...base, pair: p(false), invite: { code: 'X', expiresAt: null, demo: false, status: 'declined' } }).label, 'Invite declined');
  assert.equal(coupleView({ ...base, pair: p(true), transport: 'conflict' }).tone, 'warn');
  assert.equal(townLabel('online', 0), 'Online · only you in town', 'town headcount is labelled as town-only');
  assert.equal(townLabel('online', 1), 'Online · 2 cats in town');
});

test('identity: one instance id per page load, distinct default names, chosen looks respected', async () => {
  const ls = new Map<string, string>();
  const ss = new Map<string, string>([['pawville:presence-id', 'cat_dupdupdup']]); // copied by "duplicate tab"
  const store = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  (globalThis as Record<string, unknown>).window = { localStorage: store(ls), sessionStorage: store(ss) };
  const id = await import('../src/pawville/instanceId.ts');
  const a = id.presenceId();
  assert.notEqual(a, 'cat_dupdupdup', 'a copied sessionStorage id is not reused');
  assert.equal(id.presenceId(), a, 'stable for the page lifetime (renders, remounts, reconnects)');
  assert.equal(ss.has('pawville:presence-id'), false);
  id.resetInstanceIdForTests();
  const b = id.presenceId();
  assert.notEqual(a, b, 'another tab/page load is another cat');
  assert.notEqual(id.defaultName('T', a), id.defaultName('T', b), 'two un-named Tangerines are distinguishable');
});
