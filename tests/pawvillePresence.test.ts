import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applySnapshot, createSendGate, interpolateRemotes, pruneStale, sanitizeSnapshot, snapshotsFromPresence, type PlayerSnapshot, type RemoteCat } from '../src/pawville/net/presenceProtocol.ts';
import { startTownPresence, type ChannelLike } from '../src/pawville/net/townPresence.ts';

const world = { w: 768, h: 864 };
const snap = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  v: 2, id: 'cat_abcdef12', name: 'Mochi', cat: 'T', coat: 'mochi', accessory: 'crown', extra: 'scarf', x: 100, y: 120, facing: 'down', moving: false, pose: 'stand', lift: 0, emote: null, emoteAge: 0, emoteSeq: 0, run: false, pair: null, ...o,
});

test('presence: untrusted snapshots validated (incl. coat, pose, emote, pair id)', () => {
  assert.equal(sanitizeSnapshot({ id: 'x', x: 1, y: 1 }, world), null);
  const s = sanitizeSnapshot({ id: 'cat_abcdef12', x: 99999, y: -5, coat: 'neon', pose: 'fly', emote: 'rickroll', lift: 900, pair: '<script>', name: '<b>Hi</b>' }, world)!;
  assert.deepEqual([s.x, s.y, s.coat, s.pose, s.emote, s.lift, s.pair, s.name], [768, 0, 'tangerine', 'stand', null, 40, null, 'bHib']); // lift is still clamped (hostile 900 → 40); 40 because the Cloud Swing lifts riders 31 px (was 16, which sank remote swing riders into their chairs)
});

test('presence: rate limit, interpolation, stale pruning, self/key filtering', () => {
  const gate = createSendGate(100, 4000);
  assert.equal(gate(0, snap()), true);
  assert.equal(gate(50, snap({ x: 110 })), false);
  assert.equal(gate(150, snap({ emote: 'wave' })), true, 'emotes are sent promptly');
  const remotes = new Map<string, RemoteCat>();
  applySnapshot(remotes, snap(), 0);
  applySnapshot(remotes, snap({ x: 120 }), 10);
  interpolateRemotes(remotes, 0.1, 20);
  const r = remotes.get('cat_abcdef12')!;
  assert.ok(r.pos.x > 100 && r.pos.x < 120);
  assert.deepEqual(pruneStale(remotes, 30_000), ['cat_abcdef12']);
  const list = snapshotsFromPresence({ me_selfid1: [snap({ id: 'me_selfid1' })], cat_abcdef12: [snap()], spoof12345: [snap({ id: 'cat_other999' })] }, 'me_selfid1', world);
  assert.deepEqual(list.map((x) => x.id), ['cat_abcdef12']);
});

test('presence wiring against an in-memory channel (this is NOT a live-server test)', async () => {
  const handlers: Record<string, (p: unknown) => void> = {};
  let sub: ((s: string) => void) | null = null;
  const sent: unknown[] = [];
  let state: Record<string, unknown> = {};
  let unsubscribed = 0;
  const ch: ChannelLike = {
    on(t, f, cb) { handlers[`${t}:${f.event}`] = cb; return ch; },
    subscribe(cb) { sub = cb ?? null; return ch; },
    async track() { return 'ok'; },
    async send(m) { sent.push(m); return 'ok'; },
    presenceState() { return state; },
    async unsubscribe() { unsubscribed++; return 'ok'; },
  };
  let clock = 0;
  let roster: string[] = [];
  const p = startTownPresence({ self: snap({ id: 'me_selfid1' }), world, factory: async () => ch, now: () => clock, onRosterChange: (ids) => { roster = ids; } });
  await new Promise((r) => setTimeout(r, 0));
  sub!('SUBSCRIBED');
  state = { me_selfid1: [snap({ id: 'me_selfid1' })], cat_abcdef12: [snap()] };
  handlers['presence:sync']({});
  assert.deepEqual(roster, ['cat_abcdef12']);
  clock = 1000;
  p.update(snap({ id: 'me_selfid1', x: 140, moving: true }));
  assert.equal(sent.length, 1);
  await p.stop();
  assert.equal(unsubscribed, 1);
});
