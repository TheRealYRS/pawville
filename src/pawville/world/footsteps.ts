/**
 * Milestone 8.2: footsteps that change with the ground. Pure surface lookup (tested) plus a tiny
 * synthesised step (filtered noise burst + optional thump): no audio files. Steps are tied to the
 * walk cycle (two per cycle), quiet, slightly varied, and only for your own cat. They follow the
 * global sound switch and can be turned off separately (Settings → footsteps).
 */
import { RG, groundAtR, RTILE, type RegionDef } from '../adventure/regionKit.ts';
import { effectsAudio } from '../city/voices.ts';

export type Surface = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'water' | 'carpet' | 'roof';

/** Region ground tile → surface. Unknown tiles count as stone (city paving). */
export function surfaceOfTile(t: number): Surface {
  switch (t) {
    case RG.Grass: case RG.Flowers: case RG.Hedge: case RG.Forest: case RG.Moss: case RG.StarGrass: return 'grass';
    case RG.Path: return 'dirt';
    case RG.Sand: return 'sand';
    case RG.Snow: case RG.Ice: return 'snow';
    case RG.Water: case RG.Deep: case RG.Shallows: return 'water';
    case RG.Bridge: case RG.Wood: case RG.Dock: return 'wood';
    case RG.Carpet: return 'carpet';
    case RG.Roof: return 'roof';
    default: return 'stone';
  }
}

export function surfaceAt(def: Pick<RegionDef, 'cols' | 'rows' | 'ground'>, x: number, y: number): Surface {
  const c = Math.floor(x / RTILE), r = Math.floor((y - 2) / RTILE);
  if (c < 0 || r < 0 || c >= def.cols || r >= def.rows) return 'stone';
  return surfaceOfTile(groundAtR(def as RegionDef, c, r));
}

/** Sound recipe for a surface: noise band (Hz), length (s), loudness, and a low "thump". */
export const STEP_SOUND: Record<Surface, { f: number; q: number; dur: number; gain: number; thump: number }> = {
  grass: { f: 2600, q: 0.7, dur: 0.07, gain: 0.05, thump: 0 },
  dirt: { f: 1400, q: 0.9, dur: 0.06, gain: 0.055, thump: 0.02 },
  stone: { f: 3600, q: 2.2, dur: 0.035, gain: 0.05, thump: 0.015 },
  wood: { f: 900, q: 3.5, dur: 0.06, gain: 0.05, thump: 0.05 },
  sand: { f: 1800, q: 0.5, dur: 0.09, gain: 0.045, thump: 0 },
  snow: { f: 1200, q: 0.6, dur: 0.11, gain: 0.06, thump: 0.01 },
  water: { f: 700, q: 1.2, dur: 0.12, gain: 0.06, thump: 0 },
  carpet: { f: 500, q: 0.8, dur: 0.05, gain: 0.03, thump: 0.02 },
  roof: { f: 2200, q: 2.8, dur: 0.04, gain: 0.05, thump: 0.03 },
};

let enabled = true;
try { enabled = window.localStorage.getItem('pawville:footsteps') !== 'off'; } catch { /* default on */ }
export function footstepsEnabled(): boolean { return enabled; }
export function setFootstepsEnabled(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem('pawville:footsteps', on ? 'on' : 'off'); } catch { /* ignore */ }
}

let noise: AudioBuffer | null = null;
let lastStep = 0;
/** Play one soft step on `surface` (rate-limited; `run` = a little louder and shorter). */
export function playStep(surface: Surface, run = false): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastStep < 90) return;
  lastStep = now;
  const ac = effectsAudio();
  if (!ac) return;
  try {
    const s = STEP_SOUND[surface];
    if (!noise) {
      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime + 0.002;
    const dur = s.dur * (run ? 0.8 : 1) * (0.9 + Math.random() * 0.2);
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = s.f * (0.92 + Math.random() * 0.16);
    bp.Q.value = s.q;
    const amp = ac.createGain();
    const g = s.gain * (run ? 1.25 : 1);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(amp).connect(ac.destination);
    src.start(t0, Math.random() * 0.05, dur + 0.02);
    if (s.thump > 0) {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(surface === 'wood' ? 160 : 110, t0);
      o.frequency.exponentialRampToValueAtTime(60, t0 + 0.05);
      const a2 = ac.createGain();
      a2.gain.setValueAtTime(0.0001, t0);
      a2.gain.exponentialRampToValueAtTime(s.thump, t0 + 0.004);
      a2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      o.connect(a2).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + 0.08);
    }
  } catch {
    /* audio problems never break the game */
  }
}

/** The original Pawville town map uses its own tile set (world/townMap.ts). */
export function townSurfaceOfTile(t: number): Surface {
  // Ground: Grass 0, Path 1, Plaza 2, Water 3, Sand 4, Dock 5, Dirt 6, Flowerbed 7, Hill 8, Meadow 9, Soil 10
  switch (t) {
    case 0: case 7: case 8: case 9: return 'grass';
    case 1: case 6: case 10: return 'dirt';
    case 2: return 'stone';
    case 3: return 'water';
    case 4: return 'sand';
    case 5: return 'wood';
    default: return 'grass';
  }
}
