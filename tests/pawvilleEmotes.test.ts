import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduce, idleSession } from '../src/pawville/couple/activitySession.ts';
import { EMOTES, canPerform, createEmoteLimiter, emoteDef, emotesFor, resolveEmote, sanitizeQuick } from '../src/pawville/couple/emotes.ts';
import {
  EMOTE_IDS, REMOTE_EMOTE_MIN_GAP, applyEmote, applySnapshot, remoteEmoteNow, sanitizeSnapshot, snapshotsFromPresence, type RemoteCat,
} from '../src/pawville/net/presenceProtocol.ts';
import { MAX_PARTICLES, STARPAW, emoteFrame, emoteParticles, hasTimeline } from '../src/pawville/render/emoteAnim.ts';

const world = { w: 768, h: 864 };

test('emotes: every catalogue entry and every protocol id has a full timeline that returns to idle', () => {
  for (const id of EMOTE_IDS) assert.ok(emoteDef(id), `${id} is in the catalogue`);
  for (const e of EMOTES) {
    assert.ok(hasTimeline(e.id), `${e.id} has a timeline`);
    assert.equal(emoteFrame(e.id, e.ms), null, `${e.id} ends (back to idle)`);
    assert.equal(emoteFrame(e.id, -1), null);
    for (let t = 0; t < e.ms; t += 37) {
      const f = emoteFrame(e.id, t)!;
      assert.ok(Number.isInteger(f.dx) && Number.isInteger(f.dy), `${e.id}@${t}: pixel-aligned offsets`);
      assert.ok(Math.abs(f.dx) <= 3 && f.dy <= 2 && f.dy >= -5, `${e.id}@${t}: small, readable movement`);
      assert.ok(emoteParticles(e.id, t, false, f).length <= MAX_PARTICLES);
      assert.ok(emoteParticles(e.id, t, true, f).length <= MAX_PARTICLES);
    }
    assert.ok(e.tip.length > 5 && e.label.length > 1);
  }
  assert.equal(emoteFrame(null, 10), null);
  assert.equal(emoteFrame('nope' as never, 10), null, 'unknown emotes never crash');
  assert.deepEqual(emoteParticles('nope' as never, 10), []);
});

test('emotes: required set is present and keeps the Milestone 3 ids', () => {
  const labels = EMOTES.map((e) => e.label);
  for (const l of ['Wave', 'Heart', 'Happy dance', 'Celebrate', 'Playful huff', 'Sorry…', 'Sleepy loaf', 'Hug', 'High-five', 'Paw bump', 'Nose boop', 'Sit together', 'Happy purr', 'Surprised', 'Playful bounce']) {
    assert.ok(labels.includes(l), l);
  }
  for (const id of ['wave', 'heart', 'dance', 'celebrate', 'sleepy', 'sorry', 'grumble', 'high-five', 'paw-bump', 'nose-boop', 'hug']) assert.ok(emoteDef(id), `old id ${id} kept`);
  assert.ok(EMOTES.filter((e) => e.shared).every((e) => typeof e.range === 'number'));
});

test('emotes: each emote animates the cat itself (not just a label)', () => {
  const wave = [0, 400, 800, 1200].map((t) => emoteFrame('wave', t)!);
  assert.ok(wave.every((f) => f.paw === 'right'), 'wave raises a paw');
  assert.ok(new Set(wave.map((f) => f.pawDx)).size > 1, 'and moves it');
  assert.equal(emoteFrame('heart', 500)!.eyes, 'happy');
  assert.ok(new Set([0, 160, 320, 480].map((t) => emoteFrame('dance', t)!.dx)).size > 1, 'dance sways');
  assert.equal(emoteFrame('dance', 2500)!.phase, 'recover', 'dance ends cleanly');
  assert.ok(emoteFrame('grumble', 600)!.cheeks, 'huff puffs the cheeks');
  assert.equal(emoteFrame('sorry', 800)!.ears, 'down');
  assert.equal(emoteFrame('sleepy', 2000)!.pose, 'loaf');
  assert.equal(emoteFrame('sleepy', 2000)!.eyes, 'closed');
  assert.ok(emoteParticles('sleepy', 2000).some((p) => p.kind === 'z'));
  assert.equal(emoteFrame('surprised', 50)!.dy, 1, 'anticipation before the hop');
  assert.ok(emoteFrame('surprised', 300)!.dy < 0);
  assert.equal(emoteFrame('hug', 1000)!.face, 'partner');
  assert.ok(emoteParticles('high-five', 800).length > 0, 'contact burst');
});

test('Starpaw Serenade: four phases — intro glow, left-right-left wave, flourish, finish → idle', () => {
  const intro = emoteFrame('mini-starpaw-serenade', 400)!;
  assert.equal(intro.phase, 'intro');
  assert.equal(intro.face, 'camera');
  assert.equal(intro.ears, 'perk');
  assert.ok(intro.glow > 0);
  assert.ok(emoteParticles('mini-starpaw-serenade', 400).some((p) => p.kind === 'spark' || p.kind === 'star'), 'sparkles around the face');
  const wave: number[] = [];
  for (let t = STARPAW.wave[0]; t < STARPAW.wave[1]; t += 20) {
    const f = emoteFrame('mini-starpaw-serenade', t)!;
    assert.equal(f.phase, 'wave');
    assert.equal(f.paw, 'right');
    assert.equal(f.eyes, 'glow', 'eyes shine during the wave');
    wave.push(f.pawDx);
  }
  // left → right → left: the paw offset crosses zero in both directions
  const signs = wave.filter((d) => d !== 0).map(Math.sign);
  const changes = signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
  assert.ok(Math.min(...wave) <= -2 && Math.max(...wave) >= 2 && changes >= 3, `paw waves side to side (${changes} changes)`);
  const trail = emoteParticles('mini-starpaw-serenade', 1500);
  assert.ok(trail.some((p) => p.kind === 'paw') && trail.some((p) => p.color.toLowerCase() === '#ffd45e'), 'paw-print trail with green-gold sparkles');
  assert.equal(emoteFrame('mini-starpaw-serenade', 2450)!.eyes, 'closed', 'confident blink');
  assert.equal(emoteFrame('mini-starpaw-serenade', 2800)!.glow, 1, 'emerald flash');
  assert.ok(emoteParticles('mini-starpaw-serenade', 3000).filter((p) => p.kind === 'star' || p.kind === 'spark').length >= 5, 'constellation forms');
  const fin = emoteFrame('mini-starpaw-serenade', 3700)!;
  assert.equal(fin.phase, 'finish');
  assert.equal(fin.paw, 'none', 'paw lowered');
  assert.equal(fin.eyes, 'happy', 'proud little smile');
  assert.equal(emoteFrame('mini-starpaw-serenade', 3800), null, 'back to idle — never stuck');
  assert.ok(emoteParticles('mini-starpaw-serenade', 3790).every((p) => p.alpha < 0.3), 'particles dispersed');
});

test('Starpaw Serenade: reduced motion is calmer and still readable', () => {
  let maxDx = 0;
  let trail = 0;
  for (let t = 0; t < 3800; t += 25) {
    const f = emoteFrame('mini-starpaw-serenade', t, true)!;
    maxDx = Math.max(maxDx, Math.abs(f.dx), Math.abs(f.pawDx));
    trail += emoteParticles('mini-starpaw-serenade', t, true, f).filter((p) => p.kind === 'paw').length;
    assert.ok(emoteParticles('mini-starpaw-serenade', t, true, f).length <= 6);
  }
  assert.ok(maxDx <= 1, 'no big sway in reduced motion');
  assert.equal(trail, 0, 'no paw-print trail in reduced motion');
  assert.equal(emoteFrame('mini-starpaw-serenade', 1500, true)!.eyes, 'glow', 'eyes still shine');
});

test('Starpaw Serenade is Mini-only — checked against the character, never the nickname', () => {
  assert.equal(canPerform('mini-starpaw-serenade', 'mini'), true);
  for (const c of ['tangerine', 'midnight', 'puchu', 'chutki', 'magic', 'mochi'] as const) {
    assert.equal(canPerform('mini-starpaw-serenade', c), false, c);
    assert.ok(!emotesFor(c).some((e) => e.id === 'mini-starpaw-serenade'), `${c} doesn't see it in the menu`);
    assert.equal(resolveEmote('mini-starpaw-serenade', c), 'wave', 'falls back to an ordinary wave');
  }
  assert.ok(emotesFor('mini').some((e) => e.id === 'mini-starpaw-serenade' && e.tip === 'A little wave with a little magic.'));
  const spoof = sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, name: 'Mini', coat: 'puchu', emote: 'mini-starpaw-serenade' }, world)!;
  assert.equal(spoof.emote, 'wave', 'a Puchu named "Mini" cannot broadcast it');
  const real = sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, name: 'Bob', coat: 'mini', emote: 'mini-starpaw-serenade' }, world)!;
  assert.equal(real.emote, 'mini-starpaw-serenade');
  assert.deepEqual(sanitizeQuick(['mini-starpaw-serenade', 'hug', 'bogus', 'wave', 'wave']), ['mini-starpaw-serenade', 'wave'], 'quick bar: valid, solo, unique');
});

function remote(): RemoteCat {
  return { id: 'cat_abcdef12', name: 'x', cat: 'T', coat: 'mini', accessory: 'none', extra: 'none', pos: { x: 0, y: 0 }, target: { x: 0, y: 0 }, facing: 'down', moving: false, pose: 'stand', lift: 0,
    emote: null, emoteStart: 0, emoteSeq: -1, run: false, pair: null, lastUpdate: 0, lastEmoteAccept: -Infinity };
}

test('network emotes: validated, started from the same point, never replayed when stale', () => {
  assert.equal(sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, emote: 'rickroll' }, world)!.emote, null, 'unknown id rejected');
  assert.equal(sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, emote: 'wave', emoteAge: 'soon' }, world)!.emoteAge, 0, 'malformed age repaired');
  assert.equal(sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, emote: 'wave', emoteAge: 99_999 }, world)!.emote, null, 'already finished → not replayed');
  assert.equal(sanitizeSnapshot({ v: 9, id: 'cat_abcdef12', x: 1, y: 1 }, world), null, 'unknown NEWER protocol version is not guessed at');
  assert.ok(sanitizeSnapshot({ v: 2, id: 'cat_abcdef12', x: 1, y: 1, emote: 'wave' }, world), 'v2 clients still understood');
  const r = remote();
  applyEmote(r, { emote: 'heart', emoteAge: 500, emoteSeq: 1 }, 10_000);
  assert.deepEqual(remoteEmoteNow(r, 10_000), { id: 'heart', t: 500 }, 'plays from the sender’s current point');
  applyEmote(r, { emote: 'heart', emoteAge: 900, emoteSeq: 1 }, 10_100);
  assert.equal(r.emoteStart, 9_500, 'same emote + seq: no restart');
  applyEmote(r, { emote: 'heart', emoteAge: 0, emoteSeq: 2 }, 10_200);
  assert.equal(r.emoteStart, 9_500, 'restart faster than the spam gap is ignored');
  applyEmote(r, { emote: 'heart', emoteAge: 0, emoteSeq: 2 }, 10_000 + REMOTE_EMOTE_MIN_GAP + 1);
  assert.equal(r.emoteStart, 10_000 + REMOTE_EMOTE_MIN_GAP + 1, 'new seq restarts');
  assert.equal(remoteEmoteNow(r, r.emoteStart + 5_000), null, 'finishes on its own');
  applyEmote(r, { emote: null, emoteAge: 0, emoteSeq: 3 }, 20_000);
  assert.equal(r.emote, null, 'cancel clears it');
  // reconnect: presence metadata never (re)starts an emote
  const list = snapshotsFromPresence({ cat_abcdef12: [{ v: 3, id: 'cat_abcdef12', x: 1, y: 1, emote: 'wave', emoteAge: 10 }] }, 'me_123456', world);
  assert.equal(list[0].emote, null);
  const remotes = new Map<string, RemoteCat>();
  applySnapshot(remotes, sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, coat: 'mini', emote: 'mini-starpaw-serenade', emoteAge: 1200, emoteSeq: 4 }, world)!, 50_000);
  assert.deepEqual(remoteEmoteNow(remotes.get('cat_abcdef12')!, 50_000), { id: 'mini-starpaw-serenade', t: 1200 }, 'late arrival joins mid-animation');
});

test('local emote spam guard', () => {
  const ok = createEmoteLimiter(500, 3, 10_000);
  assert.equal(ok(0), true);
  assert.equal(ok(100), false, 'too soon');
  assert.equal(ok(600), true);
  assert.equal(ok(1200), true);
  assert.equal(ok(1800), false, 'burst limit');
  assert.equal(ok(11_000), true, 'window slides');
});

test('couple emotes need consent: decline, cancel and disconnect all clean up', () => {
  const now = 1000;
  const inv = reduce(idleSession(true), { type: 'invite', sid: 's1', kind: 'emote', params: { emote: 'sit-together' } }, 'T');
  assert.equal(inv.s.phase, 'inviting');
  let M = reduce(idleSession(true), { type: 'remote', msg: inv.out[0], now }, 'M').s;
  assert.equal(M.phase, 'invited', 'partner is asked, not forced');
  const dec = reduce(M, { type: 'decline' }, 'M');
  const T = reduce(inv.s, { type: 'remote', msg: dec.out[0], now }, 'T').s;
  assert.equal(T.phase, 'cancelled', 'declining cancels for the asker');
  const can = reduce(inv.s, { type: 'cancel' }, 'T');
  M = reduce(reduce(idleSession(true), { type: 'remote', msg: inv.out[0], now }, 'M').s, { type: 'remote', msg: can.out[0], now }, 'M').s;
  assert.equal(M.phase, 'cancelled', 'either player can cancel');
  const gone = reduce(reduce(inv.s, { type: 'partner', present: false, now }, 'T').s, { type: 'tick', now: now + 60_000 }, 'T').s;
  assert.ok(gone.phase === 'cancelled' || gone.phase === 'idle', 'a disconnect times out cleanly');
});
