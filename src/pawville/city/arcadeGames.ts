/**
 * Arcade game rules (Milestone 7) — pure, deterministic where randomness is injected, unit tested.
 *
 *  - Meow Melody: watch a growing pattern of four paw pads, then repeat it. One "second chance"
 *    per game (a mistake replays the pattern once instead of ending the game).
 *  - Claw Machine: the claw sweeps left/right; drop it over a plush. Centred = win, near the edge
 *    = the plush may slip (a fair, visible chance), otherwise a miss. No hidden rigging.
 */

// ---- Meow Melody ------------------------------------------------------------------------------
export const PADS = 4;
export interface MelodyState {
  seq: number[];
  /** How many notes of `seq` the player has repeated correctly this round. */
  pos: number;
  round: number;
  phase: 'show' | 'input' | 'over';
  secondChance: boolean;
  /** Last result, for feedback. */
  last: 'ok' | 'round' | 'mistake' | 'over' | null;
}

export function newMelody(rand: () => number): MelodyState {
  return { seq: [Math.floor(rand() * PADS)], pos: 0, round: 1, phase: 'show', secondChance: true, last: null };
}

/** The pattern finished playing: the player may now repeat it. */
export function melodyShown(s: MelodyState): MelodyState {
  return s.phase === 'show' ? { ...s, phase: 'input', pos: 0 } : s;
}

export function melodyPress(s: MelodyState, pad: number, rand: () => number): MelodyState {
  if (s.phase !== 'input' || pad < 0 || pad >= PADS) return s;
  if (s.seq[s.pos] !== pad) {
    if (s.secondChance) return { ...s, phase: 'show', pos: 0, secondChance: false, last: 'mistake' };
    return { ...s, phase: 'over', last: 'over' };
  }
  const pos = s.pos + 1;
  if (pos < s.seq.length) return { ...s, pos, last: 'ok' };
  // round cleared: add a note (avoid three identical notes in a row so patterns stay readable)
  let next = Math.floor(rand() * PADS);
  const n = s.seq.length;
  if (n >= 2 && s.seq[n - 1] === next && s.seq[n - 2] === next) next = (next + 1) % PADS;
  return { ...s, seq: [...s.seq, next], pos: 0, round: s.round + 1, phase: 'show', last: 'round' };
}

/** Rounds fully cleared in a finished game. */
export function melodyScore(s: MelodyState): number {
  return s.round - 1;
}

/** Tokens earned for a finished game (then capped per day by the economy). */
export function melodyTokens(rounds: number): number {
  return rounds >= 8 ? 5 : rounds >= 5 ? 3 : rounds >= 3 ? 2 : rounds >= 1 ? 1 : 0;
}

/** Note pitches (Hz) for the pads — a gentle pentatonic set. */
export const PAD_FREQ = [523.25, 587.33, 659.25, 783.99] as const;

// ---- Claw machine -----------------------------------------------------------------------------
export interface Plush { item: 'plush-tangerine' | 'plush-midnight' | 'plush-fish'; x: number }
/** Plush positions on a 0..100 track. */
export const CLAW_PLUSHES: readonly Plush[] = [{ item: 'plush-tangerine', x: 18 }, { item: 'plush-fish', x: 50 }, { item: 'plush-midnight', x: 82 }];
export const CLAW_SPEED = 38; // track units per second
export const CLAW_COST = 1;

/** Position of the sweeping claw after `ms` milliseconds (ping-pong over 0..100). */
export function clawPosition(ms: number): number {
  const d = ((ms / 1000) * CLAW_SPEED) % 200;
  return d <= 100 ? d : 200 - d;
}

export type ClawOutcome = { result: 'win'; item: Plush['item']; offset: number } | { result: 'slip'; item: Plush['item']; offset: number } | { result: 'miss'; offset: number };

/**
 * Drop at track position `x`. Within 5 units of a plush's centre = win; 5..11 = it grabs but may
 * slip (50%, shown to the player as "wobbly"); further = miss.
 */
export function clawDrop(x: number, rand: () => number, plushes: readonly Plush[] = CLAW_PLUSHES): ClawOutcome {
  let best: Plush | null = null;
  let off = Infinity;
  for (const p of plushes) { const d = Math.abs(p.x - x); if (d < off) { off = d; best = p; } }
  if (!best || off > 11) return { result: 'miss', offset: off };
  if (off <= 5) return { result: 'win', item: best.item, offset: off };
  return rand() < 0.5 ? { result: 'win', item: best.item, offset: off } : { result: 'slip', item: best.item, offset: off };
}

// ---- Vending -----------------------------------------------------------------------------------
export const VENDING_PRODUCTS = [
  { item: 'snack-milk', label: 'Warm milk', price: 1 },
  { item: 'snack-cookies', label: 'Paw cookies', price: 1 },
  { item: 'snack-onigiri', label: 'Tuna onigiri', price: 2 },
] as const;
