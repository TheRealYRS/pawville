import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../src/pawville/games/shared.ts';
import {
  FLEET, SIZE, allSunk, cellIndex, cellLabel, checkPlacement, chooseShot, createBoard, fire, isFleetComplete, placementCells, publicView, randomFleet,
  type HiddenBoard, type Placement,
} from '../src/pawville/games/battleship/engine.ts';

const fixedFleet: Placement[] = [
  { ship: 'galleon', row: 0, col: 0, dir: 'h' }, { ship: 'trawler', row: 2, col: 0, dir: 'v' }, { ship: 'barge', row: 9, col: 7, dir: 'h' },
  { ship: 'sub', row: 4, col: 5, dir: 'v' }, { ship: 'dinghy', row: 7, col: 2, dir: 'h' },
];

test('fleet: 5 ships, 17 cells, labels', () => {
  assert.equal(FLEET.reduce((n, s) => n + s.length, 0), 17);
  assert.equal(cellLabel(0), 'A1');
  assert.equal(cellLabel(99), 'J10');
});

test('placement: rotation, bounds, overlap, duplicates', () => {
  assert.deepEqual(placementCells({ ship: 'dinghy', row: 0, col: 0, dir: 'v' }), [0, 10]);
  assert.equal(checkPlacement([], { ship: 'galleon', row: 0, col: 6, dir: 'h' }), 'out_of_bounds');
  assert.equal(checkPlacement([fixedFleet[0]], { ship: 'trawler', row: 0, col: 4, dir: 'v' }), 'overlap');
  assert.equal(checkPlacement([fixedFleet[0]], { ship: 'galleon', row: 5, col: 5, dir: 'h' }), 'duplicate');
  assert.equal(isFleetComplete(fixedFleet), true);
  assert.throws(() => createBoard(fixedFleet.slice(0, 4)));
  for (let seed = 1; seed <= 100; seed++) assert.equal(isFleetComplete(randomFleet(seededRandom(seed))), true);
});

test('shots: miss, hit, sunk, repeat, invalid, win', () => {
  let b = createBoard(fixedFleet);
  let r = fire(b, cellIndex(5, 9));
  assert.equal(r.result.kind, 'miss');
  b = r.board;
  assert.equal(fire(b, cellIndex(5, 9)).result.kind, 'repeat');
  assert.equal(fire(b, 100).result.kind, 'invalid');
  r = fire(b, cellIndex(7, 2));
  r = fire(r.board, cellIndex(7, 3));
  assert.deepEqual(r.result, { kind: 'sunk', cell: 73, ship: 'dinghy' });
  b = r.board;
  for (const p of fixedFleet) for (const c of placementCells(p)!) b = fire(b, c).board;
  assert.equal(allSunk(b), true);
});

test('public view never reveals afloat ships', () => {
  let b = createBoard(fixedFleet);
  b = fire(b, cellIndex(0, 0)).board;
  b = fire(b, cellIndex(7, 2)).board;
  b = fire(b, cellIndex(7, 3)).board;
  const v = publicView(b);
  const visible = v.cells.map((c, i) => (c === 'hit' || c === 'sunk' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(visible.sort((x, y) => x - y), [0, 72, 73]);
  assert.equal(JSON.stringify(v).includes('placements'), false);
});

test('AI picks legal cells and harder levels need fewer shots', () => {
  const playOut = (level: 'easy' | 'medium' | 'hard', seed: number) => {
    const rng = seededRandom(seed);
    let b: HiddenBoard = createBoard(randomFleet(rng));
    let shots = 0;
    while (!allSunk(b)) {
      const r = fire(b, chooseShot(publicView(b), level, rng));
      assert.ok(r.result.kind !== 'repeat' && r.result.kind !== 'invalid');
      b = r.board;
      shots++;
      assert.ok(shots <= SIZE * SIZE);
    }
    return shots;
  };
  const avg = (l: 'easy' | 'medium' | 'hard') => Array.from({ length: 25 }, (_, i) => playOut(l, i * 31 + 1)).reduce((a, b) => a + b) / 25;
  const [e, m, h] = [avg('easy'), avg('medium'), avg('hard')];
  assert.ok(m < e && h < m, `${e} > ${m} > ${h}`);
});
