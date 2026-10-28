/**
 * The Pawville town layout. Pure data + deterministic generation: every client builds the
 * exact same town, which is what makes shared multiplayer positions meaningful.
 *
 * Milestone 3 extends the original 48×36-tile town southwards with the Park (swing, seesaw,
 * picnic meadow, stargazing hill, shared garden, pond), the couple home, and new small
 * interactions across the existing town. The original northern layout is unchanged.
 *
 * Units: TILE = 16 world pixels. Coordinates are world pixels, anchored at the feet.
 */
import { distance, expandRect, pointInRect, rectsOverlap, seededRandom, type Rect, type Vec2 } from './geometry.ts';

export const TILE = 16;
export const MAP_COLS = 48;
export const MAP_ROWS = 54;
export const WORLD_W = MAP_COLS * TILE; // 768
export const WORLD_H = MAP_ROWS * TILE; // 864
/** The original Milestone 1/2 town height (rows 0–35). */
export const OLD_TOWN_ROWS = 36;

export const Ground = {
  Grass: 0, Path: 1, Plaza: 2, Water: 3, Sand: 4, Dock: 5, Dirt: 6, Flowerbed: 7, Hill: 8, Meadow: 9, Soil: 10,
} as const;
export type GroundType = (typeof Ground)[keyof typeof Ground];

/** Buildings / game destinations (open a destination panel). */
/** Milestone 7: 'typing-arena' was retired (PawType moved into the arcades). */
export type DestinationId = 'arcade' | 'harbor' | 'puzzle-garden' | 'event-board' | 'whack-a-cat' | 'home' | 'boxing-ring';

export type BuildingStyle = 'arcade' | 'station' | 'harbor' | 'greenhouse' | 'home';

export interface Building {
  /** A destination, or 'station' (Milestone 7: a travel building handled by the adventure layer). */
  id: DestinationId | 'station';
  name: string;
  style: BuildingStyle;
  rect: Rect;
  door: Rect;
  sign: string;
}

/** Everything that can be interacted with in town. */
export type InteractKind = 'destination' | 'activity' | 'object';

export type ActivityId = 'swing' | 'seesaw' | 'bench' | 'picnic' | 'stargaze' | 'fishing' | 'garden' | 'pond' | 'photo-arch';
export type ObjectId = 'fountain-coin' | 'mailbox' | 'vending' | 'claw' | 'apple-tree' | 'flowers' | 'puddle' | 'shell' | 'toy';

export interface Interactable {
  /** Unique id of this spot (e.g. "bench-1", "shell-2"). */
  id: string;
  kind: InteractKind;
  /** Which handler runs: a destination id, activity id or object id. */
  action: DestinationId | ActivityId | ObjectId;
  label: string;
  point: Vec2;
  radius: number;
  /** Availability rule evaluated with the current environment (see environment.ts). */
  when?: 'always' | 'wet' | 'night';
}

export type PropKind =
  | 'tree' | 'pine' | 'bush' | 'lamp' | 'bench' | 'fountain' | 'board' | 'lot' | 'barrel' | 'crate' | 'boat' | 'signpost' | 'napcat'
  | 'swing' | 'seesaw' | 'appletree' | 'mailbox' | 'vending' | 'claw' | 'arch' | 'telescope' | 'fence' | 'reeds' | 'blanket-rack' | 'ring';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  variant: number;
}

const CENTER: Vec2 = { x: 24 * TILE, y: 20 * TILE };
export const PLAZA_CENTER: Vec2 = CENTER;
export const PLAZA_RADIUS = 88;
export const SPAWN_POINT: Vec2 = { x: 384, y: 440 };

const tiles = (c: number, r: number, w: number, h: number): Rect => ({ x: c * TILE, y: r * TILE, w: w * TILE, h: h * TILE });

export const BUILDINGS: readonly Building[] = [
  { id: 'arcade', name: 'Arcade', style: 'arcade', rect: tiles(18, 2, 12, 7), door: tiles(23, 7, 2, 2), sign: 'ARCADE' },
  { id: 'station', name: 'Pawville Station', style: 'station', rect: tiles(3, 11, 10, 7), door: tiles(7, 16, 2, 2), sign: 'STATION' },
  { id: 'harbor', name: 'Harbor', style: 'harbor', rect: tiles(31, 10, 8, 7), door: tiles(34, 15, 2, 2), sign: 'HARBOR' },
  { id: 'puzzle-garden', name: 'Puzzle Garden', style: 'greenhouse', rect: tiles(4, 23, 10, 6), door: tiles(8, 27, 2, 2), sign: 'GARDEN' },
  { id: 'home', name: 'Our Home', style: 'home', rect: tiles(4, 37, 9, 6), door: tiles(8, 41, 2, 2), sign: 'HOME' },
];

/** Stargazing hill (a gentle mound) and the shared garden plots. */
export const HILL = { center: { x: 584, y: 664 }, radius: 52 };
export const GARDEN_RECT: Rect = tiles(27, 47, 6, 3);
export const POND_RECT: Rect = tiles(10, 48, 5, 3);
export const RING_RECT: Rect = tiles(30, 33, 6, 3); // Boxing ring (rope square) south-east of the plaza
export const MEADOW_CENTER: Vec2 = { x: 440, y: 648 };

/**
 * Every bench in Pawville — the ONE list the props, the interactions and the seats are derived
 * from, so a bench can never exist without being sittable (checked by tests that enumerate the
 * bench props). Coordinates are the bench prop's feet anchor. Ids are stable: bench-0..3 are the
 * Milestone 3 plaza benches; bench-4 is the park bench near the seesaw (previously decorative).
 */
export interface BenchDef {
  id: string;
  x: number;
  y: number;
  area: string;
  /** Milestone 10: which way you look when sitting. 'up' = the seat faces north (back view of the bench). */
  faces?: 'up' | 'down';
}
export const BENCHES: readonly BenchDef[] = [
  { id: 'bench-0', x: 330, y: 272, area: 'Fountain Plaza' },
  { id: 'bench-1', x: 438, y: 272, area: 'Fountain Plaza' },
  // Milestone 10: the two benches SOUTH of the fountain now face it (they used to face away)
  { id: 'bench-2', x: 330, y: 376, area: 'Fountain Plaza', faces: 'up' },
  { id: 'bench-3', x: 438, y: 376, area: 'Fountain Plaza', faces: 'up' },
  { id: 'bench-4', x: 556, y: 776, area: 'Paw Park' },
];
/**
 * Two seats per bench (left, right), 18 px apart: a sitting cat's sprite is up to 18 px wide (whiskers included), so at the old
 * 12 px two cats overlapped by ~50 pixels; at 18 they do not overlap at all (tests/pawvilleSeatClaims.test.ts measures it).
 *
 * Draw order: a bench that faces the viewer ('down', the seat plank is in front) has its cats drawn IN FRONT of it, 1 px below the
 * bench's baseline and lifted onto the plank. They used to sit 1 px BEHIND the baseline, so the bench's front boards were drawn over
 * them and the cats looked sunk into the bench (the same bug Milestone 8.1 fixed for the city benches). A bench seen from behind
 * ('up') keeps its cats behind it: you see their backs over the backrest.
 */
export function benchSeats(b: Pick<BenchDef, 'x' | 'y'> & { faces?: 'up' | 'down' }): [{ x: number; y: number }, { x: number; y: number }] {
  const y = b.faces === 'up' ? b.y - 1 : b.y + 1;
  return [{ x: b.x - 9, y }, { x: b.x + 9, y }];
}
/** How far the sitting cat is raised onto the seat plank (pixels), measured from the bench sprites. */
export function benchSeatLift(b: Pick<BenchDef, 'faces'>): number {
  return b.faces === 'up' ? 4 : 8;
}
/** Where the player stands to use the bench (on the side the seat faces, outside its collider). */
export function benchApproach(b: Pick<BenchDef, 'x' | 'y' | 'faces'>): Vec2 {
  return b.faces === 'up' ? { x: b.x, y: b.y - 13 } : { x: b.x, y: b.y + 12 };
}
/** Which way a seated cat looks on this bench (towards the view the seat faces). */
export function benchFacing(b: Pick<BenchDef, 'faces'>, seat: 0 | 1): 'up' | 'left' | 'right' {
  return b.faces === 'up' ? 'up' : seat === 0 ? 'right' : 'left';
}
export function benchById(id: string): BenchDef | undefined {
  return BENCHES.find((b) => b.id === id);
}

/** Seats used by park activities (feet positions when seated). */
export const SEATS = {
  swing: [{ x: 290, y: 646 }, { x: 314, y: 646 }],
  seesaw: [{ x: 278, y: 770 }, { x: 330, y: 770 }],
  bench: BENCHES.map((b) => benchSeats(b)),
  stargaze: [{ x: 574, y: 652 }, { x: 596, y: 652 }],
  picnic: [{ x: 430, y: 646 }, { x: 452, y: 646 }],
  fishing: [{ x: 712, y: 366 }, { x: 690, y: 366 }],
} as const;

export const INTERACTABLES: readonly Interactable[] = [
  // --- destinations (original + new) ---
  { id: 'arcade', kind: 'destination', action: 'arcade', label: 'Enter the Arcade', point: { x: 384, y: 152 }, radius: 26 },
  { id: 'harbor', kind: 'destination', action: 'harbor', label: 'Visit the Harbor', point: { x: 560, y: 280 }, radius: 24 },
  { id: 'puzzle-garden', kind: 'destination', action: 'puzzle-garden', label: 'Enter the Puzzle Garden', point: { x: 144, y: 472 }, radius: 24 },
  { id: 'event-board', kind: 'destination', action: 'event-board', label: 'Read the Event Board', point: { x: 432, y: 432 }, radius: 22 },
  { id: 'whack-a-cat', kind: 'destination', action: 'whack-a-cat', label: 'Play at the Whack-a-Cat booth', point: { x: 520, y: 484 }, radius: 22 },
  { id: 'boxing-ring', kind: 'destination', action: 'boxing-ring', label: 'Step up to the Boxing Ring', point: { x: 528, y: 590 }, radius: 22 },
  { id: 'home', kind: 'destination', action: 'home', label: 'Go inside your home', point: { x: 144, y: 696 }, radius: 24 },
  // --- park activities ---
  { id: 'swing', kind: 'activity', action: 'swing', label: 'Sit on the swing', point: { x: 302, y: 660 }, radius: 24 },
  { id: 'seesaw', kind: 'activity', action: 'seesaw', label: 'Hop on the seesaw', point: { x: 304, y: 788 }, radius: 26 },
  { id: 'picnic', kind: 'activity', action: 'picnic', label: 'Lay out a picnic', point: { x: 440, y: 664 }, radius: 26 },
  { id: 'stargaze', kind: 'activity', action: 'stargaze', label: 'Lie back and watch the sky', point: { x: 584, y: 676 }, radius: 26 },
  { id: 'garden', kind: 'activity', action: 'garden', label: 'Tend the shared garden', point: { x: 480, y: 816 }, radius: 26 },
  { id: 'pond', kind: 'activity', action: 'pond', label: 'Sit by the pond', point: { x: 200, y: 832 }, radius: 22 },
  { id: 'fishing', kind: 'activity', action: 'fishing', label: 'Cast a line off the pier', point: { x: 712, y: 364 }, radius: 20 },
  { id: 'photo-arch', kind: 'activity', action: 'photo-arch', label: 'Take a photo under the arch', point: { x: 384, y: 604 }, radius: 18 },
  // every bench (derived from BENCHES — see above)
  ...BENCHES.map((b): Interactable => ({ id: b.id, kind: 'activity', action: 'bench', label: 'Sit on the bench', point: benchApproach(b), radius: 14 })),
  // --- small objects ---
  { id: 'fountain-coin', kind: 'object', action: 'fountain-coin', label: 'Toss a coin in the fountain', point: { x: 384, y: 346 }, radius: 18 },
  { id: 'mailbox', kind: 'object', action: 'mailbox', label: 'Check the mailbox', point: { x: 224, y: 700 }, radius: 16 },
  { id: 'vending', kind: 'object', action: 'vending', label: 'Use the snack machine', point: { x: 286, y: 488 }, radius: 16 },
  { id: 'claw', kind: 'object', action: 'claw', label: 'Try the claw machine', point: { x: 506, y: 156 }, radius: 16 },
  { id: 'apple-tree', kind: 'object', action: 'apple-tree', label: 'Shake the apple tree', point: { x: 330, y: 536 }, radius: 18 },
  { id: 'flowers', kind: 'object', action: 'flowers', label: 'Pick a few flowers', point: { x: 124, y: 520 }, radius: 18 },
  { id: 'puddle-0', kind: 'object', action: 'puddle', label: 'Splash in the puddle', point: { x: 372, y: 448 }, radius: 14, when: 'wet' },
  { id: 'puddle-1', kind: 'object', action: 'puddle', label: 'Splash in the puddle', point: { x: 376, y: 712 }, radius: 14, when: 'wet' },
  { id: 'shell-0', kind: 'object', action: 'shell', label: 'Pick up a shell', point: { x: 636, y: 500 }, radius: 14 },
  { id: 'shell-1', kind: 'object', action: 'shell', label: 'Pick up a shell', point: { x: 630, y: 724 }, radius: 14 },
  { id: 'shell-2', kind: 'object', action: 'shell', label: 'Pick up a shell', point: { x: 640, y: 830 }, radius: 14 },
  { id: 'toy-0', kind: 'object', action: 'toy', label: 'Something squeaky is hiding here…', point: { x: 610, y: 120 }, radius: 14 },
  { id: 'toy-1', kind: 'object', action: 'toy', label: 'Something squeaky is hiding here…', point: { x: 40, y: 600 }, radius: 14 },
  { id: 'toy-2', kind: 'object', action: 'toy', label: 'Something squeaky is hiding here…', point: { x: 560, y: 846 }, radius: 14 },
];

export const FOUNTAIN = { x: 384, y: 330, collider: { x: 358, y: 300, w: 52, h: 30 } as Rect };
export const EVENT_BOARD_PROP: Prop = { kind: 'board', x: 432, y: 418, variant: 0 };
export const LOT_RECT: Rect = tiles(29, 24, 7, 5);

/** Deep water (solid). The dock rows stay walkable; the pond is solid too. */
export const WATER_RECTS: readonly Rect[] = [tiles(41, 0, 7, 22), tiles(41, 24, 7, 30), tiles(46, 22, 2, 2), POND_RECT];

export const WORLD_BOUNDS: Rect = { x: 16, y: 26, w: WORLD_W - 32, h: WORLD_H - 34 };

export function buildGround(): Uint8Array {
  const g = new Uint8Array(MAP_COLS * MAP_ROWS).fill(Ground.Grass);
  const fill = (c0: number, r0: number, c1: number, r1: number, t: GroundType) => {
    for (let r = Math.max(0, r0); r <= Math.min(MAP_ROWS - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(MAP_COLS - 1, c1); c++) g[r * MAP_COLS + c] = t;
    }
  };
  // original town
  fill(3, 19, 38, 20, Ground.Path);
  fill(23, 9, 24, 52, Ground.Path); // main north–south road now runs into the park
  fill(7, 18, 8, 18, Ground.Path);
  fill(34, 17, 35, 18, Ground.Path);
  fill(8, 29, 9, 29, Ground.Path);
  fill(8, 30, 36, 31, Ground.Path);
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (distance({ x: c * TILE + 8, y: r * TILE + 8 }, CENTER) <= PLAZA_RADIUS) g[r * MAP_COLS + c] = Ground.Plaza;
    }
  }
  fill(39, 0, 40, MAP_ROWS - 1, Ground.Sand);
  fill(41, 0, 47, MAP_ROWS - 1, Ground.Water);
  fill(41, 22, 45, 23, Ground.Dock);
  fill(29, 24, 35, 28, Ground.Dirt);
  fill(3, 30, 6, 33, Ground.Flowerbed);
  fill(11, 32, 14, 33, Ground.Flowerbed);
  fill(15, 24, 16, 27, Ground.Flowerbed);
  // park
  fill(6, 44, 38, 45, Ground.Path); // park promenade
  fill(8, 43, 9, 43, Ground.Path); // home doorstep
  fill(17, 38, 21, 41, Ground.Meadow);
  fill(25, 38, 31, 43, Ground.Meadow); // picnic meadow
  fill(16, 46, 22, 50, Ground.Meadow); // seesaw lawn
  fill(GARDEN_RECT.x / TILE, GARDEN_RECT.y / TILE, (GARDEN_RECT.x + GARDEN_RECT.w) / TILE - 1, (GARDEN_RECT.y + GARDEN_RECT.h) / TILE - 1, Ground.Soil);
  for (let r = 36; r < MAP_ROWS; r++) {
    for (let c = 30; c < 39; c++) {
      if (distance({ x: c * TILE + 8, y: r * TILE + 8 }, HILL.center) <= HILL.radius) g[r * MAP_COLS + c] = Ground.Hill;
    }
  }
  fill(POND_RECT.x / TILE, POND_RECT.y / TILE, (POND_RECT.x + POND_RECT.w) / TILE - 1, (POND_RECT.y + POND_RECT.h) / TILE - 1, Ground.Water);
  return g;
}

export function groundAt(ground: Uint8Array, col: number, row: number): GroundType {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return Ground.Water;
  return ground[row * MAP_COLS + col] as GroundType;
}

function fixedProps(): Prop[] {
  const p = (kind: PropKind, x: number, y: number, variant = 0): Prop => ({ kind, x, y, variant });
  return [
    p('fountain', FOUNTAIN.x, FOUNTAIN.y),
    EVENT_BOARD_PROP,
    p('lot', LOT_RECT.x + LOT_RECT.w / 2, LOT_RECT.y + LOT_RECT.h),
    p('signpost', 352, 458),
    ...BENCHES.map((b) => p('bench', b.x, b.y, b.faces === 'up' ? 1 : 0)),
    p('napcat', 438, 266),
    p('lamp', 360, 184), p('lamp', 408, 184), p('lamp', 360, 472), p('lamp', 408, 470),
    p('lamp', 96, 300), p('lamp', 200, 344), p('lamp', 264, 300), p('lamp', 504, 344), p('lamp', 600, 300),
    p('lamp', 200, 476), p('lamp', 296, 528),
    p('barrel', 600, 290), p('barrel', 612, 292, 1), p('crate', 516, 292),
    p('boat', 724, 424),
    p('bush', 60, 470), p('bush', 230, 470, 1), p('bush', 232, 380),
    // Milestone 3
    p('ring', RING_RECT.x + RING_RECT.w / 2, RING_RECT.y + RING_RECT.h),
    p('claw', 506, 140),
    p('vending', 286, 474),
    p('appletree', 330, 520),
    p('arch', 384, 592),
    p('swing', 302, 646),
    p('seesaw', 304, 772),
    p('telescope', 612, 650),
    p('mailbox', 224, 688),
    p('fence', GARDEN_RECT.x + GARDEN_RECT.w / 2, GARDEN_RECT.y + GARDEN_RECT.h + 2),
    p('reeds', POND_RECT.x - 4, POND_RECT.y + POND_RECT.h), p('reeds', POND_RECT.x + POND_RECT.w + 4, POND_RECT.y + 12, 1),
    p('blanket-rack', 476, 618),
    p('lamp', 360, 604), p('lamp', 408, 604), p('lamp', 248, 728), p('lamp', 520, 728), p('lamp', 360, 852),
    p('bush', 100, 752), p('bush', 252, 600, 1),
  ];
}

export function propCollider(prop: Prop): Rect | null {
  const { x, y } = prop;
  switch (prop.kind) {
    case 'tree': case 'appletree': return { x: x - 5, y: y - 5, w: 10, h: 5 };
    case 'pine': return { x: x - 4, y: y - 5, w: 8, h: 5 };
    case 'bush': return { x: x - 7, y: y - 6, w: 14, h: 6 };
    case 'lamp': return { x: x - 2, y: y - 3, w: 4, h: 3 };
    case 'bench': return { x: x - 12, y: y - 6, w: 24, h: 6 };
    case 'fountain': return FOUNTAIN.collider;
    case 'board': return { x: x - 14, y: y - 8, w: 28, h: 8 };
    case 'lot': return LOT_RECT;
    case 'barrel': return { x: x - 5, y: y - 5, w: 10, h: 5 };
    case 'crate': return { x: x - 6, y: y - 6, w: 12, h: 6 };
    case 'signpost': return { x: x - 2, y: y - 3, w: 4, h: 3 };
    case 'ring': return { x: RING_RECT.x, y: RING_RECT.y, w: RING_RECT.w, h: RING_RECT.h - 6 };
    case 'claw': case 'vending': return { x: x - 8, y: y - 8, w: 16, h: 8 };
    case 'swing': return null; // posts are thin; the seats are walk-through so cats can sit
    case 'seesaw': return { x: x - 3, y: y - 4, w: 6, h: 4 };
    case 'telescope': return { x: x - 3, y: y - 3, w: 6, h: 3 };
    case 'mailbox': return { x: x - 3, y: y - 3, w: 6, h: 3 };
    case 'fence': return { x: GARDEN_RECT.x - 2, y: GARDEN_RECT.y - 2, w: GARDEN_RECT.w + 4, h: GARDEN_RECT.h + 4 };
    case 'arch': return null;
    case 'reeds': case 'blanket-rack': case 'boat': case 'napcat': return null;
  }
}

function generateTrees(ground: Uint8Array, occupied: readonly Rect[]): Prop[] {
  const trees: Prop[] = [];
  const add = (x: number, y: number, kind: 'tree' | 'pine', variant: number) => trees.push({ kind, x, y, variant });
  let i = 0;
  for (let x = 16; x < 39 * TILE; x += 30, i++) add(x, 22, i % 3 === 0 ? 'pine' : 'tree', i % 3);
  for (let y = 60; y < WORLD_H - 20; y += 34, i++) add(8, y, i % 2 === 0 ? 'pine' : 'tree', i % 3);
  // Milestone 6: the border tree in front of the old south gate (x≈384) is left out so the gate is visible.
  for (let x = 30; x < 38 * TILE; x += 32, i++) if (Math.abs(x - 384) >= 20) add(x, WORLD_H - 2, i % 3 === 1 ? 'tree' : 'pine', i % 3);
  const rand = seededRandom(0x9a77);
  const blocked = occupied.map((r) => expandRect(r, 14));
  const avoidPoints: Vec2[] = [SPAWN_POINT, ...INTERACTABLES.map((it) => it.point), ...Object.values(SEATS).flat(2) as Vec2[]];
  let attempts = 0;
  while (trees.length < 120 && attempts < 9000) {
    attempts++;
    const x = Math.round(40 + rand() * (37 * TILE - 40));
    const y = Math.round(48 + rand() * (WORLD_H - 96));
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    let ok = true;
    for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1 && ok; dc++) if (groundAt(ground, col + dc, row + dr) !== Ground.Grass) ok = false;
    if (!ok) continue;
    const foot: Rect = { x: x - 10, y: y - 26, w: 20, h: 28 };
    if (blocked.some((b) => rectsOverlap(b, foot))) continue;
    if (avoidPoints.some((p) => distance(p, { x, y }) < 44)) continue;
    if (trees.some((t) => distance(t, { x, y }) < 34)) continue;
    add(x, y, rand() < 0.3 ? 'pine' : 'tree', Math.floor(rand() * 3));
  }
  return trees;
}

export interface TownLayout {
  ground: Uint8Array;
  props: Prop[];
  solids: Rect[];
}

export function buildTown(): TownLayout {
  const ground = buildGround();
  const fixed = fixedProps();
  const occupied: Rect[] = [
    ...BUILDINGS.map((b) => b.rect),
    ...fixed.map(propCollider).filter((r): r is Rect => r !== null),
    { x: PLAZA_CENTER.x - PLAZA_RADIUS, y: PLAZA_CENTER.y - PLAZA_RADIUS, w: PLAZA_RADIUS * 2, h: PLAZA_RADIUS * 2 },
    { x: 260, y: 600, w: 90, h: 60 }, // swing area
    { x: 250, y: 740, w: 110, h: 60 }, // seesaw
    { x: 600, y: 580, w: 60, h: 20 },
  ];
  const props = [...fixed, ...generateTrees(ground, occupied)];
  const solids: Rect[] = [
    ...BUILDINGS.map((b) => b.rect),
    ...WATER_RECTS,
    ...props.map(propCollider).filter((r): r is Rect => r !== null),
  ];
  return { ground, props, solids };
}

export function areaName(p: Vec2): string {
  if (distance(p, PLAZA_CENTER) <= PLAZA_RADIUS + 8) return 'Fountain Plaza';
  if (p.x >= 39 * TILE) return 'Harbor Docks';
  if (p.y >= 36 * TILE) {
    if (distance(p, HILL.center) <= HILL.radius + 12) return 'Stargazing Hill';
    if (pointInRect(p, expandRect(GARDEN_RECT, 24))) return 'Shared Garden';
    if (p.x < 15 * TILE && p.y < 44 * TILE) return 'Home Lane';
    if (pointInRect(p, expandRect(POND_RECT, 30))) return 'Lily Pond';
    if (distance(p, MEADOW_CENTER) < 70) return 'Picnic Meadow';
    return 'Paw Park';
  }
  if (p.y < 10 * TILE) return 'Arcade Row';
  if (p.x < 15 * TILE && p.y < 21 * TILE) return 'Station Lane';
  if (p.x < 18 * TILE && p.y >= 21 * TILE) return 'Garden Walk';
  if (p.x > 27 * TILE && p.y < 21 * TILE) return 'Harbor Street';
  if (pointInRect(p, expandRect(RING_RECT, 30))) return 'The Ring';
  if (pointInRect(p, expandRect(LOT_RECT, 40))) return 'Whack-a-Cat Corner';
  return 'Pawville';
}
