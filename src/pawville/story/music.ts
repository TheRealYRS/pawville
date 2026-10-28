/**
 * The music of "The Song Beneath the Stars": the lullaby, the five phrases of the old trail, the Hearthsong, and how the
 * arrangement follows the way you listened. All original; pure note data first (so it is testable and can be rendered to
 * a WAV preview), then a thin player on the game's single shared AudioContext.
 *
 * The lullaby is a recurring thread, NOT a karaoke song: it appears at the opening chime, in Biscuit's practice, as a clue,
 * quietly in the temple and as an optional memory in the epilogue.
 */
import { midiToHz, type Note, type VoiceId } from '../audio/synth.ts';
import { leadingTones, type ChimeVariant, type StoryState, type Tone } from './model.ts';

export interface Clip { bpm: number; notes: Note[]; seconds: number }

// ---- pitches (C-major pentatonic family: G A B D E, plus a few helpers) ------------------------------------------------------
const P = { G3: 55, B3: 59, C4: 60, D4: 62, E4: 64, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, G5: 79, A5: 81, B2: 47, C3: 48, D3: 50, E3: 52 } as const;
const SCALE = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81, 83]; // G pentatonic ladder (G A B D E …)

type Ev = { b: number; d: number; m: number; v?: number; voice?: VoiceId };
const seq = (start: number, steps: readonly (readonly [number, number] | readonly [number, number, number])[], voice?: VoiceId): Ev[] => {
  let b = start; const out: Ev[] = [];
  for (const [m, d, v] of steps) { if (m > 0) out.push({ b, d, m, v, voice }); b += d; }
  return out;
};
const rest = (d: number) => [0, d] as const;

// ---- the lullaby (3/4) ----------------------------------------------------------------------------------------------------
/** Bars 1–4: the half Lumi remembers. It ends on A4, leaning — the missing step. */
export const LULLABY_A: readonly (readonly [number, number])[] = [[P.G4, 1], [P.B4, 1], [P.D5, 1], [P.E5, 2], [P.D5, 1], [P.B4, 1], [P.A4, 1], [P.G4, 1], [P.A4, 3]];
/** Bars 5–8: the part that was missing. It resolves home to G. */
export const LULLABY_B: readonly (readonly [number, number])[] = [[P.G4, 1], [P.B4, 1], [P.D5, 1], [P.E5, 1], [P.G5, 1], [P.E5, 1], [P.D5, 1], [P.B4, 1], [P.A4, 1], [P.G4, 3]];

/** The five phrases of the old trail, one per place (in the order the five notes name them), and the missing sixth. */
export const PHRASES: Record<string, readonly (readonly [number, number] | readonly [number, number, number])[]> = {
  wind: [[P.G4, 1], [P.A4, 1], [P.B4, 1], [P.D5, 1], [P.E5, 3], rest(1)],
  lantern: [[P.D5, 1], [P.E5, 1], [P.B4, 1], [P.D5, 1], [P.A4, 1], [P.G4, 2]],
  garden: [[P.G4, 1], [P.B4, 1], [P.A4, 1], [P.G4, 1], [P.B4, 1], [P.G4, 2]],
  echo: [[P.D5, 0.75], [P.D5, 0.25, 0.5], [P.B4, 0.75], [P.B4, 0.25, 0.5], [P.E5, 0.75], [P.E5, 0.25, 0.5], [P.D5, 2]],
  rise: [[P.G4, 1], [P.B4, 1], [P.D5, 1], [P.E5, 1], [P.G5, 4]],
  temple: [[P.E5, 1], [P.D5, 1], [P.B4, 1], [P.A4, 1], [P.G4, 3]],
};
export const PLACE_ORDER = ['wind', 'lantern', 'garden', 'echo', 'rise'] as const;

const bar = (m: number, chord: readonly number[], b: number, d = 3): Ev[] => chord.map((c) => ({ b, d, m: c, v: 0.55, voice: 'pad' as VoiceId })).concat([{ b, d: 1, m, v: 0.6, voice: 'bass' }]);

function toNotes(evs: readonly Ev[], bpm: number, defaultVoice: VoiceId, gain = 1): Note[] {
  const sec = 60 / bpm;
  return evs.map((e) => ({ t: e.b * sec, dur: Math.max(0.05, e.d * sec * 0.96), freq: midiToHz(e.m), vel: (e.v ?? 0.8) * gain, voice: e.voice ?? defaultVoice }));
}
const clip = (bpm: number, notes: Note[]): Clip => ({ bpm, notes: notes.sort((a, b) => a.t - b.t), seconds: notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0) + 1.2 });

// ---- how the first chime was mended changes its voice ----------------------------------------------------------------------------
export const chimeVoice = (c: ChimeVariant | null): VoiceId => (c === 'craft' ? 'chime-paper' : c === 'wait' ? 'chime-crack' : c === 'improv' ? 'chime-cap' : 'bell');

// ---- treatments for the five tones -------------------------------------------------------------------------------------------------
/** The diatonic neighbour `steps` below `m` on the pentatonic ladder (for harmony). */
function below(m: number, steps: number): number {
  const i = SCALE.indexOf(m);
  return i - steps >= 0 && i >= 0 ? SCALE[i - steps] : m - 4;
}

interface Options { lead: readonly Tone[]; chime: ChimeVariant | null; phrases: readonly string[]; finale: boolean; quiet?: boolean; community?: boolean }

/** Arrange the collected phrases. The structure is always the same; what happens around it follows how you listened. */
export function arrange(o: Options): Clip {
  const bpm = o.lead.includes('patience') ? 60 : o.lead.includes('playfulness') ? 92 : 76;
  const lead = chimeVoice(o.chime);
  const evs: Ev[] = [];
  let b = 0;
  const mixed = o.lead.length === 0;
  const has = (t: Tone) => o.lead.includes(t);
  const list = [...PLACE_ORDER.filter((p) => o.phrases.includes(p)), ...(o.finale ? ['temple'] : [])];
  list.forEach((name, idx) => {
    const steps = PHRASES[name];
    let local = b;
    const stretch = has('patience') ? 1.35 : 1;
    const melody: Ev[] = [];
    steps.forEach(([m, d, v], i) => {
      let at = local;
      if (has('playfulness') && i % 2 === 1 && m > 0) at += 0.25; // swing
      if (m > 0) melody.push({ b: at, d: d * stretch, m, v: (v ?? 1) * (has('patience') ? 0.8 : o.quiet ? 0.55 : 0.9), voice: lead });
      local += d * stretch;
    });
    evs.push(...melody);
    const len = local - b;
    // chords under every phrase (a slow G – Em – C – D walk)
    const chords: number[][] = [[P.G3, P.B3, P.D4], [P.E3, P.G3, P.B3], [P.C3 + 12, P.E4, P.G4], [P.D3 + 12, P.G3, P.B3]];
    const ch = chords[idx % 4];
    ch.forEach((m) => evs.push({ b, d: len, m, v: o.quiet ? 0.35 : 0.5, voice: 'pad' }));
    evs.push({ b, d: Math.min(2, len), m: ch[0] - 12, v: 0.5, voice: 'bass' });
    if (has('kindness') || mixed) melody.forEach((e) => evs.push({ ...e, m: below(e.m, 2), v: (e.v ?? 0.8) * (mixed ? 0.3 : 0.55), voice: 'box' }));
    if (has('curiosity') || (mixed && idx === 2)) { evs.push({ b: b + len - 1.5, d: 0.5, m: P.G5, v: 0.5, voice: 'box' }, { b: b + len - 1, d: 0.5, m: P.A5, v: 0.45, voice: 'box' }, { b: b + len - 0.5, d: 1, m: P.E5, v: 0.4, voice: 'box' }); }
    if (has('courage')) melody.forEach((e) => evs.push({ ...e, m: e.m + 12, v: 0.35, voice: 'lead' }));
    if (has('playfulness')) {
      for (let k = 0; k < len; k += 1) evs.push({ b: b + k + 0.5, d: 0.15, m: 0, v: 0.5, voice: 'shaker' });
      for (let k = 0; k < len; k += 2) evs.push({ b: b + k, d: 0.2, m: 0, v: 0.55, voice: 'stomp' });
    }
    if (o.chime === 'improv' && idx % 2 === 0) evs.push({ b: b + 0.5, d: 0.2, m: P.D5, v: 0.4, voice: 'chime-cap' });
    b += len + (has('patience') ? 3 : 1);
    if (has('curiosity') && idx === 2) { // a subtle extra detail tucked inside the third phrase
      evs.push(...seq(b, [[P.E5, 0.5], [P.G5, 0.5], [P.A5, 1]], 'pluck').map((e) => ({ ...e, v: 0.5 })));
      b += 2.5;
    }
  });
  if (o.finale) { // the lullaby, resolved, as a quiet coda
    let t = b + 1;
    const coda = seq(t, LULLABY_B.map(([m, d]) => [m, d] as const), 'box').map((e) => ({ ...e, v: 0.55 }));
    evs.push(...coda);
    for (const [i, c] of [[P.G3, P.B3, P.D4], [P.E3, P.G3, P.B3], [P.C3 + 12, P.E4, P.G4], [P.G3, P.B3, P.D4]].entries()) evs.push(...bar(c[0] - 12, c, t + i * 3, 3));
    t += 12;
    b = t;
  }
  if (o.community) { // a friendly tap on the beat for the music evening
    for (let k = 0; k < b; k += 1) evs.push({ b: k, d: 0.1, m: 0, v: 0.35, voice: k % 2 ? 'tamb' : 'rim' });
  }
  return clip(bpm, toNotes(evs, bpm, 'bell'));
}

// ---- cues --------------------------------------------------------------------------------------------------------------------------------
export const CUES = ['chime-phrase', 'lullaby-1', 'five-notes', 'phrase-wind', 'phrase-lantern', 'phrase-garden', 'phrase-echo', 'phrase-rise', 'echo-demo', 'echo-repeat', 'echo-change', 'echo-pause', 'arrangement', 'hearthsong', 'lullaby-quiet', 'community'] as const;
export type CueId = (typeof CUES)[number];
export const isCue = (x: string): x is CueId => (CUES as readonly string[]).includes(x);

const phraseClip = (name: string, voice: VoiceId, bpm = 72): Clip => clip(bpm, toNotes(seq(0, PHRASES[name]).map((e) => ({ ...e, voice })), bpm, voice));

/** Pure: the notes of a cue for a given story state. */
export function cueClip(cue: string, s?: StoryState): Clip | null {
  const lead = s ? leadingTones(s) : [];
  const voice = chimeVoice(s?.chime ?? null);
  switch (cue as CueId) {
    case 'chime-phrase': return clip(60, toNotes(seq(0, [[P.G4, 1], [P.B4, 1], [P.D5, 1.5], [P.E5, 2]], voice), 60, voice));
    case 'lullaby-1': {
      const evs = [...seq(0, LULLABY_A, 'box'), ...bar(P.G3, [P.G3, P.B3, P.D4], 0), ...bar(P.E3, [P.E3, P.G3, P.B3], 3), ...bar(P.C3 + 12, [P.E4, P.G4], 6), ...bar(P.D3, [P.D4, P.A4], 9)];
      return clip(66, toNotes(evs, 66, 'box'));
    }
    case 'lullaby-quiet': {
      const evs = [...seq(0, [...LULLABY_A, ...LULLABY_B], 'box').map((e) => ({ ...e, v: 0.5 })), ...bar(P.G3, [P.G3, P.B3, P.D4], 0), ...bar(P.E3, [P.E3, P.G3, P.B3], 3), ...bar(P.C3 + 12, [P.E4, P.G4], 6), ...bar(P.D3, [P.D4, P.A4], 9), ...bar(P.G3, [P.G3, P.B3, P.D4], 12), ...bar(P.E3, [P.E3, P.G3, P.B3], 15), ...bar(P.C3 + 12, [P.E4, P.G4], 18), ...bar(P.G3, [P.G3, P.B3, P.D4], 21)];
      return clip(60, toNotes(evs, 60, 'box'));
    }
    case 'five-notes': {
      const five = [[P.G4, 1.5], [P.A4, 1.5], [P.B4, 1.5], [P.D5, 1.5], [P.E5, 3]] as const;
      const evs = [...seq(0, five, 'bell'), ...seq(10, five, 'bell'), ...seq(20, five, 'bell').map((e) => ({ ...e, v: 0.6 })), ...seq(20, five.map(([m, d]) => [m - 12, d] as const), 'pad')];
      return clip(60, toNotes(evs, 60, 'bell'));
    }
    case 'phrase-wind': return phraseClip('wind', 'bell');
    case 'phrase-lantern': return phraseClip('lantern', 'bell');
    case 'phrase-garden': return phraseClip('garden', 'pluck', 84);
    case 'phrase-echo': return phraseClip('echo', 'bell', 80);
    case 'phrase-rise': return phraseClip('rise', 'bell', 68);
    case 'echo-demo': case 'echo-repeat': {
      const m = [P.D5, P.B4, P.E5], evs: Ev[] = [];
      m.forEach((n, i) => { evs.push({ b: i, d: 0.5, m: n, v: 0.9, voice: 'bell' }, { b: i + 3.2, d: 0.5, m: n, v: 0.45, voice: 'bell' }); });
      return clip(72, toNotes(evs, 72, 'bell'));
    }
    case 'echo-change': {
      const evs: Ev[] = [{ b: 0, d: 0.5, m: P.D5, voice: 'bell' }, { b: 1, d: 0.5, m: P.B4, voice: 'bell' }, { b: 2, d: 0.25, m: P.E5, voice: 'bell' }, { b: 2.25, d: 0.25, m: P.G5, voice: 'bell' },
        { b: 4.2, d: 0.5, m: P.D5, v: 0.45, voice: 'bell' }, { b: 5.2, d: 0.5, m: P.A4, v: 0.45, voice: 'bell' }, { b: 6.2, d: 0.25, m: P.E5, v: 0.45, voice: 'bell' }, { b: 6.45, d: 0.25, m: P.G5, v: 0.45, voice: 'bell' }, { b: 6.7, d: 0.25, m: P.A5, v: 0.4, voice: 'bell' }];
      return clip(72, toNotes(evs, 72, 'bell'));
    }
    case 'echo-pause': {
      const evs: Ev[] = [{ b: 0, d: 0.5, m: P.D5, voice: 'bell' }, { b: 1, d: 0.5, m: P.B4, voice: 'bell' }, { b: 5, d: 2, m: P.G4, v: 0.5, voice: 'bell' }];
      return clip(72, toNotes(evs, 72, 'bell'));
    }
    case 'arrangement': return arrange({ lead, chime: s?.chime ?? null, phrases: s?.phrases.length ? s.phrases : [...PLACE_ORDER], finale: false });
    case 'hearthsong': return arrange({ lead, chime: s?.chime ?? null, phrases: [...PLACE_ORDER], finale: true });
    case 'community': return arrange({ lead: lead.length ? lead : ['playfulness'], chime: s?.chime ?? null, phrases: [...PLACE_ORDER], finale: true, community: true });
    default: return null;
  }
}
