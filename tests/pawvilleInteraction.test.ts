import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraFor, findInteractable, pixelScaleFor, smoothCamera, stickyInteractable } from '../src/pawville/world/interaction.ts';
import { MOVEMENT, collides, type CollisionWorld } from '../src/pawville/world/movement.ts';
import { townSpots } from '../src/pawville/adventure/regions.ts';
import { BUILDINGS, INTERACTABLES, SEATS, SPAWN_POINT, WORLD_BOUNDS, WORLD_H, WORLD_W, buildTown } from '../src/pawville/world/townMap.ts';
import { DESTINATIONS, GAMES, gamesAt } from '../src/pawville/destinations.ts';

test('no prompt at spawn; every spot selects itself; ids are unique', () => {
  assert.equal(findInteractable(SPAWN_POINT, INTERACTABLES), null);
  assert.equal(new Set(INTERACTABLES.map((i) => i.id)).size, INTERACTABLES.length);
  for (const item of INTERACTABLES) assert.equal(findInteractable(item.point, INTERACTABLES)?.item.id, item.id, item.id);
});

test('availability rules hide weather-only spots', () => {
  const puddle = INTERACTABLES.find((i) => i.action === 'puddle')!;
  assert.equal(findInteractable(puddle.point, INTERACTABLES, (i) => i.when !== 'wet'), null);
  assert.equal(findInteractable(puddle.point, INTERACTABLES)?.item.id, puddle.id);
});

test('prompt hysteresis', () => {
  const item = INTERACTABLES[0];
  const edge = { x: item.point.x + item.radius + 3, y: item.point.y };
  assert.equal(findInteractable(edge, [item]), null);
  assert.equal(stickyInteractable(edge, [item], item.id)?.item.id, item.id);
  assert.equal(stickyInteractable({ x: edge.x + 20, y: edge.y }, [item], item.id), null);
});

test('camera clamps, eases and snaps on teleports; pixel scale 2..4', () => {
  const view = { w: 400, h: 240 };
  const world = { w: WORLD_W, h: WORLD_H };
  assert.deepEqual(cameraFor({ x: 0, y: 0 }, view, world), { x: 0, y: 0 });
  assert.deepEqual(cameraFor({ x: WORLD_W, y: WORLD_H }, view, world), { x: WORLD_W - 400, y: WORLD_H - 240 });
  const eased = smoothCamera({ x: 0, y: 0 }, { x: 10, y: 0 }, 1 / 60);
  assert.ok(eased.x > 0 && eased.x < 10);
  assert.deepEqual(smoothCamera({ x: 0, y: 0 }, { x: 500, y: 0 }, 1 / 60), { x: 500, y: 0 });
  assert.equal(pixelScaleFor(390, 844), 2);
  assert.equal(pixelScaleFor(1280, 720), 3);
});

test('registry: every game is reachable from a destination that exists in town', () => {
  for (const d of DESTINATIONS) assert.ok(INTERACTABLES.some((i) => i.kind === 'destination' && i.action === d.id), d.id);
  for (const g of GAMES) assert.ok(DESTINATIONS.some((d) => d.id === g.destination), g.id);
  assert.deepEqual(gamesAt('boxing-ring').map((g) => g.id), ['cat-boxing']);
  assert.ok(gamesAt('arcade').some((g) => g.id === 'paw-vs-paw'));
});

/** Flood fill over a 4-px grid using the real colliders: proves every spot is reachable on foot. */
test('every interaction spot and seat is reachable on foot from the spawn point', () => {
  const town = buildTown();
  const world: CollisionWorld = { bounds: WORLD_BOUNDS, solids: town.solids };
  const step = 4;
  const cols = Math.ceil(WORLD_W / step);
  const rows = Math.ceil(WORLD_H / step);
  const seen = new Uint8Array(cols * rows);
  const free = (c: number, r: number) => {
    const p = { x: c * step + 2, y: r * step + 2 };
    if (p.x < WORLD_BOUNDS.x + MOVEMENT.hitboxW / 2 || p.x > WORLD_BOUNDS.x + WORLD_BOUNDS.w - MOVEMENT.hitboxW / 2) return false;
    if (p.y < WORLD_BOUNDS.y + MOVEMENT.hitboxH || p.y > WORLD_BOUNDS.y + WORLD_BOUNDS.h) return false;
    return !collides(p, world);
  };
  const start = [Math.floor(SPAWN_POINT.x / step), Math.floor(SPAWN_POINT.y / step)];
  const queue = [start];
  seen[start[1] * cols + start[0]] = 1;
  while (queue.length) {
    const [c, r] = queue.pop()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nr * cols + nc]) continue;
      if (!free(nc, nr)) continue;
      seen[nr * cols + nc] = 1;
      queue.push([nc, nr]);
    }
  }
  const reachable = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (seen[(Math.floor(y / step) + dy) * cols + Math.floor(x / step) + dx]) return true;
    return false;
  };
  for (const it of INTERACTABLES) {
    assert.ok(!collides(it.point, world), `${it.id} point is not inside a collider`);
    assert.ok(reachable(it.point.x, it.point.y), `${it.id} is reachable`);
  }
  // Milestone 7: the old Typing Arena is now Pawville Station — its door is an adventure exit (train to Whiskerwick).
  for (const b of BUILDINGS) {
    const door = { x: b.door.x + b.door.w / 2, y: b.door.y + b.door.h };
    const viaAdventure = townSpots().some((sp) => sp.role === 'exit' && Math.hypot(sp.point.x - door.x, sp.point.y - door.y) < 40);
    assert.ok(INTERACTABLES.some((i) => i.action === b.id) || viaAdventure, `${b.id} has a door interaction`);
  }
  for (const [name, seats] of Object.entries(SEATS)) {
    const flat = (Array.isArray(seats[0]) ? (seats as unknown as { x: number; y: number }[][]).flat() : (seats as unknown as { x: number; y: number }[]));
    for (const s of flat) assert.ok(reachable(s.x, s.y + 8) || reachable(s.x, s.y), `${name} seat near (${s.x},${s.y}) is reachable`);
  }
});
