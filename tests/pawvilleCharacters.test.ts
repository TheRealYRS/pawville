import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_COATS, CHARACTERS, COATS, COAT_INFO, NAMED_COATS, ORIGINAL_ACCESSORIES, appearanceStore, characterFor, normalizeCoat, sanitizeAppearance,
} from '../src/pawville/appearance.ts';
import { ALLOWED_ACCESSORIES, sanitizeSnapshot } from '../src/pawville/net/presenceProtocol.ts';
import { renderCatFrame, type SpriteKey } from '../src/pawville/render/catSprites.ts';
import { memoryStorage } from '../src/pawville/persistence.ts';

/** A fake 2D context that records every pixel colour written (enough for the sprite renderer). */
function recordingFactory() {
  const colors: string[] = [];
  const ctx = new Proxy({ fillStyle: '' } as Record<string, unknown>, {
    get(t, k) {
      if (k === 'fillRect') return () => colors.push(String(t.fillStyle));
      if (k in t) return t[k as string];
      return () => undefined;
    },
    set(t, k, v) { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { colors, factory: (width: number, height: number) => ({ width, height, getContext: () => ctx }) };
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('characters: every canonical id resolves to one appearance definition each', () => {
  // Milestone 6: Racon (a raccoon) joins the six cats — an intentional roster change.
  assert.deepEqual(CHARACTERS.map((c) => c.id), ['tangerine', 'midnight', 'puchu', 'chutki', 'mini', 'magic', 'racon']);
  for (const c of CHARACTERS) {
    assert.ok(COAT_INFO[c.coat], `${c.id} has an appearance`);
    assert.equal(characterFor(c.coat)?.id, c.id);
    assert.equal(Object.keys(COAT_INFO[c.coat].pixel).length, 12);
    assert.equal(COAT_INFO[c.coat].pixel.e, c.eyeColor, `${c.id}: the eye colour shown in the wardrobe is the one drawn`);
  }
  assert.deepEqual([...NAMED_COATS], ['puchu', 'chutki', 'mini', 'magic', 'racon']);
  assert.equal(COATS.length, 8, 'the 8 palette coats are unchanged');
  assert.equal(ALL_COATS.length, 13);
});

test('characters: Puchu and Chutki are a matching pair with distinct markings', () => {
  const p = COAT_INFO.puchu, c = COAT_INFO.chutki;
  assert.equal(p.pixel.f, c.pixel.f, 'same white coat');
  assert.equal(p.marks!.color, c.marks!.color, 'same orange');
  const key = (l: readonly (readonly [number, number])[]) => l.map(([x, y]) => `${x},${y}`).sort().join(' ');
  assert.notEqual(key(p.marks!.front), key(c.marks!.front), 'different spot layout (front)');
  assert.notEqual(key(p.marks!.back), key(c.marks!.back), 'different spot layout (back)');
  assert.ok(c.marks!.svgForehead && !p.marks!.svgForehead, 'Chutki has the forehead heart');
  assert.notEqual(p.marks!.tail, c.marks!.tail, 'different tail pattern');
  // white coat really is predominantly white, dots really orange
  const [r, g, b] = rgb(p.pixel.f);
  assert.ok(r > 240 && g > 235 && b > 225);
  const [or, og, ob] = rgb(p.marks!.color);
  assert.ok(or > 230 && og > 120 && og < 190 && ob < 100);
});

test('characters: Mini is grey with bright green eyes; Magic is brown with a white tummy and brown eyes', () => {
  const [er, eg, eb] = rgb(COAT_INFO.mini.pixel.e);
  assert.ok(eg > 200 && eg > er + 100 && eg > eb + 80, 'saturated green eyes');
  const [fr, fg, fb] = rgb(COAT_INFO.mini.pixel.f);
  assert.ok(Math.max(fr, fg, fb) - Math.min(fr, fg, fb) < 20, 'neutral grey coat');
  const m = COAT_INFO.magic;
  const [br, bg, bb] = rgb(m.pixel.b);
  assert.ok(br > 240 && bg > 240 && bb > 230, 'white tummy');
  assert.ok((m.marks?.bellyFront?.length ?? 0) >= 6, 'tummy patch drawn in the town sprite');
  const [mr, mg, mb] = rgb(m.pixel.e);
  assert.ok(mr > mg && mg > mb, 'brown/amber eyes');
  const fur = rgb(m.pixel.f);
  assert.ok(Math.abs(mr - fur[0]) + Math.abs(mg - fur[1]) + Math.abs(mb - fur[2]) > 80, 'eyes distinguishable from the coat');
});

test('characters: every character renders in every pose, facing and expression, markings included', () => {
  for (const coat of ALL_COATS) for (const pose of ['stand', 'sit', 'loaf'] as const) for (const facing of ['down', 'up', 'left', 'right'] as const) {
    for (const extra of [{}, { eyes: 'glow', paw: 'right', pawLift: 3, pawDx: -2, ears: 'perk' }, { eyes: 'closed', ears: 'down', cheeks: true }] as Partial<SpriteKey>[]) {
      const { colors, factory } = recordingFactory();
      renderCatFrame(factory, { coat, accessory: 'crown', extra: 'scarf', facing, frame: 1, moving: pose === 'stand', pose, ...extra });
      assert.ok(colors.length > (pose === 'loaf' ? 15 : 40), `${coat} ${pose} ${facing} draws`);
      if (COAT_INFO[coat].marks && COAT_INFO[coat].marks!.color !== COAT_INFO[coat].pixel.f && coat !== 'magic') {
        assert.ok(colors.includes(COAT_INFO[coat].marks!.color), `${coat} ${pose} ${facing} shows its markings`);
      }
    }
  }
  const front = recordingFactory();
  renderCatFrame(front.factory, { coat: 'mini', accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'stand' });
  assert.ok(front.colors.includes(COAT_INFO.mini.pixel.e), 'Mini’s green eyes are drawn at world size');
  const tummy = recordingFactory();
  renderCatFrame(tummy.factory, { coat: 'magic', accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'sit' });
  assert.ok(tummy.colors.filter((c) => c === COAT_INFO.magic.pixel.b).length >= 8, 'Magic’s white tummy shows when sitting');
});

test('characters: unknown ids fall back safely everywhere', () => {
  assert.equal(normalizeCoat('dragon'), 'tangerine');
  assert.equal(normalizeCoat(undefined, 'midnight'), 'midnight');
  assert.deepEqual(sanitizeAppearance({ coat: '<img>', extra: 'x' }, 'M'), { coat: 'midnight', extra: 'none' });
  const { colors, factory } = recordingFactory();
  renderCatFrame(factory, { coat: 'not-a-cat' as never, accessory: 'none', extra: 'none', facing: 'down', frame: 0, moving: false, pose: 'stand' });
  assert.ok(colors.length > 40, 'renders the default instead of crashing');
  const snap = sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, coat: 'ghost' }, { w: 100, h: 100 })!;
  assert.equal(snap.coat, 'tangerine');
});

test('characters: selections persist; older saves (Milestone 2/3) keep working', () => {
  const s = memoryStorage();
  appearanceStore(s).save({ coat: 'chutki', extra: 'flower' });
  assert.deepEqual(appearanceStore(s).load(), { coat: 'chutki', extra: 'flower' });
  const old = memoryStorage();
  old.setItem('pawville:appearance', JSON.stringify({ v: 1, data: { coat: 'mochi', extra: 'scarf' } }));
  assert.deepEqual(appearanceStore(old).load(), { coat: 'mochi', extra: 'scarf' }, 'existing coat kept');
  const legacy = memoryStorage();
  legacy.setItem('pawville:cat', 'M');
  assert.equal(appearanceStore(legacy).load().coat, 'midnight', 'Milestone 2 key still migrates');
});

test('characters: Tangerine/Midnight and the Paw vs Paw accessory whitelist are unchanged', () => {
  assert.equal(COAT_INFO.tangerine.pixel.f, '#FF8A35');
  assert.equal(COAT_INFO.tangerine.svg.eye, '#86E08F');
  assert.equal(COAT_INFO.midnight.pixel.f, '#252031');
  assert.equal(COAT_INFO.midnight.svg.rim, '#A89BC9');
  assert.deepEqual([...ORIGINAL_ACCESSORIES], ['none', 'crown', 'bow', 'wizard', 'bell']);
  assert.deepEqual([...ALLOWED_ACCESSORIES], ['none', 'crown', 'bow', 'wizard', 'bell']);
  // the Paw vs Paw seat ('cat') stays T/M no matter which character you wear
  const s = sanitizeSnapshot({ v: 3, id: 'cat_abcdef12', x: 1, y: 1, cat: 'M', coat: 'puchu' }, { w: 10, h: 10 })!;
  assert.deepEqual([s.cat, s.coat], ['M', 'puchu']);
});
