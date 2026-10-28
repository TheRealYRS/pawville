import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../src/pawville/games/shared.ts';
import { FACES, LEVELS, createMemory, flipCard, isComplete, memoryWinner, pairsFound, resolveMismatch, type MemoryState } from '../src/pawville/games/memory/engine.ts';
import { HOLES, ROUND_MS, WHACK_LEVELS, comboBonus, createWhack, tickWhack, whack, type WhackState } from '../src/pawville/games/whack/engine.ts';

const pairOf = (s: MemoryState, i: number) => s.cards.findIndex((c, j) => j !== i && c.face === s.cards[i].face);
const otherFace = (s: MemoryState, i: number) => s.cards.findIndex((c) => c.face !== s.cards[i].face);

test('memory: each face exactly twice, faces visually unique, shuffled', () => {
  const visual = new Set(FACES.map((f) => (f.kind === 'cat' ? `${f.cat}|${f.accessory}|${f.mood}` : f.item)));
  assert.equal(visual.size, FACES.length);
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const s = createMemory(level, seededRandom(5));
    assert.equal(s.cards.length, LEVELS[level].pairs * 2);
    const counts = new Map<string, number>();
    for (const c of s.cards) counts.set(c.face, (counts.get(c.face) ?? 0) + 1);
    assert.ok([...counts.values()].every((n) => n === 2));
  }
});

test('memory: matching, locking, moves, completion, restart', () => {
  let s = createMemory('easy', seededRandom(9));
  s = flipCard(s, 0);
  const wrong = otherFace(s, 0);
  s = flipCard(s, wrong);
  assert.equal(s.locked, true);
  assert.equal(flipCard(s, s.cards.findIndex((_, j) => j !== 0 && j !== wrong)), s, 'locked during mismatch');
  s = resolveMismatch(s);
  s = flipCard(flipCard(s, 0), pairOf(s, 0));
  assert.equal(pairsFound(s), 1);
  assert.equal(flipCard(s, 0), s);
  let full = createMemory('hard', seededRandom(4));
  for (let i = 0; i < full.cards.length; i++) if (!full.matched.includes(i)) full = flipCard(flipCard(full, i), pairOf(full, i));
  assert.equal(isComplete(full), true);
  assert.equal(full.moves, LEVELS.hard.pairs);
});

test('memory 2-player: matches score and keep the turn, mismatches pass it', () => {
  let s = createMemory('easy', seededRandom(2), 2);
  s = flipCard(flipCard(s, 0), pairOf(s, 0));
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.turn, 0);
  const a = s.cards.findIndex((_, i) => !s.matched.includes(i));
  s = flipCard(s, a);
  s = flipCard(s, s.cards.findIndex((c, i) => !s.matched.includes(i) && i !== a && c.face !== s.cards[a].face));
  s = resolveMismatch(s);
  assert.equal(s.turn, 1);
  assert.equal(memoryWinner(s), null, 'not finished');
});

function runUntil(s: WhackState, rng: () => number, kind?: string): { s: WhackState; t: number } {
  for (let t = 0; t < s.endsAt; t += 16) {
    s = tickWhack(s, t, rng);
    if (s.targets.some((x) => x.state === 'up' && (!kind || x.kind === kind))) return { s, t };
  }
  throw new Error('no target');
}

test('whack: spawns stay within the board and the max visible limit', () => {
  const rng = seededRandom(1);
  let s = createWhack('hard', 0);
  for (let t = 0; t < ROUND_MS; t += 16) {
    s = tickWhack(s, t, rng);
    assert.ok(s.targets.filter((x) => x.state === 'up').length <= WHACK_LEVELS.hard.maxUp);
    assert.ok(s.targets.every((x) => x.hole >= 0 && x.hole < HOLES));
  }
});

test('whack: scoring, no double scoring, expired targets, kittens, game over', () => {
  let { s, t } = runUntil(createWhack('easy', 0), seededRandom(2), 'cat');
  const target = s.targets.find((x) => x.state === 'up' && x.kind === 'cat')!;
  s = whack(s, target.hole, t + 5);
  assert.equal(s.score, 10);
  assert.equal(whack(s, target.hole, t + 10).score, 10);
  assert.equal(comboBonus(50), 20);
  const r2 = runUntil(createWhack('medium', 0), seededRandom(3), 'cat');
  const t2 = r2.s.targets.find((x) => x.state === 'up' && x.kind === 'cat')!;
  assert.equal(whack(r2.s, t2.hole, t2.expiresAt + 1).score, r2.s.score);
  const r3 = runUntil(createWhack('hard', 0), seededRandom(11), 'kitten');
  const kit = r3.s.targets.find((x) => x.state === 'up' && x.kind === 'kitten')!;
  assert.equal(whack(r3.s, kit.hole, r3.t + 1).score, 0);
  let over = createWhack('easy', 0);
  for (let tt = 0; tt <= ROUND_MS + 100; tt += 50) over = tickWhack(over, tt, seededRandom(4));
  assert.equal(over.over, true);
  assert.equal(whack(over, 0, ROUND_MS + 200), over);
});
