import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bestMoves, chooseMove, findWinningCells } from '../src/game/minimaxAI.ts';
import { boardFromString, emptyCells, getOutcome, otherSeat, placeMark } from '../src/game/gameRules.ts';
import type { Board, Difficulty, Seat } from '../src/game/types.ts';

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe('AI', () => {
  it('finds immediate wins', () => {
    assert.deepEqual(findWinningCells(boardFromString('MM.TT....'), 'M'), [2]);
  });

  it('medium takes a win over a block', () => {
    const b = boardFromString('MM.TT....');
    assert.equal(chooseMove(b, 'M', 'medium', seeded(1)), 2);
  });

  it('medium blocks an immediate threat', () => {
    const b = boardFromString('TT..M....');
    assert.equal(chooseMove(b, 'M', 'medium', seeded(2)), 2);
  });

  it('hard takes the win and blocks forks correctly', () => {
    assert.deepEqual(bestMoves(boardFromString('MM.TT....'), 'M'), [2]);
    // T on opposite corners, M center: M must play an edge, never a corner.
    const moves = bestMoves(boardFromString('T...M...T'), 'M');
    assert.ok(moves.length > 0 && moves.every((c) => [1, 3, 5, 7].includes(c)), `got ${moves}`);
  });

  it('easy, medium and hard always return a legal move', () => {
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const b = boardFromString('TM.MT.T..');
      for (let i = 0; i < 20; i++) {
        const c = chooseMove(b, 'M', d, seeded(i + 7));
        assert.ok(emptyCells(b).includes(c));
      }
    }
  });

  it('hard never loses: exhaustive check against every opponent line', () => {
    let games = 0;
    function explore(board: Board, toMove: Seat, ai: Seat) {
      const { winner } = getOutcome(board);
      if (winner) {
        games++;
        assert.notEqual(winner, otherSeat(ai), `hard AI lost on ${board.map((v) => v ?? '.').join('')}`);
        return;
      }
      const options = toMove === ai ? bestMoves(board, ai) : emptyCells(board);
      for (const c of options) explore(placeMark(board, c, toMove), otherSeat(toMove), ai);
    }
    const empty = boardFromString('.........');
    explore(empty, 'T', 'M'); // AI moves second
    for (const first of [0, 2, 4, 6, 8]) explore(placeMark(empty, first, 'M'), 'T', 'M'); // AI moves first
    assert.ok(games > 1000);
  });
});
