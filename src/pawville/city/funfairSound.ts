/**
 * Funfair sound effects, synthesised on the game's shared effects AudioContext (voices.ts → effectsAudio), so they
 * follow the global sound switch and the browser's autoplay rules like every other Pawville sound. No audio files.
 * Every call is rate-limited per kind and wrapped, so audio problems can never break a ride or a game.
 */
import { effectsAudio } from './voices.ts';

const last: Record<string, number> = {};
const gap = (k: string, ms: number) => {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (last[k] ?? -1e9) < ms) return false;
  last[k] = now;
  return true;
};
function tone(ac: AudioContext, t0: number, f0: number, f1: number, dur: number, type: OscillatorType, gain: number) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}
function noise(ac: AudioContext, t0: number, dur: number, freq: number, q: number, gain: number) {
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t0);
}

export type FairSfx = 'hop' | 'bump' | 'wall' | 'engine' | 'tick' | 'throw' | 'clink' | 'ring' | 'miss' | 'jackpot' | 'bell' | 'start' | 'done';
export function fairSfx(kind: FairSfx, power = 0.5): void {
  if (!gap(kind, kind === 'engine' ? 90 : kind === 'bump' ? 70 : kind === 'wall' ? 90 : 40)) return;
  const ac = effectsAudio();
  if (!ac) return;
  try {
    const t = ac.currentTime + 0.005;
    const p = Math.max(0, Math.min(1, power));
    switch (kind) {
      case 'hop': tone(ac, t, 330, 520, 0.12, 'triangle', 0.07); tone(ac, t + 0.08, 520, 700, 0.12, 'sine', 0.05); break;
      case 'bump': tone(ac, t, 160 + 60 * (1 - p), 55, 0.18, 'sawtooth', 0.12 * (0.5 + p)); noise(ac, t, 0.1, 900, 0.8, 0.12 * (0.5 + p)); tone(ac, t + 0.02, 880, 660, 0.09, 'square', 0.03); break;
      case 'wall': tone(ac, t, 120, 60, 0.12, 'triangle', 0.09 * (0.4 + p)); noise(ac, t, 0.06, 500, 0.7, 0.07); break;
      case 'engine': tone(ac, t, 64 + 40 * p, 70 + 40 * p, 0.12, 'sawtooth', 0.018); break;
      case 'tick': tone(ac, t, 1000, 900, 0.04, 'square', 0.025); break;
      case 'throw': noise(ac, t, 0.18, 1800, 0.6, 0.05); tone(ac, t, 300, 700, 0.18, 'sine', 0.035); break;
      case 'clink': tone(ac, t, 1760, 1500, 0.14, 'triangle', 0.08); tone(ac, t + 0.03, 2349, 2000, 0.1, 'sine', 0.05); break;
      case 'ring': [784, 988, 1175].forEach((f, i) => tone(ac, t + i * 0.07, f, f, 0.2, 'triangle', 0.08)); break;
      case 'miss': tone(ac, t, 220, 140, 0.22, 'triangle', 0.06); break;
      case 'jackpot': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(ac, t + i * 0.08, f, f, 0.28, 'triangle', 0.09)); break;
      case 'bell': tone(ac, t, 1318, 1318, 0.5, 'sine', 0.07); tone(ac, t, 1976, 1976, 0.35, 'sine', 0.03); break;
      case 'start': [523, 659, 784].forEach((f, i) => tone(ac, t + i * 0.12, f, f, 0.18, 'square', 0.04)); break;
      case 'done': [784, 659, 523, 784].forEach((f, i) => tone(ac, t + i * 0.1, f, f, 0.2, 'triangle', 0.07)); break;
    }
  } catch {
    /* audio never breaks the game */
  }
}
