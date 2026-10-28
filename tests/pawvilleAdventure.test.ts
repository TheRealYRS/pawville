import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS } from '../src/pawville/adventure/content.ts';
import { dispatch, validateQuests } from '../src/pawville/adventure/engine.ts';
import { emptyAdventure, addFlags, sanitizeAdventure, type AdventureState } from '../src/pawville/adventure/state.ts';
import { mergeShared, parseSharedFlags } from '../src/pawville/adventure/sync.ts';
import { lensSolved, constellationSolved, LUMI_SOLUTION, platesPressed } from '../src/pawville/adventure/puzzles.ts';
import { regionDef, EXPLORE_REGIONS } from '../src/pawville/adventure/regions.ts';
import { groundSolids, regionPropCollider, regionBounds, reachableTiles, RTILE } from '../src/pawville/adventure/regionKit.ts';
import { collides, findFreeSpot } from '../src/pawville/world/movement.ts';
import { canPerform, signatureFor } from '../src/pawville/couple/emotes.ts';
import { sanitizeSnapshot } from '../src/pawville/net/presenceProtocol.ts';

test('quest content is valid', () => assert.deepEqual(validateQuests(QUESTS), []));

test('harbor quest runs end to end, rewards once, and unlocks the harbor', () => {
  let s = emptyAdventure();
  const go = (ev: Parameters<typeof dispatch>[2]) => { const r = dispatch(QUESTS, s, ev, 1); s = r.state; return r; };
  go({ type: 'talk', npc: 'mabel' });
  assert.equal(s.quests['lost-chart'].status, 'active');
  go({ type: 'talk', npc: 'marlow' });
  for (const i of [0, 1, 2]) go({ type: 'collect', item: 'chart-piece', spot: `chart-${i}` });
  go({ type: 'collect', item: 'chart-piece', spot: 'chart-0' });
  go({ type: 'talk', npc: 'marlow' });
  for (const i of [0, 1, 2]) go({ type: 'collect', item: 'driftwood', spot: `driftwood-${i}` });
  go({ type: 'use', spot: 'toolbox' });
  s = addFlags(s, ['pier-repaired']).state;
  const r = go({ type: 'flag', flag: 'pier-repaired' });
  assert.equal(s.quests['lost-chart'].status, 'done');
  assert.ok(s.flags.includes('region:harbor'));
  assert.ok(r.grants.some((g) => g.kind === 'memory'));
  assert.equal(dispatch(QUESTS, s, { type: 'flag', flag: 'pier-repaired' }, 2).grants.length, 0, 'no duplicate rewards');
  assert.equal(s.quests['lighthouse-mystery'].status, 'active', 'follow-up quest starts');
});

test('a flag shared by the partner completes a waiting objective (no soft-lock)', () => {
  let s: AdventureState = { ...emptyAdventure(), quests: { 'lost-star': { status: 'active' as const, step: 4, count: 0, hits: [], startedAt: 0 } } };
  s = addFlags(s, ['crystal-door-open']).state;
  s = dispatch(QUESTS, s, { type: 'flag', flag: '__settle__' }, 1).state;
  assert.equal(s.quests['lost-star'].step, 5);
});

test('shared flags: whitelist only, union merge, idempotent; saves sanitised', () => {
  assert.deepEqual(parseSharedFlags(['region:harbor', 'evil', 42, 'harbor-restored']), ['region:harbor', 'harbor-restored']);
  const a = mergeShared(emptyAdventure(), ['region:harbor']).state;
  assert.equal(mergeShared(a, ['region:harbor']).added.length, 0);
  assert.deepEqual(sanitizeAdventure(JSON.parse(JSON.stringify(a))).flags, a.flags);
  assert.deepEqual(sanitizeAdventure('garbage').flags, []);
});

test('puzzles', () => {
  assert.ok(lensSolved([2, 1, 0]));
  assert.ok(!lensSolved([0, 1, 2]));
  assert.ok(constellationSolved([...LUMI_SOLUTION].reverse()));
  assert.deepEqual(platesPressed([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }], [{ x: 2, y: 0 }], new Set(['b'])), { a: true, b: true });
});

test('every region spot is standable and reachable from the spawn', () => {
  for (const id of EXPLORE_REGIONS) {
    const d = regionDef(id);
    const props = d.props.map(regionPropCollider).filter((r): r is NonNullable<typeof r> => !!r);
    const world = { bounds: regionBounds(d), solids: [...groundSolids(d), ...props] };
    assert.ok(!collides(d.spawn, world), `${id} spawn free`);
    const reach = reachableTiles(d, d.spawn, props);
    for (const s of d.spots) {
      const f = findFreeSpot(s.point, world);
      assert.ok(Math.hypot(f.x - s.point.x, f.y - s.point.y) <= s.radius, `${id}/${s.id} standable`);
      assert.ok(reach.has(Math.floor(f.y / RTILE) * d.cols + Math.floor(f.x / RTILE)), `${id}/${s.id} reachable`);
    }
  }
});

test('signature emotes are exclusive; region travels in presence v4', () => {
  assert.equal(signatureFor('racon')?.id, 'racon-fence-dance');
  assert.ok(canPerform('racon-fence-dance', 'racon'));
  assert.ok(!canPerform('racon-fence-dance', 'mini'));
  const spoof = sanitizeSnapshot({ v: 4, id: 'cat_abcdef12', x: 1, y: 1, name: 'Racon', coat: 'tangerine', emote: 'racon-fence-dance', region: 'harbor' }, { w: 1024, h: 1024 })!;
  assert.notEqual(spoof.emote, 'racon-fence-dance');
  assert.equal(spoof.region, 'harbor');
  assert.equal(sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1 }, { w: 1024, h: 1024 })!.region, 'town');
});
