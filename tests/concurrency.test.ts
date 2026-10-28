/**
 * Models the server's concurrency contract: make_move takes a row lock
 * (SELECT ... FOR UPDATE), so concurrent requests for one room are applied
 * one at a time against the latest committed state. This test reproduces that
 * with an async mutex and fires truly concurrent requests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, newMatch } from '../src/game/matchEngine.ts';
import type { MatchState, Seat } from '../src/game/types.ts';

class LockedRoom {
  state: MatchState = newMatch();
  private chain: Promise<unknown> = Promise.resolve();

  makeMove(seat: Seat, cell: number) {
    const run = async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5)); // network jitter inside the lock
      const r = applyMove(this.state, seat, cell);
      if (r.ok) this.state = r.state;
      return r.ok ? 'ok' : r.error;
    };
    const p = this.chain.then(run, run);
    this.chain = p;
    return p;
  }
}

describe('simultaneous attempts', () => {
  it('two tabs of the same player claiming the same square: exactly one succeeds', async () => {
    for (let i = 0; i < 50; i++) {
      const room = new LockedRoom();
      const results = await Promise.all([room.makeMove('T', 4), room.makeMove('T', 4)]);
      assert.equal(results.filter((r) => r === 'ok').length, 1);
      assert.equal(room.state.history.length, 1);
    }
  });

  it('both players clicking the same square at once: only the player whose turn it is succeeds', async () => {
    for (let i = 0; i < 50; i++) {
      const room = new LockedRoom();
      const [a, b] = await Promise.all([room.makeMove('M', 0), room.makeMove('T', 0)]);
      assert.equal(a, 'not_your_turn');
      assert.equal(b, 'ok');
      assert.equal(room.state.board[0], 'T');
    }
  });

  it('a burst of concurrent moves never corrupts the board', async () => {
    const room = new LockedRoom();
    const attempts: Promise<string>[] = [];
    for (let cell = 0; cell < 9; cell++) {
      attempts.push(room.makeMove('T', cell), room.makeMove('M', cell));
    }
    await Promise.all(attempts);
    const marks = room.state.board.filter((v) => v !== null).length;
    assert.equal(marks, room.state.history.length);
    assert.equal(new Set(room.state.history).size, room.state.history.length);
    const t = room.state.board.filter((v) => v === 'T').length;
    const m = room.state.board.filter((v) => v === 'M').length;
    assert.ok(t - m === 0 || t - m === 1, `turn order violated: T=${t} M=${m}`);
  });
});
