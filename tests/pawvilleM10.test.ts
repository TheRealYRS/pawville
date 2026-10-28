/**
 * Milestone 10, batches 1–2: fountain benches, ducks on the water, facing hysteresis, the home
 * garden (and Green Thumb), the Ferris wheel ride, the new cat art and the branding.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BENCHES, FOUNTAIN, benchApproach, benchFacing, benchSeats, buildTown } from '../src/pawville/world/townMap.ts';
import { facingFor } from '../src/pawville/world/movement.ts';
import { regionDef } from '../src/pawville/adventure/regions.ts';
import { RG, RTILE, groundAtR } from '../src/pawville/adventure/regionKit.ts';
import { duckPath } from '../src/pawville/render/districtArt.ts';
import { CROPS, GARDEN_BEDS, STAGES, applyOp, cropById, emptyHomeGarden, grow, growAll, sanitizeHomeGarden, wildlife, type GardenOp, type GardenOpInput, type HomeGarden } from '../src/pawville/home/homeGarden.ts';
import { FAIR_LAYOUT, FERRIS, exitPoint, ferrisAngle, stand } from '../src/pawville/city/funfair.ts';
import { renderCatFrame } from '../src/pawville/render/catSprites.ts';
import { rasterFactory, sig } from '../scripts/preview/raster.ts';
import { ACHIEVEMENTS, ITEM_NAMES } from '../src/pawville/worldSave.ts';
import { RECIPES } from '../src/pawville/home/cooking.ts';
import { collides, type CollisionWorld } from '../src/pawville/world/movement.ts';
import { WORLD_BOUNDS } from '../src/pawville/world/townMap.ts';

// ---- benches & ducks ------------------------------------------------------------------------
test('fountain benches face the fountain; seats, approach and facing agree', () => {
  const town = buildTown();
  const world: CollisionWorld = { bounds: WORLD_BOUNDS, solids: town.solids };
  for (const b of BENCHES.filter((x) => x.area === 'Fountain Plaza')) {
    const fountainIsNorth = FOUNTAIN.y < b.y;
    assert.equal(b.faces === 'up', fountainIsNorth, `${b.id} looks towards the fountain`);
    const stand = benchApproach(b);
    assert.ok(fountainIsNorth ? stand.y < b.y : stand.y > b.y, `${b.id}: you approach from the side the seat faces`);
    assert.ok(!collides(stand, world), `${b.id}: approach spot is free`);
    for (const i of [0, 1] as const) assert.equal(benchFacing(b, i) === 'up', fountainIsNorth);
    const prop = town.props.find((p) => p.kind === 'bench' && p.x === b.x && p.y === b.y)!;
    assert.equal(prop.variant, fountainIsNorth ? 1 : 0, `${b.id}: drawn from the matching side`);
    assert.equal(benchSeats(b).length, 2);
  }
});

test('ducks: every point of every duck loop is on water (not on the plank bridges)', () => {
  const park = regionDef('city-park');
  const ducks = park.props.filter((p) => p.kind === 'duck');
  assert.ok(ducks.length >= 3);
  for (const d of ducks) for (let t = 0; t < 30; t += 0.25) {
    const p = duckPath(d.x, d.y, d.variant ?? 0, t);
    for (const [dx, dy] of [[-6, 0], [6, 0], [0, -2], [0, 2]]) {
      const g = groundAtR(park, Math.floor((p.x + dx) / RTILE), Math.floor((p.y + dy) / RTILE));
      assert.ok(g === RG.Water || g === RG.Deep, `duck at ${d.x},${d.y} reaches ${p.x + dx},${p.y + dy} (tile ${g})`);
    }
  }
});

test('facing: diagonal input no longer flickers between side and front views', () => {
  let f = facingFor(1, 0.95, 'right');
  for (const [x, y] of [[0.95, 1], [1, 0.9], [0.9, 1]]) { f = facingFor(x, y, f); assert.equal(f, 'right'); }
  assert.equal(facingFor(0.3, 1, 'right'), 'down', 'a clearly vertical push still turns');
  assert.equal(facingFor(1, 0.3, 'down'), 'right');
  assert.equal(facingFor(0, 0, 'left'), 'left');
});

// ---- home garden ----------------------------------------------------------------------------
let n = 0;
const op = (o: GardenOpInput & { at: number; by?: 'T' | 'M' }): GardenOp => ({ id: `op${n++}`, by: 'T', ...o } as GardenOp);
test('garden: plant → water → grow a stage per watering → harvest; regrowing crops come back', () => {
  let g: HomeGarden = emptyHomeGarden();
  const herbs = cropById('herbs');
  let t = 1000;
  let r = applyOp(g, op({ kind: 'plant', bed: 0, crop: 'herbs', at: t })); assert.ok(r.ok); g = r.garden;
  assert.equal(applyOp(g, op({ kind: 'harvest', bed: 0, at: t })).ok, false, 'not ripe');
  for (let stage = 1; stage <= STAGES; stage++) {
    r = applyOp(g, op({ kind: 'water', bed: 0, at: t })); assert.ok(r.ok, `water ${stage}`); g = r.garden;
    assert.equal(applyOp(g, op({ kind: 'water', bed: 0, at: t + 1 })).ok, false, 'no double watering');
    t += herbs.stageMs - 1;
    assert.equal(growAll(g, t).beds[0]!.stage, stage - 1, 'not yet');
    t += 1;
    g = growAll(g, t);
    assert.equal(g.beds[0]!.stage, stage);
  }
  const h = { ...op({ kind: 'harvest', bed: 0, at: t }) };
  r = applyOp(g, h);
  assert.ok(r.ok && r.harvested && r.harvested.item === 'herbs' && r.harvested.n === herbs.yield && r.first);
  g = r.garden;
  assert.equal(g.beds[0]!.stage, 1, 'herbs grow back');
  assert.equal(applyOp(g, h).ok, false, 'the same harvest can’t be applied twice');
  assert.equal(g.harvests, 1);
});

test('garden: plants never die offline, ownership is respected, decorations unlock by harvesting', () => {
  let g = applyOp(emptyHomeGarden(), op({ kind: 'plant', bed: 2, crop: 'carrot', at: 0, by: 'M' })).garden;
  g = applyOp(g, op({ kind: 'water', bed: 2, at: 0 })).garden;
  const yearLater = growAll(g, 365 * 24 * 3600_000);
  assert.equal(yearLater.beds[2]!.stage, 1, 'a year away: one stage (it waits for water), never wilted');
  assert.equal(grow(yearLater.beds[2]!, 1e13).stage, 1);
  assert.equal(applyOp(g, op({ kind: 'dig', bed: 2, at: 1, by: 'T' })).ok, false, 'not your crop');
  assert.ok(applyOp(g, op({ kind: 'dig', bed: 2, at: 1, by: 'M' })).ok);
  assert.equal(applyOp(g, op({ kind: 'decor', decor: 'gnome', on: true, at: 1 })).ok, false, 'locked until 3 harvests');
  assert.ok(applyOp({ ...g, harvests: 3 }, op({ kind: 'decor', decor: 'gnome', on: true, at: 1 })).ok);
  assert.equal(applyOp(g, op({ kind: 'plant', bed: GARDEN_BEDS, crop: 'herbs', at: 1 })).ok, false);
  assert.equal(applyOp(g, op({ kind: 'plant', bed: 2, crop: 'herbs', at: 1 })).ok, false, 'occupied');
});

test('garden: saves survive junk; wildlife follows the garden; crops feed recipes; Green Thumb exists', () => {
  const bad = sanitizeHomeGarden({ beds: [{ crop: 'nope' }, { crop: 'catnip', stage: 99, wateredAt: 'x' }], harvests: -5, decor: ['gnome', 'evil'] });
  assert.equal(bad.beds.length, GARDEN_BEDS);
  assert.equal(bad.beds[0], null);
  assert.equal(bad.beds[1]!.stage, STAGES);
  assert.equal(bad.harvests, 0);
  assert.deepEqual(bad.decor, ['gnome']);
  const g = { ...emptyHomeGarden(), beds: [{ crop: 'berries', plantedBy: 'T', plantedAt: 0, stage: 2, wateredAt: null }, null, null, null, null, null] } as HomeGarden;
  assert.ok(wildlife(g, false).butterflies >= 1);
  assert.equal(wildlife(g, true).butterflies, 0);
  assert.ok(wildlife(g, true).fireflies > 0);
  for (const c of CROPS) assert.ok(ITEM_NAMES[c.item], c.id);
  assert.ok(RECIPES.some((r) => r.needs.some((x) => 'item' in x && x.item === 'carrot')), 'carrots are cookable');
  assert.ok(ACHIEVEMENTS['green-thumb']);
});

// ---- Ferris wheel (now part of the Whiskerwick Funfair; the full ride model is tested in pawvilleFunfair.test.ts) ----
test('ferris wheel: lives in the funfair, one slow turn, boarding spot and exit agree', () => {
  assert.ok(regionDef('city').props.every((p) => p.kind !== 'ferris'), 'the wheel moved out of the city into the funfair');
  const fair = regionDef('funfair');
  const spot = fair.spots.find((s) => s.id === 'fair-ferris')!;
  assert.equal(spot.activity, 'ride');
  assert.deepEqual(spot.point, stand('ferris'), 'marker, prompt and boarding point agree');
  assert.equal(fair.props.filter((p) => p.kind === 'ferris').length, 1);
  let prev = -1;
  for (let ms = 0; ms < FERRIS.periodMs; ms += 500) { const a = ferrisAngle(ms); assert.ok(a >= prev, 'the wheel never turns backwards'); prev = a; }
  assert.ok(Math.hypot(exitPoint('ferris').x - stand('ferris').x, exitPoint('ferris').y - stand('ferris').y) < 60, 'you step out next to where you got in');
  assert.equal(FAIR_LAYOUT.ferris.x, 140);
});

// ---- cat art ----------------------------------------------------------------------------------
const art = (coat: string, k: Record<string, unknown>) => {
  const { factory } = rasterFactory();
  const c = renderCatFrame(factory as never, { coat: coat as never, accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'stand', ...k } as never) as unknown as { __r: Parameters<typeof sig>[0] & { px: Map<string, string> } };
  return c.__r;
};
test('cat art: shaded fur, a back view with a separate head, a real loaf, Chutki ≠ Puchu', () => {
  for (const coat of ['tangerine', 'midnight', 'puchu', 'chutki', 'mini', 'magic']) {
    const front = art(coat, {});
    const colours = new Set(front.px.values());
    assert.ok(colours.size >= 8, `${coat}: shaded (${colours.size} colours)`);
    const back = art(coat, { facing: 'up' });
    // the neck is narrower than the head: count filled pixels on head row vs neck row
    const width = (row: number) => [...back.px.keys()].filter((k) => Number(k.split(',')[1]) === row).length;
    assert.ok(width(6 + 6) > width(6 + 8), `${coat}: back view has a head wider than the neck`);
    const loaf = art(coat, { pose: 'loaf' });
    assert.ok(loaf.px.size > 150, `${coat}: the loaf is a full cat, not a strip (${loaf.px.size}px)`);
  }
  assert.notEqual(sig(art('puchu', {})), sig(art('chutki', {})));
  const orange = (r: { px: Map<string, string> }) => [...r.px.values()].filter((v) => v.toUpperCase() === '#FF9A3D').length;
  assert.ok(orange(art('chutki', {})) >= orange(art('puchu', {})) + 6, 'Chutki has bold orange patches');
});

// ---- branding ---------------------------------------------------------------------------------
test('branding: the tab says Pawville, with Pawville metadata and favicon', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Pawville<\/title>/);
  assert.match(html, /og:title" content="Pawville"/);
  assert.doesNotMatch(html, /Paw vs Paw — Settle it like cats/);
  assert.match(readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8'), /<svg/);
});
