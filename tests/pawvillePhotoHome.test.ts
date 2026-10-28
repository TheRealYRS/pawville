import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DECOR, DEFAULT_HOME, checkPlace, decorDef, homeStore, sanitizeHome, type Placed } from '../src/pawville/home/decor.ts';
import { ALL_DECOR_IDS, drawDecor, drawRoom, hasArt } from '../src/pawville/home/homeArt.ts';
import { approachCells, findPath, isWalkable, nearestFree, planInteraction, solidGrid } from '../src/pawville/home/homeWalk.ts';
import { composePhoto, FILTERS } from '../src/pawville/memories/photoCompose.ts';
import { FRAMINGS, MAX_CAPTURE_W, biasForPanel, framingRect, subjectOnScreen } from '../src/pawville/memories/photoFraming.ts';
import { memoryStorage } from '../src/pawville/persistence.ts';
import { CatSpriteCache } from '../src/pawville/render/catSprites.ts';

/** Fake canvas: accepts any 2D call and records drawImage sources. */
function fakeCanvas(width = 100, height = 80) {
  const drawn: unknown[] = [];
  const grad = { addColorStop: () => undefined };
  const ctx = new Proxy({ fillStyle: '', globalAlpha: 1 } as Record<string, unknown>, {
    get(t, k) {
      if (k === 'drawImage') return (src: unknown) => drawn.push(src);
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k in t) return t[k as string];
      return () => undefined;
    },
    set(t, k, v) { t[k as string] = v; return true; },
  });
  return { width, height, getContext: () => ctx as unknown as CanvasRenderingContext2D, drawn };
}
const factory = (w: number, h: number) => fakeCanvas(w, h);

// ------------------------------------------------------------------ photo mode
test('photo framing: the subject is always inside the photo (every framing, anywhere in town)', () => {
  const world = { w: 768, h: 864 };
  for (const framing of FRAMINGS) for (const x of [10, 384, 760]) for (const y of [30, 432, 860]) {
    const r = framingRect(framing, [{ x, y }], world);
    assert.ok(x - 12 >= r.x && x + 12 <= r.x + r.w, `${framing} @${x},${y}: horizontally in frame`);
    assert.ok(y - 28 >= r.y && y + 2 <= r.y + r.h, `${framing} @${x},${y}: head and feet in frame`);
    assert.ok(r.w * r.zoom <= MAX_CAPTURE_W, 'bounded output size');
  }
});

test('photo framing: couple portraits include both cats, even far apart', () => {
  for (const [a, b] of [[{ x: 100, y: 100 }, { x: 130, y: 104 }], [{ x: 100, y: 100 }, { x: 400, y: 300 }]]) {
    const r = framingRect('couple', [a, b], { w: 768, h: 864 });
    for (const p of [a, b]) assert.ok(p.x - 12 >= r.x && p.x + 12 <= r.x + r.w && p.y - 28 >= r.y && p.y <= r.y + r.h);
  }
});

test('photo controls never cover the subject: side panel and bottom sheet', () => {
  const desktop = { vw: 1920, vh: 1080, panel: { left: 1920 - 372, top: 12, width: 360, height: 1056 } };
  const phone = { vw: 390, vh: 844, panel: { left: 0, top: 844 - 420, width: 390, height: 420 } };
  for (const v of [desktop, phone, { vw: 1366, vh: 768, panel: { left: 1366 - 372, top: 12, width: 360, height: 744 } }]) {
    const bias = biasForPanel(v.panel, v.vw, v.vh);
    const s = subjectOnScreen(bias, v.vw, v.vh);
    const head = { x: s.x, y: s.y - 60 }; // the cat's face is above its feet
    for (const p of [s, head]) {
      const inside = p.x >= v.panel.left && p.x <= v.panel.left + v.panel.width && p.y >= v.panel.top && p.y <= v.panel.top + v.panel.height;
      assert.equal(inside, false, `subject visible at ${v.vw}×${v.vh}`);
    }
  }
});

test('photo capture: the saved photo is composed ONLY from the rendered scene (never the UI)', () => {
  const scene = fakeCanvas(300, 200);
  for (const f of FILTERS) for (const frame of ['polaroid', 'plain', 'stars'] as const) {
    const out = composePhoto(scene, { filter: f.id, frame, vignette: true, caption: 'Magic Moment', subline: 'Plaza · today' }, factory) as unknown as ReturnType<typeof fakeCanvas>;
    assert.ok(out, `${f.id}/${frame} composed`);
    const ctx = out.getContext() as unknown as { drawn?: unknown[] };
    void ctx;
    assert.deepEqual(out.drawn.filter((d) => d !== scene), [], 'nothing but the scene is drawn into the photo');
    assert.ok(out.width >= scene.width && out.height >= scene.height);
  }
  assert.ok(FILTERS.every((f) => !/saturate\(([2-9]|1\.[3-9])/.test(f.css)), 'filters are gentle (coat colours stay recognisable)');
});

// ------------------------------------------------------------------ home
test('home: every catalogue piece has its own illustration and draws without errors', () => {
  for (const id of ALL_DECOR_IDS) {
    assert.ok(hasArt(id), `${id} is illustrated`);
    const d = decorDef(id);
    for (const rot of [0, 90] as const) drawDecor(fakeCanvas().getContext(), id, { x: 30, y: 60, w: d.w * 24, h: d.h * 24 }, rot);
  }
  const groups = new Set(DECOR.map((d) => d.group));
  assert.deepEqual([...groups].sort(), ['cat', 'decor', 'furniture']);
  for (const id of ['bed', 'sofa', 'armchair', 'table', 'side-table', 'wardrobe', 'bookshelf', 'desk', 'lamp', 'table-lamp', 'plant', 'painting', 'photo-frame', 'curtains', 'rug-round', 'clock', 'books', 'cat-tower', 'cat-bed', 'scratch-board', 'toy-basket', 'food-bowls', 'cardboard-box', 'window-perch', 'cat-tunnel', 'climb-shelves']) {
    assert.ok(DECOR.some((d) => d.id === id), `${id} in the catalogue`);
  }
  drawRoom(fakeCanvas(400, 300).getContext(), { room: DEFAULT_HOME.placed, wallpaper: 'night', cat: { coat: 'magic', accessory: 'none', extra: 'none', x: 3.5, y: 6.5, lift: 0, facing: 'down', pose: 'sit', moving: false, frame: 0 }, ghost: { item: 'bed', x: 0, y: 2, rot: 0, ok: false }, openUid: null, time: 0, editing: true }, new CatSpriteCache(factory));
});

test('home: placement rules incl. curtains over a window; old saves still load', () => {
  const room: Placed[] = [{ uid: 'w', item: 'window', x: 4, y: 0, rot: 0, placedBy: 'T' }];
  assert.equal(checkPlace(room, { uid: 'c', item: 'curtains', x: 4, y: 0, rot: 0 }), 'ok', 'curtains hang over windows');
  assert.equal(checkPlace(room, { uid: 'p', item: 'painting', x: 4, y: 0, rot: 0 }), 'blocked');
  assert.equal(checkPlace(room, { uid: 'b', item: 'cat-bed', x: 2, y: 1, rot: 0 }), 'floor-only');
  assert.equal(checkPlace(room, { uid: 'b', item: 'window-perch', x: 2, y: 3, rot: 0 }), 'wall-only');
  // a Milestone 3 save (only old ids) is preserved exactly
  const m3 = { placed: [{ uid: 'd1', item: 'rug-round', x: 4, y: 4, rot: 0, placedBy: 'T' }, { uid: 'd2', item: 'sofa', x: 4, y: 3, rot: 0, placedBy: 'T' }, { uid: 'x', item: 'cat-tower', x: 0, y: 5, rot: 90, placedBy: 'M' }], wallpaper: 'mint' };
  assert.deepEqual(sanitizeHome(m3), m3);
  const s = memoryStorage();
  s.setItem('pawville:home', JSON.stringify({ v: 1, data: m3 }));
  assert.deepEqual(homeStore(s).load(), m3, 'stored layout restored');
  homeStore(s).save({ wallpaper: 'cream', placed: [...m3.placed, { uid: 'n', item: 'scratch-board', x: 11, y: 7, rot: 0, placedBy: 'T' }] as Placed[] });
  assert.equal(homeStore(s).load().placed.length, 4, 'new furniture saved alongside the old');
  assert.equal(sanitizeHome({ placed: [{ uid: 'z', item: 'hot-tub', x: 3, y: 4 }] }).placed[0].item, 'plant', 'unknown pieces never crash');
});

test('home: the cat walks around solid furniture and uses pieces contextually', () => {
  const room: Placed[] = [
    { uid: 'sofa', item: 'sofa', x: 3, y: 4, rot: 0, placedBy: 'T' },
    { uid: 'rug', item: 'rug-long', x: 3, y: 6, rot: 0, placedBy: 'T' },
    { uid: 'bed', item: 'bed', x: 9, y: 2, rot: 0, placedBy: 'T' },
    { uid: 'post', item: 'scratch-board', x: 0, y: 7, rot: 0, placedBy: 'T' },
    { uid: 'perch', item: 'window-perch', x: 6, y: 1, rot: 0, placedBy: 'T' },
  ];
  const g = solidGrid(room);
  assert.equal(isWalkable(g, { x: 4, y: 4 }), false, 'sofa is solid');
  assert.equal(isWalkable(g, { x: 4, y: 6 }), true, 'rugs are walkable');
  assert.equal(isWalkable(g, { x: 4, y: 1 }), false, 'walls are not floor');
  const path = findPath(g, { x: 2, y: 7 }, { x: 6, y: 3 })!;
  assert.ok(path && path.every((c) => isWalkable(g, c)), 'path never crosses furniture');
  const bed = planInteraction(room, room[2], { x: 2, y: 7 })!;
  assert.deepEqual([bed.action, bed.pose], ['sleep', 'loaf']);
  assert.ok(bed.lift > 0, 'sleeps ON the bed');
  const sofa = planInteraction(room, room[0], { x: 2, y: 7 })!;
  assert.deepEqual([sofa.action, sofa.pose], ['sit', 'sit']);
  const post = planInteraction(room, room[3], { x: 6, y: 7 })!;
  assert.equal(post.action, 'scratch');
  assert.equal(post.facing, 'left', 'faces the post');
  const perch = planInteraction(room, room[4], { x: 2, y: 7 })!;
  assert.deepEqual([perch.action, perch.facing], ['perch', 'up'], 'looks out of the window');
  assert.equal(planInteraction(room, room[1], { x: 2, y: 7 }), null, 'a rug has no action');
  // boxed in → no plan (never a crash)
  const boxed: Placed[] = [{ uid: 'a', item: 'bookshelf', x: 0, y: 2, rot: 0, placedBy: 'T' }, { uid: 'b', item: 'cat-bed', x: 2, y: 2, rot: 0, placedBy: 'T' }];
  assert.ok(approachCells(boxed[1]).length > 0);
  assert.deepEqual(nearestFree(solidGrid(boxed), { x: 0, y: 2 }), { x: 0, y: 3 });
});
