import type { Board, CellValue, Outcome, Seat, WinLine } from './types.ts';

export const WIN_LINES: readonly WinLine[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export const CAT_NAMES: Record<Seat, string> = { T: 'Tangerine', M: 'Midnight' };

export function emptyBoard(): Board {
  return Array<CellValue>(9).fill(null);
}

export function otherSeat(seat: Seat): Seat {
  return seat === 'T' ? 'M' : 'T';
}

export function isCellIndex(cell: unknown): cell is number {
  return typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell <= 8;
}

export function emptyCells(board: Board): number[] {
  const out: number[] = [];
  board.forEach((v, i) => { if (v === null) out.push(i); });
  return out;
}

/** Winner + line, 'D' for a full board without a line, or null while in progress. */
export function getOutcome(board: Board): Outcome {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) return { winner: v, line };
  }
  if (board.every((v) => v !== null)) return { winner: 'D', line: null };
  return { winner: null, line: null };
}

export function placeMark(board: Board, cell: number, seat: Seat): Board {
  const next = board.slice();
  next[cell] = seat;
  return next;
}

/** Serialises to the DB format: 9 chars of '.', 'T', 'M'. */
export function boardToString(board: Board): string {
  return board.map((v) => v ?? '.').join('');
}

export function boardFromString(s: string): Board {
  if (!/^[.TM]{9}$/.test(s)) throw new Error(`Invalid board string: ${s}`);
  return s.split('').map((c) => (c === '.' ? null : (c as Seat)));
}

export function cellLabel(cell: number): string {
  const rows = ['top', 'middle', 'bottom'];
  const cols = ['left', 'center', 'right'];
  const r = rows[Math.floor(cell / 3)];
  const c = cols[cell % 3];
  return r === 'middle' && c === 'center' ? 'center' : `${r} ${c}`;
}
