/**
 * Karaoke expansion: six new original songs, a backing band built from the lyrics' own tempo, accents for accurate taps,
 * a count-in, vocals-only and unlock rules. The pure parts are tested here; what the band SOUNDS like is only checked
 * objectively (non-silent, no clipping, on the grid) — nobody has listened to it in an automated test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOD_MS, PERFECT_MS, SONGS, accuracy, allWords, beatMs, newRun, songLengthMs, songUnlocked, stars, tap } from '../src/pawville/city/karaoke.ts';
import { NEW_SONGS } from '../src/pawville/city/karaokeSongs.ts';
import { barCount, buildBacking, countIn, guideVocal, inBreakAt, instrumentalBreaks, parseChord, tapAccent } from '../src/pawville/city/karaokeBacking.ts';
import { renderOffline, RECIPES, type VoiceId } from '../src/pawville/audio/synth.ts';
import { emptyAdventure, viewOf, addFlags } from '../src/pawville/adventure/state.ts';
import { completeScene } from '../src/pawville/story/engine.ts';

const CLASSIC = SONGS.slice(0, 3);

test('karaoke: the three original songs are preserved exactly, and the six new ones come after', () => {
  assert.deepEqual(SONGS.slice(0, 3).map((s) => s.id), ['window-seat', 'biscuits-song', 'lantern-alley']);
  assert.equal(SONGS.length, 9);
  assert.equal(allWords(SONGS[0]).map((w) => w.text).join(' '), 'Sun on the window seat warm little paws Rain on the rooftops now I stay because you are here with me');
  assert.equal(allWords(SONGS[1]).map((w) => w.text).join(' '), 'Down by the fountain coins full of wishes one little melody finally finished sing it with me');
  assert.equal(allWords(SONGS[2]).map((w) => w.text).join(' '), 'Light the lanterns one by one cobbles glowing gold Walk me home the long way round paw in paw');
  assert.deepEqual([SONGS[0].bpm, SONGS[1].bpm, SONGS[2].bpm], [92, 100, 84]);
  assert.equal(new Set(SONGS.map((s) => s.id)).size, 9);
});

test('karaoke: every new song is well formed, in a singable range, long enough to be a song, and has real words', () => {
  assert.equal(NEW_SONGS.length, 6);
  for (const s of NEW_SONGS) {
    const w = allWords(s), b = beatMs(s);
    assert.ok(s.title && s.by && s.genre && s.blurb && s.backing, `${s.id}: metadata`);
    assert.ok(w.length >= 60, `${s.id}: ${w.length} words`);
    for (let i = 1; i < w.length; i++) assert.ok(w[i].beat > w[i - 1].beat, `${s.id}: beats must increase at word ${i} (${w[i].text})`);
    for (const x of w) { assert.ok(x.note >= 200 && x.note <= 900, `${s.id}: ${x.text} at ${x.note.toFixed(0)}Hz`); assert.ok(x.text.length > 0 && !/[-]/.test(x.text)); }
    const sec = songLengthMs(s) / 1000;
    assert.ok(sec >= 45 && sec <= 140, `${s.id}: ${sec.toFixed(0)}s`);
    assert.ok(w[0].beat >= s.backing!.beatsPerBar, `${s.id}: a bar of count-in before the first word`);
    // every word is at least 0.45 beats from the next (it must be tappable)
    for (let i = 1; i < w.length; i++) assert.ok((w[i].beat - w[i - 1].beat) * b >= 150, `${s.id}: words ${i - 1}/${i} too close`);
    let run = newRun(s); for (const x of w) run = tap(s, run, x.beat * b).run;
    assert.equal(stars(run), 3); assert.equal(accuracy(run), 1);
  }
});

test('karaoke: the six new songs are varied — tempo, groove, feel, mode, chords and melody all differ', () => {
  assert.equal(new Set(NEW_SONGS.map((s) => s.bpm)).size, 6);
  assert.equal(new Set(NEW_SONGS.map((s) => s.backing!.groove)).size, 6);
  assert.equal(new Set(NEW_SONGS.map((s) => s.backing!.progression.join('-'))).size, 6);
  assert.equal(new Set(NEW_SONGS.map((s) => allWords(s).slice(0, 10).map((x) => Math.round(x.note)).join(','))).size, 6, 'different opening melodies');
  const genres = NEW_SONGS.map((s) => s.genre!.toLowerCase()).join(' | ');
  for (const need of ['pop', 'funk', 'shanty', 'funny', 'duet', 'cozy']) assert.match(genres, new RegExp(need), `a ${need} song`);
  const bpbs = new Set(NEW_SONGS.map((s) => s.backing!.beatsPerBar));
  assert.ok(bpbs.has(4) && bpbs.has(3) && bpbs.has(2), '4/4, 3/4 and 6/8 feels');
  assert.ok(Math.max(...NEW_SONGS.map((s) => s.bpm)) - Math.min(...NEW_SONGS.map((s) => s.bpm)) >= 60, 'a wide tempo range');
  const duet = NEW_SONGS.find((s) => s.duet)!;
  assert.equal(duet.parts!.length, duet.lines.length);
  assert.ok(new Set(duet.parts).size === 3, 'parts A, B and together');
});

test('karaoke: song unlocks are clear, persistent and consistent with the existing world state', () => {
  const byId = (id: string) => SONGS.find((s) => s.id === id)!;
  const v0 = viewOf(emptyAdventure());
  for (const s of CLASSIC) assert.ok(songUnlocked(s, v0));
  for (const id of ['pocket-full-of-biscuits', 'cat-walk-groove', 'yarn-ball-disaster']) assert.ok(songUnlocked(byId(id), v0), `${id} is open from the start`);
  assert.ok(!songUnlocked(byId('lighthouse-shanty'), v0) && songUnlocked(byId('lighthouse-shanty'), viewOf(addFlags(emptyAdventure(), ['harbor-restored']).state)));
  assert.ok(!songUnlocked(byId('winter-lanterns'), v0) && songUnlocked(byId('winter-lanterns'), viewOf(addFlags(emptyAdventure(), ['region:highlands']).state)));
  const duet = byId('two-paws-one-umbrella');
  assert.ok(!songUnlocked(duet, v0));
  assert.ok(songUnlocked(duet, viewOf({ ...emptyAdventure(), quests: { 'biscuits-song': { status: 'done', step: 3, count: 0, hits: [], startedAt: 1 } } })), 'finishing Biscuit’s Song opens the duet');
  assert.ok(songUnlocked(duet, viewOf(completeScene({ ...emptyAdventure(), flags: ['lumi-home'] }, 'a1-end'))), 'so does sharing the five notes in the story');
  for (const s of SONGS) if (s.unlock) assert.ok(s.unlock.text.length > 10, `${s.id}: unlock text`);
  assert.ok(songUnlocked(duet, undefined), 'with no world state given, nothing is hidden');
});

test('band: every song has a deterministic backing with drums, bass, chords and a counter-melody, all on the song’s own tempo', () => {
  const need: Record<string, VoiceId[]> = {
    ballad: ['bass', 'pad', 'box'], folk: ['bass', 'pad', 'strum', 'shaker'], pop: ['kick', 'snare', 'hat', 'shaker', 'tamb', 'bass', 'pad', 'stab', 'lead'],
    funk: ['kick', 'snare', 'hat', 'ohat', 'cowbell', 'bass', 'stab', 'organ'], shanty: ['stomp', 'clap', 'tamb', 'bass', 'accordion', 'whistle'],
    comic: ['kick', 'clap', 'hat', 'rim', 'cowbell', 'bass', 'stab', 'whistle'], duet: ['kick', 'rim', 'shaker', 'bass', 'pad', 'pluck'], waltz: ['bass', 'pad', 'pluck', 'shaker', 'box'],
  };
  for (const s of SONGS) {
    const notes = buildBacking(s), beat = 60 / s.bpm, spec = s.backing!;
    assert.ok(notes.length > 50, `${s.id}: ${notes.length} notes`);
    assert.deepEqual(buildBacking(s), notes, `${s.id}: deterministic`);
    const voices = new Set(notes.map((n) => n.voice));
    for (const v of need[spec.groove]) assert.ok(voices.has(v), `${s.id} (${spec.groove}) has no ${v}`);
    let prev = -1;
    for (const n of notes) { assert.ok(Number.isFinite(n.t) && n.t >= prev - 1e-9 && n.dur > 0 && Number.isFinite(n.freq) && n.freq > 0 && n.vel > 0 && n.vel <= 1 && RECIPES[n.voice], `${s.id}: bad note ${JSON.stringify(n)}`); prev = n.t; }
    const first = Math.floor(allWords(s)[0].beat / spec.beatsPerBar) * spec.beatsPerBar * beat;
    assert.ok(notes[0].t >= first - 1e-9, `${s.id}: the band waits for the count-in`);
    const last = notes[notes.length - 1].t;
    assert.ok(last <= (barCount(s) * spec.beatsPerBar) * beat + 1e-6, `${s.id}: nothing after the final bar`);
    assert.ok(last >= (allWords(s)[allWords(s).length - 1].beat) * beat, `${s.id}: the band plays to the end of the words`);
  }
  // fills appear in the drum grooves
  for (const id of ['pocket-full-of-biscuits', 'cat-walk-groove', 'yarn-ball-disaster', 'lighthouse-shanty']) assert.ok(buildBacking(SONGS.find((s) => s.id === id)!).some((n) => n.voice === 'tom' || (n.voice === 'stomp' && n.vel >= 0.8)), `${id}: a fill`);
  // the backing is tied to the song's tempo: the same song at a different bpm is the same music, scaled
  const s = SONGS.find((x) => x.id === 'cat-walk-groove')!;
  const slow = buildBacking({ ...s, bpm: s.bpm / 2 });
  const base = buildBacking(s);
  assert.equal(slow.length, base.length);
  base.slice(0, 200).forEach((n, i) => assert.ok(Math.abs(slow[i].t - n.t * 2) < 1e-9));
});

test('band: bar lines fall exactly on the beat grid (kicks on beat one, snares on two and four)', () => {
  for (const id of ['pocket-full-of-biscuits', 'cat-walk-groove']) {
    const s = SONGS.find((x) => x.id === id)!, beat = 60 / s.bpm;
    const notes = buildBacking(s);
    for (const n of notes.filter((x) => x.voice === 'kick' || x.voice === 'snare')) {
      const step = n.t / (beat / 4);
      assert.ok(Math.abs(step - Math.round(step)) < 1e-6, `${id}: ${n.voice} off the 16th grid`);
    }
    const snares = notes.filter((x) => x.voice === 'snare' && x.vel > 0.5);
    for (const n of snares.slice(0, 40)) { const b = (n.t / beat) % 4; assert.ok([1, 3, 3.5, 3.75].some((k) => Math.abs(b - k) < 1e-6), `${id}: a loud snare off beats two/four or the fill (${b})`); }
  }
});

test('band: the count-in matches the bar, and accurate taps add accents while misses add nothing', () => {
  for (const s of SONGS) {
    const c = countIn(s), bpb = s.backing!.beatsPerBar;
    assert.equal(c.length, bpb);
    c.forEach((n, i) => assert.ok(Math.abs(n.t - (i * 60) / s.bpm) < 1e-9));
    assert.equal(c[0].voice, 'cowbell'); assert.ok(c[0].vel > c[1].vel, 'the first click is accented');
    assert.ok(allWords(s)[0].beat >= bpb);
  }
  assert.ok(tapAccent('perfect', 1, 440).length >= 2 && tapAccent('good', 1, 440).length === 1);
  assert.ok(tapAccent('perfect', 1, 440).every((n) => n.t === 1 && n.vel <= 0.6));
  // a missed or stray tap changes nothing in the run (it never ends the song or the streak)
  const s = SONGS[3]; const b = beatMs(s); const run = newRun(s);
  const stray = tap(s, run, allWords(s)[0].beat * b + b / 2);
  assert.equal(stray.word, null); assert.equal(stray.run, run);
  assert.ok(GOOD_MS > PERFECT_MS);
});

test('band: instrumental breaks are found where the singers rest, and the lyric view can say so', () => {
  const cat = SONGS.find((s) => s.id === 'cat-walk-groove')!;
  const br = instrumentalBreaks(cat);
  assert.ok(br.length >= 1 && br[0][1] > br[0][0]);
  const w = allWords(cat), beat = beatMs(cat);
  const gapAt = w.findIndex((x, i) => i > 0 && x.beat - w[i - 1].beat >= 6);
  const mid = ((w[gapAt - 1].beat + w[gapAt].beat) / 2) * beat;
  assert.ok(inBreakAt(cat, mid));
  assert.ok(!inBreakAt(cat, w[5].beat * beat));
  for (const id of ['pocket-full-of-biscuits', 'lighthouse-shanty', 'yarn-ball-disaster', 'two-paws-one-umbrella', 'winter-lanterns']) assert.ok(instrumentalBreaks(SONGS.find((s) => s.id === id)!).length >= 1, `${id} has an instrumental break`);
  assert.equal(parseChord('Em7').seventh, 10); assert.equal(parseChord('Am').third, 3); assert.equal(parseChord('G7').third, 4);
  assert.throws(() => parseChord('H'));
});

test('band: every song renders to audio that is not silent, never clips, and is reproducible', () => {
  for (const s of SONGS) {
    const notes = [...countIn(s), ...buildBacking(s), ...guideVocal(s)].filter((n) => n.t < 16);
    const pcm = renderOffline(notes, 11025, 1);
    let peak = 0, energy = 0, zero = 0;
    for (const x of pcm) { peak = Math.max(peak, Math.abs(x)); energy += x * x; if (Math.abs(x) < 1e-4) zero++; }
    assert.ok(peak > 0.1 && peak <= 0.93, `${s.id}: peak ${peak.toFixed(2)}`);
    assert.ok(energy / pcm.length > 1e-4, `${s.id}: too quiet`);
    assert.ok(zero / pcm.length < 0.6, `${s.id}: mostly silence`);
    const again = renderOffline(notes, 11025, 1);
    assert.equal(again.length, pcm.length);
    for (let i = 0; i < pcm.length; i += 997) assert.equal(again[i], pcm[i]);
  }
});

test('band: the vocal guide follows the lyric timing (it is the same melody the words carry)', () => {
  for (const s of NEW_SONGS) {
    const g = guideVocal(s), w = allWords(s);
    assert.equal(g.length, w.length);
    g.forEach((n, i) => { assert.ok(Math.abs(n.t - w[i].beat * (60 / s.bpm)) < 1e-9); assert.equal(n.freq, w[i].note); });
  }
});
