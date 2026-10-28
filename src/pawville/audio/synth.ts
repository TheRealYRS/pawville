/**
 * A tiny, dependency-free synthesiser shared by the story's music and the karaoke backing band.
 *
 * Music is described as plain NOTES (seconds, Hz, velocity, voice). Two players turn notes into sound:
 *   - scheduleWebAudio(): the browser (the game's ONE shared AudioContext, see lib/soundService.ts), and
 *   - renderOffline():    plain maths into a Float32Array (tests, and the WAV preview recordings in /previews).
 * Both read the SAME voice recipes below, so the preview recordings are a fair picture of what the game plays
 * (the offline filter is a simple one-pole approximation of the browser's biquad filter).
 */
export type VoiceId =
  // tonal
  | 'bell' | 'box' | 'pad' | 'bass' | 'sub' | 'pluck' | 'lead' | 'organ' | 'stab' | 'strum' | 'whistle' | 'accordion'
  // story chime timbres (how the first broken chime was mended)
  | 'chime-paper' | 'chime-crack' | 'chime-cap'
  // percussion
  | 'kick' | 'snare' | 'hat' | 'ohat' | 'shaker' | 'tamb' | 'cowbell' | 'clap' | 'rim' | 'tom' | 'stomp';

export interface Note { t: number; dur: number; freq: number; vel: number; voice: VoiceId }

interface TonalRecipe {
  kind: 'tonal';
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** extra sine partials [ratio, amplitude] added on top of `wave` at the fundamental */
  partials?: readonly (readonly [number, number])[];
  /** detuned copy in cents (0 = none) */
  detune?: number;
  a: number;
  /** exponential decay time constant (s) after the attack; Infinity = sustain for the note's duration */
  tau: number;
  r: number;
  lp?: number;
  gain: number;
}
interface NoiseRecipe { kind: 'noise'; hp?: number; lp?: number; bp?: number; a: number; tau: number; gain: number; /** a pitched body mixed under the noise */ body?: { freq: number; to?: number; tau: number; gain: number; wave?: 'sine' | 'triangle' } ; bursts?: readonly number[] }
interface ToneBurst { kind: 'burst'; freqs: readonly number[]; wave: 'square' | 'sine' | 'triangle'; tau: number; gain: number; lp?: number }
interface Sweep { kind: 'sweep'; from: number; to: number; tau: number; gain: number; wave?: 'sine' | 'triangle' }
type Recipe = TonalRecipe | NoiseRecipe | ToneBurst | Sweep;

export const RECIPES: Record<VoiceId, Recipe> = {
  bell: { kind: 'tonal', wave: 'sine', partials: [[2.76, 0.22], [5.4, 0.08]], a: 0.004, tau: 1.1, r: 0.1, gain: 0.5 },
  box: { kind: 'tonal', wave: 'sine', partials: [[3, 0.18], [4, 0.1]], a: 0.003, tau: 0.45, r: 0.05, gain: 0.5 },
  pad: { kind: 'tonal', wave: 'triangle', detune: 7, a: 0.22, tau: Infinity, r: 0.6, lp: 1300, gain: 0.2 },
  bass: { kind: 'tonal', wave: 'sine', partials: [[2, 0.35], [3, 0.1]], a: 0.006, tau: 0.5, r: 0.06, lp: 600, gain: 0.55 },
  sub: { kind: 'tonal', wave: 'sine', a: 0.008, tau: Infinity, r: 0.08, gain: 0.5 },
  pluck: { kind: 'tonal', wave: 'triangle', a: 0.003, tau: 0.2, r: 0.04, lp: 2600, gain: 0.4 },
  lead: { kind: 'tonal', wave: 'sawtooth', detune: 5, a: 0.012, tau: Infinity, r: 0.1, lp: 2800, gain: 0.16 },
  organ: { kind: 'tonal', wave: 'sine', partials: [[2, 0.5], [3, 0.3], [4, 0.2]], a: 0.02, tau: Infinity, r: 0.08, gain: 0.22 },
  stab: { kind: 'tonal', wave: 'sawtooth', detune: 9, a: 0.004, tau: 0.13, r: 0.03, lp: 2200, gain: 0.2 },
  strum: { kind: 'tonal', wave: 'triangle', partials: [[2, 0.25], [3, 0.12]], a: 0.003, tau: 0.35, r: 0.05, lp: 3000, gain: 0.3 },
  whistle: { kind: 'tonal', wave: 'sine', partials: [[2, 0.08]], a: 0.04, tau: Infinity, r: 0.12, gain: 0.3 },
  accordion: { kind: 'tonal', wave: 'square', detune: 12, a: 0.05, tau: Infinity, r: 0.12, lp: 1800, gain: 0.1 },
  'chime-paper': { kind: 'tonal', wave: 'triangle', partials: [[2.4, 0.1]], a: 0.01, tau: 0.35, r: 0.05, lp: 3200, gain: 0.5 },
  'chime-crack': { kind: 'tonal', wave: 'sine', partials: [[1.006, 0.8], [2.76, 0.18]], a: 0.004, tau: 0.8, r: 0.08, gain: 0.45 },
  'chime-cap': { kind: 'tonal', wave: 'square', partials: [[3.1, 0.4]], a: 0.002, tau: 0.16, r: 0.03, lp: 5200, gain: 0.2 },
  kick: { kind: 'sweep', from: 150, to: 46, tau: 0.13, gain: 0.95 },
  stomp: { kind: 'sweep', from: 120, to: 55, tau: 0.09, gain: 0.8, wave: 'triangle' },
  tom: { kind: 'sweep', from: 200, to: 110, tau: 0.16, gain: 0.7 },
  snare: { kind: 'noise', hp: 1600, a: 0.001, tau: 0.09, gain: 0.55, body: { freq: 190, to: 140, tau: 0.07, gain: 0.5, wave: 'triangle' } },
  clap: { kind: 'noise', bp: 1500, a: 0.001, tau: 0.05, gain: 0.5, bursts: [0, 0.012, 0.024] },
  hat: { kind: 'noise', hp: 7000, a: 0.001, tau: 0.03, gain: 0.3 },
  ohat: { kind: 'noise', hp: 6500, a: 0.002, tau: 0.16, gain: 0.28 },
  shaker: { kind: 'noise', bp: 5200, a: 0.012, tau: 0.05, gain: 0.3 },
  tamb: { kind: 'noise', hp: 4800, a: 0.001, tau: 0.09, gain: 0.3, bursts: [0, 0.018] },
  cowbell: { kind: 'burst', freqs: [587, 845], wave: 'square', tau: 0.14, gain: 0.22, lp: 3400 },
  rim: { kind: 'burst', freqs: [830, 1700], wave: 'sine', tau: 0.03, gain: 0.35 },
};

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// ---- offline renderer -------------------------------------------------------------------------------------------

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
}
const onePole = (fc: number, sr: number) => 1 - Math.exp((-2 * Math.PI * fc) / sr);

function wave(kind: TonalRecipe['wave'] | 'sine', ph: number): number {
  const p = ph - Math.floor(ph);
  switch (kind) {
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'triangle': return 4 * Math.abs(p - 0.5) - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * p - 1;
  }
}

/** Renders notes to mono PCM. `tail` seconds of silence are appended so releases are never cut. */
export function renderOffline(notes: readonly Note[], sr = 22050, tail = 1.5): Float32Array {
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.dur + 2), 0) + tail;
  const out = new Float32Array(Math.ceil(end * sr));
  const noise = lcg(1234567);
  for (const n of notes) {
    const r = RECIPES[n.voice];
    const start = Math.floor(n.t * sr);
    const gain = r.gain * n.vel;
    if (r.kind === 'tonal') {
      const total = n.dur + r.r + (Number.isFinite(r.tau) ? Math.min(2.5, r.tau * 5) : 0);
      const len = Math.min(out.length - start, Math.ceil(total * sr));
      const lpA = r.lp ? onePole(r.lp, sr) : 1;
      let lpY = 0, lpZ = 0; // two cascaded one-poles ≈ the browser's 12 dB/octave low-pass
      const det = r.detune ? Math.pow(2, r.detune / 1200) : 1;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let env: number;
        if (t < r.a) env = t / r.a;
        else if (Number.isFinite(r.tau)) env = Math.exp(-(t - r.a) / r.tau);
        else env = 1;
        if (!Number.isFinite(r.tau)) { if (t > n.dur) env *= Math.max(0, 1 - (t - n.dur) / r.r); }
        else if (t > n.dur + 0.02) env *= Math.max(0, 1 - (t - n.dur - 0.02) / Math.max(r.r, 0.4)); // let bells ring a little past the note
        if (env <= 0 && t > n.dur) break;
        let s = wave(r.wave, n.freq * t);
        if (r.detune) s = (s + wave(r.wave, n.freq * det * t)) * 0.5;
        if (r.partials) for (const [ratio, amp] of r.partials) s += amp * Math.sin(2 * Math.PI * n.freq * ratio * t);
        lpY += lpA * (s - lpY); lpZ += lpA * (lpY - lpZ);
        out[start + i] += (r.lp ? lpZ : s) * env * gain;
      }
    } else if (r.kind === 'sweep') {
      const len = Math.min(out.length - start, Math.ceil(Math.min(1, r.tau * 7) * sr));
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const f = r.to + (r.from - r.to) * Math.exp(-t / (r.tau * 0.45));
        ph += f / sr;
        out[start + i] += wave(r.wave ?? 'sine', ph) * Math.exp(-t / r.tau) * gain * (t < 0.002 ? t / 0.002 : 1);
      }
    } else if (r.kind === 'burst') {
      const len = Math.min(out.length - start, Math.ceil(Math.min(1, r.tau * 7) * sr));
      const lpA = r.lp ? onePole(r.lp, sr) : 1;
      let y = 0, y2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let s = 0;
        for (const f of r.freqs) s += wave(r.wave, f * t);
        y += lpA * (s / r.freqs.length - y); y2 += lpA * (y - y2);
        out[start + i] += (r.lp ? y2 : s / r.freqs.length) * Math.exp(-t / r.tau) * gain;
      }
    } else {
      const bursts = r.bursts ?? [0];
      const hpA = r.hp ? onePole(r.hp, sr) : 0, lpA = r.lp ? onePole(r.lp, sr) : 1, bpLo = r.bp ? onePole(r.bp * 0.5, sr) : 0, bpHi = r.bp ? onePole(r.bp * 1.6, sr) : 1;
      for (const off of bursts) {
        const s0 = start + Math.floor(off * sr);
        const len = Math.min(out.length - s0, Math.ceil(Math.min(1, r.tau * 7) * sr));
        let hp = 0, hp2 = 0, lp = 0, lp2 = 0, bl = 0, bl2 = 0, bh = 0, bh2 = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          let s = noise();
          if (r.hp) { hp += hpA * (s - hp); s -= hp; hp2 += hpA * (s - hp2); s -= hp2; }
          if (r.lp) { lp += lpA * (s - lp); lp2 += lpA * (lp - lp2); s = lp2; }
          if (r.bp) { bl += bpLo * (s - bl); bl2 += bpLo * (bl - bl2); const hs = s - bl2; bh += bpHi * (hs - bh); bh2 += bpHi * (bh - bh2); s = bh2; }
          const env = (t < r.a ? t / r.a : Math.exp(-(t - r.a) / r.tau)) * gain;
          out[s0 + i] += s * env;
        }
      }
      if (r.body) {
        const len = Math.min(out.length - start, Math.ceil(Math.min(1, r.body.tau * 7) * sr));
        let ph = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const f = r.body.to ? r.body.to + (r.body.freq - r.body.to) * Math.exp(-t / (r.body.tau * 0.5)) : r.body.freq;
          ph += f / sr;
          out[start + i] += wave(r.body.wave ?? 'sine', ph) * Math.exp(-t / r.body.tau) * r.body.gain * n.vel;
        }
      }
    }
  }
  // gentle safety limiter so mixes of many layers can never clip
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.92) { const k = 0.92 / peak; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

/** 16-bit mono WAV bytes. */
export function toWav(samples: Float32Array, sr = 22050): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buf);
}

// ---- Web Audio player ----------------------------------------------------------------------------------------------

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = b.getChannelData(0);
  const r = lcg(98765);
  for (let i = 0; i < d.length; i++) d[i] = r();
  noiseBuf = b;
  return b;
}

/**
 * Schedule notes on an AudioContext starting at `t0` (ctx time). Everything is routed through one master gain that
 * the caller owns, and the returned function stops and disconnects everything cleanly (panel closed, song ended).
 * Pass `nodes` to collect scheduled sources so a stop can silence them immediately.
 */
export function scheduleWebAudio(ac: AudioContext, dest: AudioNode, notes: readonly Note[], t0: number): () => void {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const add = (s: AudioScheduledSourceNode, g?: GainNode) => { sources.push(s); if (g) gains.push(g); };
  for (const n of notes) {
    const r = RECIPES[n.voice];
    const t = t0 + n.t;
    const gain = r.gain * n.vel;
    try {
      if (r.kind === 'tonal') {
        const g = ac.createGain();
        const stopAt = t + n.dur + r.r + (Number.isFinite(r.tau) ? Math.min(2.5, r.tau * 5) : 0.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + r.a);
        if (Number.isFinite(r.tau)) {
          g.gain.setTargetAtTime(0.0001, t + r.a, r.tau);
        } else {
          g.gain.setValueAtTime(gain, t + n.dur);
          g.gain.linearRampToValueAtTime(0.0001, t + n.dur + r.r);
        }
        let tail: AudioNode = g;
        if (r.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = r.lp; g.connect(f); tail = f; }
        tail.connect(dest);
        const mk = (freq: number, amp: number, type: OscillatorType) => {
          const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
          if (amp !== 1) { const a = ac.createGain(); a.gain.value = amp; o.connect(a).connect(g); gains.push(a); } else o.connect(g);
          o.start(t); o.stop(stopAt); add(o);
        };
        if (r.detune) { mk(n.freq, 0.5, r.wave); mk(n.freq * Math.pow(2, r.detune / 1200), 0.5, r.wave); } else mk(n.freq, 1, r.wave);
        for (const [ratio, amp] of r.partials ?? []) mk(n.freq * ratio, amp, 'sine');
        gains.push(g);
      } else if (r.kind === 'sweep') {
        const g = ac.createGain(); const o = ac.createOscillator(); o.type = r.wave ?? 'sine';
        o.frequency.setValueAtTime(r.from, t); o.frequency.exponentialRampToValueAtTime(r.to, t + r.tau * 0.9);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.002, r.tau);
        o.connect(g).connect(dest); o.start(t); o.stop(t + r.tau * 6); add(o, g);
      } else if (r.kind === 'burst') {
        const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0.0001, t, r.tau);
        let tail: AudioNode = g;
        if (r.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = r.lp; g.connect(f); tail = f; }
        tail.connect(dest);
        for (const f of r.freqs) { const o = ac.createOscillator(); o.type = r.wave; o.frequency.value = f; const a = ac.createGain(); a.gain.value = 1 / r.freqs.length; o.connect(a).connect(g); o.start(t); o.stop(t + r.tau * 6); add(o, a); }
        gains.push(g);
      } else {
        for (const off of r.bursts ?? [0]) {
          const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac); s.loop = true;
          const g = ac.createGain(); const tt = t + off;
          g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(gain, tt + Math.max(0.001, r.a)); g.gain.setTargetAtTime(0.0001, tt + r.a, r.tau);
          let tail: AudioNode = s;
          const chain = (type: BiquadFilterType, f: number) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; tail.connect(b); tail = b; };
          if (r.hp) chain('highpass', r.hp); if (r.lp) chain('lowpass', r.lp); if (r.bp) chain('bandpass', r.bp);
          tail.connect(g).connect(dest); s.start(tt); s.stop(tt + r.tau * 7); add(s, g);
        }
        if (r.body) {
          const o = ac.createOscillator(); o.type = r.body.wave ?? 'sine'; const g = ac.createGain();
          o.frequency.setValueAtTime(r.body.freq, t); if (r.body.to) o.frequency.exponentialRampToValueAtTime(r.body.to, t + r.body.tau);
          g.gain.setValueAtTime(r.body.gain * n.vel, t); g.gain.setTargetAtTime(0.0001, t, r.body.tau);
          o.connect(g).connect(dest); o.start(t); o.stop(t + r.body.tau * 6); add(o, g);
        }
      }
    } catch { /* a failed note must never break the game */ }
  }
  return () => {
    const now = ac.currentTime;
    for (const g of gains) { try { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.0001, now, 0.02); } catch { /* ignore */ } }
    for (const s of sources) { try { s.stop(now + 0.1); } catch { /* ignore */ } }
  };
}
