/**
 * Paw Snap — a two-player reaction duel on one device (pure).
 * Wait for the fish to jump, then snap your key first. Snapping early is a "too eager" foul
 * that gives the round to the other cat. First to 3 points wins.
 */
import { seededRandom } from '../../world/geometry.ts';

export type SnapPhase = 'waiting' | 'signal' | 'scored' | 'over';
export const POINTS_TO_WIN = 3;

export interface SnapState {
  phase: SnapPhase;
  round: number;
  signalAt: number;
  scores: [number, number];
  lastWinner: 0 | 1 | null;
  lastReason: 'faster' | 'foul' | null;
  reactionMs: number | null;
  seed: number;
}

export function signalTime(seed: number, round: number, from: number): number {
  const rand = seededRandom(seed * 31 + round);
  return from + 1500 + rand() * 3500;
}

export function createSnap(seed: number, now: number): SnapState {
  return { phase: 'waiting', round: 1, signalAt: signalTime(seed, 1, now), scores: [0, 0], lastWinner: null, lastReason: null, reactionMs: null, seed };
}

export function tickSnap(s: SnapState, now: number): SnapState {
  if (s.phase === 'waiting' && now >= s.signalAt) return { ...s, phase: 'signal' };
  return s;
}

export function press(s: SnapState, player: 0 | 1, now: number): SnapState {
  const t = tickSnap(s, now);
  if (t.phase === 'waiting') {
    const winner = (1 - player) as 0 | 1;
    return score(t, winner, 'foul', null);
  }
  if (t.phase === 'signal') return score(t, player, 'faster', Math.round(now - t.signalAt));
  return t;
}

function score(s: SnapState, winner: 0 | 1, reason: 'faster' | 'foul', reactionMs: number | null): SnapState {
  const scores: [number, number] = [...s.scores];
  scores[winner]++;
  const over = scores[winner] >= POINTS_TO_WIN;
  return { ...s, phase: over ? 'over' : 'scored', scores, lastWinner: winner, lastReason: reason, reactionMs };
}

export function nextRound(s: SnapState, now: number): SnapState {
  if (s.phase !== 'scored') return s;
  const round = s.round + 1;
  return { ...s, phase: 'waiting', round, signalAt: signalTime(s.seed, round, now), reactionMs: null };
}
