/** Seat identifiers. 'T' = Tangerine (orange cat, Player 1), 'M' = Midnight (black cat, Player 2). */
export type Seat = 'T' | 'M';
export type CellValue = Seat | null;
/** Always exactly 9 cells, row-major: index = row * 3 + col. */
export type Board = readonly CellValue[];
export type WinLine = readonly [number, number, number];
export type Winner = Seat | 'D' | null; // 'D' = draw
export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'closed';
export type Accessory = 'none' | 'crown' | 'bow' | 'wizard' | 'bell';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameMode = 'online' | 'computer' | 'local';
export type ReactionKind = 'mischief' | 'love' | 'laugh' | 'shock' | 'wave' | 'sad';
export type CatMood = 'idle' | 'happy' | 'thinking' | 'surprised' | 'sad' | 'victorious' | 'playful';

export interface Outcome {
  winner: Winner;
  line: WinLine | null;
}

export interface Score {
  T: number;
  M: number;
  draws: number;
  games: number;
}

export interface RematchState {
  /** Round number each seat voted a rematch for (null = no vote). Votes for other rounds are stale. */
  T: number | null;
  M: number | null;
  declinedBy: Seat | null;
  declinedRound: number | null;
}

/** The authoritative match state. Online it comes from Postgres; offline from matchEngine. */
export interface MatchState {
  board: Board;
  turn: Seat;
  startingSeat: Seat;
  status: RoomStatus;
  winner: Winner;
  winningLine: WinLine | null;
  round: number;
  history: readonly number[];
  lastMoveCell: number | null;
  lastMoveSeat: Seat | null;
  score: Score;
  rematch: RematchState;
  version: number;
}

export type MoveError =
  | 'invalid_cell'
  | 'cell_taken'
  | 'not_your_turn'
  | 'game_over'
  | 'waiting_for_opponent';

export type RematchError = 'stale_rematch';

export type EngineResult<E extends string> =
  | { ok: true; state: MatchState }
  | { ok: false; error: E };

export const SEATS: readonly Seat[] = ['T', 'M'];
export const ACCESSORIES: readonly Accessory[] = ['none', 'crown', 'bow', 'wizard', 'bell'];
export const REACTIONS: readonly ReactionKind[] = ['mischief', 'love', 'laugh', 'shock', 'wave', 'sad'];
