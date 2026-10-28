import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DECOR, DEFAULT_HOME, ROOM_W, WALL_ROWS, available, HOME_IS_SHARED, canEdit, checkPlace, footprint, homeStore, sanitizeHome, type Placed } from '../src/pawville/home/decor.ts';
import { NOTE_MAX, cleanNote, localMailStore, validateMail } from '../src/pawville/home/mailbox.ts';
import { photosToPrune } from '../src/pawville/memories/photoStore.ts';
import { memoryStorage } from '../src/pawville/persistence.ts';
import { addItem, emptySave } from '../src/pawville/worldSave.ts';

test('decor placement: bounds, wall vs floor, overlap, rugs under furniture, rotation', () => {
  const room: Placed[] = [{ uid: 'a', item: 'sofa', x: 2, y: 3, rot: 0, placedBy: 'T' }];
  assert.equal(checkPlace(room, { uid: 'b', item: 'table', x: 3, y: 3, rot: 0 }), 'blocked');
  assert.equal(checkPlace(room, { uid: 'b', item: 'rug-long', x: 2, y: 3, rot: 0 }), 'ok', 'rugs go under furniture');
  assert.equal(checkPlace(room, { uid: 'b', item: 'window', x: 0, y: 3, rot: 0 }), 'wall-only');
  assert.equal(checkPlace(room, { uid: 'b', item: 'plant', x: 0, y: 0, rot: 0 }), 'floor-only');
  assert.equal(checkPlace(room, { uid: 'b', item: 'sofa', x: ROOM_W - 2, y: 5, rot: 0 }), 'out-of-room');
  assert.deepEqual(footprint({ item: 'sofa', x: 1, y: 2, rot: 90 }), { x: 1, y: 2, w: 1, h: 3 });
  assert.equal(checkPlace(room, { uid: 'a', item: 'sofa', x: 2, y: 3, rot: 0 }), 'ok', 'a piece never blocks itself (moving)');
  assert.ok(WALL_ROWS === 2);
});

test('decor ownership and unlocks', () => {
  const p: Placed = { uid: 'x', item: 'plant', x: 1, y: 2, rot: 0, placedBy: 'M' };
  assert.equal(canEdit(p, 'M'), true);
  assert.equal(canEdit(p, 'T'), !HOME_IS_SHARED, 'the layout is per device, so nobody is locked out of a piece (locks only apply to a shared layout)');
  const plush = DECOR.find((d) => d.id === 'plush-midnight')!;
  assert.equal(available(plush, emptySave(), 'autumn'), false);
  assert.equal(available(plush, addItem(emptySave(), 'plush-midnight'), 'autumn'), true);
  const pumpkin = DECOR.find((d) => d.id === 'pumpkin')!;
  assert.equal(available(pumpkin, emptySave(), 'autumn'), true);
  assert.equal(available(pumpkin, emptySave(), 'spring'), false);
});

test('home persistence: default room, invalid pieces dropped, save/load', () => {
  assert.equal(sanitizeHome(undefined).placed.length, DEFAULT_HOME.placed.length);
  const bad = sanitizeHome({ placed: [{ item: 'sofa', x: 2, y: 3 }, { item: 'table', x: 3, y: 3 }, { item: 'jacuzzi', x: 0, y: 5 }] });
  assert.equal(bad.placed.filter((p) => p.item === 'table').length, 0, 'overlapping piece dropped');
  const s = memoryStorage();
  const st = homeStore(s);
  st.save({ wallpaper: 'mint', placed: [] });
  assert.equal(st.load().wallpaper, 'mint');
});

test('mail: notes are cleaned and limited; gifts must be giftable', () => {
  assert.equal(cleanNote('  hi\u0000 there\n\n you  '), 'hi there you');
  assert.equal(cleanNote('x'.repeat(500)).length, NOTE_MAX);
  assert.match(validateMail('note', '   ', null)!, /few words/);
  assert.match(validateMail('gift', '', 'diamond')!, /Pick something/);
  assert.equal(validateMail('gift', '', 'bouquet'), null);
  const s = memoryStorage();
  localMailStore(s).save([{ id: 'a', kind: 'note', body: 'hello', gift: null, fromMe: true, at: 1, openedAt: null }]);
  assert.equal(localMailStore(s).load()[0].body, 'hello');
});

test('photos: album stays bounded, favourites kept', () => {
  const list = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, createdAt: i, favorite: i < 3 }));
  const drop = photosToPrune(list, 60);
  assert.equal(drop.length, 10);
  assert.ok(!drop.some((id) => ['p0', 'p1', 'p2'].includes(id)), 'favourites are never pruned');
  assert.ok(drop.includes('p3'), 'oldest non-favourites go first');
});
