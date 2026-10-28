/**
 * Whiskerwick, Milestone 8: Grand City Park (with the Residential District), Old Town, the
 * Rooftops, and three walk-in interiors (Hearth & Whisker, the Old Library, The Purring Cup).
 * Same RegionDef toolkit as every other region: movement, collision, camera, presence, emotes,
 * photo mode, quests and the world map work unchanged.
 */
import { seededRandom, type Vec2 } from '../world/geometry.ts';
import { RG, groundBuilder, scatter, type AdventureSpot, type NpcDef, type RegionDef, type RegionProp, type RGround } from '../adventure/regionKit.ts';
import type { AdvView, RegionId } from '../adventure/state.ts';
import { SHOP_FURNITURE } from '../home/decor.ts';

export const NEW_CITY_REGIONS: readonly RegionId[] = ['city-park', 'old-town', 'rooftops', 'hearth', 'library', 'purring-cup', 'funfair'];

const spot = (s: Omit<AdventureSpot, 'kind'>): AdventureSpot => ({ kind: 'adventure', ...s });
const npcSpot = (n: NpcDef, label: string): AdventureSpot => spot({ id: `talk-${n.id}`, role: 'npc', npc: n.id, label, point: { x: n.x, y: n.y }, radius: 29, when: n.when });
const night = (phase: string) => phase === 'evening' || phase === 'night';
const step = (q: string, i: number) => (v: AdvView) => v.onStep(q, i);
const stamp = (id: string, x: number, y: number, label: string): AdventureSpot => spot({ id, role: 'collect', label, point: { x, y }, radius: 12,
  collect: { item: 'old-stamp', once: true, text: 'An old Whiskerwick postage stamp! A tiny painting of the city on it.' } });
const bench = (id: string, x: number, y: number): AdventureSpot => spot({ id, role: 'activity', activity: 'bench', label: 'Sit down for a while', point: { x, y: y + 12 }, radius: 14 });

// =================================================================================================
// Grand City Park + Residential District (48 x 44)
// =================================================================================================
export const PARK_GATE: Vec2 = { x: 528, y: 668 };
export function buildCityPark(): RegionDef {
  const cols = 48, rows = 44;
  const b = groundBuilder(cols, rows, RG.Grass);
  b.rect(32, 0, 33, 43, RG.Path); // Gate Walk (north-south)
  b.rect(2, 20, 46, 21, RG.Path); // Long Walk (east-west)
  b.disc(14, 30, 5.5, RG.Water); // Lily Pond
  b.rect(8, 30, 20, 31, RG.Bridge); // the pond bridge
  // Milestone 8.1: the pond walk crosses on planks (it used to be dirt painted over the water)
  b.road(14, 22, 15, 40, RG.Path); b.rect(14, 40, 32, 41, RG.Path);
  // the hedge maze (entrance at the bottom)
  b.rect(2, 2, 14, 14, RG.Hedge);
  b.rect(8, 13, 8, 14, RG.Path); b.rect(3, 13, 13, 13, RG.Path); b.rect(3, 3, 3, 13, RG.Path); b.rect(3, 3, 11, 3, RG.Path);
  b.rect(11, 3, 11, 9, RG.Path); b.rect(6, 9, 11, 9, RG.Path); b.rect(6, 6, 6, 9, RG.Path); b.rect(6, 6, 9, 6, RG.Path);
  b.rect(13, 5, 13, 12, RG.Path); // a dead end
  b.rect(8, 15, 8, 19, RG.Path);
  // the Residential District (east of Gate Walk)
  b.rect(38, 22, 46, 32, RG.Paving); // courtyard
  b.rect(34, 26, 37, 27, RG.Paving);
  b.rect(36, 9, 46, 10, RG.Cobble); b.rect(36, 9, 37, 19, RG.Cobble); // Linden Row — 8.1: runs in front of the apartments, not behind them
  b.rect(38, 33, 46, 34, RG.Flowers); // community garden beds

  const props: RegionProp[] = [
    { kind: 'parkgate', x: 528, y: 704 },
    { kind: 'gazebo', x: 300, y: 280 },
    { kind: 'conservatory', x: 440, y: 140 },
    { kind: 'picnicblanket', x: 380, y: 420 }, { kind: 'picnicblanket', x: 444, y: 452, variant: 1 },
    // Milestone 10: one duck per quarter of the pond (they used to paddle across the plank bridges)
    { kind: 'duck', x: 176, y: 448 }, { kind: 'duck', x: 286, y: 448, variant: 1 }, { kind: 'duck', x: 192, y: 542, variant: 2 }, { kind: 'duck', x: 278, y: 534, variant: 3 },
    { kind: 'berrybush', x: 196, y: 260 }, { kind: 'berrybush', x: 268, y: 200 }, { kind: 'berrybush', x: 100, y: 400 },
    { kind: 'parkbench', x: 470, y: 300 }, { kind: 'parkbench', x: 300, y: 380 }, { kind: 'parkbench', x: 600, y: 600 },
    { kind: 'lamp', x: 504, y: 120 }, { kind: 'lamp', x: 504, y: 360 }, { kind: 'lamp', x: 504, y: 600 }, { kind: 'lamp', x: 120, y: 300 },
    { kind: 'flowerbed', x: 420, y: 520 }, { kind: 'flowerbed', x: 380, y: 260 }, { kind: 'reeds', x: 150, y: 520 }, { kind: 'reeds', x: 300, y: 460, variant: 1 },
    // residential
    { kind: 'apartment', x: 640, y: 140, variant: 0 }, { kind: 'apartment', x: 720, y: 140, variant: 1 },
    { kind: 'townhouse', x: 632, y: 300, variant: 0 }, { kind: 'townhouse', x: 712, y: 300, variant: 1 },
    { kind: 'apartment', x: 700, y: 650, variant: 2 },
    { kind: 'laundry', x: 680, y: 356 },
    { kind: 'planter', x: 640, y: 420 }, { kind: 'planter', x: 740, y: 420 }, { kind: 'parkbench', x: 690, y: 470 },
    { kind: 'lamp', x: 624, y: 380 }, { kind: 'lamp', x: 752, y: 380 },
  ];
  const keep: Vec2[] = [PARK_GATE, { x: 300, y: 292 }, { x: 440, y: 160 }, { x: 136, y: 104 }, { x: 240, y: 300 }, { x: 680, y: 390 }, { x: 440, y: 190 }, { x: 128, y: 300 }];
  const rand = seededRandom(0x9a5c);
  props.push(...scatter({ cols, rows, ground: b.g }, rand, 42, 'tree', [RG.Grass], [...keep, ...props], 32, 3, props));
  props.push(...scatter({ cols, rows, ground: b.g }, rand, 18, 'bush', [RG.Grass], [...keep, ...props], 26, 2, props));

  const tulip: NpcDef = {
    id: 'tulip', name: 'Nana Tulip', coat: 'cloud', extra: 'flower', x: 680, y: 400, facing: 'down',
    schedule: ({ phase, rain }) => (rain ? { x: 712, y: 316, facing: 'down', pose: 'sit', doing: 'Knitting on her doorstep, out of the rain' }
      : night(phase) ? { x: 632, y: 316, facing: 'down', pose: 'sit', doing: 'Watching the stars from her step' }
        : { x: 680, y: 400, facing: 'down', doing: 'Tending the courtyard garden' }),
  };
  const bloom: NpcDef = {
    id: 'bloom', name: 'Professor Bloom', coat: 'mint', extra: 'glasses', x: 440, y: 186, facing: 'down',
    schedule: ({ rain }) => (rain ? { x: 440, y: 186, facing: 'up', doing: 'Sheltering by the conservatory door' } : { x: 230, y: 420, facing: 'down', doing: 'Counting ducks at the pond' }),
  };
  const spots: AdventureSpot[] = [
    spot({ id: 'park-to-city', role: 'exit', label: 'Back through the gate to Central Plaza', point: { x: 528, y: 690 }, radius: 24, to: { region: 'city', x: 528, y: 72 } }),
    npcSpot(tulip, 'Talk to Nana Tulip'),
    npcSpot(bloom, 'Talk to Professor Bloom'),
    spot({ id: 'park-gazebo', role: 'activity', activity: 'bench', label: 'Sit in the gazebo', point: { x: 300, y: 292 }, radius: 18 }),
    spot({ id: 'park-conservatory', role: 'sign', label: 'Peek into the conservatory', point: { x: 440, y: 156 }, radius: 16, journal: ['conservatory'], seen: 'landmark-conservatory',
      text: 'Warm, wet glass. Inside, silver-white moonflowers sway — the same flowers that grow in the Dreaming Isles.' }),
    spot({ id: 'park-ducks', role: 'activity', activity: 'watch', label: 'Watch the ducks', point: { x: 240, y: 436 }, radius: 18, journal: ['creature-ducks'], seen: 'creature-ducks',
      text: 'Three ducks paddle in neat loops. One quacks at you, then pretends it didn’t.' }),
    spot({ id: 'park-pond-fish', role: 'activity', activity: 'fish', label: 'Fish from the pond bridge', point: { x: 160, y: 482 }, radius: 14 }),
    ...[[196, 260], [268, 200], [100, 400]].map(([x, y], i) => spot({ id: `park-berries-${i}`, role: 'collect', label: 'Pick berries', point: { x, y: y + 12 }, radius: 14,
      collect: { item: 'berries', once: true, text: 'A pawful of sweet park berries.' } })),
    bench('park-bench-0', 470, 300), bench('park-bench-1', 300, 380), bench('park-bench-2', 600, 600), bench('park-bench-3', 690, 470),
    ...[[380, 420], [444, 452]].map(([x, y], i) => spot({ id: `park-picnic-${i}`, role: 'activity', activity: 'bench', label: 'Sit on the picnic blanket', point: { x, y: y + 4 }, radius: 16 })),
    stamp('stamp-maze', 104, 104, 'Something papery at the heart of the maze'),
    stamp('stamp-courtyard', 740, 434, 'A stamp tucked under a flowerpot'),
    spot({ id: 'park-scarf', role: 'collect', label: 'A blue scarf is caught on the gazebo railing', point: { x: 248, y: 296 }, radius: 14, when: step('lost-scarf', 0),
      collect: { item: 'blue-scarf', key: true, once: true, text: 'A soft blue scarf. It smells faintly of peppermint.' } }),
    spot({ id: 'res-garden', role: 'collect', label: 'Pick herbs from the community garden', point: { x: 720, y: 520 }, radius: 16,
      collect: { item: 'herbs', once: true, text: 'Nana Tulip says the community garden is for everyone. You take a handful of herbs.' } }),
  ];
  return {
    id: 'city-park', name: 'Grand City Park', cols, rows, ground: b.g, props, spots, npcs: [tulip, bloom], gates: [], spawn: PARK_GATE,
    areas: [
      { name: 'Hedge Maze', rect: { x: 32, y: 32, w: 208, h: 208 } },
      { name: 'Lily Pond', rect: { x: 120, y: 390, w: 240, h: 180 } },
      { name: 'Conservatory', rect: { x: 380, y: 80, w: 130, h: 110 } },
      { name: 'Residential District', rect: { x: 576, y: 0, w: 192, h: 704 } },
      { name: 'Picnic Lawn', rect: { x: 340, y: 380, w: 160, h: 120 } },
    ],
    climate: { water: true },
  };
}

// =================================================================================================
// Old Town (44 x 40)
// =================================================================================================
export const OLDTOWN_GATE: Vec2 = { x: 120, y: 604 };
export function buildOldTown(): RegionDef {
  const cols = 44, rows = 40;
  const b = groundBuilder(cols, rows, RG.Brick);
  b.rect(6, 2, 8, 39, RG.Cobble); // Bell Street
  b.rect(6, 4, 41, 6, RG.Cobble); // Library Row
  b.rect(6, 17, 17, 19, RG.Cobble); // Lantern Alley
  b.disc(23, 18, 6.5, RG.Paving); // Clock Square
  b.rect(22, 6, 24, 12, RG.Cobble); b.rect(22, 24, 24, 34, RG.Cobble);
  b.rect(6, 34, 36, 36, RG.Cobble); // Market Lane (shops)
  b.rect(1, 8, 4, 12, RG.Paving); b.rect(4, 10, 6, 10, RG.Cobble); // the hidden courtyard, through a narrow gap

  const props: RegionProp[] = [
    { kind: 'clocktower', x: 368, y: 236 },
    { kind: 'librarybldg', x: 368, y: 62 },
    { kind: 'oldshop', x: 224, y: 528, variant: 0 }, { kind: 'oldshop', x: 320, y: 528, variant: 1 }, { kind: 'oldshop', x: 448, y: 528, variant: 2 },
    { kind: 'well', x: 40, y: 200 },
    { kind: 'parkbench', x: 320, y: 362 }, { kind: 'parkbench', x: 420, y: 362 },
    { kind: 'planter', x: 300, y: 196 }, { kind: 'planter', x: 436, y: 196 },
    { kind: 'barrel', x: 600, y: 600 }, { kind: 'barrel', x: 612, y: 604, variant: 1 }, { kind: 'crate', x: 560, y: 500 },
  ];
  for (const [x, y] of [[96, 140], [144, 420], [96, 560], [200, 300], [280, 108], [460, 108], [600, 108], [520, 580], [270, 330], [470, 330]]) props.push({ kind: 'oldlamp', x, y });
  const velvet: NpcDef = {
    id: 'velvet', name: 'Mr. Velvet', coat: 'midnight', extra: 'glasses', x: 184, y: 560, facing: 'down',
    // The Song Beneath the Stars: while he keeps the old trail gate he is not at the shop
    when: (v) => !v.story.velvetAtGate(),
    schedule: ({ phase }) => (night(phase) ? { x: 336, y: 340, facing: 'up', pose: 'sit', doing: 'Staring up at the stopped clock' } : { x: 184, y: 560, facing: 'down', doing: 'Polishing a pocket watch' }),
  };
  const wren: NpcDef = { id: 'wren', name: 'Wren', coat: 'blossom', extra: 'glasses', x: 360, y: 560, facing: 'down', schedule: () => ({ x: 360, y: 560, facing: 'down', doing: 'Shelving books' }) };
  const windOk = (v: AdvView) => v.onStep('clock-hour', 3) && v.item('clock-key') > 0;
  const spots: AdventureSpot[] = [
    spot({ id: 'old-to-city', role: 'exit', label: 'Back to Whiskerwick Station', point: { x: 120, y: 626 }, radius: 24, to: { region: 'city', x: 200, y: 72 } }),
    npcSpot(velvet, 'Talk to Mr. Velvet'),
    npcSpot(wren, 'Talk to Wren'),
    spot({ id: 'old-antiques', role: 'activity', activity: 'shop', shop: 'antiques', label: 'Browse Tick & Trinket Antiques', point: { x: 224, y: 542 }, radius: 14 }),
    spot({ id: 'old-books', role: 'activity', activity: 'shop', shop: 'bookshop', label: 'Browse Dog-Eared Books', point: { x: 320, y: 542 }, radius: 14 }),
    spot({ id: 'old-boutique', role: 'activity', activity: 'shop', shop: 'boutique', label: 'Enter Ribbon & Bell Boutique', point: { x: 448, y: 542 }, radius: 14 }),
    spot({ id: 'old-library-door', role: 'exit', label: 'Enter the Old Library', point: { x: 368, y: 84 }, radius: 16, to: { region: 'library', x: 192, y: 232 } }),
    spot({ id: 'old-roof-stairs', role: 'exit', label: 'Climb the iron stairs to the rooftops', point: { x: 640, y: 92 }, radius: 24, to: { region: 'rooftops', x: 64, y: 400 } }),
    spot({ id: 'old-clock', role: 'sign', label: 'Look up at the clock tower', point: { x: 368, y: 252 }, radius: 16, when: (v) => !windOk(v),
      text: (v) => (v.has('clock-fixed') ? 'TICK… TOCK. The clock keeps perfect time again. Pigeons have returned to the ledge.'
        : v.onStep('clock-hour', 3) ? 'A small brass keyhole at the base of the clock. Without the key, the hands won’t budge.'
          : 'The great clock has been stuck at eleven for as long as anyone remembers.') }),
    spot({ id: 'old-wind-clock', role: 'use', label: 'Wind the clock with the brass key', point: { x: 368, y: 252 }, radius: 16, when: windOk, setFlags: ['clock-fixed'],
      text: 'Click… whirr… CLONG! The great hands swing to twelve, and the bell rings out over every rooftop in Whiskerwick.' }),
    spot({ id: 'old-well', role: 'activity', activity: 'watch', label: 'Peer into the old well', point: { x: 40, y: 214 }, radius: 14, text: 'Far below, the water reflects a little circle of sky — and two tiny stars, even at noon.' }),
    spot({ id: 'old-courtyard', role: 'sign', label: 'A hidden courtyard', point: { x: 56, y: 140 }, radius: 16, journal: ['hidden-courtyard'], seen: 'landmark-hidden-courtyard',
      text: 'A quiet courtyard nobody seems to know about. The bench is carved with two pawprints inside a circle.' }),
    stamp('stamp-oldtown', 24, 180, 'A stamp stuck between two old bricks'),
    bench('old-bench-0', 320, 362), bench('old-bench-1', 420, 362),
  ];
  return {
    id: 'old-town', name: 'Old Town', cols, rows, ground: b.g, props, spots, npcs: [velvet, wren], gates: [], spawn: OLDTOWN_GATE,
    areas: [
      { name: 'Clock Square', rect: { x: 260, y: 180, w: 220, h: 220 } },
      { name: 'Library Row', rect: { x: 96, y: 40, w: 580, h: 80 } },
      { name: 'Lantern Alley', rect: { x: 96, y: 260, w: 180, h: 60 } },
      { name: 'Hidden Courtyard', rect: { x: 0, y: 120, w: 80, h: 100 } },
      { name: 'Old Town Shops', rect: { x: 160, y: 470, w: 500, h: 170 } },
      { name: 'Bell Street', rect: { x: 90, y: 0, w: 60, h: 640 } },
    ],
    climate: {},
  };
}

// =================================================================================================
// The Rooftops (40 x 30), above a parallax skyline
// =================================================================================================
export function buildRooftops(): RegionDef {
  const cols = 40, rows = 30;
  const b = groundBuilder(cols, rows, RG.Void);
  b.rect(1, 18, 12, 28, RG.Roof); // the stair roof
  b.rect(13, 22, 16, 23, RG.Bridge); // planks
  b.rect(17, 14, 31, 28, RG.Roof); // the café roof
  b.rect(24, 10, 25, 13, RG.Bridge);
  b.rect(18, 2, 30, 9, RG.Roof); // the garden roof
  b.rect(32, 20, 33, 21, RG.Bridge);
  b.rect(34, 17, 38, 25, RG.Roof); // the secret roof
  const props: RegionProp[] = [
    { kind: 'roofcafe', x: 384, y: 250 }, { kind: 'cafetable', x: 340, y: 330 }, { kind: 'cafetable', x: 420, y: 330 }, { kind: 'cafetable', x: 380, y: 400 },
    { kind: 'chimney', x: 60, y: 320 }, { kind: 'chimney', x: 480, y: 270 }, { kind: 'watertank', x: 160, y: 320 },
    { kind: 'stringlights', x: 384, y: 300 },
    { kind: 'planter', x: 320, y: 70 }, { kind: 'planter', x: 352, y: 70 }, { kind: 'planter', x: 448, y: 70 }, { kind: 'flowerbed', x: 400, y: 120 },
    { kind: 'telescope', x: 470, y: 120 }, { kind: 'parkbench', x: 360, y: 140 },
    { kind: 'laundry', x: 120, y: 360 },
  ];
  const sky: NpcDef = {
    id: 'sky', name: 'Sky', coat: 'pebble', extra: 'scarf', x: 300, y: 380, facing: 'right',
    schedule: ({ phase }) => (night(phase) ? { x: 440, y: 128, facing: 'up', pose: 'sit', doing: 'Stargazing by the telescope' } : { x: 300, y: 380, facing: 'right', doing: 'Sketching the skyline' }),
  };
  const spots: AdventureSpot[] = [
    spot({ id: 'roof-down', role: 'exit', label: 'Climb back down to Old Town', point: { x: 64, y: 420 }, radius: 24, to: { region: 'old-town', x: 640, y: 112 } }),
    npcSpot(sky, 'Talk to Sky'),
    spot({ id: 'roof-cafe', role: 'activity', activity: 'shop', shop: 'cafe', label: 'Order at the Rooftop Café', point: { x: 384, y: 266 }, radius: 16 }),
    ...[[340, 330], [420, 330], [380, 400]].map(([x, y], i) => spot({ id: `roof-seat-${i}`, role: 'activity', activity: 'bench', label: 'Take a seat at the café table', point: { x, y: y + 10 }, radius: 14 })),
    bench('roof-bench', 360, 140),
    spot({ id: 'roof-scope', role: 'activity', activity: 'telescope', scope: 'rooftops', label: 'Look through the rooftop telescope', point: { x: 470, y: 134 }, radius: 14, journal: ['roof-scope'], seen: 'landmark-roof-scope',
      text: (v) => (v.has('constellation-lumi') ? 'Above the clock tower, Lumi’s five stars twinkle. From up here you could almost reach them.' : 'Chimneys, the clock tower, the sea… and a sky full of stars, with a few strangely missing.') }),
    spot({ id: 'roof-herbs', role: 'collect', label: 'Pick herbs from the rooftop garden', point: { x: 336, y: 86 }, radius: 14, collect: { item: 'herbs', once: true, text: 'Rooftop herbs — they taste of sunshine.' } }),
    spot({ id: 'roof-key', role: 'collect', label: 'Something brass glints in the gutter', point: { x: 584, y: 360 }, radius: 14, when: step('clock-hour', 2),
      collect: { item: 'clock-key', key: true, once: true, text: 'A heavy brass key with a clock face on its bow.' } }),
    stamp('stamp-roof', 176, 300, 'A loose roof tile with something under it'),
  ];
  return {
    id: 'rooftops', name: 'The Rooftops', cols, rows, ground: b.g, props, spots, npcs: [sky], gates: [], spawn: { x: 64, y: 400 },
    areas: [
      { name: 'Rooftop Café', rect: { x: 272, y: 224, w: 240, h: 230 } },
      { name: 'Rooftop Garden', rect: { x: 288, y: 32, w: 208, h: 128 } },
      { name: 'The Secret Roof', rect: { x: 544, y: 272, w: 80, h: 140 } },
      { name: 'Stair Roof', rect: { x: 16, y: 288, w: 192, h: 176 } },
    ],
    climate: { sky: 'skyline' },
  };
}

// =================================================================================================
// Interiors (24 x 16 rooms)
// =================================================================================================
function room(floor: RGround, cols = 24, rows = 16) {
  const b = groundBuilder(cols, rows, RG.IWall);
  b.rect(1, 4, cols - 2, rows - 2, floor);
  b.rect(11, rows - 1, 12, rows - 1, floor);
  return b;
}

export function buildHearth(): RegionDef {
  const b = room(RG.Wood);
  const showroom = SHOP_FURNITURE().filter((d) => d.layer === 'floor').slice(0, 11);
  const slots: [number, number][] = [[52, 96], [128, 96], [208, 96], [272, 96], [336, 96], [52, 168], [104, 168], [272, 168], [336, 168], [60, 216], [330, 216]];
  const props: RegionProp[] = showroom.map((d, i) => ({ kind: `decor:${d.id}`, x: slots[i][0], y: slots[i][1] }));
  props.push({ kind: 'counter', x: 192, y: 178 });
  const hazel: NpcDef = { id: 'hazel', name: 'Hazel', coat: 'cocoa', extra: 'flower', x: 192, y: 140, facing: 'down', schedule: () => ({ x: 192, y: 140, facing: 'down', doing: 'Arranging cushions' }) };
  const spots: AdventureSpot[] = [
    spot({ id: 'hearth-exit', role: 'exit', label: 'Back out to Shopping Street', point: { x: 192, y: 248 }, radius: 24, to: { region: 'city', x: 480, y: 206 } }),
    npcSpot(hazel, 'Talk to Hazel'),
    spot({ id: 'hearth-catalogue', role: 'activity', activity: 'shop', shop: 'furniture', label: 'Browse the furniture catalogue', point: { x: 192, y: 194 }, radius: 16 }),
  ];
  return { id: 'hearth', name: 'Hearth & Whisker', cols: 24, rows: 16, ground: b.g, props, spots, npcs: [hazel], gates: [], spawn: { x: 192, y: 232 }, areas: [], climate: { indoor: 'warm' } };
}

export function buildLibrary(): RegionDef {
  const b = room(RG.Carpet);
  const props: RegionProp[] = [];
  for (let i = 0; i < 6; i++) props.push({ kind: 'bookcase', x: 40 + i * 60, y: 96 });
  props.push({ kind: 'bookcase', x: 40, y: 168 }, { kind: 'bookcase', x: 344, y: 168 });
  props.push({ kind: 'readingtable', x: 136, y: 182 }, { kind: 'readingtable', x: 256, y: 182 }, { kind: 'globe', x: 320, y: 222 });
  const spots: AdventureSpot[] = [
    spot({ id: 'library-exit', role: 'exit', label: 'Back out to Library Row', point: { x: 192, y: 248 }, radius: 24, to: { region: 'old-town', x: 368, y: 108 } }),
    spot({ id: 'library-ledger', role: 'use', label: 'Read the old ledger on the reading table', point: { x: 136, y: 196 }, radius: 16, journal: ['clock-ledger'],
      text: '“The clock tower key was kept by the lamplighter, who loved the high places. When she retired, the key went up with her chimneys.”' }),
    spot({ id: 'library-history', role: 'sign', label: 'Leaf through “A History of Whiskerwick”', point: { x: 256, y: 196 }, radius: 16,
      text: 'Whiskerwick began as a fishing village. The first train arrived from Pawville a hundred years ago — the same year the clock stopped.' }),
    spot({ id: 'library-atlas', role: 'sign', label: 'Open the star atlas by the globe', point: { x: 320, y: 236 }, radius: 14,
      text: (v) => (v.has('constellation-lumi') ? 'Someone has pencilled a new five-star constellation into the atlas: “Lumi”.' : 'An old star atlas. One page shows five stars in a little creature’s shape — labelled “lost”.') }),
    stamp('stamp-library', 96, 212, 'A stamp used as a bookmark'),
  ];
  return { id: 'library', name: 'The Old Library', cols: 24, rows: 16, ground: b.g, props, spots, npcs: [], gates: [], spawn: { x: 192, y: 232 }, areas: [], climate: { indoor: 'library' } };
}

export function buildPurringCup(): RegionDef {
  const b = room(RG.Wood);
  const props: RegionProp[] = [
    { kind: 'counter', x: 120, y: 100 }, { kind: 'pastrycase', x: 200, y: 98 },
    { kind: 'cafetable', x: 210, y: 166 }, { kind: 'cafetable', x: 290, y: 166 }, { kind: 'cafetable', x: 210, y: 222 }, { kind: 'cafetable', x: 290, y: 222 },
    { kind: 'windowseat', x: 340, y: 110 }, { kind: 'planter', x: 40, y: 200 }, { kind: 'planter', x: 344, y: 230 },
    { kind: 'karaokestage', x: 64, y: 150 }, // Milestone 8.2: karaoke nights
  ];
  const spots: AdventureSpot[] = [
    spot({ id: 'cup-exit', role: 'exit', label: 'Back out to the Café Quarter', point: { x: 192, y: 248 }, radius: 24, to: { region: 'city', x: 352, y: 630 } }),
    spot({ id: 'cup-order', role: 'activity', activity: 'shop', shop: 'cafe', label: 'Order at the counter', point: { x: 120, y: 116 }, radius: 16 }),
    ...[[210, 166], [290, 166], [210, 222], [290, 222]].map(([x, y], i) => spot({ id: `cup-seat-${i}`, role: 'activity', activity: 'bench', label: 'Sit down at a table', point: { x, y: y + 10 }, radius: 14 })),
    spot({ id: 'cup-window', role: 'activity', activity: 'bench', label: 'Curl up on the warm window seat', point: { x: 340, y: 124 }, radius: 14 }),
    spot({ id: 'cup-karaoke', role: 'activity', activity: 'machine', machine: 'karaoke', label: 'Step up to the karaoke mic', point: { x: 64, y: 164 }, radius: 14 }),
  ];
  return { id: 'purring-cup', name: 'The Purring Cup', cols: 24, rows: 16, ground: b.g, props, spots, npcs: [], gates: [], spawn: { x: 192, y: 232 }, areas: [], climate: { indoor: 'cafe' } };
}
