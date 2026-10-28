import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activeRematchVotes, applyMove, declineRematch, declinedThisRound, newMatch, requestRematch } from '../src/game/matchEngine.ts';
import type { MatchState } from '../src/game/types.ts';

function play(moves: number[], start: MatchState = newMatch()): MatchState {
  let s = start;
  for (const cell of moves) {
    const r = applyMove(s, s.turn, cell);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}
const tWins = (s?: MatchState) => play([0, 3, 1, 4, 2], s); // valid when T starts
function must(r: ReturnType<typeof requestRematch>): MatchState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('rematch', () => {
  it('needs both players before the board resets', () => {
    const done = tWins();
    const one = must(requestRematch(done, 'T', done.round));
    assert.equal(one.status, 'finished');
    assert.equal(one.board[0], 'T', 'board must not reset on a single vote');
    assert.deepEqual(activeRematchVotes(one), { T: true, M: false });

    const both = must(requestRematch(one, 'M', one.round));
    assert.equal(both.status, 'playing');
    assert.equal(both.round, 2);
    assert.ok(both.board.every((v) => v === null));
    assert.deepEqual(both.history, []);
    assert.equal(both.startingSeat, 'M', 'starting seat alternates for fairness');
    assert.equal(both.turn, 'M');
  });

  it('duplicate votes from the same player do not start a round', () => {
    const done = tWins();
    const a = must(requestRematch(done, 'T', 1));
    const b = must(requestRematch(a, 'T', 1));
    assert.equal(b.status, 'finished');
    assert.equal(b.round, 1);
  });

  it('rejects stale votes from an earlier round', () => {
    const r1 = tWins();
    const r2 = must(requestRematch(must(requestRematch(r1, 'T', 1)), 'M', 1));
    assert.deepEqual(requestRematch(r2, 'T', 1), { ok: false, error: 'stale_rematch' }); // round 2 still playing
    const r2done = play([0, 3, 1, 4, 2], r2); // M starts now: M 0,1,2
    assert.equal(r2done.winner, 'M');
    assert.deepEqual(requestRematch(r2done, 'T', 1), { ok: false, error: 'stale_rematch' });
    const v = must(requestRematch(r2done, 'T', 2));
    assert.deepEqual(activeRematchVotes(v), { T: true, M: false });
  });

  it('rejects a rematch while a game is still in progress', () => {
    assert.deepEqual(requestRematch(play([4]), 'T', 1), { ok: false, error: 'stale_rematch' });
  });

  it('a decline is visible and does not reset the game', () => {
    const done = tWins();
    const asked = must(requestRematch(done, 'T', 1));
    const declined = declineRematch(asked, 'M', 1);
    assert.ok(declined.ok);
    if (!declined.ok) return;
    assert.equal(declined.state.status, 'finished');
    assert.equal(declinedThisRound(declined.state), 'M');
    assert.equal(declined.state.board[0], 'T');
    // Changing your mind clears your own decline and starts the round (T already voted).
    const changed = must(requestRematch(declined.state, 'M', 1));
    assert.equal(changed.round, 2);
    assert.equal(changed.status, 'playing');
  });
});

describe('score tracking', () => {
  it('tracks wins, draws and games across rounds', () => {
    let s = tWins(); // round 1: T wins (T started)
    s = must(requestRematch(must(requestRematch(s, 'T', s.round)), 'M', s.round));
    s = play([0, 3, 1, 4, 2], s); // round 2: M started and wins
    s = must(requestRematch(must(requestRematch(s, 'M', s.round)), 'T', s.round));
    s = play([0, 1, 2, 4, 3, 5, 7, 6, 8], s); // round 3: draw
    assert.deepEqual(s.score, { T: 1, M: 1, draws: 1, games: 3 });
    assert.equal(s.round, 3);
  });
});
