import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boardFromString, boardToString, emptyBoard, getOutcome, emptyCells } from '../src/game/gameRules.ts';
import { applyMove, newMatch, validateMove } from '../src/game/matchEngine.ts';
import type { MatchState, Seat } from '../src/game/types.ts';

function play(moves: number[], start: MatchState = newMatch()): MatchState {
  let s = start;
  for (const cell of moves) {
    const r = applyMove(s, s.turn, cell);
    if (!r.ok) throw new Error(`move ${cell} failed: ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('board basics', () => {
  it('empty board has 9 empty cells and no outcome', () => {
    const b = emptyBoard();
    assert.equal(b.length, 9);
    assert.deepEqual(emptyCells(b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(getOutcome(b), { winner: null, line: null });
  });

  it('round-trips the database board format', () => {
    const b = boardFromString('T.M..T..M');
    assert.equal(boardToString(b), 'T.M..T..M');
    assert.throws(() => boardFromString('XX'));
  });
});

describe('moves', () => {
  it('accepts a valid move and switches turn', () => {
    const r = applyMove(newMatch(), 'T', 4);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.state.board[4], 'T');
    assert.equal(r.state.turn, 'M');
    assert.deepEqual(r.state.history, [4]);
    assert.equal(r.state.version, 2);
  });

  it('rejects invalid cell indexes', () => {
    for (const bad of [-1, 9, 1.5, Number.NaN]) {
      assert.deepEqual(applyMove(newMatch(), 'T', bad), { ok: false, error: 'invalid_cell' });
    }
  });

  it('rejects an occupied square', () => {
    const s = play([4]);
    assert.deepEqual(applyMove(s, 'M', 4), { ok: false, error: 'cell_taken' });
  });

  it('rejects an out-of-turn move', () => {
    assert.deepEqual(applyMove(newMatch(), 'M', 0), { ok: false, error: 'not_your_turn' });
    const s = play([0]);
    assert.deepEqual(applyMove(s, 'T', 1), { ok: false, error: 'not_your_turn' });
  });

  it('rejects moves while waiting for an opponent', () => {
    assert.equal(validateMove(newMatch({ waiting: true }), 'T', 0), 'waiting_for_opponent');
  });
});

describe('outcomes', () => {
  it('detects a horizontal win', () => {
    const s = play([0, 3, 1, 4, 2]); // T: 0,1,2
    assert.equal(s.winner, 'T');
    assert.deepEqual(s.winningLine, [0, 1, 2]);
    assert.equal(s.status, 'finished');
  });

  it('detects a vertical win', () => {
    const s = play([0, 1, 3, 4, 8, 7]); // M: 1,4,7
    assert.equal(s.winner, 'M');
    assert.deepEqual(s.winningLine, [1, 4, 7]);
  });

  it('detects both diagonal wins', () => {
    assert.deepEqual(play([0, 1, 4, 2, 8]).winningLine, [0, 4, 8]);
    assert.deepEqual(play([2, 0, 4, 1, 6]).winningLine, [2, 4, 6]);
  });

  it('checks all eight lines', () => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const line of lines) {
      const chars = '.........'.split('');
      line.forEach((i) => (chars[i] = 'M'));
      assert.deepEqual(getOutcome(boardFromString(chars.join(''))), { winner: 'M', line });
    }
  });

  it('detects a draw', () => {
    // T M T / T M M / M T T
    const s = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
    assert.equal(s.winner, 'D');
    assert.equal(s.winningLine, null);
    assert.equal(s.status, 'finished');
  });

  it('rejects any move after the game is complete', () => {
    const s = play([0, 3, 1, 4, 2]);
    for (const seat of ['T', 'M'] as Seat[]) {
      assert.deepEqual(applyMove(s, seat, 8), { ok: false, error: 'game_over' });
    }
  });

  it('a winning move is counted exactly once', () => {
    const s = play([0, 3, 1, 4, 2]);
    assert.deepEqual(s.score, { T: 1, M: 0, draws: 0, games: 1 });
    // Re-applying the same (duplicate) event is rejected, so the score cannot double count.
    assert.equal(applyMove(s, 'T', 2).ok, false);
    assert.deepEqual(s.score, { T: 1, M: 0, draws: 0, games: 1 });
  });
});
