import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BETWEEN_ROUNDS_TICKS, DODGE, MAX_HP, METER_MAX, MOVES, NO_INPUT, ROUND_TICKS, aiInput, createAi, createBox, forfeit, sanitizeInput, stepBox,
  type BoxState, type Input,
} from '../src/pawville/games/boxing/engine.ts';

const close = (): BoxState => {
  const s = createBox();
  s.fighters[0].x = 44;
  s.fighters[1].x = 58;
  return s;
};
const run = (s: BoxState, a: Input, b: Input, ticks: number) => {
  for (let i = 0; i < ticks; i++) s = stepBox(s, [a, b]);
  return s;
};

test('a jab in range lands after its startup and deals damage once', () => {
  let s = stepBox(close(), [{ move: 0, jab: true }, NO_INPUT]);
  s = run(s, NO_INPUT, NO_INPUT, MOVES.jab.startup + MOVES.jab.active + 2);
  assert.equal(s.fighters[1].hp, MAX_HP - MOVES.jab.damage);
  assert.equal(s.fighters[0].landed, 1);
});

test('out of range attacks whiff', () => {
  const s0 = createBox();
  let s = stepBox(s0, [{ move: 0, heavy: true }, NO_INPUT]);
  let whiffed = false;
  for (let i = 0; i < 20; i++) { s = stepBox(s, [NO_INPUT, NO_INPUT]); whiffed ||= s.events.some((e) => e.type === 'whiff'); }
  assert.equal(s.fighters[1].hp, MAX_HP);
  assert.ok(whiffed);
});

test('cooldowns stop button-mashing: holding jab every tick lands far fewer than one per tick', () => {
  let s = close();
  s = run(s, { move: 0, jab: true }, NO_INPUT, 60);
  assert.ok(s.fighters[0].thrown <= Math.ceil(60 / MOVES.jab.cooldown) + 1);
});

test('blocking reduces damage; dodging makes you briefly untouchable', () => {
  let s = stepBox(close(), [{ move: 0, heavy: true }, { move: 0, block: true }]);
  s = run(s, NO_INPUT, { move: 0, block: true }, 20);
  const blockedDamage = MAX_HP - s.fighters[1].hp;
  assert.ok(blockedDamage > 0 && blockedDamage < MOVES.heavy.damage);
  let d = stepBox(close(), [{ move: 0, heavy: true }, NO_INPUT]);
  d = run(d, NO_INPUT, NO_INPUT, MOVES.heavy.startup - 3);
  d = stepBox(d, [NO_INPUT, { move: 0, dodge: true }]);
  let dodged = false;
  for (let i = 0; i < 10; i++) { d = stepBox(d, [NO_INPUT, NO_INPUT]); dodged ||= d.events.some((e) => e.type === 'dodged'); }
  assert.equal(d.fighters[1].hp, MAX_HP);
  assert.ok(dodged);
  assert.equal(d.fighters[1].cooldown.dodge > 0 || DODGE.cooldown > 0, true);
});

test('hits stun the defender, but jab stun is shorter than a jab so nobody is locked forever', () => {
  assert.ok(MOVES.jab.stun < MOVES.jab.cooldown);
  let s = stepBox(close(), [{ move: 0, jab: true }, NO_INPUT]);
  s = run(s, NO_INPUT, NO_INPUT, MOVES.jab.startup);
  assert.equal(s.fighters[1].action, 'stun');
  s = run(s, NO_INPUT, NO_INPUT, MOVES.jab.stun + 1);
  assert.equal(s.fighters[1].action, 'idle');
});

test('flurry needs a full meter', () => {
  let s = stepBox(close(), [{ move: 0, flurry: true }, NO_INPUT]);
  assert.equal(s.fighters[0].action, 'idle');
  s.fighters[0].meter = METER_MAX;
  s = stepBox(s, [{ move: 0, flurry: true }, NO_INPUT]);
  assert.equal(s.fighters[0].action, 'flurry');
  s = run(s, NO_INPUT, NO_INPUT, 30);
  assert.ok(MAX_HP - s.fighters[1].hp >= MOVES.flurry.damage * 3);
});

test('rounds: knockout, time-out decision, break between rounds, best of three, reset', () => {
  let s = close();
  s.fighters[1].hp = 3;
  s = stepBox(s, [{ move: 0, jab: true }, NO_INPUT]);
  s = run(s, NO_INPUT, NO_INPUT, 6);
  assert.equal(s.phase, 'round-over');
  assert.deepEqual(s.wins, [1, 0]);
  s = run(s, NO_INPUT, NO_INPUT, BETWEEN_ROUNDS_TICKS);
  assert.equal(s.phase, 'fight');
  assert.equal(s.round, 2);
  assert.equal(s.fighters[1].hp, MAX_HP, 'clean reset for the next round');
  s.fighters[0].hp = 90;
  s = run(s, NO_INPUT, NO_INPUT, ROUND_TICKS);
  assert.equal(s.roundWinner, 1);
  assert.deepEqual(s.wins, [1, 1]);
  s = run(s, NO_INPUT, NO_INPUT, BETWEEN_ROUNDS_TICKS);
  s.fighters[0].hp = 1;
  s.fighters[0].x = 44; s.fighters[1].x = 58;
  s = stepBox(s, [NO_INPUT, { move: 0, jab: true }]);
  s = run(s, NO_INPUT, NO_INPUT, 6);
  assert.equal(s.phase, 'match-over');
  assert.equal(s.matchWinner, 1);
  const after = stepBox(s, [{ move: 0, jab: true }, NO_INPUT]);
  assert.equal(after.phase, 'match-over', 'nothing happens after the match');
});

test('disconnect = forfeit; network input is sanitised; AI only produces legal inputs', () => {
  const f = forfeit(createBox(), 1);
  assert.equal(f.matchWinner, 0);
  assert.equal(f.forfeit, 1);
  assert.deepEqual(sanitizeInput({ move: 7, jab: 'yes', heavy: true }), { move: 0, jab: false, heavy: true, flurry: false, block: false, dodge: false });
  let s = createBox();
  const mem = createAi(3);
  for (let i = 0; i < 3000 && s.phase !== 'match-over'; i++) s = stepBox(s, [NO_INPUT, aiInput(s, 1, 'hard', mem)]);
  assert.ok(s.fighters[1].landed > 0 || s.wins[1] > 0, 'the AI fights');
});

test('simultaneous hits trade fairly (no bias towards player 1)', () => {
  let s = stepBox(close(), [{ move: 0, jab: true }, { move: 0, jab: true }]);
  s = run(s, NO_INPUT, NO_INPUT, MOVES.jab.startup + 1);
  assert.equal(s.fighters[0].hp, s.fighters[1].hp);
});
