import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSeconds, memoryStorage, readBest, seededRandom, shuffle, submitBest } from '../src/pawville/games/shared.ts';
import { ALL_PHRASES, PHRASES, isValidPhrase } from '../src/pawville/games/pawtype/phrases.ts';
import {
  MAX_OVERFLOW, botChars, charMarks, compareResults, createType, pickPhrases, plausibleResult, resultOf, totalChars, typeInput, typeStats,
} from '../src/pawville/games/pawtype/typing.ts';
import { createSnap, nextRound, press, tickSnap } from '../src/pawville/games/reflex/engine.ts';

test('shared: deterministic shuffle and personal bests', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seededRandom(7)), shuffle([1, 2, 3, 4, 5], seededRandom(7)));
  const s = memoryStorage();
  assert.equal(submitBest('g', 'k', 50, 'higher', s).isNewBest, true);
  assert.equal(submitBest('g', 'k', 40, 'higher', s).isNewBest, false);
  assert.equal(readBest('g', 'k', s), 50);
  assert.equal(formatSeconds(83.44), '1:23.4');
});

test('PawType phrases: lowercase words only, no punctuation, all categories filled, examples included', () => {
  for (const p of ALL_PHRASES) assert.ok(isValidPhrase(p), `"${p}"`);
  for (const list of Object.values(PHRASES)) assert.ok(list.length >= 6);
  for (const ex of ['you are my favorite person', 'meet me under the stars', 'lets go get some cake', 'i will steal your snacks', 'the cats own this town']) {
    assert.ok(ALL_PHRASES.includes(ex), ex);
  }
});

test('PawType: both players get identical phrases from the same match seed', () => {
  assert.deepEqual(pickPhrases(99, 'mixed', 3), pickPhrases(99, 'mixed', 3));
  assert.notDeepEqual(pickPhrases(99, 'mixed', 3), pickPhrases(100, 'mixed', 3));
});

test('PawType: no typing before the start; capitals are fine; wrong keys never advance', () => {
  let s = createType(['cat nap'], 1000, 'race');
  assert.equal(typeInput(s, 'c', 500), s, 'locked before start');
  s = typeInput(s, 'CA', 1100);
  assert.equal(typeStats(s, 1100).correctChars, 2, 'caps lock does not matter');
  s = typeInput(s, 'cax', 1200);
  s = typeInput(s, 'caxyz', 1300);
  assert.equal(typeStats(s, 1300).correctChars, 2);
  assert.deepEqual(charMarks(s).slice(0, 4), ['correct', 'correct', 'wrong', 'wrong']);
  s = typeInput(s, 'x'.repeat(30), 1400);
  assert.ok(s.typed.length - 0 <= MAX_OVERFLOW + 2);
});

test('PawType: progress, spaces between phrases, finishing, accuracy and wpm', () => {
  const phrases = ['ab cd', 'ef'];
  assert.equal(totalChars(phrases), 8);
  let s = createType(phrases, 0, 'race');
  s = typeInput(s, 'ab cx', 1000);
  s = typeInput(s, 'ab c', 1500);
  s = typeInput(s, 'ab cd', 2000);
  assert.equal(s.index, 1);
  assert.equal(typeStats(s, 2000).correctChars, 5);
  s = typeInput(s, 'e', 2500);
  assert.equal(typeStats(s, 2500).correctChars, 7, 'the space between phrases counts once');
  s = typeInput(s, 'ef', 3000);
  const st = typeStats(s, 99999);
  assert.equal(st.finished, true);
  assert.equal(st.correctChars, 8);
  assert.equal(st.elapsed, 3, 'timer stops on completion');
  assert.equal(st.errors, 1);
  assert.ok(Math.abs(st.accuracy - (7 / 8) * 100) < 1e-9);
  assert.ok(Math.abs(st.wpm - 8 / 5 / (3 / 60)) < 1e-9);
  assert.equal(typeStats(createType(['a'], 0, 'race'), 0).wpm, 0, 'zero elapsed time is safe');
  assert.equal(typeStats(createType(['a'], 0, 'race'), 0).accuracy, 100, 'empty input is safe');
});

test('PawType timed: ends at the time limit, unfinished phrases are not counted as completed', () => {
  let s = createType(['hello there', 'more words'], 0, 'timed15');
  s = typeInput(s, 'hello the', 5000);
  assert.equal(typeInput(s, 'hello there', 15_001), s, 'no input after time');
  const r = resultOf('me', s, 20_000);
  assert.equal(r.phrasesDone, 0);
  assert.equal(r.finished, false);
  assert.equal(typeStats(s, 20_000).elapsed, 15);
});

test('PawType ranking: finishing wins, then speed, then accuracy breaks ties; mashing loses', () => {
  const base = { name: 'a', finished: true, finishMs: 9000, correctChars: 20, accuracy: 90, wpm: 30, phrasesDone: 1 };
  assert.ok(compareResults(base, { ...base, finishMs: 9500 }, 'race') < 0);
  assert.ok(compareResults(base, { ...base, finished: false, finishMs: null, correctChars: 19 }, 'race') < 0);
  assert.ok(compareResults({ ...base, accuracy: 99 }, base, 'timed30') < 0, 'tie broken by accuracy');
  let masher = createType(['the cats own this town'], 0, 'timed15');
  let careful = createType(['the cats own this town'], 0, 'timed15');
  for (let i = 0; i < 40; i++) masher = typeInput(masher, masher.typed + 'q', 100 + i * 10);
  careful = typeInput(careful, 'the cats', 3000);
  assert.ok(compareResults(resultOf('c', careful, 15000), resultOf('m', masher, 15000), 'timed15') < 0);
});

test('PawType: implausible partner results are rejected; pace bot is monotonic', () => {
  const phrases = ['the cats own this town'];
  const ok = { name: 'p', finished: true, finishMs: 8000, correctChars: 22, accuracy: 96, wpm: 33, phrasesDone: 1 };
  assert.equal(plausibleResult(ok, phrases, 'race'), true);
  assert.equal(plausibleResult({ ...ok, finishMs: 100 }, phrases, 'race'), false, 'impossibly fast');
  assert.equal(plausibleResult({ ...ok, correctChars: 99 }, phrases, 'race'), false);
  assert.equal(plausibleResult({ ...ok, accuracy: 140 }, phrases, 'race'), false);
  const a = botChars(40, 5, 1);
  const b = botChars(40, 10, 1);
  assert.ok(b > a && a > 0);
  assert.equal(botChars(40, 5, 1), a, 'deterministic');
});

test('Paw Snap: early press is a foul, first snap after the signal scores, first to 3 wins', () => {
  let s = createSnap(7, 0);
  const foul = press(s, 0, s.signalAt - 1);
  assert.equal(foul.lastWinner, 1);
  assert.equal(foul.lastReason, 'foul');
  s = tickSnap(s, s.signalAt);
  assert.equal(s.phase, 'signal');
  s = press(s, 1, s.signalAt + 230);
  assert.equal(s.lastWinner, 1);
  assert.equal(s.reactionMs, 230);
  assert.equal(press(s, 0, s.signalAt + 300), s, 'second press in the same round does nothing');
  for (let i = 0; i < 2; i++) {
    s = nextRound(s, 10_000 * (i + 1));
    s = press(tickSnap(s, s.signalAt), 1, s.signalAt + 100);
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.scores, [0, 3]);
});
