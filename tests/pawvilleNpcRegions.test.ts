/**
 * The formerly empty regions (harbor, forest, highlands, cave, isles, library, Purring Cup) now have residents:
 * who lives where, that they stand on real walkable ground, never block an arrival point or a talk spot, talk in a
 * voice that fits them, and that the forest's quest guide is not mistaken for the town resident of the same name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionDef, resetRegionCacheForTests, townSpots } from '../src/pawville/adventure/regions.ts';
import { REGION_IDS } from '../src/pawville/adventure/state.ts';
import { RTILE } from '../src/pawville/adventure/regionKit.ts';
import { VOICE_TRAITS, findPath, makeLivingWorld, residentDialogue, safeSpot, tickLiving } from '../src/pawville/living/engine.ts';
import { NEW_RESIDENTS, residentFor, type Resident } from '../src/pawville/living/roster.ts';
import { COAT_INFO, EXTRAS } from '../src/pawville/appearance.ts';
import { dialogueFor, npcName } from '../src/pawville/adventure/dialogue.ts';
import { emptyAdventure, viewOf } from '../src/pawville/adventure/state.ts';

const WAS_EMPTY = ['harbor', 'forest', 'highlands', 'cave', 'isles', 'library', 'purring-cup'] as const;
const by = (r: string) => NEW_RESIDENTS.filter((p) => p.region === r);

test('every formerly empty region now has residents, and the harbor and the frosty highlands have a small community', () => {
  for (const r of WAS_EMPTY) assert.ok(by(r).length >= 2, `${r} has at least two residents`);
  assert.ok(by('harbor').length >= 4, 'the harbor');
  assert.ok(by('highlands').length >= 4, 'Frostbell');
  assert.equal(WAS_EMPTY.reduce((n, r) => n + by(r).length, 0), 20);
});

test('ids are unique across the whole game: no resident shares an id with a quest NPC in the same region', () => {
  resetRegionCacheForTests();
  assert.equal(new Set(NEW_RESIDENTS.map((p) => p.id)).size, NEW_RESIDENTS.length);
  for (const r of WAS_EMPTY) {
    const def = regionDef(r);
    for (const p of by(r)) {
      assert.equal(def.npcs.filter((n) => n.id === p.id).length, 1, `${p.id} appears once in ${r}`);
      assert.equal(def.spots.filter((s) => s.npc === p.id).length, 1, `${p.id} has exactly one talk spot`);
    }
  }
  // the 20 new ids are also unique against every id that already existed before them
  const before = new Set(NEW_RESIDENTS.slice(0, 24).map((p) => p.id));
  for (const p of NEW_RESIDENTS.slice(24)) assert.ok(!before.has(p.id), `${p.id} is new`);
  resetRegionCacheForTests();
});

test('residentFor is scoped to a region: the forest guide Bramble is not the town resident Bramble', () => {
  assert.ok(residentFor('bramble', 'town'), 'the town resident');
  assert.equal(residentFor('bramble', 'forest'), undefined, 'the forest NPC is a quest guide, not a resident');
  assert.equal(residentFor('dory', 'harbor')?.name, 'Dory');
  assert.equal(residentFor('dory', 'forest'), undefined, 'and nobody is found in the wrong region');
  assert.equal(residentFor('nobody', 'harbor'), undefined);
  // and the forest guide really has her own dialogue, which the resident lookup used to hide
  const v = viewOf(emptyAdventure(), 'forest' as never);
  const lines = dialogueFor('bramble', v, 'forest');
  assert.ok(lines.lines.length > 0);
  assert.equal(npcName('bramble'), 'Bramble');
});

test('residents stand on walkable ground, their two landmarks connect, and you can walk to them from where you arrive', () => {
  resetRegionCacheForTests();
  for (const r of WAS_EMPTY) {
    const def = regionDef(r);
    const world = makeLivingWorld(def, by(r));
    const home = safeSpot(def, world.solids, def.spawn);
    for (const p of by(r)) {
      const a = safeSpot(def, world.solids, p.stops[0]), b = safeSpot(def, world.solids, p.stops[1]);
      for (let i = 0; i < 2; i++) {
        const s = [a, b][i];
        assert.ok(Math.hypot(s.x - p.stops[i].x, s.y - p.stops[i].y) < 0.5, `${p.id} stop ${i} is already on walkable ground (no silent shifting)`);
        assert.ok(s.x > RTILE && s.y > RTILE && s.x < def.cols * RTILE - RTILE && s.y < def.rows * RTILE - RTILE, `${p.id} stop ${i} is inside the region`);
      }
      assert.ok(findPath(def, world.solids, a, b).length > 0 && findPath(def, world.solids, b, a).length > 0, `${r}/${p.id}: the two landmarks connect both ways`);
      assert.ok(findPath(def, world.solids, home, a).length > 0, `${r}/${p.id}: reachable from the arrival point`);
    }
  }
  resetRegionCacheForTests();
});

test('nobody stands on top of a talk spot, a quest NPC, a door or an arrival point', () => {
  resetRegionCacheForTests();
  const arrivals: Record<string, { x: number; y: number; from: string }[]> = {};
  for (const id of REGION_IDS) {
    if (id === 'town') continue;
    for (const s of regionDef(id as Exclude<typeof id, 'town'>).spots) if (s.to) (arrivals[s.to.region] ??= []).push({ x: s.to.x, y: s.to.y, from: `${id}:${s.id}` });
  }
  for (const s of townSpots()) if (s.to) (arrivals[s.to.region] ??= []).push({ x: s.to.x, y: s.to.y, from: `town:${s.id}` });
  for (const r of WAS_EMPTY) {
    const def = regionDef(r);
    const people = by(r);
    const fixed = [
      ...def.spots.filter((s) => s.role !== 'npc').map((s) => ({ n: s.id, ...s.point, min: 16 })),
      ...def.npcs.filter((n) => !people.some((p) => p.id === n.id)).map((n) => ({ n: `npc:${n.id}`, x: n.x, y: n.y, min: 28 })),
      { n: 'spawn', ...def.spawn, min: 32 },
      ...(arrivals[r] ?? []).map((a) => ({ n: `arrival ${a.from}`, x: a.x, y: a.y, min: 32 })),
    ];
    for (const p of people) for (const s of p.stops) for (const f of fixed) {
      assert.ok(Math.hypot(s.x - f.x, s.y - f.y) >= f.min, `${r}/${p.id} is too close to ${f.n}`);
    }
    // and not on top of each other
    for (const p of people) for (const q of people) if (p.id < q.id) for (const a of p.stops) for (const b of q.stops) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 24, `${p.id} / ${q.id} share a landmark`);
  }
  resetRegionCacheForTests();
});

test('they really walk: every resident moves between their landmarks over a few minutes, smoothly and without leaving the ground', () => {
  resetRegionCacheForTests();
  for (const r of WAS_EMPTY) {
    const def = regionDef(r);
    const people = by(r);
    const world = makeLivingWorld(def, people);
    const seen = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
    let worstJump = 0;
    const last = new Map(people.map((p) => [p.id, { x: world.states.get(p.id)!.x, y: world.states.get(p.id)!.y }]));
    for (let t = 0; t < 240_000; t += 180) {
      tickLiving(world, 180, t, { x: -999, y: -999 });
      for (const p of people) {
        const s = world.states.get(p.id)!;
        const l = last.get(p.id)!;
        worstJump = Math.max(worstJump, Math.hypot(s.x - l.x, s.y - l.y));
        last.set(p.id, { x: s.x, y: s.y });
        assert.ok(!world.solids.some((q) => s.x >= q.x - 1 && s.x < q.x + q.w + 1 && s.y >= q.y && s.y < q.y + q.h), `${r}/${p.id} walked into scenery at ${Math.round(s.x)},${Math.round(s.y)}`);
        const m = seen.get(p.id) ?? { minX: s.x, maxX: s.x, minY: s.y, maxY: s.y };
        seen.set(p.id, { minX: Math.min(m.minX, s.x), maxX: Math.max(m.maxX, s.x), minY: Math.min(m.minY, s.y), maxY: Math.max(m.maxY, s.y) });
      }
    }
    assert.ok(worstJump < 8, `${r}: nobody teleports (worst step ${worstJump.toFixed(1)} px)`);
    for (const p of people) {
      const m = seen.get(p.id)!;
      const span = Math.hypot(m.maxX - m.minX, m.maxY - m.minY);
      const want = Math.hypot(p.stops[0].x - p.stops[1].x, p.stops[0].y - p.stops[1].y);
      assert.ok(span > want * 0.6, `${r}/${p.id} actually travels between their landmarks (covered ${span.toFixed(0)} of ${want.toFixed(0)} px)`);
    }
  }
  resetRegionCacheForTests();
});

test('every new resident is a distinct character with a voice that fits, and what they say changes with the weather and the time', () => {
  const fresh = NEW_RESIDENTS.slice(24) as Resident[];
  assert.equal(fresh.length, 20);
  for (const p of fresh) {
    assert.ok(COAT_INFO[p.coat], `${p.id}: a real coat`);
    assert.ok((EXTRAS as readonly string[]).includes(p.extra), `${p.id}: a real accessory`);
    assert.ok(VOICE_TRAITS.includes(p.trait), `${p.id}: trait "${p.trait}" has its own voice (not the generic fallback)`);
    assert.ok(p.job.length > 3 && p.name.length > 2);
    assert.ok(p.lines.every((l) => l.length > 15 && l.length < 140), `${p.id}: lines are a sensible length`);
    assert.ok(NEW_RESIDENTS.some((q) => q.id === p.friend), `${p.id}: their friend exists`);
    const day = residentDialogue(p, 'day', false), night = residentDialogue(p, 'night', false), rain = residentDialogue(p, 'day', true);
    assert.notDeepEqual(day, night, `${p.id}: night differs`);
    assert.notDeepEqual(day, rain, `${p.id}: rain differs`);
    assert.ok(day.length === 5 && day.every((l) => l.length > 3));
    assert.ok(day.join(' ').includes(p.lines[0]), 'and their own words are in it');
  }
  for (const t of ['weathered', 'hardy', 'woodsy', 'dreamy']) assert.ok(VOICE_TRAITS.includes(t), `new voice ${t}`);
  // two residents of the same trait don't sound identical (their own lines and friend differ)
  assert.notDeepEqual(residentDialogue(residentFor('dory', 'harbor')!, 'day', false), residentDialogue(residentFor('latte', 'purring-cup')!, 'day', false));
});

test('the content fits the place: each region\'s residents talk about their own surroundings', () => {
  const text = (r: string) => by(r).flatMap((p) => [...p.lines, p.job]).join(' ').toLowerCase();
  assert.match(text('harbor'), /boat|net|tide|shell|lighthouse|sea/);
  assert.match(text('highlands'), /sled|cocoa|aurora|frost|lake/);
  assert.match(text('forest'), /mushroom|fern|tree|forest|trail/);
  assert.match(text('cave'), /crystal|echo|cave/);
  assert.match(text('isles'), /star|bridge|pond/);
  assert.match(text('library'), /book|shelf|read|librarian/);
  assert.match(text('purring-cup'), /milk|karaoke|window|cup|barista/);
  // nobody spoils a quest: no resident talks about solving a puzzle or a hidden secret
  for (const p of NEW_RESIDENTS.slice(24)) assert.doesNotMatch(p.lines.join(' '), /solution|the answer|secret passage|moonstone|pressure plate/i, `${p.id} spoils nothing`);
});

test('the Purring Cup and the Old Library are no longer empty rooms, and Frostbell has more than just Juniper', () => {
  resetRegionCacheForTests();
  assert.ok(regionDef('purring-cup').npcs.length >= 3);
  assert.ok(regionDef('library').npcs.length >= 2);
  assert.ok(regionDef('highlands').npcs.length >= 5, 'Juniper + four residents');
  assert.ok(regionDef('harbor').npcs.length >= 7, 'Marlow, Finn, Coral + four residents');
  resetRegionCacheForTests();
});

// ---- the engine fixes found while building this (they also un-froze two EXISTING residents) -------------------------
import { RG, groundBuilder, type RegionDef } from '../src/pawville/adventure/regionKit.ts';
import { makeTownLiving } from '../src/pawville/living/town.ts';

function field(props: RegionDef['props'] = []): RegionDef {
  const b = groundBuilder(12, 8, RG.Grass);
  return { id: 'harbor', name: 'Test field', cols: 12, rows: 8, ground: b.g, props, spots: [], npcs: [], gates: [], spawn: { x: 40, y: 40 }, areas: [], climate: {} };
}
const person = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Resident => ({
  id, name: id, region: 'harbor', coat: 'cloud', extra: 'none', trait: 'relaxed', job: 'tester', friend: id, idle: 'sit', stops: [a, b], lines: ['one', 'two', 'three'],
});

test('a prop standing BETWEEN two open tiles is walked around, not into (a crystal used to freeze Echo mid-stride)', () => {
  // two open tiles with a crystal exactly on the straight line between their centres
  const def = field([{ kind: 'crystal', x: 56, y: 48 }]);
  const p = person('walker', { x: 56, y: 40 }, { x: 56, y: 72 });
  const w = makeLivingWorld(def, [p]);
  const a = safeSpot(def, w.solids, p.stops[0]), b = safeSpot(def, w.solids, p.stops[1]);
  const path = findPath(def, w.solids, a, b);
  assert.ok(path.length > 2, 'a route exists, and it is not the straight line through the crystal');
  assert.ok(path.some((n) => Math.abs(n.x - 56) >= 12), 'it steps sideways around the prop');
  const seen = { minY: 1e9, maxY: -1e9 };
  for (let t = 0; t < 120_000; t += 180) { tickLiving(w, 180, t, { x: -999, y: -999 }); const s = w.states.get('walker')!; seen.minY = Math.min(seen.minY, s.y); seen.maxY = Math.max(seen.maxY, s.y); }
  assert.ok(seen.maxY - seen.minY > 24, `the resident actually gets across (${(seen.maxY - seen.minY).toFixed(0)} px of travel)`);
});

test('landmarks are always the centre of a walkable tile, even when written on the corner of a counter or inside scenery', () => {
  const def = field([{ kind: 'lamp', x: 100, y: 60 }, { kind: 'crate', x: 72, y: 72 }]);
  const w = makeLivingWorld(def, []);
  for (const raw of [{ x: 100, y: 60 }, { x: 73, y: 70 }, { x: 99, y: 59 }, { x: 5, y: 5 }, { x: 999, y: 999 }]) {
    const s = safeSpot(def, w.solids, raw);
    assert.equal((s.x - 8) % RTILE, 0, `x is a tile centre (${s.x})`);
    assert.equal((s.y - 8) % RTILE, 0, `y is a tile centre (${s.y})`);
    assert.ok(!w.solids.some((q) => s.x >= q.x - 4 && s.x < q.x + q.w + 4 && s.y >= q.y - 3 && s.y < q.y + q.h + 3), 'and it is walkable');
  }
});

test('a resident in a one-tile corridor with somebody standing in it idles patiently, then carries on once they leave — never frozen mid-stride', () => {
  const b = groundBuilder(12, 5, RG.Grass);
  b.rect(0, 0, 11, 1, RG.Rock); b.rect(0, 3, 11, 4, RG.Rock); // only row 2 (y = 40) is open
  const def: RegionDef = { ...field(), rows: 5, ground: b.g };
  const p = person('commuter', { x: 24, y: 40 }, { x: 168, y: 40 });
  const w = makeLivingWorld(def, [p]);
  const acts = new Set<string>();
  let reachedFar = false;
  for (let t = 0; t < 140_000; t += 180) {
    const parked = t < 50_000 ? { x: 96, y: 40 } : { x: -999, y: -999 }; // somebody stands in the corridor for 50 s, then leaves
    tickLiving(w, 180, t, parked);
    const s = w.states.get('commuter')!;
    if (t < 50_000) acts.add(s.activity);
    if (t >= 50_000 && s.x > 150) reachedFar = true;
    assert.ok(s.x >= 9 && s.x <= 183, 'never leaves the corridor');
  }
  assert.ok(acts.has('Looking around'), `while blocked they idle instead of walking into the person (saw: ${[...acts].join(', ')})`);
  assert.ok(reachedFar, 'and once the way is clear they finish the trip');
});

test('nobody in the whole game stays frozen: every resident (old and new, town to café) travels between their landmarks over five minutes', () => {
  resetRegionCacheForTests();
  const regions = [...new Set(NEW_RESIDENTS.map((p) => p.region))];
  const frozen: string[] = [];
  for (const r of regions) {
    const w = r === 'town' ? makeTownLiving() : makeLivingWorld(regionDef(r), by(r));
    const box = new Map<string, number[]>();
    for (let t = 0; t < 300_000; t += 180) {
      tickLiving(w, 180, t, { x: -999, y: -999 });
      for (const p of w.residents) {
        const s = w.states.get(p.id)!;
        const m = box.get(p.id) ?? [s.x, s.x, s.y, s.y];
        box.set(p.id, [Math.min(m[0], s.x), Math.max(m[1], s.x), Math.min(m[2], s.y), Math.max(m[3], s.y)]);
      }
    }
    for (const p of w.residents) {
      const m = box.get(p.id)!;
      const span = Math.hypot(m[1] - m[0], m[3] - m[2]);
      if (span < 12) frozen.push(`${r}/${p.id} (${span.toFixed(0)} px)`);
    }
  }
  assert.deepEqual(frozen, [], `frozen residents: ${frozen.join(', ')}`);
  resetRegionCacheForTests();
});
