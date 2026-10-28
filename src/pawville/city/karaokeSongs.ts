/**
 * Six new ORIGINAL karaoke songs (The Song Beneath the Stars expansion). Every lyric and melody here was written for
 * Pawville; nothing is taken from any commercial song. They are deliberately different from one another in tempo, feel,
 * key/mode, chord progression and arrangement (the arrangement lives in karaokeBacking.ts, selected by `backing.groove`):
 *
 *   Pocket Full of Biscuits  — upbeat pop            · 124 bpm · C major
 *   Cat Walk Groove          — funky, groove-driven  · 104 bpm · E dorian
 *   Lighthouse Shanty        — sea-shanty (6/8)      · 112 pulses/min · D minor        (unlocks when Pawport is restored)
 *   The Yarn Ball Disaster   — funny and frantic     · 150 bpm · C major (polka-ish)
 *   Two Paws, One Umbrella   — a rainy-day duet      ·  78 bpm · F major               (unlocks with Biscuit's friendship)
 *   Winter Lanterns          — cozy seasonal waltz   ·  66 bpm · A minor               (unlocks at Frostbell)
 *
 * The three songs that already existed (Window Seat, Biscuit's Song, Lantern Alley) are untouched in karaoke.ts.
 * The lullaby of the main story is NOT a karaoke song, and none of these is a version of it.
 */
import type { KaraokeSong, KaraokeWord } from './karaoke.ts';

const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A scale degree token → Hz. '5' = 5th degree, '3+' = an octave up, '6-' = an octave down, 'b3' / '#4' = flat / sharp. */
function degree(mode: keyof typeof MODES, tonic: number, token: string): number {
  let s = token, shift = 0, oct = 0;
  while (s.startsWith('b') || s.startsWith('#')) { shift += s[0] === 'b' ? -1 : 1; s = s.slice(1); }
  while (s.endsWith('+')) { oct += 1; s = s.slice(0, -1); }
  while (s.endsWith('-')) { oct -= 1; s = s.slice(0, -1); }
  const d = Number(s) - 1;
  return hz(tonic + MODES[mode][((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct) + shift);
}

interface Ln {
  /** words (one tap each), separated by spaces */
  t: string;
  /** scale degrees, one per word (cycled if shorter) */
  n: string;
  /** beats each word lasts before the next (cycled; default 1) */
  r?: string;
  /** extra beats after the line (a breath, an instrumental break) */
  gap?: number;
  /** duet: who sings the line */
  who?: 'A' | 'B' | 'both';
}

function build(start: number, mode: keyof typeof MODES, tonic: number, lines: readonly Ln[], snap = 2): { lines: KaraokeWord[][]; who?: ('A' | 'B' | 'both')[] } {
  let cursor = start;
  const out: KaraokeWord[][] = [];
  const who: ('A' | 'B' | 'both')[] = [];
  for (const l of lines) {
    // "sun-rise" is two taps (two syllables) drawn as one word
    const words: { text: string; cont: boolean }[] = [];
    for (const tok of l.t.split(' ')) tok.split('-').forEach((syl, k) => { if (syl) words.push({ text: syl, cont: k > 0 }); });
    const notes = l.n.split(' '), rhythm = (l.r ?? '1').split(' ').map(Number);
    const line: KaraokeWord[] = [];
    words.forEach((w, i) => {
      line.push({ text: w.text, beat: cursor, note: degree(mode, tonic, notes[i % notes.length]), ...(w.cont ? { cont: true } : {}) });
      cursor += rhythm[i % rhythm.length];
    });
    // every line starts on the beat of a bar (or half bar), so the words sit neatly on the band's chords
    cursor = Math.ceil(cursor / snap - 1e-9) * snap + (l.gap ?? 0);
    out.push(line);
    who.push(l.who ?? 'both');
  }
  return { lines: out, who };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Pocket Full of Biscuits — upbeat pop (4/4, 124 bpm, C major). Count-in bar, 2 verses, a chorus twice, a bridge.
// ---------------------------------------------------------------------------------------------------------------------
const biscuits = build(4, 'major', 60, [
  // verse 1
  { t: 'Woke up with the sun-rise purr-ing', n: '5 5 3 5 6 5 3 2', r: '1 1 1 1 1 1 1 1' },
  { t: 'Pock-ets full of bis-cuits, read-y', n: '3 3 5 3 6 5 3 2', gap: 0 },
  { t: 'Whis-kers up and tail a-swing-ing', n: '5 5 6 5 3 2 3 5' },
  { t: 'Noth-ing’s gon-na slow me down', n: '6 6 5 3 2 3 1', r: '1 1 1 1 1 1 2' },
  // chorus
  { t: 'Bis-cuit bis-cuit ev-ry-bod-y sing', n: '5 5 6 6 5 3 5 6 5', r: '1 1 1 1 .5 .5 1 1 2', who: 'both' },
  { t: 'Share a lit-tle crumb with me', n: '3 3 5 6 5 3 2', r: '1 1 1 1 1 1 2' },
  { t: 'Bis-cuit bis-cuit ring the lit-tle bell', n: '5 5 6 6 5 3 5 6 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Ev-ry day’s a par-ty, can’t you tell', n: '6 6 5 3 2 3 5 3 1', r: '1 1 .5 .5 1 1 1 1 2', gap: 8 },
  // verse 2
  { t: 'Met a cat by the foun-tain danc-ing', n: '5 5 3 5 6 5 3 2 3' },
  { t: 'Traded half a bis-cuit for a song', n: '3 3 5 3 6 5 3 2 1', r: '1 1 1 1 1 1 1 1 2' },
  { t: 'Sun-set on the roofs be-gan to glow', n: '5 5 6 5 3 2 3 5', r: '1 1 1 1 1 1 1 2' },
  { t: 'Four-teen friends and so much fun', n: '6 6 5 3 2 3 1', r: '1 1 1 1 1 1 2' },
  // chorus again, then the big finish
  { t: 'Bis-cuit bis-cuit ev-ry-bod-y sing', n: '5 5 6 6 5 3 5 6 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Share a lit-tle crumb with me', n: '3 3 5 6 5 3 2', r: '1 1 1 1 1 1 2' },
  { t: 'Bis-cuit bis-cuit ring the lit-tle bell', n: '5 5 6 6 5 3 5 6 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Ev-ry day’s a par-ty, can’t you tell', n: '6 6 5 3 2 3 5 3 1+', r: '1 1 .5 .5 1 1 1 1 2' },
]);

// ---------------------------------------------------------------------------------------------------------------------
// 2. Cat Walk Groove — funk (4/4, 104 bpm, E dorian). Syncopated words, a four-bar instrumental break in the middle.
// ---------------------------------------------------------------------------------------------------------------------
const groove = build(4, 'dorian', 64, [
  { t: 'Slink slink slink-y down the hall', n: '1 1 3 5 3 1 b7-', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Tail up high and not a care', n: '5 6 5 3 1 3 5', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Stair-case stage and I’m the star', n: '3 5 6 5 3 1 b7-', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Wait-ing for the beat to drop', n: '1 3 5 6 5 3 1', r: '1 .5 .5 1 1 1 2' },
  { t: 'Cat walk cat walk shake it by the door', n: '5 5 6 6 5 3 1 3 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Cat walk cat walk pad-ding on the floor', n: '5 5 6 6 5 3 1 3 5', r: '1 1 1 1 .5 .5 1 1 2', gap: 12 },
  { t: 'Nine lives nine moves nine good rea-sons', n: '1 1 3 5 3 1 3 5', r: '1 .5 .5 1 .5 .5 1 1', gap: 1 },
  { t: 'Cream-y moon-light in my eyes', n: '5 6 5 3 1 3 5', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Zoo-mies at the mid-night hour', n: '3 5 6 5 3 1 b7-', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Noth-ing here can touch the grooove', n: '1 3 5 6 5 3 1', r: '1 .5 .5 1 1 1 2' },
  { t: 'Cat walk cat walk shake it by the door', n: '5 5 6 6 5 3 1 3 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Cat walk cat walk pad-ding on the floor', n: '5 5 6 6 5 3 1 3 5', r: '1 1 1 1 .5 .5 1 1 2' },
  { t: 'Last-ing one more time— meow', n: '6 6 5 3 1+', r: '1 1 1 1 3' },
]);

// ---------------------------------------------------------------------------------------------------------------------
// 3. Lighthouse Shanty — sea-shanty (6/8 felt as 2 pulses per bar, 112 pulses/min, D minor). Verse / "haul!" response.
// ---------------------------------------------------------------------------------------------------------------------
const shanty = build(2, 'minor', 62, [
  { t: 'Oh the lamp is lit at Paw-port bay', n: '5 5 5 3 5 6 5', r: '1 .5 .5 1 .5 .5 1' },
  { t: 'Haul a-way the line', n: '5 3 2 1', r: '1 .5 .5 2' },
  { t: 'The gulls are loud and the tide is grey', n: '5 5 5 3 5 6 5 3', r: '1 .5 .5 1 .5 .5 .5 .5' },
  { t: 'Haul a-way the line', n: '5 3 2 1', r: '1 .5 .5 2' },
  { t: 'Heave ho heave ho the fish-es come', n: '5 5 6 6 5 3 2 3', r: '1 1 1 1 .5 .5 1 1' },
  { t: 'Heave ho heave ho we’ll all go home', n: '5 5 6 6 5 3 2 1', r: '1 1 1 1 .5 .5 1 2', gap: 6 },
  { t: 'A cap-tain’s cat has a sil-ver bell', n: '5 5 5 3 5 6 5 3', r: '1 .5 .5 1 .5 .5 .5 .5' },
  { t: 'Haul a-way the line', n: '5 3 2 1', r: '1 .5 .5 2' },
  { t: 'And ev-ery wave has a tale to tell', n: '5 5 5 3 5 6 5 3', r: '1 .5 .5 1 .5 .5 .5 .5' },
  { t: 'Haul a-way the line', n: '5 3 2 1', r: '1 .5 .5 2' },
  { t: 'Heave ho heave ho the fish-es come', n: '5 5 6 6 5 3 2 3', r: '1 1 1 1 .5 .5 1 1' },
  { t: 'Heave ho heave ho we’ll all go home', n: '5 5 6 6 5 3 2 1', r: '1 1 1 1 .5 .5 1 2', gap: 2 },
  { t: 'Roll the lamp a-round a-round', n: '3 5 6 5 3 2 1', r: '1 1 1 1 1 1 2' },
  { t: 'Lights be-hind and lights a-head', n: '3 5 6 5 3 2 1', r: '1 1 1 1 1 1 2' },
  { t: 'Heave ho heave ho we’ll all go home', n: '5 5 6 6 5 3 2 1+', r: '1 1 1 1 .5 .5 1 3' },
], 2);

// ---------------------------------------------------------------------------------------------------------------------
// 4. The Yarn Ball Disaster — funny, frantic oom-pah (4/4, 150 bpm, C major).
// ---------------------------------------------------------------------------------------------------------------------
const yarn = build(4, 'major', 60, [
  { t: 'I on-ly want-ed one small ball of yarn', n: '1 3 5 5 6 5 3 2 1', r: '1 1 1 .5 .5 1 1 1 1' },
  { t: 'Now it’s round the dog the lamp and the barn', n: '1 3 5 5 6 5 3 2 1', r: '1 1 1 .5 .5 1 1 1 1' },
  { t: 'Round the sofa round the stairs', n: '5 5 6 5 3 2 3', r: '1 .5 .5 1 1 1 1' },
  { t: 'Round the mayor’s fan-cy chairs', n: '5 5 6 5 3 2 1', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Oh no oh no oh no no no', n: '6 6 5 5 3 3 1 1', r: '1 .5 .5 1 .5 .5 1 1' },
  { t: 'There goes the yarn there goes the show', n: '5 6 5 3 2 3 5 6', r: '1 1 1 1 .5 .5 1 1' },
  { t: 'Un-rav-el-ing all a-round the town', n: '5 3 5 6 5 3 2 1', r: '.5 .5 .5 .5 1 1 1 1' },
  { t: 'Don’t look back I’m ty-ing it a-round', n: '5 3 5 6 5 3 2 1+', r: '1 1 1 1 1 1 1 2', gap: 8 },
  { t: 'Then the mail-man got a lit-tle stuck', n: '1 3 5 5 6 5 3 2 1', r: '1 1 1 .5 .5 1 1 1 1' },
  { t: 'And the bak-er lost his hat in luck', n: '1 3 5 5 6 5 3 2 1', r: '1 1 1 .5 .5 1 1 1 1' },
  { t: 'Round the fish-pond round the swing', n: '5 5 6 5 3 2 3', r: '1 .5 .5 1 1 1 1' },
  { t: 'Wait that’s not the yarn that’s a-ny-thing', n: '5 5 6 5 3 2 1', r: '1 .5 .5 1 1 1 1', gap: 1 },
  { t: 'Oh no oh no oh no no no', n: '6 6 5 5 3 3 1 1', r: '1 .5 .5 1 .5 .5 1 1' },
  { t: 'There goes the yarn there goes the show', n: '5 6 5 3 2 3 5 6', r: '1 1 1 1 .5 .5 1 1' },
  { t: 'And I got a — sweat-er out of it', n: '5 6 5 3 2 1+', r: '1 1 1 1 1 3' },
]);

// ---------------------------------------------------------------------------------------------------------------------
// 5. Two Paws, One Umbrella — a rainy-day duet (4/4, 78 bpm, F major). Parts: A / B / both.
// ---------------------------------------------------------------------------------------------------------------------
const duet = build(4, 'major', 65, [
  { t: 'Rain on the pave-ment, rain on the glass', n: '3 3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 1 2', who: 'A' },
  { t: 'Where is the sun-shine? Oh, let it pass', n: '3 3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 1 2', who: 'B' },
  { t: 'One lit-tle um-brel-la, plen-ty of room', n: '5 5 6 6 5 3 2 3 5', r: '1 1 1 1 1 1 1 1 2', who: 'A' },
  { t: 'Come a lit-tle clos-er, watch the ground bloom', n: '5 5 6 6 5 3 2 3 1', r: '1 1 1 1 1 1 1 1 2', who: 'B', gap: 1 },
  { t: 'Two paws one um-brel-la', n: '5 6 5 3 2 3', r: '1 1 1 1 1 3', who: 'both' },
  { t: 'You hold the han-dle and I hold your tail', n: '3 5 6 5 3 2 3 5 6', r: '1 1 1 1 1 1 1 1 2', who: 'both', gap: 8 },
  { t: 'Pud-dles are mir-rors, I like how we look', n: '3 3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 1 2', who: 'B' },
  { t: 'Rip-ples are ver-ses in a sky-wide book', n: '3 3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 1 2', who: 'A' },
  { t: 'Thun-der can grum-ble, thun-der can groan', n: '5 5 6 6 5 3 2 3 5', r: '1 1 1 1 1 1 1 1 2', who: 'A' },
  { t: 'Un-der our roof we are nev-er a-lone', n: '5 5 6 6 5 3 2 3 1', r: '1 1 1 1 1 1 1 1 2', who: 'B', gap: 1 },
  { t: 'Two paws one um-brel-la', n: '5 6 5 3 2 3', r: '1 1 1 1 1 3', who: 'both' },
  { t: 'Home is the place where we walk side by side', n: '3 5 6 5 3 2 3 5 6', r: '1 1 1 1 1 1 1 1 2', who: 'both', gap: 1 },
  { t: 'Let it keep rain-ing, we’ll stay dry in-side', n: '6 6 5 3 2 3 5 3 1', r: '1 1 1 1 1 1 1 1 4', who: 'both' },
]);

// ---------------------------------------------------------------------------------------------------------------------
// 6. Winter Lanterns — a cozy seasonal waltz (3/4, 66 bpm, A minor).
// ---------------------------------------------------------------------------------------------------------------------
const winter = build(3, 'minor', 57, [
  { t: 'Snow on the roof-tops, soft as a sigh', n: '3 5 5 6 5 3 2 3', r: '1 1 1 1 1 1 1 1' },
  { t: 'Lan-terns are glow-ing, one by one', n: '3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 2', gap: 1 },
  { t: 'Co-coa is steam-ing, mit-tens are warm', n: '3 5 5 6 5 3 2 3', r: '1 1 1 1 1 1 1 1' },
  { t: 'Win-ter has come to stay a-while', n: '3 5 6 5 3 2 1', r: '1 1 1 1 1 1 2', gap: 1 },
  { t: 'Hold the light hold the light', n: '5 6 5 3', r: '1 1 1 3' },
  { t: 'Through the long and qui-et night', n: '3 5 6 5 3 1', r: '1 1 1 1 1 3', gap: 6 },
  { t: 'Frost on the win-dow paints us a fern', n: '3 5 5 6 5 3 2 3', r: '1 1 1 1 1 1 1 1' },
  { t: 'Pur-ring a-gainst the e-ven-ing chill', n: '3 5 5 6 5 3 2 1', r: '1 1 1 1 1 1 1 2', gap: 1 },
  { t: 'Some-one is hum-ming, some-one stays near', n: '3 5 5 6 5 3 2 3', r: '1 1 1 1 1 1 1 1' },
  { t: 'Home is a light in the snow', n: '3 5 6 5 3 2 1', r: '1 1 1 1 1 1 2', gap: 1 },
  { t: 'Hold the light hold the light', n: '5 6 5 3', r: '1 1 1 3' },
  { t: 'Through the long and qui-et night', n: '3 5 6 5 3 1', r: '1 1 1 1 1 3', gap: 1 },
  { t: 'Hold the light', n: '5 6 5', r: '1 1 6' },
], 3);

const tidy = (b: ReturnType<typeof build>) => b.lines as readonly (readonly KaraokeWord[])[];

/**
 * The new songs. `backing` picks the arrangement (karaokeBacking.ts). `unlock` is shown to the player in plain words and is
 * checked against persistent world state only (a finished quest, a restored place, a story milestone), never against a timer.
 */
export const NEW_SONGS: readonly KaraokeSong[] = [
  { id: 'pocket-full-of-biscuits', title: 'Pocket Full of Biscuits', by: 'The Purring Cup house band', bpm: 124, genre: 'Upbeat pop', blurb: 'Bouncy, bright and impossible not to tap along to.',
    backing: { groove: 'pop', progression: ['C', 'G', 'Am', 'F'], beatsPerBar: 4, root: 48 }, lines: tidy(biscuits) },
  { id: 'cat-walk-groove', title: 'Cat Walk Groove', by: 'Sol & the Slink Section', bpm: 104, genre: 'Funk', blurb: 'Slinky bass, chicken-scratch stabs and a cowbell that means business.',
    backing: { groove: 'funk', progression: ['Em7', 'Em7', 'A7', 'Em7'], beatsPerBar: 4, root: 40 }, lines: tidy(groove) },
  { id: 'lighthouse-shanty', title: 'Lighthouse Shanty', by: 'Pawport harbour crew', bpm: 112, genre: 'Sea shanty', blurb: 'Stomp, clap and answer “haul away!” — a call-and-response in 6/8.',
    unlock: { text: 'Restore Pawport Harbor (light the lighthouse).', when: (v) => v.has('harbor-restored') },
    backing: { groove: 'shanty', progression: ['Dm', 'Dm', 'Am', 'Dm', 'C', 'C', 'Dm', 'Am'], beatsPerBar: 2, root: 38 }, lines: tidy(shanty) },
  { id: 'yarn-ball-disaster', title: 'The Yarn Ball Disaster', by: 'Crumpet (and a very long string)', bpm: 150, genre: 'Funny', blurb: 'A frantic oom-pah that gets sillier with every verse.',
    backing: { groove: 'comic', progression: ['C', 'G7', 'C', 'G7', 'F', 'C', 'G7', 'C'], beatsPerBar: 4, root: 48 }, lines: tidy(yarn) },
  { id: 'two-paws-one-umbrella', title: 'Two Paws, One Umbrella', by: 'A rainy-day duet', bpm: 78, genre: 'Duet', blurb: 'A gentle duet for two voices (or one cat singing both). Parts are marked A, B and “together”.', duet: true,
    unlock: { text: 'Finish Biscuit’s Song at the arcade, or share the five notes with Biscuit (The Song Beneath the Stars).', when: (v) => v.done('biscuits-song') || v.story.done('a1-end') },
    backing: { groove: 'duet', progression: ['F', 'Dm', 'Bb', 'C'], beatsPerBar: 4, root: 41 }, lines: tidy(duet), parts: duet.who },
  { id: 'winter-lanterns', title: 'Winter Lanterns', by: 'Frostbell cabin choir', bpm: 66, genre: 'Cozy seasonal waltz', blurb: 'Snow, cocoa and lanterns, in three slow beats.',
    unlock: { text: 'Visit Frostbell Highlands.', when: (v) => v.has('region:highlands') },
    backing: { groove: 'waltz', progression: ['Am', 'F', 'C', 'G'], beatsPerBar: 3, root: 45 }, lines: tidy(winter) },
];
