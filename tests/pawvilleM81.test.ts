/**
 * Milestone 8.1 regression tests: gait frames, sheet layout, seating depth, map audit, camera snapping,
 * night lighting, one-time claims, presence budget and the telescope model.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCatFrame } from '../src/pawville/render/catSprites.ts';
import { rasterFactory, sig } from '../scripts/preview/raster.ts';
import { sheetPadding } from '../src/pawville/components/panelLayout.ts';
import { seatFor, standPoint, SEAT_HEIGHT } from '../src/pawville/world/seating.ts';
import { auditRegion } from '../src/pawville/world/mapAudit.ts';
import { EXPLORE_REGIONS, regionDef, townSpots } from '../src/pawville/adventure/regions.ts';
import { buildRegionSprites, regionSpriteKey } from '../src/pawville/render/regionArt.ts';
import { groundBuilder, RG, regionPropCollider, type RegionDef } from '../src/pawville/adventure/regionKit.ts';
import { snapCamera, smoothCamera } from '../src/pawville/world/interaction.ts';
import { lampLight, nightGradeAlpha, NIGHT_MAX_ALPHA } from '../src/pawville/render/lighting.ts';
import { gradeFor, type Environment } from '../src/pawville/world/environment.ts';
import { claimOnce } from '../src/pawville/world/claims.ts';
import { createTrackBudget, type PlayerSnapshot } from '../src/pawville/net/presenceProtocol.ts';
import {
  SKY, aim, createDwell, inSight, moonPhaseAt, shootingStar, skyJournalId, zoomTo, SHOOT_EVERY, type SkyContext, type ScopeView,
} from '../src/pawville/adventure/telescope.ts';
import { JOURNAL } from '../src/pawville/adventure/content.ts';
import { grantOnce } from '../src/pawville/city/economy.ts';
import { sanitizeAdventure, emptyAdventure } from '../src/pawville/adventure/state.ts';

const COATS = ['tangerine', 'midnight', 'puchu', 'chutki', 'mini', 'magic', 'racon'] as const;
const frame = (coat: string, facing: string, f: number, moving = true) => {
  const { factory } = rasterFactory();
  const c = renderCatFrame(factory as never, { coat: coat as never, accessory: 'none', extra: 'none', facing: facing as never, frame: f, moving, pose: 'stand' }) as unknown as { __r: Parameters<typeof sig>[0] };
  return sig(c.__r);
};

test('walk cycle: all four frames are distinct poses in every direction for all seven characters', () => {
  for (const coat of COATS) for (const facing of ['left', 'right', 'up', 'down']) {
    const sigs = [0, 1, 2, 3].map((f) => frame(coat, facing, f));
    assert.equal(new Set(sigs).size, 4, `${coat} ${facing}`);
  }
});
test('walk cycle: idle has no leg motion (frames only differ by breathing / tail sway)', () => {
  assert.equal(frame('mini', 'left', 0, false), frame('mini', 'left', 1, false));
  assert.equal(frame('tangerine', 'down', 0, false), frame('tangerine', 'down', 1, false));
});

test('sheet layout: padding clears the rounded corner; sitting/fishing no longer use the padding-less dock', () => {
  const css = readFileSync('src/pawville/styles/pawville.css', 'utf8');
  const block = css.slice(css.indexOf('.pv-sheet {'), css.indexOf('}', css.indexOf('.pv-sheet {')));
  const r = Number(/--sheet-r:\s*(\d+)px/.exec(block)![1]);
  const [py, px] = /padding:\s*(\d+)px\s+(\d+)px/.exec(block)!.slice(1).map(Number);
  assert.ok(px >= sheetPadding(r) && py >= 14, `padding ${py}/${px} vs radius ${r}`);
  assert.match(block, /max-height/); // long text scrolls inside instead of overflowing
  const layer = readFileSync('src/pawville/adventure/AdventureLayer.tsx', 'utf8');
  const panels = readFileSync('src/pawville/components/AdventurePanels.tsx', 'utf8');
  assert.doesNotMatch(layer, /pv-dock pv-sitbar/);
  assert.doesNotMatch(panels, /pv-dock pv-fishing/);
  assert.match(css, /\.pv-town:has\(\.pv-sheet\) \.pv-prompt/); // prompt never sits on top of an open sheet
  for (const r2 of [0, 10, 22, 30, 60]) assert.ok(sheetPadding(r2) >= Math.ceil(r2 * 0.3) + 10);
});

test('seating: the cat sits in front of (drawn after) the bench, raised to the seat, and stands up clear of it', () => {
  for (const kind of ['bench', 'parkbench', 'gazebo', 'windowseat']) {
    const prop = { kind, x: 200, y: 300 };
    const s = seatFor({ x: 200, y: 312 }, [prop]);
    assert.ok(s.y > prop.y, `${kind}: cat baseline must be in front of the prop baseline`);
    assert.equal(s.lift, SEAT_HEIGHT[kind]);
    const col = regionPropCollider(prop as never);
    const up = standPoint(s);
    if (col) assert.ok(up.y >= col.y + col.h, `${kind}: stand point is outside the collider`);
  }
  const table = seatFor({ x: 210, y: 176 }, [{ kind: 'cafetable', x: 210, y: 166 }]);
  assert.ok(table.y > 166 && table.lift === 0);
});

const { factory } = rasterFactory();
const SPRITES = buildRegionSprites(factory as never);
const visual = (p: { kind: string; x: number; y: number; variant?: number }) => {
  const s = SPRITES[regionSpriteKey(p.kind, p.variant ?? 0)] as unknown as { canvas: { width: number; height: number }; ox: number; oy: number } | undefined;
  return s ? { x: p.x + s.ox, y: p.y + s.oy, w: s.canvas.width, h: s.canvas.height } : null;
};
test('map audit: every explorable region passes (no roads under buildings, no dirt over water, props on solid ground, spots reachable)', () => {
  const issues = EXPLORE_REGIONS.flatMap((id) => auditRegion(regionDef(id), visual as never));
  assert.deepEqual(issues.map((i) => `${i.region} ${i.rule} ${i.detail}`), []);
});
test('map audit rules actually catch the Milestone 8 defects', () => {
  const b = groundBuilder(12, 12, RG.Grass);
  b.rect(0, 4, 11, 6, RG.Water); b.rect(5, 0, 6, 11, RG.Path); // a path painted straight over a river
  b.rect(0, 9, 11, 9, RG.Cobble);
  const def = { id: 'test', name: 't', cols: 12, rows: 12, ground: b.g, props: [{ kind: 'cafe', x: 96, y: 176 }], spots: [], npcs: [], gates: [], spawn: { x: 24, y: 24 }, areas: [], climate: {} } as unknown as RegionDef;
  const rules = new Set(auditRegion(def, visual as never).map((i) => i.rule));
  assert.ok(rules.has('path-over-water'));
  assert.ok(rules.has('road-under-building'));
  // and the fix: road() turns the crossing into a bridge
  const b2 = groundBuilder(12, 12, RG.Grass);
  b2.rect(0, 4, 11, 6, RG.Water); b2.road(5, 0, 6, 11, RG.Path);
  assert.equal(b2.at(5, 5), RG.Bridge);
  assert.equal(b2.at(5, 1), RG.Path);
});
test('the telescope spots exist and the city/rooftop ones are reachable on foot', () => {
  assert.ok(townSpots().some((s) => s.id === 'town-telescope' && s.activity === 'telescope' && s.scope === 'town'));
  for (const [r, id] of [['city', 'city-telescope'], ['rooftops', 'roof-scope']] as const) {
    const s = regionDef(r).spots.find((x) => x.id === id);
    assert.ok(s && s.activity === 'telescope' && s.scope);
  }
});

test('camera: the followed cat keeps a stable screen position while the camera eases (no 1px flicker)', () => {
  let cam = { x: 0, y: 0 };
  let flipsOld = 0, flipsNew = 0, prevOld = NaN, prevNew = NaN, dirOld = 0, dirNew = 0;
  for (let i = 0; i < 240; i++) {
    const cat = { x: 160 + i * 1.37, y: 120 + i * 0.41 };
    cam = smoothCamera(cam, { x: cat.x - 160, y: cat.y - 120 }, 1 / 60);
    const old = Math.round(cat.x) - Math.round(cam.x);
    const snap = snapCamera(cam, cat);
    const nw = Math.round(cat.x) - snap.x;
    for (const [v, which] of [[old, 0], [nw, 1]] as const) {
      const prev = which ? prevNew : prevOld;
      if (!Number.isNaN(prev) && v !== prev) {
        const d = Math.sign(v - prev);
        if (which) { if (dirNew && d !== dirNew) flipsNew++; dirNew = d; } else { if (dirOld && d !== dirOld) flipsOld++; dirOld = d; }
      }
      if (which) prevNew = v; else prevOld = v;
    }
    assert.ok(Number.isInteger(snap.x) && Number.isInteger(snap.y));
  }
  assert.ok(flipsOld > 0, 'the old rounding really did jitter');
  assert.equal(flipsNew, 0);
});

test('night lighting: lighter plum grade with a cap, compact lamp halos', () => {
  const env = { phase: 'night', hour: 23, darkness: 1, weather: 'sunny', wind: 0 } as unknown as Environment;
  const g = gradeFor(env);
  assert.equal(g.tint, '#4a3f7a');
  assert.ok(nightGradeAlpha(g.tintAlpha) <= NIGHT_MAX_ALPHA);
  const l = lampLight(1);
  assert.ok(l.haloR <= 18 && l.poolA > 0);
  assert.equal(lampLight(0).poolA, 0);
});

test('one-time claims: repeated input cannot claim twice', () => {
  const s = new Set<string>();
  assert.equal(claimOnce(s, 'shell-1'), true);
  assert.equal(claimOnce(s, 'shell-1'), false);
});

test('presence: never more than 5 track() calls in any 30 s window, and the latest resting state is delivered', () => {
  const b = createTrackBudget(4, 30_000, 3_000);
  const calls: number[] = [];
  let lastX = -1;
  const snap = (x: number) => ({ id: 'a', name: 'a', cat: 'T', coat: 'mini', accessory: 'none', extra: 'none', x, y: 0, facing: 'down', moving: false, pose: 'stand', lift: 0, emote: null, emoteAge: 0, emoteSeq: 0, run: false, pair: null, region: 'town' } as unknown as PlayerSnapshot);
  b.force(0, snap(0)); calls.push(0); // the subscribe re-announce counts
  let x = 0;
  for (let t = 0; t <= 120_000; t += 100) {
    if (t % 1000 === 0 && t < 90_000) x += 5; // stop at a new place every second for 90 s (the old gate tracked every 1.5 s)
    if (b.want(t, snap(x))) { calls.push(t); lastX = x; }
  }
  for (const t of calls) assert.ok(calls.filter((u) => u >= t && u < t + 30_000).length <= 5, `window at ${t}`);
  assert.equal(lastX, x, 'the final resting place was tracked (coalesced, never dropped)');
  assert.ok(calls.length >= 10, 'presence still updates regularly within the budget');
});

const ctx = (o: Partial<SkyContext> = {}): SkyContext => ({ site: 'city', darkness: 1, clear: true, moonPhase: 0.5, flags: new Set(), time: 1, ...o });
const at = (id: string, zoom = 1): ScopeView => { const s = SKY.find((x) => x.id === id)!; return { az: s.az, alt: s.alt, zoom }; };
const sees = (v: ScopeView, c: SkyContext, id: string) => inSight(v, c).some((o) => o.id === id);

test('telescope: aiming wraps around the compass and stops at the zenith/horizon; zoom is bounded', () => {
  const v = aim({ az: 350, alt: 79, zoom: 1 }, 20, 10);
  assert.equal(v.az, 10); assert.equal(v.alt, 80);
  assert.equal(aim(v, 0, -200).alt, 0);
  assert.equal(zoomTo(v, 9).zoom, 4); assert.equal(zoomTo(v, 0).zoom, 1);
});
test('telescope: visibility follows darkness, weather, zoom and quest flags', () => {
  assert.ok(sees(at('mouse-dipper'), ctx(), 'mouse-dipper'));
  assert.ok(!sees(at('mouse-dipper'), ctx({ darkness: 0.1 }), 'mouse-dipper'), 'no stars by day');
  assert.ok(!sees(at('mouse-dipper'), ctx({ clear: false }), 'mouse-dipper'), 'no stars through clouds');
  assert.ok(!sees(at('whisker-comet', 1), ctx(), 'whisker-comet'), 'comet invisible to the naked eye');
  assert.ok(sees(at('whisker-comet', 3), ctx(), 'whisker-comet'));
  assert.ok(!sees(at('lumi-stars'), ctx(), 'lumi-stars'));
  assert.ok(sees(at('lumi-stars'), ctx({ flags: new Set(['lumi-home']) }), 'lumi-stars'));
  assert.ok(sees(at('pawport-light', 2), ctx({ darkness: 0 }), 'pawport-light'), 'landmarks by day');
  assert.ok(!sees(at('pawport-light', 2), ctx({ site: 'rooftops' }), 'pawport-light'), 'each site has its own horizon');
  assert.ok(!sees(at('moon'), ctx({ moonPhase: 0.01 }), 'moon'), 'no moon at new moon');
  assert.ok(!sees({ az: 90, alt: 5, zoom: 1 }, ctx(), 'mouse-dipper'), 'must actually point at it');
});
test('telescope: the moon phase is computed from the real date', () => {
  const full = moonPhaseAt(Date.UTC(2024, 0, 25, 17, 54)); // full moon, 25 Jan 2024
  assert.ok(Math.abs(full - 0.5) < 0.03, String(full));
  const fresh = moonPhaseAt(Date.UTC(2024, 1, 9, 22, 59)); // new moon, 9 Feb 2024
  assert.ok(fresh < 0.03 || fresh > 0.97, String(fresh));
});
test('telescope: shooting stars come on a schedule at night and can be caught', () => {
  let caught = false;
  for (let t = 0; t < SHOOT_EVERY * 3; t += 0.1) {
    const c = ctx({ time: t });
    const s = shootingStar(c);
    if (s && sees({ az: s.az, alt: s.alt, zoom: 1 }, c, 'shooting-star')) caught = true;
  }
  assert.ok(caught);
  assert.equal(shootingStar(ctx({ darkness: 0 })), null);
});
test('telescope: discoveries need a steady aim, save to the journal once and pay once', () => {
  const dwell = createDwell(600);
  assert.deepEqual(dwell(0, ['moon']), []);
  assert.deepEqual(dwell(300, ['moon']), []);
  assert.deepEqual(dwell(700, ['moon']), ['moon']);
  assert.deepEqual(dwell(800, []), []);
  assert.deepEqual(dwell(900, ['moon']), [], 'looking away resets the timer');
  for (const o of SKY) assert.ok(JOURNAL.some((j) => j.id === skyJournalId(o.id) && j.kind === 'sky'), o.id);
  const st = sanitizeAdventure(JSON.parse(JSON.stringify({ ...emptyAdventure(), journal: [skyJournalId('moon'), skyJournalId('mouse-dipper')] })));
  assert.deepEqual(st.journal, ['sky-moon', 'sky-mouse-dipper'], 'sky discoveries survive save/reload');
  const save0 = { tokens: 0, claims: [] } as never;
    const r1 = grantOnce(save0, 'sky:moon', 1);
  if (!r1.ok) throw new Error('first sky grant should succeed');
  const r2 = grantOnce(r1.save, 'sky:moon', 1);
  assert.equal(r2.ok, false);
});
