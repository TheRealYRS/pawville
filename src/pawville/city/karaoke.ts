/**
 * Karaoke night at The Purring Cup (Milestone 8.2).
 *
 * Original songs (written for Pawville). Each word has a beat and a note. The words light up in
 * time; tap Space (or the big paw) on each word's beat and your cat sings that note. Timing is
 * judged against the beat: perfect, good or miss. Pure and unit tested; the panel plays the notes.
 */

export interface KaraokeWord { text: string; beat: number; note: number; /** a syllable that continues the previous word (drawn without a gap) */ cont?: true }
export interface KaraokeSong {
  id: string;
  title: string;
  by: string;
  bpm: number;
  /** Lines of words; beats count from the song start (lead-in included). */
  lines: readonly (readonly KaraokeWord[])[];
  /** The Song Beneath the Stars expansion: style, a one-line description and how the band plays it (karaokeBacking.ts). */
  genre?: string;
  blurb?: string;
  backing?: BackingSpec;
  /** A duet: `parts[i]` says who sings line i ('A', 'B' or both). One cat can sing both parts. */
  duet?: boolean;
  parts?: readonly ('A' | 'B' | 'both')[];
  /** Locked until this holds (persistent world state only). `text` tells the player how, in plain words. */
  unlock?: { text: string; when: (v: AdvView) => boolean };
}

// C major pentatonic, a gentle singing range
const N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25 } as const;
const line = (start: number, words: string, notes: number[], gaps?: number[]): KaraokeWord[] =>
  words.split(' ').map((w, i) => ({ text: w, beat: start + (gaps ? gaps.slice(0, i).reduce((a, b) => a + b, 0) : i), note: notes[i % notes.length] }));

import type { AdvView } from '../adventure/state.ts';
import type { BackingSpec } from './karaokeBacking.ts';
import { NEW_SONGS } from './karaokeSongs.ts';

/** The three original songs (unchanged) followed by the six new ones. */
const CLASSIC_SONGS: readonly KaraokeSong[] = [
  {
    id: 'window-seat', title: 'Window Seat', by: 'The Purring Cup house band', bpm: 92, genre: 'Cozy and gentle', blurb: 'The house favourite: a slow, warm ballad.',
    backing: { groove: 'ballad', progression: ['C', 'Am', 'F', 'G'], beatsPerBar: 4, root: 48 },
    lines: [
      line(4, 'Sun on the window seat', [N.E4, N.G4, N.A4, N.G4, N.E4]),
      line(10, 'warm little paws', [N.D4, N.E4, N.G4, N.E4]),
      line(16, 'Rain on the rooftops now', [N.E4, N.G4, N.A4, N.C5, N.A4]),
      line(22, 'I stay because', [N.G4, N.E4, N.D4, N.C4]),
      line(28, 'you are here with me', [N.C4, N.D4, N.E4, N.G4, N.E4]),
    ],
  },
  {
    id: 'biscuits-song', title: 'Biscuit’s Song', by: 'Biscuit (finished at last)', bpm: 100, genre: 'Folk-pop', blurb: 'The song Biscuit finally finished, with a gentle swing.',
    backing: { groove: 'folk', progression: ['C', 'F', 'C', 'G'], beatsPerBar: 4, root: 48 },
    lines: [
      line(4, 'Down by the fountain', [N.G4, N.A4, N.G4, N.E4]),
      line(9, 'coins full of wishes', [N.E4, N.G4, N.A4, N.C5]),
      line(14, 'one little melody', [N.C5, N.A4, N.G4, N.E4, N.G4], [1, 1, 1, 0.5]),
      line(20, 'finally finished', [N.A4, N.C5, N.D5, N.C5]),
      line(25, 'sing it with me', [N.E5, N.D5, N.C5, N.A4]),
    ],
  },
  {
    id: 'lantern-alley', title: 'Lantern Alley', by: 'Old Town traditional', bpm: 84, genre: 'Cozy and gentle', blurb: 'An Old Town lullaby for walking home the long way round.',
    backing: { groove: 'ballad', progression: ['C', 'Em', 'F', 'G'], beatsPerBar: 4, root: 48 },
    lines: [
      line(4, 'Light the lanterns one by one', [N.C4, N.E4, N.G4, N.E4, N.G4, N.A4]),
      line(11, 'cobbles glowing gold', [N.A4, N.G4, N.E4, N.D4]),
      line(17, 'Walk me home the long way round', [N.D4, N.E4, N.G4, N.A4, N.G4, N.E4, N.C4]),
      line(25, 'paw in paw', [N.E4, N.D4, N.C4]),
    ],
  },
];

export const SONGS: readonly KaraokeSong[] = [...CLASSIC_SONGS, ...NEW_SONGS];

/** Is this song open to the player? Songs without an `unlock` always are. */
export const songUnlocked = (song: KaraokeSong, v?: AdvView): boolean => !song.unlock || !v || song.unlock.when(v);

export const PERFECT_MS = 90;
export const GOOD_MS = 190;

export function songById(id: string): KaraokeSong | undefined {
  return SONGS.find((s) => s.id === id);
}
export function beatMs(song: KaraokeSong): number {
  return 60000 / song.bpm;
}
export function allWords(song: KaraokeSong): KaraokeWord[] {
  return song.lines.flat();
}
export function songLengthMs(song: KaraokeSong): number {
  const w = allWords(song);
  return (w[w.length - 1].beat + 3) * beatMs(song);
}

export type Grade = 'perfect' | 'good' | 'miss';
export interface KaraokeRun {
  /** Grade per word index (undefined = not judged yet). */
  grades: (Grade | undefined)[];
  score: number;
  streak: number;
  bestStreak: number;
}
export function newRun(song: KaraokeSong): KaraokeRun {
  return { grades: new Array(allWords(song).length).fill(undefined), score: 0, streak: 0, bestStreak: 0 };
}

/**
 * A tap at `ms` (since the song started). It is matched with the nearest un-judged word within the
 * good window. A tap with no word nearby does nothing (no penalty: singing along is for fun).
 */
export function tap(song: KaraokeSong, run: KaraokeRun, ms: number): { run: KaraokeRun; word: number | null; grade: Grade | null } {
  const words = allWords(song);
  const b = beatMs(song);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < words.length; i++) {
    if (run.grades[i]) continue;
    const d = Math.abs(words[i].beat * b - ms);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0 || bestD > GOOD_MS) return { run, word: null, grade: null };
  const grade: Grade = bestD <= PERFECT_MS ? 'perfect' : 'good';
  const grades = run.grades.slice();
  grades[best] = grade;
  const streak = run.streak + 1;
  return { run: { grades, score: run.score + (grade === 'perfect' ? 100 : 60), streak, bestStreak: Math.max(run.bestStreak, streak) }, word: best, grade };
}

/** Words whose window has passed without a tap become misses (call every frame). */
export function expire(song: KaraokeSong, run: KaraokeRun, ms: number): KaraokeRun {
  const words = allWords(song);
  const b = beatMs(song);
  let changed = false;
  const grades = run.grades.slice();
  let streak = run.streak;
  for (let i = 0; i < words.length; i++) {
    if (!grades[i] && ms - words[i].beat * b > GOOD_MS) { grades[i] = 'miss'; streak = 0; changed = true; }
  }
  return changed ? { ...run, grades, streak } : run;
}

export function accuracy(run: KaraokeRun): number {
  const judged = run.grades.filter(Boolean) as Grade[];
  if (!judged.length) return 0;
  return judged.reduce((a, g) => a + (g === 'perfect' ? 1 : g === 'good' ? 0.6 : 0), 0) / judged.length;
}

export function stars(run: KaraokeRun): 0 | 1 | 2 | 3 {
  const a = accuracy(run);
  return a >= 0.85 ? 3 : a >= 0.6 ? 2 : a >= 0.3 ? 1 : 0;
}

/** Which line is current at `ms` (the one whose last word hasn't passed by more than a beat). */
export function currentLine(song: KaraokeSong, ms: number): number {
  const b = beatMs(song);
  for (let i = 0; i < song.lines.length; i++) {
    const l = song.lines[i];
    if (ms <= (l[l.length - 1].beat + 1.5) * b) return i;
  }
  return song.lines.length - 1;
}
