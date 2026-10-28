import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PATTERN_PUZZLES, isPatternAnswer, tokenKey } from '../src/pawville/games/puzzle/patterns.ts';
import { countSolutions, generateBed, isBedSolved } from '../src/pawville/games/puzzle/flowerbed.ts';
import { NAP_PUZZLES, brokenClues, solveNap } from '../src/pawville/games/puzzle/napspots.ts';
import { CATEGORIES, dailyPuzzle, puzzleData } from '../src/pawville/games/puzzle/catalog.ts';

const EXPECTED: Record<string, string> = { p1: 'daisyx1r0', p2: 'leafx1r0', p3: 'starx1r0', p4: 'pawx1r90', p5: 'pawx4r0', p6: 'tulipx1r0', p7: 'leafx5r0', p8: 'sunx1r0' };

test('patterns: fixed answers, distinct options, wrong answers rejected', () => {
  for (const p of PATTERN_PUZZLES) {
    assert.equal(tokenKey(p.options[p.answer]), EXPECTED[p.id]);
    assert.equal(new Set(p.options.map(tokenKey)).size, p.options.length);
    assert.equal(isPatternAnswer(p, (p.answer + 1) % 4), false);
  }
});

test('flower beds: generated puzzles have exactly one valid solution', () => {
  for (const size of [4, 5] as const) for (let seed = 1; seed <= 20; seed++) {
    const p = generateBed(size, seed);
    assert.equal(countSolutions(size, p.givens), 1);
    assert.equal(isBedSolved(p, p.solution), true);
  }
});

test('nap spots: exactly one solution each; broken clues reported', () => {
  for (const p of NAP_PUZZLES) {
    const sols = solveNap(p.clues);
    assert.equal(sols.length, 1, p.id);
    assert.deepEqual(brokenClues(p, sols[0]), []);
  }
  assert.ok(brokenClues(NAP_PUZZLES[0], { T: 0, M: 1, B: 2, G: 3 }).length > 0);
});

test('catalogue resolves; daily puzzle stable per day and always solvable', () => {
  for (const c of CATEGORIES) for (const p of c.puzzles) assert.ok(puzzleData(p.key));
  const kinds = new Set<string>();
  for (let i = 1; i <= 40; i++) {
    const d = `2026-11-${String((i % 28) + 1).padStart(2, '0')}`;
    const a = dailyPuzzle(d);
    assert.deepEqual(a, dailyPuzzle(d));
    kinds.add(a.kind);
    const data = puzzleData(a.key)!;
    if (data.kind === 'bed') assert.equal(countSolutions(data.puzzle.size, data.puzzle.givens), 1);
  }
  assert.equal(kinds.size, 3);
});
