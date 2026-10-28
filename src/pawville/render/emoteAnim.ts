/**
 * Emote animation timelines (pure, deterministic, unit tested).
 *
 * Every emote is a function of elapsed time only: `emoteFrame(id, t)` describes the cat's body
 * (pose, offsets, paw, eyes, ears, cheeks, tail) and `emoteParticles(id, t)` lists the small
 * effects drawn around it. Nothing is stored between frames, so a cat can never get "stuck" in an
 * animation: once `t >= duration` the timeline returns null and the cat is idle again. Remote
 * clients reproduce exactly the same animation from the emote id + start time.
 *
 * Particles are bounded (MAX_PARTICLES) and computed from t, so there is nothing to clean up.
 */
import { emoteDef } from '../couple/emotes.ts';
import type { EmoteId } from '../net/presenceProtocol.ts';
import type { CatPose } from './catSprites.ts';

export type EyeState = 'open' | 'happy' | 'closed' | 'wide' | 'sad' | 'glow';
export type EarState = 'up' | 'down' | 'perk';
export type PawState = 'none' | 'left' | 'right' | 'both' | 'forward';
/** Milestone 6 whole-body poses used by signature emotes (see render/catSprites.ts). */
export type BodyMode = 'none' | 'stretch' | 'belly' | 'upright';

export interface EmoteFrame {
  pose: CatPose;
  /** Body offset in world pixels (integers). */
  dx: number;
  dy: number;
  /** Turn to face the camera (or the partner, for shared emotes). */
  face: 'keep' | 'camera' | 'partner';
  paw: PawState;
  /** 0..3 pixels the paw is raised above its base position. */
  pawLift: number;
  /** -2..2 horizontal paw offset (waving). */
  pawDx: number;
  eyes: EyeState;
  ears: EarState;
  cheeks: boolean;
  /** Tail sway override (-1..1); 0 = default idle sway. */
  tail: number;
  /** 0..1 eye-glow intensity (Starpaw Serenade). */
  glow: number;
  /** Phase label (for tests and debugging). */
  phase: string;
  /** Milestone 6: whole-body pose + its quantised parameters (see SpriteKey). */
  body: BodyMode;
  bodyK: number;
  arms: number;
  tilt: number;
  /** Milestone 6: movement is locked while this emote plays (all emotes already stop walking). */
  sound?: 'purr';
}

export type ParticleKind = 'heart' | 'note' | 'star' | 'spark' | 'z' | 'puff' | 'drop' | 'paw' | 'bang' | 'wave' | 'ring' | 'text';

export interface Particle {
  kind: ParticleKind;
  /** Offset from the cat's feet, world pixels. */
  x: number;
  y: number;
  color: string;
  /** 0..1 */
  alpha: number;
  /** 1 = small, 2 = big */
  size: 1 | 2;
  text?: string;
}

export const MAX_PARTICLES = 16;
const GREEN = '#57F28A';
const EMERALD = '#2EE86A';
const GOLD = '#FFD45E';

const base = (pose: CatPose, phase: string): EmoteFrame => ({
  pose, dx: 0, dy: 0, face: 'keep', paw: 'none', pawLift: 0, pawDx: 0, eyes: 'open', ears: 'up', cheeks: false, tail: 0, glow: 0, phase,
  body: 'none', bodyK: 0, arms: 0, tilt: 0,
});

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Integer pixel offset from a smooth curve. */
const px = (v: number) => Math.round(v);
/** Smooth 0→1→0 envelope inside [a,b]. */
function bump(t: number, a: number, b: number): number {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
}
/** Ease-in-out 0→1 between a and b. */
function ramp(t: number, a: number, b: number): number {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
}

export function emoteDuration(id: EmoteId): number {
  return emoteDef(id)?.ms ?? 0;
}

/**
 * The body state at `t` ms into the emote. Returns null when the emote is over (or unknown),
 * which means "back to idle" — the single completion rule for every emote.
 * `reduced` = prefers-reduced-motion: calmer, smaller movements, no oscillation.
 */
export function emoteFrame(id: EmoteId | null, t: number, reduced = false): EmoteFrame | null {
  if (!id) return null;
  const d = emoteDef(id);
  if (!d || !Number.isFinite(t) || t < 0 || t >= d.ms) return null;
  const s = reduced ? 0 : 1; // motion scale
  switch (id) {
    case 'wave': {
      // anticipation (lean back) → wave ×2 → recover
      const f = base('stand', t < 200 ? 'anticipate' : t < 1500 ? 'wave' : 'recover');
      f.face = 'camera';
      f.eyes = 'happy';
      f.paw = 'right';
      f.pawLift = t < 200 ? px(ramp(t, 0, 200) * 2) : t < 1500 ? 3 : px((1 - ramp(t, 1500, 1800)) * 3);
      f.pawDx = t >= 200 && t < 1500 ? px(Math.sin(((t - 200) / 1300) * Math.PI * 4) * 2 * s) : 0;
      f.dx = t < 200 ? -px(ramp(t, 0, 200) * s) : px(Math.sin(((t - 200) / 1300) * Math.PI * 2) * s);
      f.tail = Math.sin(t / 160) * s;
      return f;
    }
    case 'heart': {
      const f = base('sit', t < 300 ? 'settle' : 'heart');
      f.face = 'camera';
      f.eyes = 'happy';
      f.dy = px(-bump(t, 0, 300) * s);
      f.tail = Math.sin(t / 300) * 0.6 * s;
      return f;
    }
    case 'dance': {
      const beat = t / 325; // 8 beats
      const f = base('stand', 'dance');
      f.face = 'camera';
      f.eyes = 'happy';
      f.dx = px(Math.sin(beat * Math.PI) * 2 * s);
      f.dy = -px(Math.abs(Math.sin(beat * Math.PI)) * 2 * s);
      f.paw = Math.floor(beat) % 2 === 0 ? 'left' : 'right';
      f.pawLift = 2;
      f.tail = Math.sin(beat * Math.PI) * s;
      if (t > d.ms - 250) { f.paw = 'none'; f.dx = 0; f.dy = 0; f.phase = 'recover'; }
      return f;
    }
    case 'celebrate': {
      const f = base('stand', t < 250 ? 'crouch' : t < 1700 ? 'cheer' : 'recover');
      f.face = 'camera';
      f.eyes = 'happy';
      f.ears = 'perk';
      f.dy = t < 250 ? px(ramp(t, 0, 250) * s) : t < 1700 ? -px(Math.abs(Math.sin(((t - 250) / 360) * Math.PI)) * 4 * s) : 0;
      f.paw = t < 250 || t >= 1900 ? 'none' : 'both';
      f.pawLift = 3;
      f.tail = Math.sin(t / 120) * s;
      return f;
    }
    case 'grumble': {
      const f = base('sit', t < 250 ? 'inhale' : t < 1400 ? 'huff' : 'release');
      f.face = 'camera';
      f.eyes = 'sad';
      f.cheeks = t >= 250 && t < 1400;
      f.dy = t < 250 ? -px(ramp(t, 0, 250) * s) : 0;
      f.tail = t >= 250 && t < 1400 ? Math.sign(Math.sin(t / 90)) * s : 0;
      return f;
    }
    case 'sorry': {
      const f = base('sit', t < 300 ? 'lower' : t < 1900 ? 'apologise' : 'recover');
      f.face = 'camera';
      f.eyes = t < 300 ? 'open' : 'sad';
      f.ears = t >= 200 && t < 2000 ? 'down' : 'up';
      f.dy = px(ramp(t, 0, 300) * (1 - ramp(t, 1900, 2200)));
      f.tail = -0.6;
      return f;
    }
    case 'purr': {
      const f = base('sit', 'purr');
      f.face = 'camera';
      f.eyes = 'closed';
      f.dx = reduced ? 0 : Math.floor(t / 70) % 2 === 0 ? 0 : 1; // tiny rumble
      f.tail = Math.sin(t / 400) * 0.8 * s;
      if (t < 200 || t > d.ms - 200) f.eyes = 'happy';
      return f;
    }
    case 'surprised': {
      const f = base('stand', t < 100 ? 'anticipate' : t < 500 ? 'jump' : 'recover');
      f.face = 'camera';
      f.eyes = 'wide';
      f.ears = 'perk';
      f.dy = t < 100 ? 1 : -px(bump(t, 100, 500) * 4 * s);
      f.tail = t < 500 ? 1 : 0.4;
      return f;
    }
    case 'bounce': {
      const hop = (t % 500) / 500;
      const f = base('stand', 'bounce');
      f.eyes = 'happy';
      f.dy = -px(Math.sin(hop * Math.PI) * 3 * s);
      f.dx = px(Math.sin((t / 1000) * Math.PI) * s);
      f.tail = Math.sin(t / 100) * s;
      return f;
    }
    case 'sleepy': {
      const f = base(t < 500 ? 'sit' : 'loaf', t < 500 ? 'curl' : t > d.ms - 400 ? 'wake' : 'sleep');
      f.eyes = 'closed';
      return f;
    }
    case 'high-five':
    case 'paw-bump': {
      // reach toward the partner → contact (600–1000 ms) → recover
      const f = base('stand', t < 600 ? 'reach' : t < 1000 ? 'contact' : 'recover');
      f.face = 'partner';
      f.eyes = t >= 600 && t < 1000 ? 'happy' : 'open';
      f.paw = 'forward';
      f.pawLift = id === 'high-five' ? px(ramp(t, 0, 600) * 3) : 1;
      f.dx = px(ramp(t, 0, 600) * (1 - ramp(t, 1000, 1600)) * 2); // lean toward partner (+x = toward)
      if (t >= 1300) f.paw = 'none';
      return f;
    }
    case 'nose-boop': {
      const f = base('stand', t < 700 ? 'lean' : t < 1100 ? 'boop' : 'recover');
      f.face = 'partner';
      f.eyes = t >= 700 && t < 1100 ? 'closed' : 'happy';
      f.dx = px(ramp(t, 0, 700) * (1 - ramp(t, 1100, 1800)) * 3);
      return f;
    }
    case 'hug': {
      const f = base('sit', t < 500 ? 'approach' : t < 2500 ? 'hug' : 'recover');
      f.face = 'partner';
      f.eyes = t >= 500 && t < 2500 ? 'closed' : 'happy';
      f.paw = t >= 500 && t < 2500 ? 'forward' : 'none';
      f.pawLift = 1;
      f.dx = px(ramp(t, 0, 500) * (1 - ramp(t, 2500, 3000)) * 3);
      f.tail = Math.sin(t / 250) * 0.7 * s;
      return f;
    }
    case 'sit-together': {
      const f = base('sit', 'together');
      f.face = 'partner';
      f.eyes = Math.floor(t / 1500) % 3 === 2 ? 'closed' : 'happy';
      f.dx = 1;
      f.tail = Math.sin(t / 500) * 0.6 * s;
      return f;
    }
    case 'mini-starpaw-serenade':
      return starpawFrame(t, reduced);
    case 'magic-long-stretch':
      return stretchFrame(t, reduced);
    case 'chutki-belly-nap':
      return bellyNapFrame(t, reduced);
    case 'puchu-loud-purr':
      return loudPurrFrame(t, reduced);
    case 'tangerine-curious-tilt':
      return curiousTiltFrame(t, reduced);
    case 'midnight-pounce':
      return pounceFrame(t, reduced);
    case 'racon-fence-dance':
      return fenceDanceFrame(t, reduced);
  }
  return null;
}

// ============================================================================================
// Milestone 6 signature timelines. Each is a pure function of t; each ends in an explicit
// recovery phase whose last frame is the idle pose, and returns null after its duration.
// ============================================================================================

/** Magic — Long Stretch (4.2 s): lower the front, reach, arch, hold, relax, blink, idle. */
export const STRETCH = { lower: [0, 700], hold: [700, 2700], relax: [2700, 3700], blink: [3700, 4200] } as const;
function stretchFrame(t: number, reduced: boolean): EmoteFrame {
  if (t < STRETCH.lower[1]) {
    const f = base('stand', 'lower');
    f.body = 'stretch';
    f.bodyK = px(ramp(t, 0, 700) * (reduced ? 2 : 3));
    f.tail = 0.6;
    f.eyes = t > 450 ? 'closed' : 'open';
    return f;
  }
  if (t < STRETCH.hold[1]) {
    const f = base('stand', 'hold');
    f.body = 'stretch';
    f.bodyK = reduced ? 2 : 3;
    f.eyes = 'closed';
    f.ears = Math.floor(t / 900) % 2 ? 'down' : 'up'; // ears relax back during the long hold
    f.tail = reduced ? 0.6 : 0.4 + Math.sin(t / 500) * 0.6; // the tail curls and uncurls
    return f;
  }
  if (t < STRETCH.relax[1]) {
    const f = base('stand', 'relax');
    f.body = 'stretch';
    f.bodyK = px((1 - ramp(t, 2700, 3700)) * (reduced ? 2 : 3));
    f.eyes = 'happy';
    f.tail = 0.3;
    if (f.bodyK === 0) f.body = 'none';
    return f;
  }
  const f = base('stand', 'blink');
  f.face = 'camera';
  f.eyes = t > 3850 && t < 4000 ? 'closed' : 'happy';
  return f;
}

/** Chutki — Upside-Down Sleep (7 s): settle, roll over, sleep belly-up, twitch, yawn, idle. */
export const BELLY_NAP = { settle: [0, 600], roll: [600, 1000], sleep: [1000, 6000], wake: [6000, 7000] } as const;
function bellyNapFrame(t: number, reduced: boolean): EmoteFrame {
  if (t < BELLY_NAP.settle[1]) {
    const f = base('sit', 'settle');
    f.eyes = 'happy';
    f.dy = px(ramp(t, 0, 600));
    return f;
  }
  if (t < BELLY_NAP.roll[1]) {
    const f = base('loaf', 'roll');
    f.eyes = 'closed';
    f.dx = reduced ? 0 : px(Math.sin(((t - 600) / 400) * Math.PI) * 2);
    return f;
  }
  if (t < BELLY_NAP.sleep[1]) {
    const f = base('loaf', 'sleep');
    f.body = 'belly';
    f.eyes = 'closed';
    // slow breathing: in for 900 ms, out for 900 ms
    f.bodyK = Math.floor((t - 1000) / 900) % 2;
    return f;
  }
  if (t < 6600) {
    const f = base('loaf', 'yawn');
    f.body = t < 6300 ? 'belly' : 'none';
    f.eyes = t < 6300 ? 'happy' : 'closed';
    return f;
  }
  const f = base('sit', 'wake');
  f.face = 'camera';
  f.eyes = t < 6800 ? 'closed' : 'happy';
  f.dy = px((1 - ramp(t, 6600, 7000)));
  return f;
}

/** Puchu — Loud Purr (4.5 s): settle, soft eyes, a visible rhythmic purr, fade out. */
export const LOUD_PURR = { settle: [0, 500], purr: [500, 3900], fade: [3900, 4500] } as const;
function loudPurrFrame(t: number, reduced: boolean): EmoteFrame {
  const f = base('sit', t < LOUD_PURR.settle[1] ? 'settle' : t < LOUD_PURR.purr[1] ? 'purr' : 'fade');
  f.face = 'camera';
  f.eyes = t < 400 ? 'happy' : 'closed';
  f.cheeks = t >= 500 && t < 3900;
  f.sound = t >= 500 && t < 3900 ? 'purr' : undefined;
  if (!reduced && t >= 500 && t < 3900) {
    // rhythmic shoulder rumble (~7 Hz), 1 px — visible but gentle
    f.dy = Math.floor(t / 70) % 2 === 0 ? 0 : -1;
  }
  f.tail = reduced ? 0 : Math.sin(t / 600) * 0.7;
  f.pawLift = 0;
  if (t > 2000 && t < 2300) { f.paw = 'forward'; f.pawLift = 1; } // an occasional contented knead
  return f;
}

/** Tangerine — Curious Tilt (2.8 s): head tilt, paw taps, tail swish, excited little hop. */
function curiousTiltFrame(t: number, reduced: boolean): EmoteFrame {
  const s = reduced ? 0 : 1;
  const f = base('stand', t < 500 ? 'notice' : t < 1400 ? 'tilt' : t < 2300 ? 'tap' : 'recover');
  f.face = 'camera';
  f.ears = 'perk';
  f.eyes = t < 1400 ? 'wide' : 'happy';
  f.tilt = t < 500 ? 0 : t < 950 ? -1 : t < 1400 ? 1 : 0;
  if (t >= 1400 && t < 2300) {
    const tap = Math.floor((t - 1400) / 150) % 2;
    f.paw = 'forward';
    f.pawLift = tap ? 2 : 0;
  }
  f.dy = t >= 2300 && t < 2600 ? -px(bump(t, 2300, 2600) * 2 * s) : 0;
  f.tail = Math.sin(t / 110) * (t > 1400 ? 1 : 0.5) * (reduced ? 0.4 : 1);
  return f;
}

/** Midnight — Playful Pounce (2.6 s): crouch, wiggle, pounce, land, calm slow blink. */
function pounceFrame(t: number, reduced: boolean): EmoteFrame {
  const s = reduced ? 0.4 : 1;
  if (t < 900) {
    const f = base('sit', t < 300 ? 'crouch' : 'wiggle');
    f.ears = 'perk';
    f.eyes = 'wide';
    f.dy = 1;
    f.dx = t >= 300 && !reduced ? (Math.floor(t / 90) % 2 ? 1 : -1) : 0; // the bum wiggle
    f.tail = Math.sin(t / 60) * s;
    return f;
  }
  if (t < 1500) {
    const k = (t - 900) / 600;
    const f = base('stand', 'pounce');
    f.paw = 'forward';
    f.pawLift = 2;
    f.ears = 'perk';
    f.eyes = 'wide';
    f.dx = px(k * 3 * s); // kept within the 3 px emote envelope so a pounce never clips into walls
    f.dy = -px(Math.sin(k * Math.PI) * 5 * s);
    return f;
  }
  if (t < 1900) {
    const f = base('stand', 'land');
    f.dx = px(3 * s * (1 - ramp(t, 1500, 1900)));
    f.paw = 'forward';
    f.eyes = 'happy';
    return f;
  }
  const f = base('sit', 'blink');
  f.face = 'camera';
  f.eyes = t > 2100 && t < 2450 ? 'closed' : 'open'; // the calm, slow cat blink
  f.tail = Math.sin(t / 400) * 0.4;
  return f;
}

/**
 * Racon — Fence Dance (5.2 s), after the user's reference clip: upright stance, forearms crossing
 * over each other in a steady rhythm while the upper body sways left and right, head bobbing,
 * ringed tail counter-swaying; finishes with a "ta-da" pose and returns to idle.
 * Beat = 260 ms. Arms cycle 0 → 1 → 2 → 3 (left over / open / right over / open), one step per beat;
 * the sway changes side every 4 beats.
 */
export const FENCE_DANCE = { rise: [0, 400], dance: [400, 4400], finish: [4400, 5000], settle: [5000, 5200], beatMs: 260 } as const;
function fenceDanceFrame(t: number, reduced: boolean): EmoteFrame {
  if (t < FENCE_DANCE.rise[1]) {
    const f = base('stand', 'rise');
    f.body = t < 200 ? 'none' : 'upright';
    f.face = 'camera';
    f.eyes = 'open';
    f.ears = 'perk';
    f.arms = 1;
    return f;
  }
  if (t < FENCE_DANCE.dance[1]) {
    const beat = Math.floor((t - 400) / FENCE_DANCE.beatMs);
    const within = ((t - 400) % FENCE_DANCE.beatMs) / FENCE_DANCE.beatMs;
    const f = base('stand', 'dance');
    f.body = 'upright';
    f.face = 'camera';
    f.eyes = 'happy';
    f.ears = beat % 2 ? 'perk' : 'up';
    f.arms = reduced ? (Math.floor(beat / 2) % 2 ? 2 : 0) : beat % 4;
    const side = Math.floor(beat / 4) % 2 === 0 ? -1 : 1; // sway left for 4 beats, then right
    f.bodyK = reduced ? 0 : side;
    f.dx = reduced ? 0 : side * 2;
    f.dy = reduced ? 0 : -px(Math.sin(within * Math.PI)); // head bob on every beat
    f.tail = -side;
    return f;
  }
  if (t < FENCE_DANCE.finish[1]) {
    const f = base('stand', 'finish');
    f.body = 'upright';
    f.face = 'camera';
    f.eyes = 'happy';
    f.ears = 'perk';
    f.arms = 4; // ta-da!
    f.dy = reduced ? 0 : -1;
    return f;
  }
  const f = base('stand', 'settle');
  f.face = 'camera';
  f.eyes = 'happy';
  return f;
}

/** Starpaw Serenade phases (ms). */
export const STARPAW = { intro: [0, 600], wave: [600, 2400], flourish: [2400, 3200], finish: [3200, 3800] } as const;

function starpawFrame(t: number, reduced: boolean): EmoteFrame {
  const s = reduced ? 0.35 : 1;
  if (t < STARPAW.intro[1]) {
    // Phase 1 — turn to camera, ears perk, head tilt, eyes begin to glow.
    const f = base('stand', 'intro');
    f.face = 'camera';
    f.ears = 'perk';
    f.dx = px(ramp(t, 200, 600) * s);
    f.glow = ramp(t, 100, 600) * 0.6;
    f.tail = Math.sin(t / 200) * 0.5 * s;
    return f;
  }
  if (t < STARPAW.wave[1]) {
    // Phase 2 — the signature paw wave: left → right → left (×2), body sway, tail in time.
    const k = (t - STARPAW.wave[0]) / (STARPAW.wave[1] - STARPAW.wave[0]);
    const sweep = Math.sin(k * Math.PI * 4); // two full left-right-left cycles
    const f = base('stand', 'wave');
    f.face = 'camera';
    f.ears = 'perk';
    f.eyes = 'glow';
    f.paw = 'right';
    f.pawLift = k < 0.08 ? px(ramp(k, 0, 0.08) * 3) : 3;
    f.pawDx = reduced ? (k < 0.5 ? -1 : 1) : px(sweep * 2);
    f.dx = px(sweep * s);
    f.tail = sweep * s;
    f.glow = 0.6 + 0.3 * bump(k, 0.15, 0.95);
    return f;
  }
  if (t < STARPAW.flourish[1]) {
    // Phase 3 — confident blink, a final paw flick, constellation forms, emerald flash.
    const f = base('stand', 'flourish');
    f.face = 'camera';
    f.ears = 'perk';
    f.eyes = t < 2600 ? 'closed' : 'glow';
    f.paw = 'right';
    f.pawLift = 3;
    f.pawDx = t >= 2600 && t < 2800 ? px(2 * s) : 0;
    f.glow = t >= 2700 && t < 2950 ? 1 : 0.5;
    f.tail = 0.5 * s;
    return f;
  }
  // Phase 4 — lower the paw, proud little smile + head tilt, last tail swish, back to idle.
  const f = base('stand', 'finish');
  f.face = 'camera';
  f.eyes = 'happy';
  f.paw = t < 3500 ? 'right' : 'none';
  f.pawLift = px((1 - ramp(t, 3200, 3500)) * 3);
  f.dx = px((1 - ramp(t, 3500, 3800)) * s);
  f.tail = Math.sin(((t - 3200) / 600) * Math.PI * 2) * s;
  f.glow = 0.5 * (1 - ramp(t, 3200, 3700));
  return f;
}

/** Hash-based pseudo random in [0,1) (stateless particles). */
function h(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Small effects around the cat at time `t`. Pure and bounded. `reduced` keeps only a few calm,
 * mostly static particles.
 */
export function emoteParticles(id: EmoteId | null, t: number, reduced = false, frame?: EmoteFrame | null): Particle[] {
  if (!id) return [];
  const d = emoteDef(id);
  if (!d || t < 0 || t >= d.ms) return [];
  const out: Particle[] = [];
  const fade = (a: number, b: number) => clamp01(Math.min((t - a) / 150, (b - t) / 250));
  const push = (p: Particle) => { if (out.length < MAX_PARTICLES && p.alpha > 0.02) out.push(p); };
  switch (id) {
    case 'wave':
      push({ kind: 'wave', x: 9, y: -27, color: '#FFF3E6', alpha: fade(150, 1700), size: 1 });
      break;
    case 'heart': {
      const k = clamp01(t / d.ms);
      push({ kind: 'heart', x: 0, y: -26 - (reduced ? 0 : px(k * 10)), color: '#FF6FA1', alpha: fade(200, 1950), size: 2 });
      if (!reduced) for (let i = 0; i < 2; i++) {
        const st = 500 + i * 400;
        const kk = clamp01((t - st) / 900);
        if (t > st) push({ kind: 'heart', x: (i ? 6 : -6) + px(Math.sin(kk * 6) * 1), y: -20 - px(kk * 12), color: '#FF9DBE', alpha: (1 - kk) * 0.9, size: 1 });
      }
      break;
    }
    case 'dance':
      for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const k = ((t / 900) + i / 3) % 1;
        push({ kind: 'note', x: -8 + i * 8, y: -22 - px(k * 10), color: i % 2 ? GOLD : '#C9BFE8', alpha: Math.sin(k * Math.PI), size: 1 });
      }
      break;
    case 'celebrate':
      for (let i = 0; i < (reduced ? 3 : 8); i++) {
        const k = clamp01((t - 250 - i * 60) / 1200);
        if (k <= 0) continue;
        const a = (i / 8) * Math.PI * 2 + h(i) * 0.5;
        push({ kind: i % 3 === 0 ? 'star' : 'spark', x: px(Math.cos(a) * (6 + k * 12)), y: -16 + px(Math.sin(a) * (4 + k * 8)) - (reduced ? 0 : px(k * 4)), color: [GOLD, '#FF8A35', '#FF6FA1', '#7EE0D2'][i % 4], alpha: 1 - k, size: i % 3 === 0 ? 2 : 1 });
      }
      break;
    case 'grumble':
      if (t > 250 && t < 1500) {
        const k = ((t - 250) % 500) / 500;
        push({ kind: 'puff', x: -10 - px(k * 4), y: -12, color: '#FFF3E6', alpha: (1 - k) * 0.85, size: 1 });
        push({ kind: 'puff', x: 10 + px(k * 4), y: -12, color: '#FFF3E6', alpha: (1 - k) * 0.85, size: 1 });
      }
      push({ kind: 'text', x: 0, y: -28, color: '#FFC94A', alpha: fade(250, 1500), size: 1, text: 'hmph' });
      break;
    case 'sorry':
      push({ kind: 'text', x: 0, y: -27, color: '#C9BFE8', alpha: fade(300, 2100), size: 1, text: 'sorry' });
      push({ kind: 'drop', x: 7, y: -18 + (reduced ? 0 : px(((t % 900) / 900) * 3)), color: '#9FD3FF', alpha: fade(400, 1900) * 0.9, size: 1 });
      break;
    case 'purr':
      for (let i = 0; i < (reduced ? 1 : 2); i++) {
        const k = ((t / 800) + i * 0.5) % 1;
        push({ kind: 'wave', x: 8 + px(k * 4), y: -16 - px(k * 6), color: '#FFC94A', alpha: Math.sin(k * Math.PI) * 0.9, size: 1 });
      }
      break;
    case 'surprised':
      push({ kind: 'bang', x: 6, y: -30 - px(bump(t, 100, 500) * 4), color: GOLD, alpha: fade(80, 1300), size: 2 });
      break;
    case 'bounce':
      if ((t % 500) < 120) push({ kind: 'puff', x: 0, y: 0, color: '#E9DCCF', alpha: 0.6, size: 1 });
      break;
    case 'sleepy':
      if (t > 600) for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const k = (((t - 600) / 1600) + i / 3) % 1;
        push({ kind: 'z', x: 8 + px(k * 6) + i, y: -10 - px(k * 14), color: '#C9BFE8', alpha: Math.sin(k * Math.PI), size: k > 0.5 ? 2 : 1 });
      }
      break;
    case 'high-five':
    case 'paw-bump':
      if (t >= 600 && t < 1200) {
        const k = (t - 600) / 600;
        for (let i = 0; i < (reduced ? 2 : 6); i++) {
          const a = (i / 6) * Math.PI * 2;
          push({ kind: 'spark', x: 10 + px(Math.cos(a) * k * 6), y: -14 + px(Math.sin(a) * k * 5), color: i % 2 ? GOLD : '#FFF3E6', alpha: 1 - k, size: 1 });
        }
        push({ kind: 'text', x: 10, y: -28, color: GOLD, alpha: 1 - k * 0.6, size: 1, text: id === 'high-five' ? 'paw!' : 'bump' });
      }
      break;
    case 'nose-boop':
      if (t >= 700 && t < 1300) push({ kind: 'heart', x: 9, y: -20 - px(((t - 700) / 600) * 6), color: '#FF6FA1', alpha: 1 - (t - 700) / 600, size: 1 });
      break;
    case 'hug':
      if (t >= 500) for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const k = (((t - 500) / 1200) + i / 3) % 1;
        push({ kind: 'heart', x: 9 + px(Math.sin(k * 5 + i) * 3), y: -20 - px(k * 12), color: i % 2 ? '#FF9DBE' : '#FF6FA1', alpha: Math.sin(k * Math.PI) * fade(500, 3000), size: i === 0 ? 2 : 1 });
      }
      break;
    case 'sit-together':
      if ((t % 2000) < 1200) push({ kind: 'heart', x: 9, y: -24 - px(((t % 2000) / 1200) * 6), color: '#FF9DBE', alpha: Math.sin(((t % 2000) / 1200) * Math.PI) * 0.9, size: 1 });
      break;
    case 'magic-long-stretch':
      if (t > 900 && t < 2600) push({ kind: 'text', x: 0, y: -24, color: '#FFE9CF', alpha: fade(900, 2600) * 0.9, size: 1, text: 'mmmh~' });
      if (!reduced && t > 3700) push({ kind: 'spark', x: -6, y: -16, color: GOLD, alpha: fade(3700, 4200), size: 2 });
      break;
    case 'chutki-belly-nap':
      if (t > 1100 && t < 6000) for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const k = ((t - 1100) / 1400 + i / 3) % 1;
        push({ kind: 'z', x: 6 + px(k * 6), y: -12 - px(k * 10), color: '#C9BFE8', alpha: Math.sin(k * Math.PI), size: i === 0 ? 2 : 1 });
      }
      if (t >= 6000 && t < 6500) push({ kind: 'text', x: -2, y: -16, color: '#FFE9CF', alpha: fade(6000, 6500), size: 1, text: 'yawn' });
      break;
    case 'puchu-loud-purr':
      if (t >= 500 && t < 3900) for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const k = ((t - 500) / 700 + i / 3) % 1;
        push({ kind: 'wave', x: (i - 1) * 7, y: -22 - px(k * 8), color: i === 1 ? '#FFB066' : '#FFE9CF', alpha: Math.sin(k * Math.PI) * 0.9, size: 1 });
      }
      if (t >= 600 && t < 1600) push({ kind: 'text', x: 0, y: -30, color: '#FFD45E', alpha: fade(600, 1600), size: 1, text: 'PRRRR' });
      break;
    case 'tangerine-curious-tilt':
      if (t > 300 && t < 1500) push({ kind: 'text', x: 8, y: -27, color: '#FFE9CF', alpha: fade(300, 1500), size: 1, text: '?' });
      if (t > 1400 && t < 2300) push({ kind: 'spark', x: -7, y: -4, color: '#FF8A35', alpha: 0.9, size: (Math.floor(t / 150) % 2 ? 2 : 1) as 1 | 2 });
      if (t > 2300 && t < 2700) push({ kind: 'text', x: 0, y: -28, color: '#FFD45E', alpha: fade(2300, 2700), size: 1, text: '!' });
      break;
    case 'midnight-pounce':
      if (t > 300 && t < 900) push({ kind: 'bang', x: 6, y: -24, color: '#FFC23D', alpha: fade(300, 900), size: 1 });
      if (t >= 1500 && t < 1900) for (let i = 0; i < (reduced ? 1 : 3); i++) push({ kind: 'puff', x: 4 + i * 4, y: -1, color: '#C9BFE8', alpha: fade(1500, 1900) * 0.8, size: 1 });
      if (t >= 2100 && t < 2600) push({ kind: 'heart', x: 0, y: -24, color: '#A89BC9', alpha: fade(2100, 2600), size: 1 });
      break;
    case 'racon-fence-dance':
      if (t >= 400 && t < 4400) {
        // rhythm marks on the beat (no music: an original animation with optional pixel "beats")
        const beat = Math.floor((t - 400) / FENCE_DANCE.beatMs);
        const k = ((t - 400) % FENCE_DANCE.beatMs) / FENCE_DANCE.beatMs;
        push({ kind: 'note', x: (beat % 2 ? 9 : -9), y: -30 - px(k * 4), color: beat % 2 ? GOLD : '#C9BFE8', alpha: 1 - k, size: 1 });
        if (!reduced && beat % 4 === 0) push({ kind: 'spark', x: (beat % 8 ? 10 : -10), y: -18, color: '#FFF3E6', alpha: 1 - k, size: 2 });
      }
      if (t >= 4400 && t < 5000) {
        for (let i = 0; i < (reduced ? 2 : 6); i++) {
          const a = (i / 6) * Math.PI * 2;
          const k = clamp01((t - 4400) / 600);
          push({ kind: i % 2 ? 'star' : 'spark', x: px(Math.cos(a) * (8 + k * 6)), y: -26 + px(Math.sin(a) * (4 + k * 4)), color: i % 2 ? GOLD : '#FFF3E6', alpha: 1 - k, size: i % 2 ? 2 : 1 });
        }
      }
      break;
    case 'mini-starpaw-serenade':
      starpawParticles(t, reduced, frame ?? emoteFrame(id, t, reduced), push);
      break;
  }
  return out;
}

/** Paw position (offset from feet) for the raised right paw, matching catSprites' raised paw. */
export function pawOffset(f: EmoteFrame): { x: number; y: number } {
  return { x: 5 + f.dx + f.pawDx, y: -12 - f.pawLift + f.dy };
}

function starpawParticles(t: number, reduced: boolean, f: EmoteFrame | null, push: (p: Particle) => void) {
  // Phase 1: a few sparkles around the face (green + gold).
  if (t < STARPAW.wave[0] + 200) {
    const n = reduced ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const st = 120 + i * 110;
      if (t < st) continue;
      const k = clamp01((t - st) / 500);
      const a = i * 1.9;
      push({ kind: i % 2 ? 'spark' : 'star', x: px(Math.cos(a) * 9), y: -15 + px(Math.sin(a) * 6), color: i % 2 ? GOLD : GREEN, alpha: Math.sin(k * Math.PI), size: 1 });
    }
  }
  // Phase 2: luminous paw-print trail + green-gold sparkles behind the waving paw.
  if (t >= STARPAW.wave[0] && t < STARPAW.flourish[0] + 200 && !reduced) {
    for (let i = 1; i <= 5; i++) {
      const tt = t - i * 90;
      if (tt < STARPAW.wave[0]) break;
      const past = emoteFrame('mini-starpaw-serenade', tt, false);
      if (!past || past.paw === 'none') continue;
      const p = pawOffset(past);
      const a = 1 - i / 6;
      push({ kind: i % 2 ? 'paw' : 'spark', x: p.x, y: p.y - 1, color: i % 2 ? GREEN : GOLD, alpha: a * 0.85, size: 1 });
    }
  } else if (t >= STARPAW.wave[0] && t < STARPAW.flourish[0] && reduced && f) {
    const p = pawOffset(f);
    push({ kind: 'spark', x: p.x, y: p.y - 2, color: GOLD, alpha: 0.7, size: 1 });
  }
  // Phase 3: a small heart-shaped constellation forms above Mini, then gently disperses (phase 4).
  if (t >= STARPAW.flourish[0] + 150) {
    const STARS: [number, number][] = [[-4, -32], [-7, -35], [-4, -38], [0, -35], [4, -38], [7, -35], [4, -32], [0, -28]];
    const shown = reduced ? 3 : STARS.length;
    for (let i = 0; i < shown; i++) {
      const appear = STARPAW.flourish[0] + 150 + i * 70;
      if (t < appear) continue;
      const disperse = clamp01((t - STARPAW.finish[0]) / 600);
      const [sx, sy] = STARS[i];
      push({
        kind: i % 3 === 0 ? 'star' : 'spark', x: sx + px(sx * disperse * 0.6), y: sy - px(disperse * 4),
        color: i % 2 ? GOLD : GREEN, alpha: clamp01((t - appear) / 150) * (1 - disperse), size: i % 3 === 0 ? 2 : 1,
      });
    }
  }
  // Emerald flash: a soft ring at the eyes during the climax.
  if (f && f.glow >= 0.95) push({ kind: 'ring', x: 0, y: -14, color: EMERALD, alpha: 0.5, size: reduced ? 1 : 2 });
}

/** Which emotes have a timeline (every catalogue entry must). */
export function hasTimeline(id: EmoteId): boolean {
  const d = emoteDef(id);
  return !!d && emoteFrame(id, 0) !== null && emoteFrame(id, d.ms - 1) !== null && emoteFrame(id, d.ms) === null;
}
