import { CAT_NAMES } from './gameRules.ts';
import type { ReactionKind, Seat, Winner } from './types.ts';

export const THINKING: Record<Seat, string> = {
  T: 'Tangerine is thinking...',
  M: 'Midnight is plotting something...',
};

const VICTORY_TITLES: Record<Seat, string> = {
  T: 'Tangerine takes the crown!',
  M: 'Midnight has conquered the board!',
};

const VICTORY_SUBTITLES = ['A purr-fect victory!', 'Three in a row. Absolute paw-wer.', 'Whiskers twitching with pride.'];
const LOSS_SUBTITLES = ['A gentle head-bonk of defeat.', 'Ears down. Tail up. Next round.', 'Tripped over a ball of yarn.'];

export const DRAW_TITLE = "It's a draw!";
export const DRAW_SUBTITLE = 'Nobody wins. Both cats sit on the keyboard.';

/** Deterministic by round so every client shows the same line for the same game. */
export function resultCopy(winner: Winner, round: number, mySeat: Seat | null): { title: string; subtitle: string; badge: string | null } {
  if (winner === 'D') return { title: DRAW_TITLE, subtitle: DRAW_SUBTITLE, badge: mySeat ? 'Draw' : null };
  if (winner === null) return { title: '', subtitle: '', badge: null };
  const iWon = mySeat === winner;
  const pool = mySeat && !iWon ? LOSS_SUBTITLES : VICTORY_SUBTITLES;
  return {
    title: VICTORY_TITLES[winner],
    subtitle: pool[(round - 1) % pool.length],
    badge: mySeat ? (iWon ? 'You win!' : 'You lost this one') : null,
  };
}

export function catName(seat: Seat): string {
  return CAT_NAMES[seat];
}

export const REACTION_LABELS: Record<ReactionKind, string> = {
  mischief: 'Mischief',
  love: 'Love',
  laugh: 'Laugh',
  shock: 'Shock',
  wave: 'Paw wave',
  sad: 'Sad',
};

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  mischief: '😼', love: '😻', laugh: '😹', shock: '🙀', wave: '🐾', sad: '😿',
};

/** Friendly copy for every server / transport error code. */
export const ERROR_COPY: Record<string, string> = {
  not_your_turn: "Paws off! It's not your turn yet.",
  cell_taken: 'That square is already claimed.',
  game_over: 'This round is over.',
  waiting_for_opponent: 'Hold your whiskers — your opponent has not joined yet.',
  invalid_cell: "That's not a square on this board.",
  room_not_found: "This room doesn't exist anymore.",
  room_expired: 'This room took a long nap and expired.',
  not_a_player: "You're not a player in this room.",
  stale_rematch: 'That rematch request is out of date.',
  opponent_left: 'Your opponent left the room.',
  slow_down: 'Easy, tiger! Reactions are on cooldown.',
  rate_limited: "You've opened a lot of rooms. Take a short catnap and try again.",
  invalid_reaction: "That reaction isn't available.",
  not_authenticated: 'Your session expired. Refresh to get a new one.',
  network: "Can't reach the server. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};

export function errorText(code: string): string {
  return ERROR_COPY[code] ?? ERROR_COPY.unknown;
}
