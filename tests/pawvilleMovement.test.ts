import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rectsOverlap } from '../src/pawville/world/geometry.ts';
import {
  MOVEMENT, collides, combineInputs, findFreeSpot, hitboxAt, inputFromKeys, moveAndCollide, normalizeInput, stepBody,
  type Body, type CollisionWorld,
} from '../src/pawville/world/movement.ts';
import { BUILDINGS, SPAWN_POINT, WORLD_BOUNDS, buildTown } from '../src/pawville/world/townMap.ts';

const open: CollisionWorld = { bounds: { x: 0, y: 0, w: 1000, h: 1000 }, solids: [] };
const body = (x: number, y: number): Body => ({ pos: { x, y }, vel: { x: 0, y: 0 }, facing: 'down', moving: false });
const run = (b: Body, input: { x: number; y: number; run?: boolean }, seconds: number, world = open, scale = 1) => {
  let cur = b;
  for (let t = 0; t < seconds; t += 1 / 60) cur = stepBody(cur, { x: input.x, y: input.y, run: !!input.run }, 1 / 60, world, scale);
  return cur;
};

test('WASD and arrow keys map to the same directions', () => {
  assert.deepEqual(inputFromKeys(new Set(['KeyW'])), { x: 0, y: -1, run: false });
  assert.deepEqual(inputFromKeys(new Set(['ArrowUp'])), { x: 0, y: -1, run: false });
  assert.deepEqual(inputFromKeys(new Set(['KeyD', 'ShiftLeft'])), { x: 1, y: 0, run: true });
  assert.deepEqual(inputFromKeys(new Set(['ArrowLeft', 'ArrowRight'])), { x: 0, y: 0, run: false });
});

test('diagonals are normalised; joystick dead zone; inputs never stack', () => {
  const i = inputFromKeys(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(i.x, i.y) - 1) < 1e-9);
  assert.deepEqual(normalizeInput(0.05, 0.05), { x: 0, y: 0 });
  assert.equal(Math.hypot(...Object.values(combineInputs({ x: 1, y: 0, run: false }, { x: 1, y: 0, run: false })).slice(0, 2) as [number, number]), 1);
});

test('acceleration, deceleration, run speed and paw-hold speed scaling', () => {
  const moving = run(body(100, 100), { x: 1, y: 0 }, 1);
  assert.ok(Math.abs(moving.vel.x - MOVEMENT.walkSpeed) < 1e-6);
  const stopped = run(moving, { x: 0, y: 0 }, 0.5);
  assert.equal(stopped.vel.x, 0);
  assert.equal(stopped.facing, 'right');
  const sprint = run(body(100, 100), { x: 1, y: 0, run: true }, 1);
  assert.ok(sprint.pos.x - 100 > (moving.pos.x - 100) * 1.4);
  const slowed = run(body(100, 100), { x: 1, y: 0 }, 1, open, 0.5);
  assert.ok(slowed.pos.x - 100 < (moving.pos.x - 100) * 0.6);
});

test('walls block and slide; thin walls cannot be tunnelled; bounds clamp', () => {
  const wall: CollisionWorld = { bounds: open.bounds, solids: [{ x: 200, y: 0, w: 20, h: 1000 }] };
  const r = moveAndCollide({ x: 190, y: 100 }, { x: 30, y: 10 }, wall);
  assert.ok(r.blockedX && Math.abs(r.pos.y - 110) < 1e-6 && !collides(r.pos, wall));
  const thin: CollisionWorld = { bounds: open.bounds, solids: [{ x: 300, y: 0, w: 2, h: 1000 }] };
  assert.ok(stepBody(body(280, 100), { x: 1, y: 0, run: true }, 5, thin).pos.x < 300);
  const c = moveAndCollide({ x: 20, y: 20 }, { x: -100, y: -100 }, { bounds: { x: 0, y: 0, w: 500, h: 500 }, solids: [] });
  assert.deepEqual(c.pos, { x: MOVEMENT.hitboxW / 2, y: MOVEMENT.hitboxH });
});

test('town: spawn is free, every building (incl. the new home) is solid, fountain blocks', () => {
  const town = buildTown();
  const world: CollisionWorld = { bounds: WORLD_BOUNDS, solids: town.solids };
  assert.ok(!collides(SPAWN_POINT, world));
  for (const b of BUILDINGS) assert.ok(collides({ x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 }, world), b.name);
  const end = run(body(SPAWN_POINT.x, SPAWN_POINT.y), { x: 0, y: -1 }, 4, world);
  assert.ok(end.pos.y > 300 && !town.solids.some((s) => rectsOverlap(hitboxAt(end.pos), s)));
  assert.ok(!collides(findFreeSpot({ x: 384, y: 320 }, world), world));
});
