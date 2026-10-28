import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BITE_WINDOW_MS, FISH, GROW_GAP_MS, SWING_MAX, applyGardenOp, cast, emptyGarden, fishAvailable, nextShootingStar, pumpSwing, reel, rollFish,
  seesawTiltShared, seesawTiltSolo, shootingStarAt, swingAngleShared, tickFishing, type GardenOp,
} from '../src/pawville/activities/park.ts';
import { seededRandom } from '../src/pawville/world/geometry.ts';

const day = { darkness: 0, weather: 'sunny' as const };

test('swing: well-timed pumps build height up to a cap; shared swinging is identical on both sides', () => {
  let s = { amp: 0, t0: 0 };
  const peak = (1000 * Math.PI) / 2 / 2.4; // ms at the top of the arc
  for (let i = 0; i < 20; i++) s = pumpSwing(s, peak + i * ((1000 * Math.PI) / 2.4)).swing;
  assert.ok(s.amp <= SWING_MAX + 1e-9);
  assert.ok(s.amp > 0.5);
  const bottom = pumpSwing({ amp: 0, t0: 0 }, 0);
  assert.equal(bottom.quality, 'meh');
  assert.equal(swingAngleShared(1000, 3500), swingAngleShared(1000, 3500));
  assert.equal(swingAngleShared(1000, 1000), 0, 'starts from rest');
});

test('seesaw: shared tilt oscillates; solo hop lifts briefly then rests', () => {
  const tilts = Array.from({ length: 50 }, (_, i) => seesawTiltShared(0, i * 100));
  assert.ok(Math.max(...tilts) > 0.9 && Math.min(...tilts) < -0.9);
  assert.equal(seesawTiltSolo(-1, null, 0), -1);
  assert.ok(seesawTiltSolo(-1, 0, 450) > 0);
  assert.equal(seesawTiltSolo(-1, 0, 2000), -1);
});

test('fishing: too soon, bite window, too late, and conditional fish', () => {
  const c = cast(0, 42);
  if (c.phase !== 'waiting') throw new Error('expected waiting');
  assert.equal(reel(c, c.biteAt - 10, day).phase, 'missed');
  assert.equal(tickFishing(c, c.biteAt).phase, 'bite');
  const caught = reel(c, c.biteAt + 100, day);
  assert.equal(caught.phase, 'caught');
  assert.equal(reel(c, c.biteAt + BITE_WINDOW_MS + 50, day).phase, 'missed');
  const moon = FISH.find((f) => f.id === 'moonfish')!;
  assert.equal(fishAvailable(moon, day), false);
  assert.equal(fishAvailable(moon, { darkness: 1, weather: 'sunny' }), true);
  const rand = seededRandom(1);
  for (let i = 0; i < 200; i++) assert.notEqual(rollFish(rand, day).id, 'moonfish');
});

test('garden: plant, grow only with spaced watering, joint care, idempotent ops, consent for removal', () => {
  const op = (o: Partial<GardenOp>): GardenOp => ({ id: `${Math.random()}`, kind: 'plant', plot: 0, by: 'T', at: 0, ...o });
  let g = applyGardenOp(emptyGarden(), op({ id: 'p1', seed: 'tulip', at: 0 })).garden;
  assert.equal(applyGardenOp(g, op({ id: 'p2', seed: 'rose', at: 1 })).reason, 'occupied');
  assert.equal(applyGardenOp(g, op({ id: 'p1', seed: 'tulip' })).reason, 'duplicate');
  g = applyGardenOp(g, op({ id: 'w1', kind: 'water', at: 1 })).garden;
  assert.equal(g.plots[0]!.growth, 1);
  g = applyGardenOp(g, op({ id: 'w2', kind: 'water', by: 'M', at: 2 })).garden;
  assert.equal(g.plots[0]!.growth, 1, 'spam-watering does not grow faster');
  assert.deepEqual(g.plots[0]!.wateredBy, ['T', 'M']);
  assert.equal(applyGardenOp(g, op({ id: 'x1', kind: 'pick', by: 'M', at: 3 })).reason, 'not-yours', "partner can't clear an unbloomed plant");
  g = applyGardenOp(g, op({ id: 'w3', kind: 'water', at: 1 + GROW_GAP_MS })).garden;
  g = applyGardenOp(g, op({ id: 'w4', kind: 'water', at: 1 + 2 * GROW_GAP_MS })).garden;
  assert.equal(g.plots[0]!.growth, 3);
  assert.equal(g.bloomed, 1);
  assert.equal(applyGardenOp(g, op({ id: 'x2', kind: 'pick', by: 'M', at: 9 })).ok, true, 'bloomed flowers can be picked by either');
  assert.equal(applyGardenOp(g, op({ id: 'bad', plot: 9 })).reason, 'bad-plot');
});

test('shooting stars are deterministic and periodic', () => {
  const start = nextShootingStar(1_000_000);
  assert.equal(shootingStarAt(start - 1), null);
  assert.ok(shootingStarAt(start + 100)! > 0);
  assert.equal(nextShootingStar(1_000_000), start);
});
