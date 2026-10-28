/**
 * Eye alignment (Gate D). The night-time eye light and the glowing-eye emote are drawn as an overlay on top of the cat
 * sprite. They used to assume the body bob was 0 (standing) or 2 (sitting) and ignored the head tilt, so while a cat
 * WALKED or RAN the light stayed put while the face bounced under it ("the eyes don't follow the body"). They now come
 * from eyeSpritePixels(), which reads the same maps and the same bob the sprite is painted from. These tests render every
 * sprite variant with the software rasteriser and check the light lands on the real eye pixels.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_COATS, COAT_INFO } from '../src/pawville/appearance.ts';
import { SPRITE_H, SPRITE_W, catBob, eyeSpritePixels, eyePixels, mapToAnchor, renderCatFrame, type SpriteKey } from '../src/pawville/render/catSprites.ts';
import { planCat } from '../src/pawville/render/townRenderer.ts';
import { rasterFactory } from '../scripts/preview/raster.ts';

const { factory } = rasterFactory();
const FACINGS = ['down', 'left', 'right'] as const;
const colorAt = (k: SpriteKey, x: number, y: number): string | undefined => (renderCatFrame(factory as never, k) as unknown as { __r: { px: Map<string, string> } }).__r.px.get(`${x},${y}`);
const base = (o: Partial<SpriteKey>): SpriteKey => ({ coat: 'tangerine', accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'stand', eyes: 'open', ...o });

test('eyes: the overlay lands on a real eye pixel in EVERY coat × facing × walk/run frame × pose × head tilt', () => {
  let checked = 0;
  for (const coat of ALL_COATS) {
    const pal = COAT_INFO[coat].pixel;
    for (const facing of FACINGS) for (const frame of [0, 1, 2, 3]) for (const [moving, run] of [[false, false], [true, false], [true, true]] as const)
      for (const pose of ['stand', 'sit'] as const) for (const tilt of [0, 1, -1]) {
        const k = base({ coat, facing, frame, moving, run, pose, tilt });
        const pts = eyeSpritePixels(k);
        assert.ok(pts.length >= 2, `${coat}/${facing}: eyes found`);
        for (const [x, y] of pts) {
          const c = colorAt(k, x, y);
          assert.ok(c === pal.e || c === pal.w, `${coat} ${facing} f${frame} ${moving ? (run ? 'run' : 'walk') : 'idle'} ${pose} tilt${tilt}: overlay pixel (${x},${y}) is ${c}, not an eye (${pal.e}/${pal.w})`);
          checked++;
        }
      }
  }
  assert.ok(checked > 5000, `${checked} pixels checked`);
});

test('eyes: the OLD overlay (bob = sit ? 2 : 0, no tilt) missed the eyes while walking, running and tilting — the reported bug', () => {
  let missed = 0, walkMissed = 0;
  for (const coat of ['tangerine', 'midnight', 'mini'] as const) {
    const pal = COAT_INFO[coat].pixel;
    for (const facing of FACINGS) for (const frame of [0, 1, 2, 3]) for (const [moving, run] of [[false, false], [true, false], [true, true]] as const) {
      const k = base({ coat, facing, frame, moving, run });
      const bobOld = 0; // pose 'stand' ⇒ the old code used 0 whatever the walk frame was
      for (const [cx, cy] of eyePixels(facing)) {
        const o = mapToAnchor(cx, cy, bobOld); // offset from the anchor
        const x = o.x + 9, y = o.y + 22; // back to sprite-canvas pixels (anchor 9,22)
        const c = colorAt(k, x, y);
        if (c !== pal.e && c !== pal.w) { missed++; if (moving) walkMissed++; }
      }
    }
  }
  assert.ok(walkMissed > 20, `the old overlay missed the eyes ${walkMissed} times on walking frames`);
  assert.ok(missed >= walkMissed);
});

test('eyes: the light follows the body — it moves exactly with the walk bounce, the run bounce and the sitting drop', () => {
  const y0 = (k: SpriteKey) => Math.min(...eyeSpritePixels(k).map(([, y]) => y));
  const stand = y0(base({}));
  assert.equal(y0(base({ pose: 'sit' })), stand + 2, 'sitting lowers the face by 2');
  for (const [frame, d] of [[0, 0], [1, -1], [2, 0], [3, -1]] as const) assert.equal(y0(base({ frame, moving: true })), stand + d, `walk frame ${frame}`);
  for (const [frame, d] of [[0, 0], [1, -2], [2, -1], [3, -2]] as const) assert.equal(y0(base({ frame, moving: true, run: true })), stand + d, `run frame ${frame}`);
  assert.equal(catBob({ frame: 5, moving: true, run: false, pose: 'stand' }), catBob({ frame: 1, moving: true, run: false, pose: 'stand' }), 'frames wrap');
  assert.equal(catBob({ frame: 1, moving: true, run: false, pose: 'sit' }), 2, 'a seated cat does not walk-bob');
  // tilt shifts the head (and so the eyes) sideways
  const x0 = (k: SpriteKey) => Math.min(...eyeSpritePixels(k).map(([x]) => x));
  assert.equal(x0(base({ tilt: 1 })), x0(base({})) + 1);
  assert.equal(x0(base({ tilt: -1 })), x0(base({})) - 1);
});

test('eyes: mirrored (right-facing) sprites mirror the eye positions; facing away, curled up and body poses draw no eye light', () => {
  const l = eyeSpritePixels(base({ facing: 'left' })), r = eyeSpritePixels(base({ facing: 'right' }));
  const lx = l.map(([x]) => x).sort(), rx = r.map(([x]) => 17 - x).sort();
  assert.deepEqual(rx, lx.map((x) => x - 0).sort().map((x) => x), 'right = left mirrored about the sprite centre (1 + 15 − c)');
  assert.deepEqual(eyeSpritePixels(base({ facing: 'up' })), []);
  assert.deepEqual(eyeSpritePixels(base({ pose: 'loaf' })), []);
  assert.deepEqual(eyeSpritePixels(base({ body: 'stretch' })), []);
  assert.ok(eyeSpritePixels(base({ facing: 'down' })).length >= 6, 'both eyes face-on');
  assert.ok(eyeSpritePixels(base({ facing: 'left' })).length >= 2 && eyeSpritePixels(base({ facing: 'left' })).length < eyeSpritePixels(base({ facing: 'down' })).length, 'one eye in profile');
});

test('eyes: every sprite stays inside its canvas, and the same function serves local and remote cats (they share planCat)', () => {
  for (const coat of ALL_COATS) for (const facing of FACINGS) for (const frame of [0, 1, 2, 3]) {
    for (const [x, y] of eyeSpritePixels(base({ coat, facing, frame, moving: true, run: true, tilt: 1 }))) assert.ok(x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H);
  }
  // planCat is the single source for "how this cat looks"; a remote cat and the local cat with the same state get the same key
  const mk = (isSelf: boolean) => planCat({ id: 'x', coat: 'tangerine', accessory: 'none', extra: 'none', x: 10, y: 10, facing: 'left', moving: true, pose: 'stand', lift: 0, animTime: 0.3, isSelf, running: true } as never, 1, false).key;
  assert.deepEqual(mk(true), mk(false));
});

test('eyes: Racon (the raccoon) has its own face; the light lands on its eye pixels too, and not on the black mask', () => {
  const pal = COAT_INFO.racon.pixel;
  for (const facing of FACINGS) for (const frame of [0, 1, 2, 3]) for (const moving of [false, true]) {
    const k = base({ coat: 'racon', facing, frame, moving, run: moving });
    for (const [x, y] of eyeSpritePixels(k)) assert.ok([pal.e, pal.w].includes(colorAt(k, x, y) as string), `racon ${facing} f${frame}: (${x},${y})`);
  }
});
