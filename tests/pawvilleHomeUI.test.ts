/**
 * Home overhaul: the cat really climbs (shelves, perch, tree), the headroom rule, drag-and-drop geometry,
 * and the Ferris wheel's shorter ride.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECOR, ROOM_H, ROOM_W, WALL_ROWS, decorDef, footprint, sanitizeHome, type DecorId, type Placed } from '../src/pawville/home/decor.ts';
import {
  CAT_HEIGHT_PX, HOP_MS, WALL_FEET_Y, checkPlaceInRoom, climbRoute, needsHeadroom, planInteraction, routePoint, solidGrid, type ClimbStep,
} from '../src/pawville/home/homeWalk.ts';
import { DRAG_THRESHOLD_PX, cellAt, dropOrigin, isDrag, pushHistory, sizeOf } from '../src/pawville/home/homeDrag.ts';
import { ROOM_PX_H, T, footprintPx } from '../src/pawville/home/homeArt.ts';
import { FERRIS, RIDE_MS } from '../src/pawville/city/funfair.ts';

const piece = (item: DecorId, x: number, y: number, rot: 0 | 90 = 0): Placed => ({ uid: `t-${item}`, item, x, y, rot, placedBy: 'T' });

// feet position in picture pixels for a step, and the top of the cat sprite there
const feetY = (s: ClimbStep) => s.y * T - s.lift;

test('climbing shelves: the cat hops up onto real boards, ending on the top board (not floating near the floor)', () => {
  const shelves = piece('climb-shelves', 5, 1);
  const route = climbRoute(shelves)!;
  assert.equal(route.length, 2, 'two hops: low board, then the top board');
  const px = footprintPx(shelves);
  assert.ok(Math.abs(feetY(route[0]) - (px.y + 14)) < 0.01, 'first hop lands on the low board');
  assert.ok(Math.abs(feetY(route[1]) - (px.y + 6)) < 0.01, 'second hop lands on the top board');
  assert.ok(route[1].lift > route[0].lift && route[0].lift > 0, 'every hop goes up');
  assert.ok(route[1].lift > 30, `rests ~40 px up the wall, not 12 px (was ${route[1].lift})`);
  const plan = planInteraction([shelves], shelves, { x: 5, y: WALL_ROWS })!;
  assert.deepEqual(plan.route, route);
  assert.equal(plan.lift, route[1].lift, 'the plan ends exactly where the last hop ends');
  assert.deepEqual(plan.spot, { x: route[1].x, y: route[1].y });
});

test('window perch and cat tree: one hop to the cushion, three hops up the tree', () => {
  const perch = piece('window-perch', 3, 1);
  const r = climbRoute(perch)!;
  assert.equal(r.length, 1);
  assert.ok(Math.abs(feetY(r[0]) - (footprintPx(perch).y + 24 - 9)) < 0.01, 'sits on the cushion');
  const tower = piece('cat-tower', 8, 3);
  const t = climbRoute(tower)!;
  assert.equal(t.length, 3);
  assert.ok(t[0].lift < t[1].lift && t[1].lift < t[2].lift, 'platform, platform, bed — each higher');
  const plan = planInteraction([tower], tower, { x: 7, y: 3 })!;
  assert.equal(plan.lift, t[2].lift);
  assert.ok(plan.lift > 30, 'the cat sits in the top bed, not halfway up the tree');
});

test('a climbing cat always stays inside the picture, wherever the piece is legally placed', () => {
  for (const item of ['climb-shelves', 'window-perch'] as const) {
    for (let x = 0; x <= ROOM_W - decorDef(item).w; x++) {
      const p = piece(item, x, WALL_ROWS - 1);
      assert.equal(checkPlaceInRoom([], p), 'ok', `${item} fits at row ${WALL_ROWS - 1}`);
      for (const s of climbRoute(p)!) {
        assert.ok(feetY(s) - CAT_HEIGHT_PX >= 0, `${item} x=${x}: head is inside the picture (feet at ${feetY(s).toFixed(1)})`);
        assert.ok(s.x >= x - 0.01 && s.x <= x + decorDef(item).w + 0.01, 'and over the piece');
        assert.ok(feetY(s) <= ROOM_PX_H);
      }
    }
  }
  for (let x = 0; x < ROOM_W; x++) for (let y = 2; y + 2 <= ROOM_H; y++) {
    for (const s of climbRoute(piece('cat-tower', x, y))!) assert.ok(feetY(s) - CAT_HEIGHT_PX >= -2, `tree at (${x},${y}) keeps the cat on screen (feet ${feetY(s).toFixed(1)})`);
  }
});

test('headroom rule: cat shelves and the perch only go on the lower wall row; old layouts keep their pieces and still work', () => {
  assert.ok(needsHeadroom('climb-shelves') && needsHeadroom('window-perch') && !needsHeadroom('shelf'));
  assert.equal(checkPlaceInRoom([], piece('climb-shelves', 4, 0)), 'needs-headroom');
  assert.equal(checkPlaceInRoom([], piece('window-perch', 4, 0)), 'needs-headroom');
  assert.equal(checkPlaceInRoom([], piece('climb-shelves', 4, 1)), 'ok');
  assert.equal(checkPlaceInRoom([], piece('shelf', 4, 0)), 'ok', 'ordinary wall pieces can still go on the top row');
  const legacy = sanitizeHome({ placed: [{ uid: 'a', item: 'climb-shelves', x: 4, y: 0, rot: 0, placedBy: 'T' }] });
  assert.equal(legacy.placed.length, 1, 'no old home loses a piece');
  const p = legacy.placed[0];
  for (const s of climbRoute(p)!) assert.ok(feetY(s) - CAT_HEIGHT_PX >= 0);
  assert.ok(planInteraction(legacy.placed, p, { x: 4, y: WALL_ROWS }));
});

test('routePoint: starts on the floor, ends at the last step, never goes backwards, hops arc above the line', () => {
  const route = climbRoute(piece('climb-shelves', 5, 1))!;
  const start: ClimbStep = { x: 5.5, y: 2.5, lift: 0 };
  const a = routePoint(start, route, 0), z = routePoint(start, route, route.length), over = routePoint(start, route, 99);
  assert.deepEqual([a.x, a.y, a.lift], [start.x, start.y, 0]);
  assert.deepEqual(z, route[route.length - 1]);
  assert.deepEqual(over, z, 'clamped past the end');
  let arced = false;
  for (let u = 0; u <= route.length; u += 0.05) {
    const p = routePoint(start, route, u);
    const straight = routePoint(start, route, Math.floor(u)).lift;
    if (p.lift > Math.max(straight, routePoint(start, route, Math.min(route.length, Math.floor(u) + 1)).lift) + 1) arced = true;
  }
  assert.ok(arced, 'each hop rises above both landings (it is a jump, not a slide)');
  assert.ok(HOP_MS >= 200 && HOP_MS <= 600);
});

test('other seat pieces keep working exactly as before (bed, sofa, rest, hide)', () => {
  for (const item of ['bed', 'sofa', 'cat-bed', 'cardboard-box'] as const) {
    const p = piece(item, 4, 4);
    const plan = planInteraction([p], p, { x: 8, y: 6 });
    assert.ok(plan && !plan.route, `${item}: no climb route`);
    assert.ok(plan!.lift >= 0 && plan!.lift <= 8);
  }
  const plain = planInteraction([], piece('table', 4, 4), { x: 8, y: 6 });
  assert.equal(plain, null, 'furniture with no action has no plan');
  assert.ok(solidGrid([]).length === ROOM_W * ROOM_H);
});

test('standing right beside a piece is a plan with nothing to walk (the room starts using it at once)', () => {
  const scratch = piece('scratch-board', 5, 6);
  const plan = planInteraction([scratch], scratch, { x: 4, y: 6 })!;
  assert.equal(plan.path.length, 1, 'path is just the cell the cat already stands on');
  assert.deepEqual(plan.path[0], { x: 4, y: 6 });
  const far = planInteraction([scratch], scratch, { x: 10, y: 3 })!;
  assert.ok(far.path.length > 1);
});

test('every catalogue piece can be dropped anywhere and lands legally inside the room', () => {
  for (const d of DECOR) for (const rot of [0, 90] as const) {
    const { w, h } = sizeOf(d.id, rot);
    for (let cx = 0; cx < ROOM_W; cx++) for (let cy = 0; cy < ROOM_H; cy++) {
      const o = dropOrigin(d.id, rot, { x: cx, y: cy });
      assert.ok(o.x >= 0 && o.x + w <= ROOM_W && o.y >= 0 && o.y + h <= ROOM_H, `${d.id}/${rot} at pointer (${cx},${cy}) stays in the room`);
      if (d.layer === 'wall') assert.ok(o.y + h <= WALL_ROWS, `${d.id}: wall pieces stay on the wall`);
      else assert.ok(o.y >= WALL_ROWS, `${d.id}: floor pieces stay on the floor`);
      if (needsHeadroom(d.id) && rot === 0) assert.equal(o.y, WALL_ROWS - 1, `${d.id} snaps to the lower wall row`);
    }
  }
});

test('the pointer holds the middle of a dragged piece', () => {
  assert.deepEqual(dropOrigin('sofa', 0, { x: 6, y: 4 }), { x: 5, y: 4 });
  assert.deepEqual(dropOrigin('bed', 0, { x: 6, y: 5 }), { x: 5, y: 4 });
  assert.deepEqual(dropOrigin('plant', 0, { x: 3, y: 3 }), { x: 3, y: 3 });
  assert.deepEqual(dropOrigin('sofa', 0, { x: 0, y: 7 }), { x: 0, y: 7 }, 'clamped at the corner');
  assert.deepEqual(footprint({ item: 'sofa', x: 5, y: 4, rot: 0 }), { x: 5, y: 4, w: 3, h: 1 });
});

test('cellAt maps screen points to room tiles and rejects points outside the grid', () => {
  const g = { left: 100, top: 50, width: 1200, height: 800 };
  assert.deepEqual(cellAt(g, 100, 50), { x: 0, y: 0 });
  assert.deepEqual(cellAt(g, 1299, 849), { x: ROOM_W - 1, y: ROOM_H - 1 });
  assert.deepEqual(cellAt(g, 700, 450), { x: 6, y: 4 });
  assert.equal(cellAt(g, 99, 100), null);
  assert.equal(cellAt(g, 700, 850), null);
  assert.equal(cellAt({ left: 0, top: 0, width: 0, height: 0 }, 1, 1), null);
});

test('click vs drag threshold, and a bounded undo history', () => {
  assert.ok(!isDrag(2, 3) && isDrag(DRAG_THRESHOLD_PX, 0) && isDrag(5, 5));
  let h: number[] = [];
  for (let i = 0; i < 50; i++) h = pushHistory(h, i, 30);
  assert.equal(h.length, 30);
  assert.equal(h[0], 20);
  assert.equal(h[29], 49);
});

test('Ferris wheel: one gentle turn is now 25–30 s (was 48 s)', () => {
  assert.ok(FERRIS.periodMs >= 25_000 && FERRIS.periodMs <= 30_000, `period ${FERRIS.periodMs}`);
  assert.equal(RIDE_MS.ferris, FERRIS.periodMs, 'a ride is exactly one turn');
});

test('WALL_FEET_Y sits just below the wall, on the first floor row', () => {
  assert.ok(WALL_FEET_Y > WALL_ROWS && WALL_FEET_Y < WALL_ROWS + 1);
});
