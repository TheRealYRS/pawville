/**
 * Character voices (Milestone 7): original, synthesised vocalisations — no audio files, nothing
 * copyrighted. Each character has a profile (pitch, brightness, shape), so Mini chirps, Magic
 * mrrps low and slow, Puchu rumbles, Chutki squeaks and Racon chitters (a raccoon, not a meow).
 *
 * Sounds play only on discrete events (emotes, greetings, wins) — never per movement frame — and
 * vary a little every time (pitch jitter + 2–3 variants) so they don't feel repetitive.
 * Respects the global sound toggle and its own "voices" volume (0 = off).
 */
import type { CoatId } from '../appearance.ts';

export type VoiceKind = 'greet' | 'happy' | 'surprised' | 'sleepy' | 'playful';

interface Profile {
  base: number; // Hz
  bright: number; // filter cutoff multiplier
  style: 'meow' | 'chirp' | 'mrrp' | 'squeak' | 'chitter';
  gain: number;
}

const PROFILES: Partial<Record<CoatId, Profile>> & { default: Profile } = {
  default: { base: 520, bright: 5, style: 'meow', gain: 0.08 },
  tangerine: { base: 560, bright: 6, style: 'meow', gain: 0.08 },
  midnight: { base: 430, bright: 4, style: 'mrrp', gain: 0.08 },
  mini: { base: 900, bright: 8, style: 'chirp', gain: 0.07 },
  magic: { base: 340, bright: 3, style: 'mrrp', gain: 0.08 },
  puchu: { base: 400, bright: 4, style: 'meow', gain: 0.08 },
  chutki: { base: 760, bright: 7, style: 'squeak', gain: 0.07 },
  racon: { base: 1100, bright: 9, style: 'chitter', gain: 0.1 },
};

let ctx: AudioContext | null = null;
/** The app's global sound switch is injected (keeps this module free of app imports, so it can be unit tested). */
let isSoundEnabled: () => boolean = () => false;
/** Milestone 10: the game's shared AudioContext is injected too (one context for every sound). */
let sharedContext: (() => AudioContext | null) | null = null;
export function configureVoices(o: { isEnabled: () => boolean; context?: () => AudioContext | null }): void {
  isSoundEnabled = o.isEnabled;
  if (o.context) sharedContext = o.context;
}
let volume = 0.7;
let last = 0;

export function setVoiceVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}
export function voiceVolume(): number {
  return volume;
}

function audio(forVoice = true): AudioContext | null {
  if (!isSoundEnabled() || (forVoice && volume <= 0)) return null;
  try {
    const shared = sharedContext?.();
    if (shared) {
      if (shared.state === 'suspended') void shared.resume().catch(() => undefined);
      return shared;
    }
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * One voiced syllable. Milestone 10 fix: the voice used to be a sawtooth through ONE narrow
 * band-pass "mouth" centred near harmonic number `bright`. A sawtooth's n-th harmonic is only 1/n
 * as loud, so bright voices (Mini 8, Racon 9) came out ~1/9 of the intended level — effectively
 * silent. Now a low-passed "body" path carries the pitch at a steady level and the mouth filter
 * adds the vowel colour with its gain compensated for the harmonic it sits on.
 */
function syllable(ac: BaseAudioContext, t0: number, f0: number, f1: number, dur: number, bright: number, gain: number, vol = volume, dest: AudioNode = ac.destination) {
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const amp = ac.createGain();
  const peak = Math.max(0.0002, gain * vol * VOICE_LEVEL);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.03, dur / 3));
  amp.gain.setValueAtTime(peak, t0 + dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // body: the fundamental and first few harmonics
  const body = ac.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = Math.min(8000, f0 * 3);
  body.Q.value = 0.7;
  const bodyGain = ac.createGain();
  bodyGain.gain.value = 0.55;
  // mouth: the vowel/character colour, loudness-compensated
  const mouth = ac.createBiquadFilter();
  mouth.type = 'bandpass';
  mouth.Q.value = 2.2;
  mouth.frequency.setValueAtTime(Math.min(9000, f0 * bright * 0.5), t0);
  mouth.frequency.linearRampToValueAtTime(Math.min(9000, f0 * bright), t0 + dur * 0.4);
  mouth.frequency.linearRampToValueAtTime(Math.min(9000, f1 * bright * 0.4), t0 + dur);
  const mouthGain = ac.createGain();
  mouthGain.gain.value = Math.min(4, 0.5 * Math.sqrt(bright) + 0.4);
  osc.connect(body).connect(bodyGain).connect(amp);
  osc.connect(mouth).connect(mouthGain).connect(amp);
  amp.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Overall loudness of character voices relative to the profile gains (tuned by measurement, see tests/browser). */
const VOICE_LEVEL = 2.4;

/** A soft snuffle (Racon) or breath: filtered noise. */
function snuffle(ac: BaseAudioContext, t0: number, dur: number, gain: number, dest: AudioNode = ac.destination) {
  const n = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
  const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 300));
  const src = ac.createBufferSource();
  src.buffer = n;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
  const a = ac.createGain();
  a.gain.setValueAtTime(0.0001, t0);
  a.gain.exponentialRampToValueAtTime(gain * volume * VOICE_LEVEL, t0 + 0.02);
  a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(a).connect(dest);
  src.start(t0);
}

/** A purr: a low rumbling hum, pulsed ~25 times a second (Magic and Puchu). */
function purrInto(ac: BaseAudioContext, t0: number, seconds: number, gain: number, dest: AudioNode = ac.destination) {
  const body = ac.createOscillator();
  body.type = 'sawtooth';
  body.frequency.setValueAtTime(46, t0);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 260;
  const amp = ac.createGain();
  const g = gain * volume * VOICE_LEVEL;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(g, t0 + 0.3);
  amp.gain.setValueAtTime(g, t0 + seconds - 0.4);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 25;
  const lg = ac.createGain();
  lg.gain.value = g * 0.5;
  lfo.connect(lg).connect(amp.gain);
  body.connect(lp).connect(amp).connect(dest);
  body.start(t0); lfo.start(t0);
  body.stop(t0 + seconds + 0.05); lfo.stop(t0 + seconds + 0.05);
}

/** Plan of syllables for a voice (pure — exported for tests). */
export function voicePlan(coat: CoatId, kind: VoiceKind, rand: () => number): { f0: number; f1: number; dur: number; at: number }[] {
  const p = PROFILES[coat] ?? PROFILES.default;
  const j = 1 + (rand() - 0.5) * 0.12; // pitch jitter
  const b = p.base * j * (kind === 'sleepy' ? 0.75 : kind === 'surprised' ? 1.25 : 1);
  const variant = Math.floor(rand() * 3);
  switch (p.style) {
    case 'chitter': {
      // raccoon chatter: quick, bright, unvoiced-sounding clicks in a burst
      const n = kind === 'sleepy' ? 2 : 4 + variant;
      return Array.from({ length: n }, (_, i) => ({ f0: b * (1 + (i % 2) * 0.15), f1: b * 0.8, dur: 0.045, at: i * 0.065 }));
    }
    case 'chirp':
      return kind === 'sleepy' ? [{ f0: b * 0.8, f1: b * 0.6, dur: 0.25, at: 0 }]
        : [{ f0: b, f1: b * 1.4, dur: 0.09, at: 0 }, ...(variant ? [{ f0: b * 1.1, f1: b * 1.5, dur: 0.08, at: 0.12 }] : [])];
    case 'squeak':
      return [{ f0: b * 1.2, f1: b * (kind === 'surprised' ? 1.8 : 1.4), dur: 0.12, at: 0 }];
    case 'mrrp':
      return [{ f0: b * 0.9, f1: b * 1.1, dur: kind === 'sleepy' ? 0.35 : 0.16, at: 0 }, ...(variant > 0 && kind !== 'sleepy' ? [{ f0: b * 1.1, f1: b * 0.95, dur: 0.12, at: 0.15 }] : [])];
    default: {
      const up = kind === 'happy' || kind === 'playful' || kind === 'surprised';
      return [{ f0: b * 0.9, f1: up ? b * 1.3 : b * 0.7, dur: kind === 'sleepy' ? 0.45 : 0.28 + variant * 0.04, at: 0 }];
    }
  }
}

export function speak(coat: CoatId, kind: VoiceKind): void {
  const now = performance.now();
  if (now - last < 350) return; // never stack voices
  last = now;
  const ac = audio();
  if (!ac) return;
  try {
    renderVoice(ac, coat, kind, Math.random, ac.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

/**
 * Schedules a character's vocalisation into any audio context (the live one, or an
 * OfflineAudioContext in the browser loudness test). Racon also snuffles and trills; Magic and
 * Puchu purr when sleepy.
 */
export function renderVoice(ac: BaseAudioContext, coat: CoatId, kind: VoiceKind, rand: () => number, t0: number, dest: AudioNode = ac.destination): void {
  const p = PROFILES[coat] ?? PROFILES.default;
  for (const s of voicePlan(coat, kind, rand)) syllable(ac, t0 + s.at, s.f0, s.f1, s.dur, p.bright, p.gain, volume, dest);
  if (p.style === 'chitter') {
    if (kind === 'greet' || kind === 'sleepy' || kind === 'surprised') snuffle(ac, t0 + 0.32, 0.18, 0.05, dest);
    if (kind === 'happy' || kind === 'playful') for (let i = 0; i < 6; i++) syllable(ac, t0 + 0.34 + i * 0.035, p.base * 1.3, p.base * 1.5, 0.03, p.bright, p.gain * 0.8, volume, dest); // a trill
  }
  if ((coat === 'magic' || coat === 'puchu') && kind === 'sleepy') purrInto(ac, t0 + 0.2, 1.4, 0.05, dest);
}

/** Which voice an emote uses (Racon never meows; Puchu's purr has its own sound). */
export function voiceForEmote(emote: string): VoiceKind | null {
  if (emote === 'puchu-loud-purr' || emote === 'purr') return null;
  if (emote.includes('sleep') || emote.includes('nap') || emote === 'sleepy' || emote === 'magic-long-stretch') return 'sleepy';
  if (emote === 'surprised') return 'surprised';
  if (emote.includes('dance') || emote === 'bounce' || emote.includes('pounce') || emote.includes('tilt')) return 'playful';
  if (emote === 'wave' || emote === 'heart' || emote === 'celebrate' || emote.includes('serenade')) return 'happy';
  return 'greet';
}

/** A short tone for game pads (Meow Melody) on the same context. */
export function padTone(freq: number, ms = 260): void {
  const ac = audio(false);
  if (!ac) return;
  try {
    const t0 = ac.currentTime + 0.005;
    syllable(ac, t0, freq, freq * 1.04, ms / 1000, 4, 0.09, 0.45);
  } catch {
    /* ignore */
  }
}

/**
 * Milestone 8.2: karaoke — the character sings a note in their own voice (their brightness and
 * style shape the vowel; the song gives the pitch). Ignores the 350 ms voice gap (songs are fast).
 */
export function singNote(coat: CoatId, freq: number, ms = 260): void {
  const ac = audio();
  if (!ac) return;
  const p = PROFILES[coat] ?? PROFILES.default;
  try {
    const t0 = ac.currentTime + 0.005;
    const bend = p.style === 'chirp' || p.style === 'squeak' ? 1.06 : p.style === 'mrrp' ? 0.97 : 1.02;
    syllable(ac, t0, freq * 0.98, freq * bend, ms / 1000, p.bright, p.gain * 1.1);
  } catch {
    /* ignore */
  }
}

/** The shared audio context for other synthesised effects (footsteps), or null when sound is off. */
export function effectsAudio(): AudioContext | null {
  return audio(false);
}
