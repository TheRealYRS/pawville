/**
 * Tiny synthesized sound kit (Web Audio, no audio files to load or license).
 * Sound is OFF by default and the AudioContext is only created after the user
 * turns it on (a user gesture), which satisfies browser autoplay rules.
 * Every call is wrapped so audio problems can never break the game.
 */
import { loadPreferences, savePreferences } from './preferences';

type Listener = (on: boolean) => void;

let enabled = loadPreferences().sound;
let ctx: AudioContext | null = null;
const listeners = new Set<Listener>();

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.12, delay = 0 }: ToneOpts) {
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  /** Soft paw tap for each move. */
  tap: () => { tone({ freq: 220, to: 120, dur: 0.09, type: 'triangle', gain: 0.18 }); },
  /** Gentle pop when a cat appears. */
  pop: () => { tone({ freq: 520, to: 880, dur: 0.11, gain: 0.1, delay: 0.04 }); },
  /** Small UI click. */
  click: () => { tone({ freq: 660, dur: 0.05, type: 'triangle', gain: 0.06 }); },
  /** Sparkle on victory. */
  victory: () => {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.09, delay: i * 0.08 }));
    tone({ freq: 2093, dur: 0.4, gain: 0.04, delay: 0.34 });
  },
  /** Gentle "aww" when you lose. */
  lose: () => { tone({ freq: 392, to: 262, dur: 0.45, type: 'triangle', gain: 0.08 }); },
  /** Playful wobble for a draw. */
  draw: () => {
    tone({ freq: 440, to: 330, dur: 0.16, type: 'square', gain: 0.035 });
    tone({ freq: 330, to: 440, dur: 0.16, type: 'square', gain: 0.035, delay: 0.18 });
  },
  /** Subtle chime when the opponent joins. */
  join: () => {
    tone({ freq: 660, dur: 0.14, gain: 0.08 });
    tone({ freq: 990, dur: 0.2, gain: 0.07, delay: 0.1 });
  },
  /** Tiny blip for reactions. */
  reaction: () => { tone({ freq: 900, to: 1200, dur: 0.07, gain: 0.05 }); },
  /** Invalid action. */
  nope: () => { tone({ freq: 160, dur: 0.08, type: 'square', gain: 0.03 }); },
  /**
   * Pawville (Milestone 6): Puchu's loud purr — a low, rumbling ~26 Hz amplitude-modulated hum.
   * Clearly recognisable but deliberately soft (peak gain 0.07), and silent while sound is off.
   */
  purr: (seconds = 3.2) => {
    const ac = audio();
    if (!ac) return;
    try {
      const t0 = ac.currentTime;
      const body = ac.createOscillator();
      body.type = 'sawtooth';
      body.frequency.setValueAtTime(48, t0);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const amp = ac.createGain();
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(0.07, t0 + 0.4);
      amp.gain.setValueAtTime(0.07, t0 + seconds - 0.6);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
      // the rumble: a slow LFO pulsing the volume (in-breath / out-breath feel)
      const lfo = ac.createOscillator();
      lfo.frequency.value = 26;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(amp.gain);
      body.connect(lp).connect(amp).connect(ac.destination);
      body.start(t0); lfo.start(t0);
      body.stop(t0 + seconds + 0.05); lfo.stop(t0 + seconds + 0.05);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Milestone 10: the ONE AudioContext for the whole game (sfx, character voices, footsteps, karaoke).
 * Character voices used to create their own second context, which some browsers left suspended.
 */
export function sharedAudioContext(): AudioContext | null {
  return audio();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  savePreferences({ sound: on });
  if (on) {
    audio();
    sfx.click();
  }
  listeners.forEach((l) => l(on));
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
