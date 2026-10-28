/**
 * Pure match engine. It mirrors the authoritative Postgres RPCs in
 * supabase/migrations/*_paw_vs_paw_core.sql (make_move, request_rematch,
 * decline_rematch) so offline modes and the unit tests share exactly the same rules.
 */
import { emptyBoard, getOutcome, isCellIndex, otherSeat, placeMark } from './gameRules.ts';
import type { EngineResult, MatchState, MoveError, RematchError, Seat } from './types.ts';

export function newMatch(opts: { startingSeat?: Seat; waiting?: boolean } = {}): MatchState {
  const startingSeat = opts.startingSeat ?? 'T';
  return {
    board: emptyBoard(),
    turn: startingSeat,
    startingSeat,
    status: opts.waiting ? 'waiting' : 'playing',
    winner: null,
    winningLine: null,
    round: 1,
    history: [],
    lastMoveCell: null,
    lastMoveSeat: null,
    score: { T: 0, M: 0, draws: 0, games: 0 },
    rematch: { T: null, M: null, declinedBy: null, declinedRound: null },
    version: 1,
  };
}

/** Second player joined: waiting -> playing. */
export function startMatch(state: MatchState): MatchState {
  if (state.status !== 'waiting') return state;
  return { ...state, status: 'playing', turn: state.startingSeat, version: state.version + 1 };
}

export function validateMove(state: MatchState, seat: Seat, cell: number): MoveError | null {
  if (!isCellIndex(cell)) return 'invalid_cell';
  if (state.status === 'waiting') return 'waiting_for_opponent';
  if (state.status !== 'playing') return 'game_over';
  if (state.turn !== seat) return 'not_your_turn';
  if (state.board[cell] !== null) return 'cell_taken';
  return null;
}

export function applyMove(state: MatchState, seat: Seat, cell: number): EngineResult<MoveError> {
  const error = validateMove(state, seat, cell);
  if (error) return { ok: false, error };

  const board = placeMark(state.board, cell, seat);
  const { winner, line } = getOutcome(board);
  const finished = winner !== null;

  return {
    ok: true,
    state: {
      ...state,
      board,
      history: [...state.history, cell],
      lastMoveCell: cell,
      lastMoveSeat: seat,
      turn: finished ? state.turn : otherSeat(seat),
      status: finished ? 'finished' : 'playing',
      winner,
      winningLine: line,
      score: {
        T: state.score.T + (winner === 'T' ? 1 : 0),
        M: state.score.M + (winner === 'M' ? 1 : 0),
        draws: state.score.draws + (winner === 'D' ? 1 : 0),
        games: state.score.games + (finished ? 1 : 0),
      },
      version: state.version + 1,
    },
  };
}

/** A vote only counts for the current, finished round. Both votes => new round. */
export function requestRematch(state: MatchState, seat: Seat, round: number): EngineResult<RematchError> {
  if (state.status !== 'finished' || round !== state.round) return { ok: false, error: 'stale_rematch' };

  const T = seat === 'T' ? state.round : state.rematch.T;
  const M = seat === 'M' ? state.round : state.rematch.M;

  if (T === state.round && M === state.round) {
    const next = otherSeat(state.startingSeat);
    return {
      ok: true,
      state: {
        ...state,
        round: state.round + 1,
        board: emptyBoard(),
        history: [],
        lastMoveCell: null,
        lastMoveSeat: null,
        winner: null,
        winningLine: null,
        startingSeat: next,
        turn: next,
        status: 'playing',
        rematch: { T: null, M: null, declinedBy: null, declinedRound: null },
        version: state.version + 1,
      },
    };
  }

  const clearsOwnDecline = state.rematch.declinedBy === seat;
  return {
    ok: true,
    state: {
      ...state,
      rematch: {
        T,
        M,
        declinedBy: clearsOwnDecline ? null : state.rematch.declinedBy,
        declinedRound: clearsOwnDecline ? null : state.rematch.declinedRound,
      },
      version: state.version + 1,
    },
  };
}

export function declineRematch(state: MatchState, seat: Seat, round: number): EngineResult<RematchError> {
  if (state.status !== 'finished' || round !== state.round) return { ok: false, error: 'stale_rematch' };
  return {
    ok: true,
    state: {
      ...state,
      rematch: {
        T: seat === 'T' ? null : state.rematch.T,
        M: seat === 'M' ? null : state.rematch.M,
        declinedBy: seat,
        declinedRound: state.round,
      },
      version: state.version + 1,
    },
  };
}

/** Rematch votes that belong to the current round only. */
export function activeRematchVotes(state: MatchState): { T: boolean; M: boolean } {
  return {
    T: state.status === 'finished' && state.rematch.T === state.round,
    M: state.status === 'finished' && state.rematch.M === state.round,
  };
}

export function declinedThisRound(state: MatchState): Seat | null {
  return state.status === 'finished' && state.rematch.declinedRound === state.round
    ? state.rematch.declinedBy
    : null;
}
