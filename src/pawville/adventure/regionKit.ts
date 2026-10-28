/**
 * Region toolkit (Milestone 6): the data shapes every explorable region is made of, plus helpers
 * to build ground maps, derive collision rectangles and check reachability. Adding a new region is
 * "write one RegionDef" — the renderer, movement, presence, world map and quests pick it up.
 */
import { distance, type Rect, type Vec2 } from '../world/geometry.ts';
import type { QuestEvent } from './engine.ts';
import type { AdvView, Cond, RegionId } from './state.ts';
import type { CoatId, ExtraId } from '../appearance.ts';
import type { Facing } from '../world/movement.ts';
import type { RideId } from '../city/funfair.ts';
import type { StoryFx } from '../story/model.ts';

export const RTILE = 16;

/** Region ground types (separate from the town's, which stay untouched). */
export const RG = {
  Grass: 0, Path: 1, Sand: 2, Water: 3, Dock: 4, Rock: 5, Forest: 6, Moss: 7, Snow: 8, Ice: 9, Stone: 10, Void: 11, StarGrass: 12,
  Deep: 13, Cliff: 14, Flowers: 15, Shallows: 16, CaveWall: 17, Bridge: 18, CaveFloor: 19, Cobble: 20,
  // Milestone 7 (Whiskerwick)
  Carpet: 21, Rail: 22, Brick: 23, Wood: 24, Paving: 25,
  // Milestone 8
  Hedge: 26, Roof: 27, IWall: 28,
  // Funfair: the picket fence round the park (solid)
  Fence: 29,
} as const;
export type RGround = (typeof RG)[keyof typeof RG];
export const SOLID_GROUND: ReadonlySet<number> = new Set<number>([RG.Water, RG.Rock, RG.Void, RG.Deep, RG.Cliff, RG.CaveWall, RG.Rail, RG.Brick, RG.Hedge, RG.IWall, RG.Fence]);

/** Every interactable thing in a region (and the adventure layer of the town). */
export interface AdventureSpot {
  id: string;
  kind: 'adventure';
  role: 'npc' | 'use' | 'collect' | 'exit' | 'sign' | 'activity';
  label: string;
  point: Vec2;
  radius: number;
  /** Available / visible only while this holds. */
  when?: Cond;
  /** NPC id for role 'npc'. */
  npc?: string;
  /** Collectables: a key item (adventure) or a bag item (world save). `once` = the spot is used up. */
  collect?: { item: string; key?: boolean; once?: boolean; text: string };
  /** Exits: where you arrive. `need` explains how to open a locked exit. */
  to?: { region: RegionId; x: number; y: number; travel?: string };
  /** When this holds, the spot shows its clue text instead of doing anything (a locked door…). */
  locked?: { when: Cond; text: string };
  /** A puzzle panel to open (may depend on quest state). */
  puzzle?: (v: AdvView) => string | null;
  activity?: 'fish' | 'sled' | 'aurora' | 'stargaze' | 'cablecar' | 'read' | 'watch' | 'place-stone' | 'ride'
    // Milestone 7
    | 'shop' | 'machine' | 'wish' | 'photo' | 'bench'
    // Milestone 8.1
    | 'telescope';
  /** Milestone 8.1: which telescope site this spot opens. */
  scope?: 'town' | 'city' | 'rooftops';
  /** Funfair: which ride the 'ride' activity boards. */
  ride?: RideId;
  /** Milestone 7: which shop / machine this spot opens. */
  shop?: string;
  machine?: string;
  /** Milestone 7: a game route a machine launches (existing game pages). */
  route?: string;
  /** Text shown when used (a sign, a letter, a description). */
  text?: string | ((v: AdvView) => string);
  journal?: string[];
  /** Extra quest event (default for 'use'/'sign'/'activity' roles: { type: 'use', spot: id }). */
  event?: QuestEvent;
  /** A landmark / creature id marked as seen on the world map when used. */
  seen?: string;
  /** World changes made by using this spot (only when it isn't locked). */
  setFlags?: string[];
  /** A 'use' spot that disappears once used (e.g. beach rubbish). */
  consume?: boolean;
  /** The Song Beneath the Stars: using this spot opens this story scene. */
  scene?: string;
  /** The Song Beneath the Stars: what using this spot changes in the story (a chime untangled, a wall mark read…). */
  story?: StoryFx;
  /** The Song Beneath the Stars: a music cue played when used (see story/music.ts). */
  cue?: string;
  /** The Song Beneath the Stars: stand still this long (ms) before the scene opens (the Wind Steps). */
  hold?: number;
}

export interface NpcDef {
  id: string;
  name: string;
  coat: CoatId;
  extra?: ExtraId;
  x: number;
  y: number;
  facing?: Facing;
  pose?: 'stand' | 'sit' | 'loaf';
  when?: Cond;
  /** Non-cat NPCs (Lumi) are drawn by the region renderer. */
  species?: 'cat' | 'lumi';
  /**
   * Milestone 7: a daily routine. Returns where the NPC is for the current time/weather. Essential
   * NPCs always return a spot (they move, they never vanish), so routines can't block a quest.
   */
  schedule?: (c: { phase: string; rain: boolean }) => { x: number; y: number; facing?: Facing; pose?: 'stand' | 'sit' | 'loaf'; doing: string };
}

export interface GateDef {
  id: string;
  rect: Rect;
  /** Solid while this holds. */
  closed: Cond;
  art: 'brambles' | 'snowdrift' | 'crystal' | 'vines' | 'rope' | 'door';
}

export interface RegionProp {
  kind: string;
  x: number;
  y: number;
  variant?: number;
  when?: Cond;
}

export interface RegionDef {
  id: RegionId;
  name: string;
  cols: number;
  rows: number;
  ground: Uint8Array;
  props: RegionProp[];
  spots: AdventureSpot[];
  npcs: NpcDef[];
  gates: GateDef[];
  spawn: Vec2;
  /** Named areas for the HUD label (first match wins; otherwise the region name). */
  areas: { name: string; rect: Rect }[];
  /** Permanent conditions of the place. */
  climate: { snow?: boolean; sky?: 'void' | 'skyline'; dark?: boolean; water?: boolean; indoor?: 'warm' | 'library' | 'cafe' };
  /** Glowing paths / decorations drawn on the ground while a condition holds. */
  trails?: { points: Vec2[]; when: Cond; color: string }[];
}

// ---- ground building --------------------------------------------------------------------------
export function groundBuilder(cols: number, rows: number, fill: RGround) {
  const g = new Uint8Array(cols * rows).fill(fill);
  const set = (c: number, r: number, t: RGround) => { if (c >= 0 && r >= 0 && c < cols && r < rows) g[r * cols + c] = t; };
  return {
    g,
    set,
    rect(c0: number, r0: number, c1: number, r1: number, t: RGround) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(c, r, t); },
    disc(cx: number, cy: number, rad: number, t: RGround) {
      for (let r = Math.floor(cy - rad); r <= Math.ceil(cy + rad); r++) for (let c = Math.floor(cx - rad); c <= Math.ceil(cx + rad); c++) {
        if (Math.hypot(c - cx, r - cy) <= rad) set(c, r, t);
      }
    },
    line(c0: number, r0: number, c1: number, r1: number, t: RGround, width = 1) {
      const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
      for (let i = 0; i <= n; i++) {
        const c = Math.round(c0 + ((c1 - c0) * i) / n), r = Math.round(r0 + ((r1 - r0) * i) / n);
        for (let dr = 0; dr < width; dr++) for (let dc = 0; dc < width; dc++) set(c + dc, r + dr, t);
      }
    },
    /** Milestone 8.1: a walkway that becomes a plank bridge wherever it crosses water (never dirt over water). */
    road(c0: number, r0: number, c1: number, r1: number, t: RGround) {
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const cur = c < 0 || r < 0 || c >= cols || r >= rows ? -1 : g[r * cols + c];
        set(c, r, cur === RG.Water || cur === RG.Deep || cur === RG.Shallows || cur === RG.Bridge ? RG.Bridge : t);
      }
    },
    at(c: number, r: number): number { return c < 0 || r < 0 || c >= cols || r >= rows ? RG.Void : g[r * cols + c]; },
  };
}

export function groundAtR(def: Pick<RegionDef, 'cols' | 'rows' | 'ground'>, c: number, r: number): number {
  if (c < 0 || r < 0 || c >= def.cols || r >= def.rows) return RG.Void;
  return def.ground[r * def.cols + c];
}

/** Solid ground as merged horizontal runs (one rect per run per row). */
export function groundSolids(def: Pick<RegionDef, 'cols' | 'rows' | 'ground'>): Rect[] {
  const out: Rect[] = [];
  for (let r = 0; r < def.rows; r++) {
    let start = -1;
    for (let c = 0; c <= def.cols; c++) {
      const solid = c < def.cols && SOLID_GROUND.has(def.ground[r * def.cols + c]);
      if (solid && start < 0) start = c;
      if (!solid && start >= 0) { out.push({ x: start * RTILE, y: r * RTILE, w: (c - start) * RTILE, h: RTILE }); start = -1; }
    }
  }
  return out;
}

/** Collision rectangle of a region prop (feet-anchored), or null for walk-through decorations. */
export function regionPropCollider(p: RegionProp): Rect | null {
  const { x, y } = p;
  if (p.kind.startsWith('decor:')) return { x: x - 20, y: y - 10, w: 40, h: 12 }; // showroom furniture
  switch (p.kind) {
    case 'tree': case 'oak': return { x: x - 5, y: y - 5, w: 10, h: 5 };
    case 'pine': case 'snowpine': return { x: x - 4, y: y - 5, w: 8, h: 5 };
    case 'bush': return { x: x - 7, y: y - 6, w: 14, h: 6 };
    case 'rock': return { x: x - 7, y: y - 6, w: 14, h: 6 };
    case 'bigrock': return { x: x - 12, y: y - 9, w: 24, h: 9 };
    case 'lamp': case 'lantern': case 'signpost': case 'flag': return { x: x - 2, y: y - 3, w: 4, h: 3 };
    case 'barrel': return { x: x - 5, y: y - 5, w: 10, h: 5 };
    case 'crate': return { x: x - 6, y: y - 6, w: 12, h: 6 };
    case 'lighthouse': return { x: x - 14, y: y - 14, w: 28, h: 14 };
    case 'house': return { x: x - 32, y: y - 40, w: 64, h: 40 };
    case 'stall': return { x: x - 20, y: y - 12, w: 40, h: 12 };
    case 'observatory': return { x: x - 26, y: y - 30, w: 52, h: 30 };
    case 'cabin': return { x: x - 28, y: y - 30, w: 56, h: 30 };
    case 'station': return { x: x - 18, y: y - 20, w: 36, h: 20 };
    case 'tent': return { x: x - 14, y: y - 10, w: 28, h: 10 };
    case 'campfire': return { x: x - 5, y: y - 4, w: 10, h: 4 };
    case 'log': return { x: x - 14, y: y - 6, w: 28, h: 6 };
    case 'wreck': return { x: x - 26, y: y - 12, w: 52, h: 12 };
    case 'pillar': return { x: x - 5, y: y - 5, w: 10, h: 5 };
    // The temple (The Song Beneath the Stars)
    case 'templepillar': return { x: x - 6, y: y - 6, w: 12, h: 6 };
    case 'hearthsong': return { x: x - 26, y: y - 8, w: 52, h: 8 };
    case 'templelamp': return { x: x - 2, y: y - 3, w: 4, h: 3 };
    case 'crystal': case 'icecrystal': return { x: x - 4, y: y - 4, w: 8, h: 4 };
    case 'bench': return { x: x - 12, y: y - 6, w: 24, h: 6 };
    case 'telescope': return { x: x - 3, y: y - 3, w: 6, h: 3 };
    // Milestone 7 (Whiskerwick)
    case 'shop': return { x: x - 32, y: y - 34, w: 64, h: 34 };
    case 'arcadebldg': return { x: x - 48, y: y - 46, w: 96, h: 46 };
    case 'citystation': case 'cinema': return { x: x - 40, y: y - 40, w: 80, h: 40 };
    case 'cafe': return { x: x - 40, y: y - 36, w: 80, h: 36 };
    case 'cityfountain': return { x: x - 22, y: y - 14, w: 44, h: 18 };
    case 'cabinet': return { x: x - 8, y: y - 8, w: 16, h: 8 };
    case 'claw': case 'vending': return { x: x - 9, y: y - 6, w: 18, h: 6 };
    case 'cafetable': return { x: x - 6, y: y - 4, w: 12, h: 4 };
    case 'ferris': return { x: x - 38, y: y - 8, w: 76, h: 8 };
    // Funfair attractions (the walk-up gate of each ride stays outside its collider)
    case 'carousel': return { x: x - 40, y: y - 18, w: 80, h: 30 };
    case 'swingride': return { x: x - 24, y: y - 14, w: 48, h: 16 };
    case 'bumperarena': return { x: x - 62, y: y - 38, w: 124, h: 40 };
    case 'ringbooth': return { x: x - 36, y: y - 12, w: 72, h: 12 };
    case 'ticketbooth': return { x: x - 14, y: y - 10, w: 28, h: 10 };
    case 'fairpillar': return { x: x - 5, y: y - 6, w: 10, h: 6 };
    case 'photobooth': case 'ticketmachine': case 'noticeboard': return { x: x - 7, y: y - 5, w: 14, h: 5 };
    case 'icecart': return { x: x - 12, y: y - 6, w: 24, h: 6 };
    // Milestone 8
    case 'gazebo': return { x: x - 30, y: y - 10, w: 60, h: 10 };
    case 'conservatory': return { x: x - 44, y: y - 34, w: 88, h: 34 };
    case 'apartment': return { x: x - 34, y: y - 40, w: 68, h: 40 };
    case 'townhouse': return { x: x - 28, y: y - 36, w: 56, h: 36 };
    case 'clocktower': return { x: x - 26, y: y - 30, w: 52, h: 30 };
    case 'oldshop': return { x: x - 32, y: y - 34, w: 64, h: 34 };
    case 'librarybldg': return { x: x - 64, y: y - 40, w: 128, h: 40 };
    case 'well': return { x: x - 10, y: y - 8, w: 20, h: 8 };
    case 'parkbench': return { x: x - 12, y: y - 6, w: 24, h: 6 };
    case 'planter': case 'berrybush': return { x: x - 8, y: y - 6, w: 16, h: 6 };
    case 'oldlamp': return { x: x - 2, y: y - 3, w: 4, h: 3 };
    case 'chimney': case 'watertank': return { x: x - 10, y: y - 10, w: 20, h: 10 };
    case 'roofcafe': return { x: x - 30, y: y - 12, w: 60, h: 12 };
    case 'counter': return { x: x - 32, y: y - 10, w: 64, h: 10 };
    case 'pastrycase': return { x: x - 16, y: y - 10, w: 32, h: 10 };
    case 'bookcase': return { x: x - 24, y: y - 10, w: 48, h: 10 };
    case 'readingtable': return { x: x - 22, y: y - 8, w: 44, h: 8 };
    case 'globe': return { x: x - 6, y: y - 4, w: 12, h: 4 };
    case 'windowseat': return { x: x - 16, y: y - 8, w: 32, h: 8 };
    case 'karaokestage': return { x: x - 22, y: y - 10, w: 44, h: 10 };
    case 'archway': case 'parkgate': return null;
    case 'marketstall': case 'boardwalkstall': return { x: x - 18, y: y - 8, w: 36, h: 8 };
    case 'statue': return { x: x - 8, y: y - 6, w: 16, h: 6 };
    case 'flowerbed': return { x: x - 14, y: y - 6, w: 28, h: 6 };
    default: return null;
  }
}

/** Gate rectangles that are currently closed (solid). */
export function closedGates(def: RegionDef, v: AdvView): Rect[] {
  return def.gates.filter((g) => g.closed(v)).map((g) => g.rect);
}

export function regionSize(def: Pick<RegionDef, 'cols' | 'rows'>): { w: number; h: number } {
  return { w: def.cols * RTILE, h: def.rows * RTILE };
}

export function regionBounds(def: Pick<RegionDef, 'cols' | 'rows'>): Rect {
  const s = regionSize(def);
  return { x: 6, y: 8, w: s.w - 12, h: s.h - 10 };
}

export function areaNameIn(def: RegionDef, p: Vec2): string {
  for (const a of def.areas) if (p.x >= a.rect.x && p.x < a.rect.x + a.rect.w && p.y >= a.rect.y && p.y < a.rect.y + a.rect.h) return a.name;
  return def.name;
}

/** Spots available right now (quest-gated spots appear and disappear with progress). */
export function visibleSpots(spots: readonly AdventureSpot[], v: AdvView): AdventureSpot[] {
  return spots.filter((s) => (!s.when || s.when(v)) && !(s.collect?.once && v.used(s.id)));
}

export function visibleNpcs(npcs: readonly NpcDef[], v: AdvView): NpcDef[] {
  return npcs.filter((n) => !n.when || n.when(v));
}

/** Deterministic scatter of decorative props (trees etc.) on allowed ground, away from features. */
export function scatter(
  def: Pick<RegionDef, 'cols' | 'rows' | 'ground'>, rand: () => number, count: number, kind: string, allowed: readonly number[],
  avoid: readonly Vec2[], minGap: number, variants = 3, existing: RegionProp[] = [],
): RegionProp[] {
  const out: RegionProp[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 60) {
    attempts++;
    const x = Math.round(12 + rand() * (def.cols * RTILE - 24));
    const y = Math.round(20 + rand() * (def.rows * RTILE - 28));
    const c = Math.floor(x / RTILE), r = Math.floor(y / RTILE);
    let ok = true;
    for (let dr = -1; dr <= 0 && ok; dr++) for (let dc = -1; dc <= 1 && ok; dc++) if (!allowed.includes(groundAtR(def, c + dc, r + dr))) ok = false;
    if (!ok) continue;
    if (avoid.some((p) => distance(p, { x, y }) < 40)) continue;
    if ([...existing, ...out].some((t) => distance(t, { x, y }) < minGap)) continue;
    out.push({ kind, x, y, variant: Math.floor(rand() * variants) });
  }
  return out;
}

/**
 * Flood fill over walkable tiles (ignoring props) from a start point; used by tests to prove every
 * spot can be reached (no soft-locks) once its gates are open.
 */
export function reachableTiles(def: RegionDef, from: Vec2, extraSolids: readonly Rect[] = []): Set<number> {
  const solidTile = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= def.cols || r >= def.rows) return true;
    if (SOLID_GROUND.has(def.ground[r * def.cols + c])) return true;
    const cx = c * RTILE + 8, cy = r * RTILE + 8;
    return extraSolids.some((s) => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h);
  };
  const seen = new Set<number>();
  const start = [Math.floor(from.x / RTILE), Math.floor(from.y / RTILE)];
  const stack = [start];
  while (stack.length) {
    const [c, r] = stack.pop()!;
    const k = r * def.cols + c;
    if (seen.has(k) || solidTile(c, r)) continue;
    seen.add(k);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}
