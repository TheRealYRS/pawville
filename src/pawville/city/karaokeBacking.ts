/**
 * The Purring Cup's house band (pure). Turns a karaoke song into backing NOTES — kick, snare, hats, shaker, tambourine,
 * cowbell, bass lines, chord backing, counter-melodies, a count-in and the occasional fill — whose times come from the SAME
 * tempo as the lyrics (`beatMs`), so the words and the band can never drift apart. The browser plays the notes through the
 * shared AudioContext (karaokeAudio.ts); Node renders the very same notes to WAV for the preview recordings (scripts/).
 */
import type { Note, VoiceId } from '../audio/synth.ts';
import { midiToHz } from '../audio/synth.ts';
import type { KaraokeSong } from './karaoke.ts';
import { allWords } from './karaoke.ts';

export type Groove = 'ballad' | 'folk' | 'pop' | 'funk' | 'shanty' | 'comic' | 'duet' | 'waltz';
export interface BackingSpec {
  groove: Groove;
  /** One chord per bar, repeated for the whole song (e.g. ['C','G','Am','F']). */
  progression: readonly string[];
  /** Beats (lyric beats) per bar: 4 for 4/4, 3 for a waltz, 2 for 6/8 felt in two. */
  beatsPerBar: number;
  /** MIDI note of the tonic in the bass register. */
  root: number;
  /** Bars [from, to) that are instrumental breaks: the counter-melody takes the lead there. */
  breaks?: readonly (readonly [number, number])[];
}

// ---- chords ----------------------------------------------------------------------------------------------------------------
const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export interface Chord { root: number; third: number; fifth: number; seventh: number | null }
export function parseChord(name: string): Chord {
  const m = /^([A-G][b#]?)(m7|maj7|m|7|dim)?$/.exec(name);
  if (!m || PC[m[1]] === undefined) throw new Error(`bad chord ${name}`);
  const q = m[2] ?? '';
  const minor = q === 'm' || q === 'm7';
  return { root: PC[m[1]], third: minor ? 3 : 4, fifth: q === 'dim' ? 6 : 7, seventh: q === 'm7' || q === '7' ? 10 : q === 'maj7' ? 11 : null };
}
/** Chord tones (semitones above the chord root). */
const tones = (c: Chord): number[] => [0, c.third, c.fifth, ...(c.seventh !== null ? [c.seventh] : [])];
/** MIDI note of a chord's root at/above `floor`. */
const rootAbove = (c: Chord, floor: number): number => { let m = floor - (floor % 12) + c.root; if (m < floor) m += 12; return m; };

// ---- the grid ----------------------------------------------------------------------------------------------------------------
/** Steps per lyric beat: 4 (16ths) in 4/4 grooves, 3 (triplet eighths) for the shanty, 2 for the waltz. */
const STEPS: Record<Groove, number> = { ballad: 4, folk: 4, pop: 4, funk: 4, shanty: 3, comic: 4, duet: 4, waltz: 2 };

export function barCount(song: KaraokeSong): number {
  const bpb = song.backing?.beatsPerBar ?? 4;
  const words = allWords(song);
  return Math.ceil((words[words.length - 1].beat + 1) / bpb) + 1;
}

const note = (t: number, dur: number, midi: number, vel: number, voice: VoiceId): Note => ({ t, dur, freq: midiToHz(midi), vel, voice });
const hit = (t: number, vel: number, voice: VoiceId): Note => ({ t, dur: 0.1, freq: 200, vel, voice });

/** Bars where the singers rest for at least a bar and a half: the counter-melody takes the lead there. */
export function instrumentalBreaks(song: KaraokeSong): [number, number][] {
  const bpb = song.backing?.beatsPerBar ?? 4;
  const words = allWords(song);
  const out: [number, number][] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].beat - words[i - 1].beat;
    if (gap >= bpb * 1.5) out.push([Math.ceil((words[i - 1].beat + 2) / bpb), Math.floor(words[i].beat / bpb)]);
  }
  return out.filter(([a, b]) => b > a);
}

/** The count-in: one bar of clicks before the first lyric ("1, 2, 3, 4"). Always included, even in vocals-only mode. */
export function countIn(song: KaraokeSong): Note[] {
  const beat = 60 / song.bpm, bpb = song.backing?.beatsPerBar ?? 4;
  const out: Note[] = [];
  for (let i = 0; i < bpb; i++) out.push(hit(i * beat, i === 0 ? 0.9 : 0.6, i === 0 ? 'cowbell' : 'rim'));
  return out;
}

/** A small musical accent for an accurate tap (a missed tap simply adds nothing — it never stops or spoils the song). */
export function tapAccent(grade: 'perfect' | 'good', when: number, freq: number): Note[] {
  return grade === 'perfect'
    ? [hit(when, 0.55, 'tamb'), { t: when, dur: 0.3, freq: freq * 2, vel: 0.35, voice: 'bell' }]
    : [hit(when, 0.4, 'rim')];
}

// ---- the band ------------------------------------------------------------------------------------------------------------------
/** The whole backing track for a song (everything except the count-in). Deterministic. */
export function buildBacking(song: KaraokeSong): Note[] {
  const spec = song.backing;
  if (!spec) return [];
  const beat = 60 / song.bpm, bpb = spec.beatsPerBar, spb = STEPS[spec.groove];
  const bars = barCount(song);
  const out: Note[] = [];
  const stepSec = beat / spb, stepsPerBar = bpb * spb;
  const bar0 = Math.floor(allWords(song)[0].beat / bpb); // the first sung bar (bar 0 is the count-in)
  const breaks = [...(spec.breaks ?? []), ...instrumentalBreaks(song)];
  const inBreak = (bar: number) => breaks.some(([a, b]) => bar >= a && bar < b);
  for (let bar = bar0; bar < bars; bar++) {
    const c = parseChord(spec.progression[(bar - bar0) % spec.progression.length]);
    const t0 = bar * bpb * beat;
    const T = (step: number) => t0 + step * stepSec;
    const lastBar = bar === bars - 1;
    const brk = inBreak(bar);
    const section = bar - bar0;
    const bass = rootAbove(c, spec.root);
    const triad = tones(c).map((s) => rootAbove(c, 60) + s);
    const fillBar = !lastBar && (bar + 1) % 4 === 0 && section >= 3;
    if (lastBar) { // the band lands on one chord and rings
      triad.forEach((m) => out.push(note(t0, beat * bpb * 1.5, m - 12, 0.45, 'pad')));
      out.push(note(t0, beat * 2, bass, 0.6, 'bass'), hit(t0, 0.8, 'kick'), hit(t0, 0.35, 'ohat'));
      out.push(note(t0 + 0.02, beat * 3, triad[0] + 12, 0.4, 'bell'), note(t0 + 0.02, beat * 3, triad[2] + 12, 0.3, 'bell'));
      continue;
    }
    switch (spec.groove) {
      case 'ballad': {
        triad.forEach((m) => out.push(note(T(0), beat * bpb * 0.98, m - 12, 0.5, 'pad')));
        out.push(note(T(0), beat * 2, bass, 0.55, 'bass'), note(T(8), beat * 2, bass + 7, 0.4, 'bass'));
        for (let s = 0; s < stepsPerBar; s += 2) out.push(note(T(s), beat * 0.9, triad[(s / 2) % triad.length] + 12 * ((s / 2) % 2), 0.28 + (s % 8 === 0 ? 0.08 : 0), 'box'));
        if (section >= 2) for (let s = 0; s < stepsPerBar; s += 4) out.push(hit(T(s + 2), 0.14, 'shaker'));
        if (brk) for (let k = 0; k < 4; k++) out.push(note(T(k * 4), beat * 0.9, triad[(k * 2) % triad.length] + 24, 0.35, 'bell'));
        break;
      }
      case 'folk': {
        triad.forEach((m) => out.push(note(T(0), beat * bpb * 0.95, m - 12, 0.34, 'pad')));
        out.push(note(T(0), beat * 0.9, bass, 0.55, 'bass'), note(T(4), beat * 0.9, bass + 7, 0.45, 'bass'), note(T(8), beat * 0.9, bass, 0.5, 'bass'), note(T(12), beat * 0.9, bass + 7, 0.45, 'bass'));
        for (const s of [4, 12]) triad.forEach((m, i) => out.push(note(T(s) + i * 0.012, beat * 0.9, m, 0.26, 'strum')));
        for (let s = 0; s < 16; s += 2) out.push(hit(T(s), s % 4 === 0 ? 0.2 : 0.12, 'shaker'));
        if (section >= 4) for (const s of [4, 12]) out.push(hit(T(s), 0.2, 'tamb'));
        if (brk) for (let k = 0; k < 8; k++) out.push(note(T(k * 2), beat * 0.45, triad[k % triad.length] + 24, 0.26, 'pluck'));
        break;
      }
      case 'pop': {
        triad.forEach((m) => out.push(note(T(0), beat * bpb * 0.95, m - 12, 0.4, 'pad')));
        for (const [s, semi, v] of [[0, 0, 0.7], [6, 0, 0.5], [8, 7, 0.55], [11, 0, 0.5], [14, 12, 0.4]] as const) out.push(note(T(s), beat * 0.4, bass + semi, v, 'bass'));
        for (const s of [0, 8, 10]) out.push(hit(T(s), s === 0 ? 0.95 : 0.7, 'kick'));
        for (const s of [4, 12]) { out.push(hit(T(s), 0.8, 'snare')); if (section >= 8) out.push(hit(T(s), 0.35, 'clap')); }
        for (let s = 0; s < 16; s += 2) out.push(hit(T(s), s % 4 === 0 ? 0.32 : 0.22, 'hat'));
        if (section >= 2) for (let s = 1; s < 16; s += 2) out.push(hit(T(s), 0.12, 'shaker'));
        if (section >= 4) for (const s of [4, 12]) out.push(hit(T(s), 0.25, 'tamb'));
        for (const s of [2, 6, 10, 14]) triad.forEach((m, i) => { if (i < 3) out.push(note(T(s), beat * 0.22, m, 0.2, 'stab')); });
        if (bar % 4 === 3) out.push(hit(T(14), 0.4, 'ohat'));
        if (fillBar) out.push(hit(T(12), 0.6, 'tom'), hit(T(13), 0.6, 'tom'), hit(T(14), 0.8, 'snare'), hit(T(15), 0.8, 'snare'));
        if (brk || bar % 4 === 2) for (let k = 0; k < 8; k++) out.push(note(T(k * 2), beat * 0.4, triad[[0, 1, 2, 1][k % 4]] + 24, brk ? 0.38 : 0.2, 'lead'));
        break;
      }
      case 'funk': {
        out.push(note(T(0), beat * bpb * 0.5, triad[0] - 12, 0.3, 'organ'), note(T(0), beat * bpb * 0.5, triad[2] - 12, 0.25, 'organ'));
        for (const [s, semi, v] of [[0, 0, 0.8], [3, 12, 0.55], [6, 10, 0.6], [8, 0, 0.75], [10, 7, 0.6], [11, 0, 0.45], [14, 10, 0.55]] as const) out.push(note(T(s), beat * 0.22, bass + semi, v, 'bass'));
        for (const s of [0, 7, 10]) out.push(hit(T(s), s === 0 ? 0.95 : 0.7, 'kick'));
        for (const s of [4, 12]) out.push(hit(T(s), 0.85, 'snare'));
        for (const s of [2, 9, 15]) out.push(hit(T(s), 0.16, 'snare'));
        for (let s = 0; s < 16; s++) out.push(hit(T(s), s % 4 === 0 ? 0.34 : s % 2 === 0 ? 0.2 : 0.12, 'hat'));
        for (const s of [6, 14]) out.push(hit(T(s), 0.34, 'ohat'));
        for (const s of [3, 11]) out.push(hit(T(s), 0.3, 'cowbell'));
        for (const s of [2, 5, 10, 13]) triad.forEach((m, i) => { if (i < 3) out.push(note(T(s), beat * 0.16, m + 12, 0.24, 'stab')); });
        if (brk) for (let k = 0; k < 8; k++) out.push(note(T(k * 2 + (k % 2 ? 0.5 : 0)), beat * 0.28, triad[[0, 2, 1, 3 % triad.length][k % 4]] + 24, 0.3, 'lead'));
        if (fillBar) { out.push(hit(T(12), 0.7, 'tom'), hit(T(13), 0.7, 'tom'), hit(T(14), 0.85, 'snare'), hit(T(15), 0.85, 'snare')); }
        break;
      }
      case 'shanty': { // 6/8 felt in two: oom-pah, stomps, claps, an accordion and a whistle
        for (let p = 0; p < 2; p++) {
          const s = p * 3;
          out.push(hit(T(s), 0.95, 'stomp'));
          out.push(note(T(s), beat * 0.9, bass + (p ? 7 : 0), 0.55, 'bass'));
          triad.forEach((m) => out.push(note(T(s), beat * 0.85, m, 0.12, 'accordion')));
          if (p === 1) out.push(hit(T(s), 0.7, 'clap'));
          out.push(hit(T(s + 1), 0.14, 'tamb'), hit(T(s + 2), 0.14, 'tamb'));
        }
        out.push(hit(T(1), 0.2, 'stomp'));
        if (brk) for (let k = 0; k < 6; k++) out.push(note(T(k), beat / 3 * 0.9, triad[[0, 1, 2, 1, 2, 1][k]] + 12, 0.32, 'whistle'));
        else if (bar % 2 === 1) out.push(note(T(4), beat * 0.6, triad[2] + 12, 0.2, 'whistle'));
        if (fillBar) out.push(hit(T(4), 0.8, 'stomp'), hit(T(5), 0.8, 'stomp'));
        break;
      }
      case 'comic': { // an oom-pah polka that keeps tripping over itself
        out.push(note(T(0), beat * 0.8, bass, 0.65, 'bass'), note(T(8), beat * 0.8, bass + 7, 0.6, 'bass'));
        for (const s of [4, 12]) triad.forEach((m, i) => { if (i < 3) out.push(note(T(s), beat * 0.3, m, 0.26, 'stab')); });
        for (const s of [0, 8]) out.push(hit(T(s), 0.85, 'kick'));
        for (const s of [4, 12]) out.push(hit(T(s), 0.7, 'clap'));
        for (let s = 0; s < 16; s += 2) out.push(hit(T(s), 0.18, 'hat'));
        for (const s of [2, 10]) out.push(hit(T(s), 0.3, 'rim'));
        if (bar % 4 === 2) out.push(hit(T(14), 0.4, 'cowbell'));
        for (let k = 0; k < 8; k++) if (brk || k % 4 === 3) out.push(note(T(k * 2), beat * 0.3, triad[[0, 2, 1, 2][k % 4]] + 24, 0.3, 'whistle'));
        if (fillBar) out.push(hit(T(12), 0.7, 'tom'), hit(T(13), 0.7, 'tom'), hit(T(14), 0.8, 'snare'), hit(T(15), 0.8, 'cowbell'));
        break;
      }
      case 'duet': {
        triad.forEach((m) => out.push(note(T(0), beat * bpb * 0.98, m - 12, 0.36, 'pad')));
        out.push(note(T(0), beat * 2, bass, 0.5, 'bass'), note(T(8), beat * 2, bass + 7, 0.4, 'bass'));
        out.push(hit(T(0), 0.4, 'kick'), hit(T(8), 0.3, 'kick'));
        for (const s of [4, 12]) out.push(hit(T(s), 0.28, 'rim'));
        for (let s = 0; s < 16; s += 2) out.push(hit(T(s), 0.1, 'shaker'));
        for (let k = 0; k < 8; k++) out.push(note(T(k * 2), beat * 0.45, triad[[0, 1, 2, 1][k % 4]] + 12 * (1 + (k > 3 ? 1 : 0)), 0.25, 'pluck'));
        if (brk) for (let k = 0; k < 4; k++) out.push(note(T(k * 4), beat * 0.9, triad[k % 3] + 24, 0.34, 'bell'));
        break;
      }
      case 'waltz': { // 3/4: bass on one, soft chords on two and three
        triad.forEach((m) => out.push(note(T(0), beat * bpb * 0.95, m - 12, 0.3, 'pad')));
        out.push(note(T(0), beat * 1.4, bass, 0.55, 'bass'), hit(T(0), 0.28, 'kick'));
        for (const s of [2, 4]) triad.forEach((m, i) => { if (i < 3) out.push(note(T(s) + i * 0.01, beat * 0.8, m, 0.22, 'pluck')); });
        out.push(hit(T(2), 0.12, 'shaker'), hit(T(4), 0.12, 'shaker'));
        for (let k = 0; k < 3; k++) out.push(note(T(k * 2), beat * 0.9, triad[[0, 2, 1][k]] + 24, brk ? 0.36 : 0.16, 'box'));
        break;
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** A guide vocal (the melody as a soft whistle) — used only for the preview recordings and tests, never in the game. */
export function guideVocal(song: KaraokeSong): Note[] {
  const beat = 60 / song.bpm;
  const words = allWords(song);
  return words.map((w, i) => {
    const next = words[i + 1];
    const dur = Math.min(1.6, ((next ? next.beat - w.beat : 2) * beat) * 0.92);
    return { t: w.beat * beat, dur: Math.max(0.12, dur), freq: w.note, vel: 0.7, voice: 'whistle' as VoiceId };
  });
}

/** Is the band playing alone right now (a long gap between two sung words)? Used for the "♪ instrumental ♪" label. */
export function inBreakAt(song: KaraokeSong, ms: number): boolean {
  const beat = 60000 / song.bpm, bpb = song.backing?.beatsPerBar ?? 4;
  const words = allWords(song);
  for (let i = 1; i < words.length; i++) {
    const from = (words[i - 1].beat + 2) * beat, to = (words[i].beat - 1) * beat;
    if (words[i].beat - words[i - 1].beat >= bpb * 1.5 && ms >= from && ms < to) return true;
  }
  return false;
}
