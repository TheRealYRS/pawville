import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore, memoryStorage, MAX_RECORD_BYTES } from '../src/pawville/persistence.ts';
import { COATS, COAT_INFO, appearanceStore, sanitizeAppearance } from '../src/pawville/appearance.ts';
import {
  addItem, bumpDailyCount, claimDaily, dailyAvailable, dailyCount, emptySave, recordMemory, sanitizeSave, takeItem, unlock, worldSaveStore,
} from '../src/pawville/worldSave.ts';
import { demoPairStore, pairCacheStore } from '../src/pawville/couple/pairModel.ts';

test('store: defaults, round trip, corrupted JSON and missing storage never crash', () => {
  const s = memoryStorage();
  const store = createStore({ key: 'x', version: 1, defaults: () => ({ n: 1 }), sanitize: (r) => ({ n: typeof (r as { n?: unknown })?.n === 'number' ? (r as { n: number }).n : 1 }) }, s);
  assert.deepEqual(store.load(), { n: 1 });
  store.save({ n: 5 });
  assert.deepEqual(store.load(), { n: 5 });
  s.setItem('pawville:x', '{not json');
  assert.deepEqual(store.load(), { n: 1 });
  const none = createStore({ key: 'y', version: 1, defaults: () => 7, sanitize: () => 7 }, null);
  assert.equal(none.load(), 7);
  assert.equal(none.save(8), false);
});

test('store: version migration runs for older data', () => {
  const s = memoryStorage();
  s.setItem('pawville:m', JSON.stringify({ v: 1, data: { name: 'old' } }));
  const store = createStore({
    key: 'm', version: 2, defaults: () => ({ title: '' }),
    sanitize: (r) => ({ title: String((r as { title?: string })?.title ?? '') }),
    migrate: (v, raw) => (v < 2 ? { title: (raw as { name: string }).name } : raw),
  }, s);
  assert.deepEqual(store.load(), { title: 'old' });
});

test('store refuses oversize records (nothing unbounded in localStorage)', () => {
  const store = createStore({ key: 'big', version: 1, defaults: () => '', sanitize: (r) => String(r) }, memoryStorage());
  assert.equal(store.save('x'.repeat(MAX_RECORD_BYTES + 10)), false);
});

test('appearance: 8 coats incl. the originals, legacy Milestone 2 key migrates, invalid values repaired', () => {
  assert.equal(COATS.length, 8);
  assert.equal(COAT_INFO.tangerine.svg.fur, '#FF8A35');
  assert.equal(COAT_INFO.midnight.svg.fur, '#252031');
  for (const c of COATS) assert.equal(Object.keys(COAT_INFO[c].pixel).length, 12);
  const s = memoryStorage();
  s.setItem('pawville:cat', 'M');
  assert.equal(appearanceStore(s).load().coat, 'midnight');
  assert.deepEqual(sanitizeAppearance({ coat: 'neon', extra: 'jetpack' }, 'M'), { coat: 'midnight', extra: 'none' });
});

test('world save: hostile/partial data is repaired; inventory, dailies, memories, achievements', () => {
  const repaired = sanitizeSave({ inventory: { apple: -3, shell: 2, laser: 9 }, memories: [{ kind: 'nope', at: 'x' }], garden: { plots: [{ seed: 'cactus', growth: 99 }] } });
  assert.deepEqual(repaired.inventory, { shell: 2 });
  assert.equal(repaired.garden.plots.length, 6);
  assert.equal(repaired.garden.plots[0]!.growth, 3);
  assert.equal(repaired.memories[0].kind, 'photo');
  let save = addItem(emptySave(), 'apple', 2);
  assert.equal(takeItem(save, 'apple', 3), null);
  save = takeItem(save, 'apple', 1)!;
  assert.equal(save.inventory.apple, 1);
  assert.equal(dailyAvailable(save, 'coin', '2026-10-24'), true);
  save = claimDaily(save, 'coin', '2026-10-24');
  assert.equal(dailyAvailable(save, 'coin', '2026-10-24'), false);
  assert.equal(dailyAvailable(save, 'coin', '2026-10-25'), true, 'missing a day never punishes');
  save = bumpDailyCount(bumpDailyCount(save, 'vending', '2026-10-24'), 'vending', '2026-10-24');
  assert.equal(dailyCount(save, 'vending', '2026-10-24'), 2);
  save = recordMemory(save, { kind: 'picnic', title: 'Picnic', detail: '', at: 1, place: 'Meadow', withPartner: false });
  assert.equal(save.memories.length, 1);
  const u1 = unlock(save, 'picnic-pals', 5);
  assert.equal(u1.isNew, true);
  assert.equal(unlock(u1.save, 'picnic-pals', 6).isNew, false);
  const st = worldSaveStore(memoryStorage());
  st.save(save);
  assert.equal(st.load().memories[0].title, 'Picnic');
});

test('shared vs personal: pair cache (local pointer) and demo pairs (per tab) are separate stores', () => {
  const local = memoryStorage();
  const session = memoryStorage();
  pairCacheStore(local).save({ pairId: 'abcdef-123', source: 'backend', myRole: 'M', partnerName: 'Mo', partnerJoined: true });
  assert.equal(demoPairStore(session).load(), null);
  assert.equal(pairCacheStore(local).load()?.myRole, 'M');
  pairCacheStore(local).reset();
  assert.equal(pairCacheStore(local).load(), null, 'resetting the local cache does not touch any server');
});
