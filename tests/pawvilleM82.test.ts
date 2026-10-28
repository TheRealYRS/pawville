/**
 * Milestone 8.2 tests: the new arcade games, the Bijou films, karaoke timing and ground-aware footsteps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/pawville/world/geometry.ts';
import {
  RUSH_GAME_MS, RUSH_HEARTS, RUSH_TRAY_MAX, addToTray, clearTray, newRush, patienceAt, rushTokens, serve, tickRush, trayMatches, type RushItem, type RushState,
} from '../src/pawville/city/cafeRush.ts';
import { BOOT_PENALTY_MS, CATCH_WINDOW, FRENZY_GAME_MS, HOOK_X, comboMultiplier, frenzyTokens, moveHook, newFrenzy, snap, tickFrenzy, type FrenzyState } from '../src/pawville/city/fishFrenzy.ts';
import { FILMS, filmAt, filmLength, sceneFade, showingFilms } from '../src/pawville/city/cinema.ts';
import { GOOD_MS, PERFECT_MS, SONGS, accuracy, allWords, beatMs, expire, newRun, songLengthMs, stars, tap } from '../src/pawville/city/karaoke.ts';
import { surfaceAt, surfaceOfTile, townSurfaceOfTile, STEP_SOUND } from '../src/pawville/world/footsteps.ts';
import { RG } from '../src/pawville/adventure/regionKit.ts';
import { regionDef } from '../src/pawville/adventure/regions.ts';
import type { AdvView } from '../src/pawville/adventure/state.ts';

// ---- Cat Café Rush ---------------------------------------------------------------------------
const withCustomer = (order: RushItem[], seat = 0): RushState => {
  const s = newRush();
  const seats = s.seats.slice();
  seats[seat] = { id: 1, order, patience: 10000, max: 10000, coat: 0 };
  return { ...s, seats };
};

test('café rush: a customer arrives, can be served with a matching tray (any order) and tips when quick', () => {
  const rand = seededRandom(7);
  let s = newRush();
  for (let i = 0; i < 20 && !s.seats.some(Boolean); i++) s = tickRush(s, 100, rand);
  const seat = s.seats.findIndex(Boolean);
  assert.ok(seat >= 0, 'someone sat down');
  const c = s.seats[seat]!;
  for (const it of [...c.order].reverse()) s = addToTray(s, it);
  assert.ok(trayMatches(s.tray, c.order));
  s = serve(s, seat);
  assert.equal(s.served, 1);
  assert.equal(s.seats[seat], null);
  assert.equal(s.tray.length, 0);
  assert.equal(s.last?.kind, 'served');
  assert.ok(s.last?.kind === 'served' && s.last.tip, 'served right away → tip');
});

test('café rush: a wrong tray costs patience (not a heart) and clears the tray; serving an empty stool does nothing', () => {
  let s = withCustomer(['milk']);
  s = addToTray(s, 'cake');
  s = serve(s, 0);
  assert.equal(s.last?.kind, 'wrong');
  assert.equal(s.tray.length, 0);
  assert.equal(s.hearts, RUSH_HEARTS);
  assert.ok(s.seats[0]!.patience < 10000);
  const before = s;
  s = addToTray(s, 'milk');
  s = serve(s, 1);
  assert.equal(s.last?.kind, 'empty-seat');
  assert.equal(s.served, before.served);
});

test('café rush: tray holds three; a customer who runs out of patience costs one heart; the shift ends', () => {
  let s = newRush();
  for (let i = 0; i < RUSH_TRAY_MAX + 2; i++) s = addToTray(s, 'fish');
  assert.equal(s.tray.length, RUSH_TRAY_MAX);
  assert.equal(s.last?.kind, 'tray-full');
  assert.equal(clearTray(s).tray.length, 0);
  let w = withCustomer(['milk']);
  w = { ...w, nextSpawn: 1e9 };
  w = tickRush(w, 10001, seededRandom(1));
  assert.equal(w.hearts, RUSH_HEARTS - 1);
  assert.equal(w.seats[0], null);
  // three walk-outs end the shift early
  let x = { ...newRush(), hearts: 1, nextSpawn: 1e9 };
  x = { ...x, seats: [{ id: 1, order: ['milk'], patience: 5, max: 10, coat: 0 }, null, null] };
  x = tickRush(x, 10, seededRandom(2));
  assert.ok(x.over);
  // and the clock ends it otherwise
  let y = newRush();
  const r = seededRandom(3);
  for (let t = 0; t < RUSH_GAME_MS + 1000 && !y.over; t += 500) { y = tickRush(y, 500, r); y = { ...y, hearts: RUSH_HEARTS }; }
  assert.ok(y.over && y.t === RUSH_GAME_MS);
  // nothing changes after the end
  assert.equal(serve(addToTray(y, 'milk'), 0), addToTray(y, 'milk'));
});

test('café rush: patience shrinks over the shift but never below 7 s; token table', () => {
  assert.ok(patienceAt(0) > patienceAt(60000));
  assert.ok(patienceAt(10 * 60000) >= 7000);
  assert.deepEqual([0, 1, 4, 8, 12, 18].map(rushTokens), [0, 1, 2, 3, 4, 5]);
});

// ---- Fish Frenzy ----------------------------------------------------------------------------
const fish = (s: FrenzyState, kind: FrenzyState['fish'][number]['kind'], x = HOOK_X, lane = s.lane): FrenzyState => ({ ...s, fish: [...s.fish, { id: s.nextId, lane, kind, x, v: 20 }], nextId: s.nextId + 1 });

test('fish frenzy: snapping on a fish in the hook lane catches it; combos multiply; a miss resets the combo', () => {
  let s = { ...newFrenzy(), nextSpawn: 1e9 };
  s = snap(fish(s, 'minnow'));
  assert.equal(s.caught, 1);
  assert.equal(s.score, 1);
  for (let i = 0; i < 3; i++) s = snap(fish(s, 'sardine', HOOK_X + CATCH_WINDOW - 1));
  assert.equal(s.combo, 4);
  assert.equal(comboMultiplier(3), 2);
  assert.equal(s.score, 1 + 2 + 2 + 2 * 2);
  s = snap(fish(s, 'koi', HOOK_X + CATCH_WINDOW + 3));
  assert.equal(s.last?.kind, 'miss');
  assert.equal(s.combo, 0);
  assert.equal(s.bestCombo, 4);
  // a fish in another lane is not caught
  s = snap(fish(s, 'golden', HOOK_X, (s.lane + 1) % 4));
  assert.equal(s.last?.kind, 'miss');
});

test('fish frenzy: an old boot costs time; the hook stays in the lanes; the game ends at the limit', () => {
  let s = { ...newFrenzy(), nextSpawn: 1e9 };
  s = snap(fish(s, 'boot'));
  assert.equal(s.last?.kind, 'boot');
  assert.equal(s.limit, FRENZY_GAME_MS - BOOT_PENALTY_MS);
  for (let i = 0; i < 6; i++) s = moveHook(s, 1);
  assert.equal(s.lane, 3);
  for (let i = 0; i < 6; i++) s = moveHook(s, -1);
  assert.equal(s.lane, 0);
  const r = seededRandom(9);
  let g = newFrenzy();
  let spawned = 0;
  for (let t = 0; t < FRENZY_GAME_MS + 500 && !g.over; t += 100) { g = tickFrenzy(g, 100, r); spawned = Math.max(spawned, g.nextId); }
  assert.ok(g.over);
  assert.ok(spawned > 40, 'plenty of fish swim by');
  assert.ok(g.fish.every((f) => f.x > -12 && f.x < 112), 'fish leave the screen');
  assert.deepEqual([0, 8, 25, 50, 80, 120].map(frenzyTokens), [0, 1, 2, 3, 4, 5]);
});

// ---- The Bijou ------------------------------------------------------------------------------
const view = (flags: string[] = [], done: string[] = []): AdvView => ({ has: (f: string) => flags.includes(f), done: (q: string) => done.includes(q) } as unknown as AdvView);

test('cinema: films unlock with the stories they tell; playback walks through every scene once', () => {
  assert.deepEqual(showingFilms(view()).map((f) => f.id), ['whiskers-at-sea']);
  assert.equal(showingFilms(view(['clock-fixed'], ['lost-star'])).length, FILMS.length);
  for (const f of FILMS) {
    assert.ok(f.scenes.length >= 5);
    const seen = new Set<number>();
    for (let ms = 0; ms < filmLength(f); ms += 250) seen.add(filmAt(f, ms).index);
    assert.equal(seen.size, f.scenes.length, `${f.id}: every scene shown`);
    assert.ok(filmAt(f, filmLength(f) + 1).done);
    assert.ok(!filmAt(f, 0).done);
  }
  assert.equal(sceneFade(0, 4000), 0);
  assert.equal(sceneFade(2000, 4000), 1);
  assert.equal(sceneFade(4000, 4000), 0);
});

test('cinema: every scene can be painted without errors (software raster)', async () => {
  const { rasterFactory } = await import('../scripts/preview/raster.ts');
  const { drawFilmFrame, FILM_W, FILM_H } = await import('../src/pawville/render/filmArt.ts');
  const { factory } = rasterFactory();
  const c = factory(FILM_W, FILM_H);
  const ctx = (c as unknown as { getContext: () => CanvasRenderingContext2D }).getContext();
  for (const f of FILMS) for (const s of f.scenes) for (const k of [0, 0.5, 1]) drawFilmFrame(ctx, s, k, k * 3, 1);
});

// ---- Karaoke --------------------------------------------------------------------------------
test('karaoke: taps on the beat are perfect, near it good, far away ignored; untapped words expire as misses', () => {
  const song = SONGS[0];
  const b = beatMs(song);
  const w = allWords(song);
  let run = newRun(song);
  let r = tap(song, run, w[0].beat * b + PERFECT_MS - 5);
  assert.equal(r.grade, 'perfect');
  run = r.run;
  r = tap(song, run, w[1].beat * b - (GOOD_MS - 10));
  assert.equal(r.grade, 'good');
  run = r.run;
  r = tap(song, run, w[1].beat * b + b / 2); // halfway between words: nothing
  assert.equal(r.word, null);
  assert.equal(run.streak, 2);
  run = expire(song, run, w[3].beat * b + GOOD_MS + 1); // word 2 and 3 passed
  assert.equal(run.grades[2], 'miss');
  assert.equal(run.grades[3], 'miss');
  assert.equal(run.streak, 0);
  assert.equal(run.bestStreak, 2);
});

test('karaoke: a perfect run gets three stars; every song is well formed', () => {
  for (const song of SONGS) {
    const b = beatMs(song);
    let run = newRun(song);
    const words = allWords(song);
    for (let i = 1; i < words.length; i++) assert.ok(words[i].beat > words[i - 1].beat, `${song.id}: beats increase`);
    for (const w of words) run = tap(song, run, w.beat * b).run;
    assert.equal(stars(run), 3);
    assert.equal(accuracy(run), 1);
    assert.ok(songLengthMs(song) > words[words.length - 1].beat * b);
  }
  assert.equal(stars(newRun(SONGS[0])), 0);
});

// ---- Footsteps ------------------------------------------------------------------------------
test('footsteps: every region tile and town tile maps to a surface with a sound', () => {
  for (const t of Object.values(RG)) assert.ok(STEP_SOUND[surfaceOfTile(t)], `tile ${t}`);
  for (let t = 0; t <= 10; t++) assert.ok(STEP_SOUND[townSurfaceOfTile(t)]);
  assert.equal(surfaceOfTile(RG.Bridge), 'wood');
  assert.equal(surfaceOfTile(RG.Carpet), 'carpet');
  assert.equal(surfaceOfTile(RG.Cobble), 'stone');
  assert.equal(townSurfaceOfTile(5), 'wood');
  // the arcade floor is carpet; the city boardwalk is wood
  assert.equal(surfaceAt(regionDef('arcade-hall'), 192, 200), 'carpet');
  const park = regionDef('city-park');
  assert.equal(surfaceAt(park, 14 * 16 + 8, 30 * 16 + 10), 'wood', 'the pond bridge');
});
