import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchAppPath, screenKey } from '../src/pawville/routes.ts';
import { renderCatFrame, spriteMapsAreValid } from '../src/pawville/render/catSprites.ts';
import { COATS } from '../src/pawville/appearance.ts';

test('routes: one table from the URL; every screen has its own mount key', () => {
  assert.deepEqual(matchAppPath('/'), { name: 'town' });
  assert.deepEqual(matchAppPath('/arcade'), { name: 'arcade' });
  assert.deepEqual(matchAppPath('/home'), { name: 'home' });
  assert.deepEqual(matchAppPath('/scrapbook'), { name: 'scrapbook' });
  assert.deepEqual(matchAppPath('/pair/abc234'), { name: 'pair', code: 'ABC234' });
  assert.deepEqual(matchAppPath('/room/AbCd'), { name: 'room', id: 'AbCd' });
  assert.deepEqual(matchAppPath('/room/%E0%A4%A'), { name: 'notfound' }, 'malformed escapes do not crash');
  for (const id of ['pawtype', 'cat-boxing', 'memory-paws', 'puzzle-garden', 'whack-a-cat', 'paw-snap']) {
    assert.deepEqual(matchAppPath(`/games/${id}`), { name: 'game', id });
  }
  // Milestone 7: Cat Battleship was retired from the playable catalogue.
  assert.deepEqual(matchAppPath('/games/cat-battleship'), { name: 'notfound' });
  const keys = ['/', '/arcade', '/play/computer', '/play/local', '/room/a', '/room/b', '/home', '/scrapbook', '/games/pawtype', '/games/cat-boxing'].map((p) => screenKey(matchAppPath(p)));
  assert.equal(new Set(keys).size, keys.length);
});

test('sprites: maps valid; every coat × pose × facing renders', () => {
  assert.ok(spriteMapsAreValid());
  let calls = 0;
  const ctx = { fillStyle: '', imageSmoothingEnabled: true, fillRect: () => { calls++; } } as unknown as CanvasRenderingContext2D;
  const factory = (width: number, height: number) => ({ width, height, getContext: () => ctx });
  for (const coat of COATS) for (const pose of ['stand', 'sit', 'loaf'] as const) for (const facing of ['down', 'up', 'left', 'right'] as const) {
    renderCatFrame(factory, { coat, accessory: 'wizard', extra: 'glasses', facing, frame: 1, moving: pose === 'stand', pose });
  }
  assert.ok(calls > 5000);
});
