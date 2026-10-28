import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, cook, canCook, harvestHerbs, eat } from '../src/pawville/home/cooking.ts';
import { DECOR, available, sanitizeHome, toggleLight, SHOP_FURNITURE, type Placed } from '../src/pawville/home/decor.ts';
import { hasArt } from '../src/pawville/home/homeArt.ts';
import { buyFurniture } from '../src/pawville/city/economy.ts';
import { emptySave, sanitizeSave, ITEM_NAMES } from '../src/pawville/worldSave.ts';
import { regionDef, EXPLORE_REGIONS } from '../src/pawville/adventure/regions.ts';
import { groundSolids, regionPropCollider, reachableTiles, RTILE, regionBounds } from '../src/pawville/adventure/regionKit.ts';
import { collides, findFreeSpot } from '../src/pawville/world/movement.ts';
import { QUESTS } from '../src/pawville/adventure/content.ts';
import { dispatch, validateQuests } from '../src/pawville/adventure/engine.ts';
import { addFlags, emptyAdventure, giveKeyItem, viewOf } from '../src/pawville/adventure/state.ts';
import { cityNpcs } from '../src/pawville/city/cityRegion.ts';
import { buildCityPark, buildOldTown } from '../src/pawville/city/cityDistricts.ts';

const save = (o: Partial<ReturnType<typeof emptySave>> = {}) => ({ ...emptySave(), ...o });

test('cooking: every recipe has real ingredients and a real result; all-or-nothing; discovery saved', () => {
  for (const r of RECIPES) { assert.ok(ITEM_NAMES[r.makes], r.id); for (const g of r.needs) assert.ok('anyFish' in g || ITEM_NAMES[g.item]); }
  let s = save({ inventory: { flour: 1, 'fish-koi': 1 } });
  assert.ok(!cook(s, 'apple-tart').ok, 'missing apples');
  assert.deepEqual(s.inventory, { flour: 1, 'fish-koi': 1 }, 'nothing consumed on failure');
  const r = cook(s, 'fish-pie');
  assert.ok(r.ok && r.first);
  s = r.ok ? r.save : s;
  assert.equal(s.inventory['fish-pie'], 1);
  assert.ok(!s.inventory.flour && !s.inventory['fish-koi']);
  assert.deepEqual(s.recipes, ['fish-pie']);
  assert.ok(!cook(s, 'fish-pie').ok, 'cannot cook again without ingredients (no duplication)');
  assert.ok(!canCook(s, RECIPES.find((x) => x.id === 'picnic-basket')!));
  const ate = eat(s, 'fish-pie');
  assert.ok(ate && !ate.inventory['fish-pie']);
  assert.equal(eat(ate!, 'fish-pie'), null);
});

test('herbs: one gentle harvest per planter per day, never wilting', () => {
  let s = save();
  const a = harvestHerbs(s, 1, '2026-10-24'); assert.equal(a.got, 2); s = a.save;
  assert.equal(harvestHerbs(s, 1, '2026-10-24').got, 0);
  assert.equal(harvestHerbs(s, 1, '2026-12-01').got, 2, 'weeks away later: still there, nothing died');
});

test('furniture: buying is atomic; you can place only as many as you own; moving/removing never loses ownership', () => {
  const stove = DECOR.find((d) => d.id === 'stove')!;
  let s = save({ tokens: 12 });
  const r = buyFurniture(s, 'stove', 12, 'Cottage stove');
  assert.ok(r.ok); s = r.ok ? r.save : s;
  assert.equal(s.tokens, 0);
  assert.ok(!buyFurniture(s, 'stove', 12, 'x').ok, 'cannot afford a second');
  assert.ok(available(stove, s, 'autumn', []));
  const placed: Placed[] = [{ uid: 'a', item: 'stove', x: 4, y: 5, rot: 0, placedBy: 'T' }];
  assert.ok(!available(stove, s, 'autumn', placed), 'the one you own is placed');
  assert.ok(available(stove, s, 'autumn', placed, 'a'), 'moving the placed one is allowed');
  assert.ok(available(stove, s, 'autumn', []), 'removed → back in storage');
  for (const d of SHOP_FURNITURE()) assert.ok(hasArt(d.id), `${d.id} has art`);
  assert.equal(sanitizeSave({}).furniture, undefined, 'older saves are unchanged');
  assert.deepEqual(sanitizeSave({ furniture: { stove: 2 }, recipes: ['a', 'a'] }).recipes, ['a']);
});

test('lights: toggling persists per piece; old saves round-trip unchanged', () => {
  const h = sanitizeHome({ placed: [{ uid: 'l', item: 'lamp', x: 1, y: 2, rot: 0, placedBy: 'T' }], wallpaper: 'plum' });
  const off = toggleLight(h, 'l');
  assert.deepEqual(sanitizeHome(JSON.parse(JSON.stringify(off))).lightsOff, ['l']);
  assert.deepEqual(toggleLight(off, 'l').lightsOff, []);
  assert.equal('lightsOff' in h, false);
});

test('all regions incl. the new districts and interiors: every spot reachable; arrivals land on free ground', () => {
  const worldOf = (t: ReturnType<typeof regionDef>) => ({ bounds: regionBounds(t), solids: [...groundSolids(t), ...t.props.filter((p) => !p.when).map(regionPropCollider).filter((r): r is NonNullable<typeof r> => !!r)] });
  for (const id of EXPLORE_REGIONS) {
    const d = regionDef(id);
    const props = d.props.filter((p) => !p.when).map(regionPropCollider).filter((r): r is NonNullable<typeof r> => !!r);
    const world = worldOf(d);
    assert.ok(!collides(d.spawn, world), `${id} spawn`);
    const reach = reachableTiles(d, d.spawn, props);
    for (const s of d.spots) {
      const f = findFreeSpot(s.point, world);
      assert.ok(Math.hypot(f.x - s.point.x, f.y - s.point.y) <= s.radius, `${id}/${s.id} standable`);
      assert.ok(reach.has(Math.floor(f.y / RTILE) * d.cols + Math.floor(f.x / RTILE)), `${id}/${s.id} reachable`);
      if (s.to && s.to.region !== 'town') assert.ok(!collides({ x: s.to.x, y: s.to.y }, worldOf(regionDef(s.to.region))), `${id}/${s.id} arrival is free`);
    }
  }
});

test('Old Town mystery: library → Sky → rooftop key → wind the clock; rewards once', () => {
  assert.deepEqual(validateQuests(QUESTS), []);
  let s = addFlags(emptyAdventure(), ['region:city']).state;
  const go = (ev: Parameters<typeof dispatch>[2]) => { const r = dispatch(QUESTS, s, ev, 1); s = r.state; return r; };
  go({ type: 'talk', npc: 'velvet' });
  go({ type: 'use', spot: 'library-ledger' });
  go({ type: 'talk', npc: 'sky' });
  s = giveKeyItem(s, 'clock-key', 1);
  go({ type: 'collect', item: 'clock-key', spot: 'roof-key' });
  assert.ok(viewOf(s).onStep('clock-hour', 3));
  const wind = buildOldTown().spots.find((x) => x.id === 'old-wind-clock')!;
  assert.ok(wind.when!(viewOf(s)), 'the wind spot appears once you hold the key');
  s = addFlags(s, ['clock-fixed']).state;
  const r = go({ type: 'flag', flag: 'clock-fixed' });
  assert.equal(s.quests['clock-hour'].status, 'done');
  assert.ok(r.grants.some((g) => g.kind === 'tokens'));
  assert.equal(dispatch(QUESTS, s, { type: 'flag', flag: 'clock-fixed' }, 2).grants.length, 0);
});

test('residents keep routines and always have a place; the scarf only appears during its quest', () => {
  const park = buildCityPark();
  for (const n of [...cityNpcs(), ...park.npcs]) for (const phase of ['morning', 'afternoon', 'evening', 'night']) for (const rain of [true, false]) {
    if (n.schedule) { const at = n.schedule({ phase, rain }); assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y)); }
  }
  const scarf = park.spots.find((x) => x.id === 'park-scarf')!;
  assert.ok(!scarf.when!(viewOf(emptyAdventure())));
});
