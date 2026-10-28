/**
 * Couple home decoration (pure, tested). The room is a 12×8 tile grid: rows 0–1 are the wall,
 * rows 2–7 the floor. Furniture blocks floor tiles; rugs sit under furniture; wall items hang on
 * the wall. Every placed piece remembers who placed it, and only that player can move or remove
 * it — so nobody overwrites their partner's decorating.
 */
import type { Season } from '../world/environment.ts';
import type { ItemId, WorldSave } from '../worldSave.ts';
import { arr, createStore, isObj, num, oneOf, str, type KeyValueStorage } from '../persistence.ts';

export const ROOM_W = 12;
export const ROOM_H = 8;
export const WALL_ROWS = 2;

export type DecorLayer = 'floor' | 'rug' | 'wall';
export type DecorId =
  | 'sofa' | 'bed' | 'table' | 'plant' | 'lamp' | 'bookshelf' | 'cat-tower' | 'rug-round' | 'rug-long' | 'window' | 'painting' | 'clock' | 'shelf'
  | 'plush-tangerine' | 'plush-midnight' | 'plush-fish' | 'shell-jar' | 'fish-tank' | 'vase' | 'apple-basket'
  | 'pumpkin' | 'snow-plush' | 'blossom-branch' | 'sun-lantern'
  // Milestone 4 furniture
  | 'armchair' | 'side-table' | 'wardrobe' | 'desk' | 'table-lamp' | 'books' | 'curtains' | 'photo-frame'
  | 'cat-bed' | 'scratch-board' | 'toy-basket' | 'food-bowls' | 'cardboard-box' | 'window-perch' | 'cat-tunnel' | 'climb-shelves'
  // Milestone 8 — bought at Hearth & Whisker (Whiskerwick)
  | 'stove' | 'dining-set' | 'tea-cart' | 'fireplace' | 'keepsake-cabinet' | 'herb-planter' | 'record-player'
  | 'pastel-bed' | 'pastel-sofa' | 'cottage-chair' | 'rustic-dresser' | 'fairy-lights' | 'reading-chair';

/**
 * What a cat does with a piece (Milestone 4 home interactions). Seat-like actions move the cat ONTO
 * the piece; the others are done standing next to it.
 */
export type HomeAction = 'sleep' | 'sit' | 'rest' | 'climb' | 'perch' | 'hide' | 'scratch' | 'play' | 'eat' | 'inspect' | 'wardrobe' | 'read'
  // Milestone 8
  | 'cook' | 'dine' | 'light' | 'display' | 'harvest' | 'music';
export const SEAT_ACTIONS: readonly HomeAction[] = ['sleep', 'sit', 'rest', 'climb', 'perch', 'hide', 'read'];

export type FurnitureStyle = 'cozy-rustic' | 'cottage-garden' | 'soft-pastel' | 'warm-wooden' | 'elegant-classic' | 'playful';
export const STYLE_NAMES: Record<FurnitureStyle, string> = {
  'cozy-rustic': 'Cozy rustic', 'cottage-garden': 'Cottage garden', 'soft-pastel': 'Soft pastel', 'warm-wooden': 'Warm wooden', 'elegant-classic': 'Elegant classic', playful: 'Playful',
};

export interface DecorDef {
  id: DecorId;
  name: string;
  w: number;
  h: number;
  layer: DecorLayer;
  /** How it's obtained. */
  source: { kind: 'free' } | { kind: 'item'; item: ItemId; count?: number } | { kind: 'fish' } | { kind: 'season'; season: Season }
    // Milestone 8: bought with paw tokens; you can place as many copies as you own
    | { kind: 'shop'; price: number; style: FurnitureStyle };
  color: string;
  /** Catalogue section (Milestone 4). */
  group?: 'furniture' | 'decor' | 'cat';
  /** Contextual cat interaction. */
  action?: HomeAction;
}

export const DECOR: readonly DecorDef[] = [
  { id: 'sofa', name: 'Plum sofa', w: 3, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#6b4fbf', group: 'furniture', action: 'sit' },
  { id: 'bed', name: 'Cozy bed', w: 2, h: 2, layer: 'floor', source: { kind: 'free' }, color: '#ff8a35', group: 'furniture', action: 'sleep' },
  { id: 'table', name: 'Coffee table', w: 2, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#9b6b43', group: 'furniture' },
  { id: 'plant', name: 'Potted plant', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#4f9a67', group: 'decor' },
  { id: 'lamp', name: 'Floor lamp', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#ffd27a', group: 'decor' },
  { id: 'bookshelf', name: 'Bookshelf', w: 2, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#7a512f', group: 'furniture', action: 'inspect' },
  { id: 'cat-tower', name: 'Cat tree', w: 1, h: 2, layer: 'floor', source: { kind: 'free' }, color: '#c9bfe8', group: 'cat', action: 'climb' },
  { id: 'rug-round', name: 'Round rug', w: 3, h: 2, layer: 'rug', source: { kind: 'free' }, color: '#ff8fb1', group: 'decor' },
  { id: 'rug-long', name: 'Long rug', w: 4, h: 1, layer: 'rug', source: { kind: 'free' }, color: '#7ee0d2', group: 'decor' },
  { id: 'window', name: 'Window', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#9cc3ff', group: 'decor' },
  { id: 'painting', name: 'Fountain painting', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#ffc94a', group: 'decor', action: 'inspect' },
  { id: 'clock', name: 'Paw clock', w: 1, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#fff3e6', group: 'decor' },
  { id: 'shelf', name: 'Wall shelf', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#b5835a', group: 'decor' },
  // Milestone 4 — core furniture
  { id: 'armchair', name: 'Armchair', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#e0475c', group: 'furniture', action: 'sit' },
  { id: 'side-table', name: 'Side table', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#a8754f', group: 'furniture' },
  { id: 'wardrobe', name: 'Wardrobe', w: 2, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#8a5a3b', group: 'furniture', action: 'wardrobe' },
  { id: 'desk', name: 'Desk & chair', w: 2, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#b5835a', group: 'furniture', action: 'read' },
  // cozy decorations
  { id: 'table-lamp', name: 'Table lamp', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#ffc94a', group: 'decor' },
  { id: 'books', name: 'Book stack', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#6b4fbf', group: 'decor', action: 'inspect' },
  { id: 'curtains', name: 'Curtains', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#ff8fb1', group: 'decor' },
  { id: 'photo-frame', name: 'Framed photos', w: 1, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#ffc94a', group: 'decor', action: 'inspect' },
  // cat furniture
  { id: 'cat-bed', name: 'Cat bed', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#ff8fb1', group: 'cat', action: 'rest' },
  { id: 'scratch-board', name: 'Scratching post', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#d9b08c', group: 'cat', action: 'scratch' },
  { id: 'toy-basket', name: 'Toy basket', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#c8935a', group: 'cat', action: 'play' },
  { id: 'food-bowls', name: 'Food & water bowls', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#7fb2e6', group: 'cat', action: 'eat' },
  { id: 'cardboard-box', name: 'Cardboard box', w: 1, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#c69c6d', group: 'cat', action: 'hide' },
  { id: 'window-perch', name: 'Window perch', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#c9bfe8', group: 'cat', action: 'perch' },
  { id: 'cat-tunnel', name: 'Cat tunnel', w: 2, h: 1, layer: 'floor', source: { kind: 'free' }, color: '#7ee0d2', group: 'cat', action: 'hide' },
  { id: 'climb-shelves', name: 'Climbing shelves', w: 2, h: 1, layer: 'wall', source: { kind: 'free' }, color: '#b5835a', group: 'cat', action: 'climb' },
  { id: 'plush-tangerine', name: 'Tangerine plush', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'plush-tangerine' }, color: '#ff8a35', group: 'cat', action: 'play' },
  { id: 'plush-midnight', name: 'Midnight plush', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'plush-midnight' }, color: '#252031', group: 'cat', action: 'play' },
  { id: 'plush-fish', name: 'Fish plush', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'plush-fish' }, color: '#7fb2e6', group: 'cat', action: 'play' },
  { id: 'shell-jar', name: 'Shell jar', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'shell', count: 3 }, color: '#ffe1ec', group: 'decor', action: 'inspect' },
  { id: 'fish-tank', name: 'Fish tank', w: 2, h: 1, layer: 'floor', source: { kind: 'fish' }, color: '#5d93c9', group: 'decor', action: 'inspect' },
  { id: 'vase', name: 'Flower vase', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'bouquet' }, color: '#ff6fa1', group: 'decor' },
  { id: 'apple-basket', name: 'Apple basket', w: 1, h: 1, layer: 'floor', source: { kind: 'item', item: 'apple', count: 3 }, color: '#e0475c', group: 'decor' },
  { id: 'pumpkin', name: 'Autumn pumpkin', w: 1, h: 1, layer: 'floor', source: { kind: 'season', season: 'autumn' }, color: '#d9631a', group: 'decor' },
  { id: 'snow-plush', name: 'Snow cat plush', w: 1, h: 1, layer: 'floor', source: { kind: 'season', season: 'winter' }, color: '#f4f8ff', group: 'cat', action: 'play' },
  { id: 'blossom-branch', name: 'Blossom branch', w: 1, h: 1, layer: 'wall', source: { kind: 'season', season: 'spring' }, color: '#ffb3c9', group: 'decor' },
  { id: 'sun-lantern', name: 'Sun lantern', w: 1, h: 1, layer: 'wall', source: { kind: 'season', season: 'summer' }, color: '#ffc94a', group: 'decor' },
  // Milestone 8 — Hearth & Whisker catalogue (each piece DOES something)
  { id: 'stove', name: 'Cottage stove', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 12, style: 'cozy-rustic' }, color: '#3d5a8a', group: 'furniture', action: 'cook' },
  { id: 'dining-set', name: 'Dining set', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 10, style: 'warm-wooden' }, color: '#9b6b43', group: 'furniture', action: 'dine' },
  { id: 'tea-cart', name: 'Tea cart', w: 1, h: 1, layer: 'floor', source: { kind: 'shop', price: 6, style: 'elegant-classic' }, color: '#cfc6e3', group: 'furniture', action: 'dine' },
  { id: 'fireplace', name: 'Brick fireplace', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 16, style: 'cozy-rustic' }, color: '#9a5340', group: 'furniture', action: 'light' },
  { id: 'keepsake-cabinet', name: 'Keepsake cabinet', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 14, style: 'elegant-classic' }, color: '#5a3f66', group: 'decor', action: 'display' },
  { id: 'herb-planter', name: 'Herb planter', w: 1, h: 1, layer: 'floor', source: { kind: 'shop', price: 5, style: 'cottage-garden' }, color: '#b5623a', group: 'decor', action: 'harvest' },
  { id: 'record-player', name: 'Record player', w: 1, h: 1, layer: 'floor', source: { kind: 'shop', price: 9, style: 'playful' }, color: '#b5323e', group: 'decor', action: 'music' },
  { id: 'pastel-bed', name: 'Pastel canopy bed', w: 2, h: 2, layer: 'floor', source: { kind: 'shop', price: 15, style: 'soft-pastel' }, color: '#c9bfe8', group: 'furniture', action: 'sleep' },
  { id: 'pastel-sofa', name: 'Pastel loveseat', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 10, style: 'soft-pastel' }, color: '#ff8fb1', group: 'furniture', action: 'sit' },
  { id: 'reading-chair', name: 'Mint reading chair', w: 2, h: 2, layer: 'floor', source: { kind: 'free' }, color: '#7ee0d2', group: 'furniture', action: 'sit' },
  { id: 'cottage-chair', name: 'Cottage armchair', w: 1, h: 1, layer: 'floor', source: { kind: 'shop', price: 6, style: 'cottage-garden' }, color: '#4f9a67', group: 'furniture', action: 'sit' },
  { id: 'rustic-dresser', name: 'Rustic dresser', w: 2, h: 1, layer: 'floor', source: { kind: 'shop', price: 8, style: 'warm-wooden' }, color: '#8a5a3b', group: 'furniture', action: 'inspect' },
  { id: 'fairy-lights', name: 'Fairy lights', w: 2, h: 1, layer: 'wall', source: { kind: 'shop', price: 4, style: 'playful' }, color: '#ffd27a', group: 'decor', action: 'light' },
];

/** The Hearth & Whisker catalogue (Milestone 8). */
export const SHOP_FURNITURE = () => DECOR.filter((d) => d.source.kind === 'shop');
/** Pieces that give light (and can be switched). */
export const LIGHT_PIECES: readonly DecorId[] = ['lamp', 'table-lamp', 'sun-lantern', 'fireplace', 'fairy-lights'];

export const decorDef = (id: DecorId) => DECOR.find((d) => d.id === id)!;

export interface Placed {
  uid: string;
  item: DecorId;
  x: number;
  y: number;
  rot: 0 | 90;
  placedBy: 'T' | 'M';
}

export function footprint(p: Pick<Placed, 'item' | 'x' | 'y' | 'rot'>): { x: number; y: number; w: number; h: number } {
  const d = decorDef(p.item);
  const [w, h] = p.rot === 90 ? [d.h, d.w] : [d.w, d.h];
  return { x: p.x, y: p.y, w, h };
}

export type PlaceCheck = 'ok' | 'out-of-room' | 'wall-only' | 'floor-only' | 'blocked';

export function checkPlace(room: readonly Placed[], p: Pick<Placed, 'uid' | 'item' | 'x' | 'y' | 'rot'>): PlaceCheck {
  const d = decorDef(p.item);
  const f = footprint(p);
  if (f.x < 0 || f.y < 0 || f.x + f.w > ROOM_W || f.y + f.h > ROOM_H) return 'out-of-room';
  if (d.layer === 'wall' && f.y + f.h > WALL_ROWS) return 'wall-only'; // cat climbing shelves remain wall-mounted; their interaction anchor is on the floor
  if (d.layer !== 'wall' && f.y < WALL_ROWS) return 'floor-only';
  for (const o of room) {
    if (o.uid === p.uid) continue;
    if (decorDef(o.item).layer !== d.layer) continue; // rugs under furniture are fine
    // Curtains hang over windows (and the window perch) — that's what they're for.
    const pair = [o.item, p.item];
    if (pair.includes('curtains') && (pair.includes('window') || pair.includes('window-perch'))) continue;
    const g = footprint(o);
    if (f.x < g.x + g.w && f.x + f.w > g.x && f.y < g.y + g.h && f.y + f.h > g.y) return 'blocked';
  }
  return 'ok';
}

/**
 * Can this player edit this piece? Only the player who placed it — IF the layout were shared.
 * The home layout is stored per device (see the note in CoupleHomePage), so there is nothing to
 * protect: a solo player was locked out of the starter lamp/plant (placed by "M"), and pairing as
 * Midnight locked every piece you had placed as Tangerine. Locks only apply to a shared layout.
 */
export const HOME_IS_SHARED = false;
export const canEdit = (p: Placed, me: 'T' | 'M') => !HOME_IS_SHARED || p.placedBy === me;

/**
 * Can another copy be placed? For bought furniture: only while you own more copies than are
 * already placed (`placed` = the room being edited) — so placing, moving and putting away can never
 * create or lose a piece. Other sources keep their original rules.
 */
export function available(d: DecorDef, save: WorldSave, season: Season, placed?: readonly Pick<Placed, 'item' | 'uid'>[], movingUid?: string): boolean {
  switch (d.source.kind) {
    case 'shop': {
      const owned = save.furniture?.[d.id] ?? 0;
      const used = (placed ?? []).filter((p) => p.item === d.id && p.uid !== movingUid).length;
      return owned > used;
    }
    case 'free': return true;
    case 'item': return (save.inventory[d.source.item] ?? 0) >= (d.source.count ?? 1);
    case 'fish': return save.fishSeen.filter((f) => f !== 'old-boot').length > 0;
    case 'season': return d.source.season === season;
  }
}

export const MAX_PIECES = 40;

export interface HomeState {
  placed: Placed[];
  wallpaper: 'plum' | 'cream' | 'mint' | 'night';
  /** Milestone 8: uids of light pieces switched off (absent = all on). */
  lightsOff?: string[];
}

export function toggleLight(h: HomeState, uid: string): HomeState {
  const off = h.lightsOff ?? [];
  return { ...h, lightsOff: off.includes(uid) ? off.filter((u) => u !== uid) : [...off, uid] };
}

export const DEFAULT_HOME: HomeState = {
  wallpaper: 'plum',
  placed: [
    { uid: 'd1', item: 'rug-round', x: 4, y: 4, rot: 0, placedBy: 'T' },
    { uid: 'd2', item: 'sofa', x: 4, y: 3, rot: 0, placedBy: 'T' },
    { uid: 'd3', item: 'window', x: 5, y: 0, rot: 0, placedBy: 'T' },
    { uid: 'd4', item: 'plant', x: 10, y: 2, rot: 0, placedBy: 'M' },
    { uid: 'd5', item: 'lamp', x: 1, y: 2, rot: 0, placedBy: 'M' },
  ],
};

export function sanitizeHome(raw: unknown): HomeState {
  const r = isObj(raw) ? raw : {};
  const ids = DECOR.map((d) => d.id);
  const placed: Placed[] = [];
  for (const x of arr(r.placed, (v) => (isObj(v) ? v : null), MAX_PIECES)) {
    const item = oneOf(x.item, ids, 'plant');
    const p: Placed = {
      uid: str(x.uid, `u${placed.length}`, 30), item, x: Math.floor(num(x.x, 0, 0, ROOM_W)), y: Math.floor(num(x.y, WALL_ROWS, 0, ROOM_H)),
      rot: x.rot === 90 ? 90 : 0, placedBy: x.placedBy === 'M' ? 'M' : 'T',
    };
    if (checkPlace(placed, p) === 'ok') placed.push(p); // drop anything that doesn't fit any more
  }
  const out: HomeState = { placed: raw === undefined ? DEFAULT_HOME.placed : placed, wallpaper: oneOf(r.wallpaper, ['plum', 'cream', 'mint', 'night'] as const, 'plum') };
  if (Array.isArray(r.lightsOff)) out.lightsOff = arr(r.lightsOff, (u) => (typeof u === 'string' && out.placed.some((p) => p.uid === u) ? u : null), MAX_PIECES);
  return out;
}

export function homeStore(storage?: KeyValueStorage | null) {
  return createStore<HomeState>({ key: 'home', version: 1, defaults: () => structuredClone(DEFAULT_HOME), sanitize: sanitizeHome }, storage);
}
