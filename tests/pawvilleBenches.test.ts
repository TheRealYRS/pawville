import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSnapshot } from '../src/pawville/net/presenceProtocol.ts';
import { distance } from '../src/pawville/world/geometry.ts';
import { collides, type CollisionWorld } from '../src/pawville/world/movement.ts';
import { BENCHES, INTERACTABLES, SEATS, SPAWN_POINT, WORLD_BOUNDS, benchApproach, benchById, benchSeats, buildTown } from '../src/pawville/world/townMap.ts';
import { findInteractable } from '../src/pawville/world/interaction.ts';

const town = buildTown();
const world: CollisionWorld = { bounds: WORLD_BOUNDS, solids: town.solids };

/** Flood fill on a 4px grid from the spawn point: the set of places a cat can actually walk to. */
function reachable(): (p: { x: number; y: number }) => boolean {
  const S = 4;
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set<string>();
  const start = [Math.round(SPAWN_POINT.x / S), Math.round(SPAWN_POINT.y / S)];
  const q = [start];
  seen.add(key(start[0], start[1]));
  while (q.length) {
    const [cx, cy] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      const p = { x: nx * S, y: ny * S };
      if (p.x < WORLD_BOUNDS.x + 6 || p.y < WORLD_BOUNDS.y + 6 || p.x > WORLD_BOUNDS.x + WORLD_BOUNDS.w - 6 || p.y > WORLD_BOUNDS.y + WORLD_BOUNDS.h) continue;
      if (collides(p, world)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return (p) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (seen.has(key(Math.round(p.x / S) + dx, Math.round(p.y / S) + dy))) return true;
    return false;
  };
}

test('benches: EVERY bench prop on the map has exactly one interaction (derived, not hard-coded)', () => {
  const benchProps = town.props.filter((p) => p.kind === 'bench');
  assert.ok(benchProps.length >= 5, 'the park bench is included');
  assert.equal(benchProps.length, BENCHES.length);
  for (const prop of benchProps) {
    const b = BENCHES.find((x) => x.x === prop.x && x.y === prop.y);
    assert.ok(b, `bench prop at ${prop.x},${prop.y} is registered`);
    const its = INTERACTABLES.filter((i) => i.action === 'bench' && distance(i.point, benchApproach(b!)) < 1);
    assert.equal(its.length, 1, `${b!.id}: one interaction`);
    assert.equal(its[0].id, b!.id);
  }
  assert.equal(new Set(BENCHES.map((b) => b.id)).size, BENCHES.length, 'stable unique ids');
  assert.deepEqual(BENCHES.slice(0, 4).map((b) => b.id), ['bench-0', 'bench-1', 'bench-2', 'bench-3'], 'Milestone 3 ids unchanged');
  assert.equal(SEATS.bench.length, BENCHES.length);
});

test('benches: every bench can be reached on foot, prompts there, and seats are on the bench', () => {
  const canReach = reachable();
  for (const b of BENCHES) {
    const stand = benchApproach(b);
    assert.ok(!collides(stand, world), `${b.id}: standing spot is free`);
    assert.ok(canReach(stand), `${b.id}: reachable from the spawn point`);
    assert.equal(findInteractable(stand, INTERACTABLES)?.item.id, b.id, `${b.id}: the prompt appears there`);
    const seats = benchSeats(b);
    assert.deepEqual(benchById(b.id) && SEATS.bench[BENCHES.indexOf(b)], seats);
    for (const s of seats) {
      assert.ok(Math.abs(s.x - b.x) <= 10, `${b.id}: seat is over the bench`);
      // a bench facing the viewer draws its cats in FRONT (1 px below its baseline, lifted onto the plank); one seen from behind keeps them behind it
      if (b.faces === 'up') assert.ok(b.y - s.y >= 0 && b.y - s.y <= 4, `${b.id}: seen from behind, the cat sits behind the backrest`);
      else assert.equal(s.y, b.y + 1, `${b.id}: the cat is drawn in front of the bench, not sunk into it`);
    }
  }
});

test('benches: no bench blocks another important interaction', () => {
  for (const b of BENCHES) {
    const it = INTERACTABLES.find((i) => i.id === b.id)!;
    for (const other of INTERACTABLES) {
      if (other.id === it.id || other.action === 'bench') continue;
      assert.ok(distance(it.point, other.point) > it.radius + other.radius - 4, `${b.id} overlaps ${other.id}`);
    }
  }
});

test('benches: the seated pose survives the network (other players see you sitting)', () => {
  const s = sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 330, y: 271, pose: 'sit', lift: 4, facing: 'right' }, { w: 768, h: 864 })!;
  assert.deepEqual([s.pose, s.lift, s.facing], ['sit', 4, 'right']);
});
