import { WIN_LINES, emptyCells, getOutcome, otherSeat, placeMark } from './gameRules.ts';
import type { Board, Difficulty, Seat } from './types.ts';

type Rng = () => number;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** Cells that would immediately complete a line for `seat`. */
export function findWinningCells(board: Board, seat: Seat): number[] {
  const out = new Set<number>();
  for (const [a, b, c] of WIN_LINES) {
    const vals = [board[a], board[b], board[c]];
    const mine = vals.filter((v) => v === seat).length;
    const empty = [a, b, c].filter((i) => board[i] === null);
    if (mine === 2 && empty.length === 1) out.add(empty[0]);
  }
  return [...out].sort((x, y) => x - y);
}

/** Minimax. Returns a score from `me`'s perspective (wins sooner are better). */
function minimax(board: Board, toMove: Seat, me: Seat, depth: number): number {
  const { winner } = getOutcome(board);
  if (winner === me) return 10 - depth;
  if (winner === otherSeat(me)) return depth - 10;
  if (winner === 'D') return 0;

  const scores = emptyCells(board).map((cell) =>
    minimax(placeMark(board, cell, toMove), otherSeat(toMove), me, depth + 1),
  );
  return toMove === me ? Math.max(...scores) : Math.min(...scores);
}

/** All optimal moves for `seat` (ties kept so the AI does not feel robotic). */
export function bestMoves(board: Board, seat: Seat): number[] {
  const cells = emptyCells(board);
  let best = -Infinity;
  let moves: number[] = [];
  for (const cell of cells) {
    const score = minimax(placeMark(board, cell, seat), otherSeat(seat), seat, 1);
    if (score > best) { best = score; moves = [cell]; }
    else if (score === best) moves.push(cell);
  }
  return moves;
}

export function chooseMove(board: Board, seat: Seat, difficulty: Difficulty, rng: Rng = Math.random): number {
  const cells = emptyCells(board);
  if (cells.length === 0) throw new Error('No legal moves');

  if (difficulty === 'easy') {
    // Mostly random; occasionally notices a win.
    const wins = findWinningCells(board, seat);
    if (wins.length && rng() < 0.3) return pick(wins, rng);
    return pick(cells, rng);
  }

  if (difficulty === 'medium') {
    const wins = findWinningCells(board, seat);
    if (wins.length) return pick(wins, rng);
    const blocks = findWinningCells(board, otherSeat(seat));
    if (blocks.length) return pick(blocks, rng);
    if (board[4] === null) return 4;
    return pick(cells, rng);
  }

  // hard: perfect play
  if (cells.length === 9) return pick([0, 2, 4, 6, 8], rng); // skip the full search on an empty board
  return pick(bestMoves(board, seat), rng);
}
