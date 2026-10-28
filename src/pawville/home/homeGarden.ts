/**
 * Milestone 10: the home garden (pure model — unit tested; persisted in its own store).
 *
 * Six raised beds. Plant a crop (seeds are free, from the seed box), water it, and it grows one
 * stage after each watering once the crop's growing time has passed. Ripe crops are harvested into
 * your bag; herbs and berries grow back, carrots and catnip are replanted. Nothing ever wilts or dies
 * while you're away — a plant simply waits for its next watering.
 *
 * Every change is an operation with an id, applied idempotently (a double tap or a replayed network
 * message can't harvest twice). Only the cat who planted an unripe crop may dig it up.
 */
import { arr, createStore, isObj, num, oneOf, type KeyValueStorage } from '../persistence.ts';
import type { ItemId } from '../worldSave.ts';

export const GARDEN_BEDS = 6;
export const STAGES = 3; // 0 seed → 1 sprout → 2 growing → 3 ripe

export type CropId = 'herbs' | 'berries' | 'carrot' | 'catnip' | 'marigold';
export interface CropDef { id: CropId; name: string; item: ItemId; yield: number; stageMs: number; regrows: boolean; color: string; blurb: string }
export const CROPS: readonly CropDef[] = [
  { id: 'herbs', name: 'Herbs', item: 'herbs', yield: 2, stageMs: 3 * 60_000, regrows: true, color: '#7edb8c', blurb: 'Grow back after picking. For soups and salads.' },
  { id: 'berries', name: 'Berry bush', item: 'berries', yield: 3, stageMs: 5 * 60_000, regrows: true, color: '#e0475c', blurb: 'Grows back after picking. For tea and picnics.' },
  { id: 'carrot', name: 'Carrots', item: 'carrot', yield: 2, stageMs: 4 * 60_000, regrows: false, color: '#ff8a35', blurb: 'Crunchy. For the garden salad.' },
  { id: 'marigold', name: 'Marigolds', item: 'bouquet', yield: 1, stageMs: 240000, regrows: true, color: '#ffc44d', blurb: 'Golden flowers for your home.' },
  { id: 'catnip', name: 'Catnip', item: 'catnip', yield: 1, stageMs: 6 * 60_000, regrows: false, color: '#9cdb7e', blurb: 'Every cat’s favourite. Makes anyone purr.' },
];
export const cropById = (id: CropId) => CROPS.find((c) => c.id === id)!;

export type Decor = 'gnome' | 'birdbath' | 'lanterns' | 'bee-hotel' | 'flower-border';
/** Decorations unlock as you harvest (no purchase, no grind beyond tending your garden). */
export const DECOR_UNLOCK: Record<Decor, number> = { 'flower-border': 0, birdbath: 1, gnome: 3, lanterns: 6, 'bee-hotel': 10 };
export const DECOR_NAMES: Record<Decor, string> = { 'flower-border': 'Flower border', birdbath: 'Birdbath', gnome: 'Garden gnome', lanterns: 'String lanterns', 'bee-hotel': 'Bee hotel' };
export const DECORS = Object.keys(DECOR_UNLOCK) as Decor[];

export interface Bed { crop: CropId; plantedBy: 'T' | 'M'; plantedAt: number; stage: number; wateredAt: number | null }
export interface HomeGarden { beds: (Bed | null)[]; harvests: number; decor: Decor[]; applied: string[] }
export const emptyHomeGarden = (): HomeGarden => ({ beds: new Array(GARDEN_BEDS).fill(null), harvests: 0, decor: ['flower-border'], applied: [] });

/** Brings a bed up to date: a watered plant grows one stage once its time has passed. Never goes backwards. */
export function grow(b: Bed, now: number): Bed {
  if (b.stage >= STAGES || b.wateredAt === null) return b;
  if (now - b.wateredAt < cropById(b.crop).stageMs) return b;
  return { ...b, stage: b.stage + 1, wateredAt: null };
}
export function growAll(g: HomeGarden, now: number): HomeGarden {
  let changed = false;
  const beds = g.beds.map((b) => { if (!b) return b; const n = grow(b, now); if (n !== b) changed = true; return n; });
  return changed ? { ...g, beds } : g;
}
/** Milliseconds until a watered bed grows (0 if ready or not watered). */
export function growsIn(b: Bed, now: number): number {
  return b.wateredAt === null || b.stage >= STAGES ? 0 : Math.max(0, cropById(b.crop).stageMs - (now - b.wateredAt));
}
export function needsWater(b: Bed): boolean {
  return b.stage < STAGES && b.wateredAt === null;
}

export type GardenOp =
  | { id: string; kind: 'plant'; bed: number; crop: CropId; by: 'T' | 'M'; at: number }
  | { id: string; kind: 'water'; bed: number; by: 'T' | 'M'; at: number }
  | { id: string; kind: 'harvest'; bed: number; by: 'T' | 'M'; at: number }
  | { id: string; kind: 'dig'; bed: number; by: 'T' | 'M'; at: number }
  | { id: string; kind: 'decor'; decor: Decor; on: boolean; by: 'T' | 'M'; at: number };

/** An operation before it gets its id/author/time (distributes over the union, unlike Omit<>). */
export type GardenOpInput = GardenOp extends infer O ? (O extends GardenOp ? Omit<O, 'id' | 'by' | 'at'> : never) : never;

export type OpResult = { garden: HomeGarden; ok: true; harvested?: { item: ItemId; n: number }; first?: boolean } | { garden: HomeGarden; ok: false; reason: string };

export function applyOp(g0: HomeGarden, op: GardenOp): OpResult {
  if (g0.applied.includes(op.id)) return { garden: g0, ok: false, reason: 'duplicate' };
  const g = growAll(g0, op.at);
  const done = (next: Partial<HomeGarden>, extra: Partial<Extract<OpResult, { ok: true }>> = {}): OpResult => ({ garden: { ...g, ...next, applied: [...g.applied, op.id].slice(-100) }, ok: true, ...extra });
  if (op.kind === 'decor') {
    if (!DECORS.includes(op.decor)) return { garden: g, ok: false, reason: 'bad-decor' };
    if (op.on && g.harvests < DECOR_UNLOCK[op.decor]) return { garden: g, ok: false, reason: 'locked' };
    const decor = op.on ? [...new Set([...g.decor, op.decor])] : g.decor.filter((d) => d !== op.decor);
    return done({ decor });
  }
  if (!Number.isInteger(op.bed) || op.bed < 0 || op.bed >= GARDEN_BEDS) return { garden: g, ok: false, reason: 'bad-bed' };
  const beds = g.beds.slice();
  const b = beds[op.bed];
  switch (op.kind) {
    case 'plant':
      if (b) return { garden: g, ok: false, reason: 'occupied' };
      if (!CROPS.some((c) => c.id === op.crop)) return { garden: g, ok: false, reason: 'bad-crop' };
      beds[op.bed] = { crop: op.crop, plantedBy: op.by, plantedAt: op.at, stage: 0, wateredAt: null };
      return done({ beds });
    case 'water':
      if (!b) return { garden: g, ok: false, reason: 'empty' };
      if (!needsWater(b)) return { garden: g, ok: false, reason: b.stage >= STAGES ? 'ripe' : 'already-watered' };
      beds[op.bed] = { ...b, wateredAt: op.at };
      return done({ beds });
    case 'harvest': {
      if (!b) return { garden: g, ok: false, reason: 'empty' };
      if (b.stage < STAGES) return { garden: g, ok: false, reason: 'not-ripe' };
      const c = cropById(b.crop);
      beds[op.bed] = c.regrows ? { ...b, stage: 1, wateredAt: null } : null;
      return done({ beds, harvests: g.harvests + 1 }, { harvested: { item: c.item, n: c.yield }, first: g.harvests === 0 });
    }
    case 'dig':
      if (!b) return { garden: g, ok: false, reason: 'empty' };
      if (b.stage < STAGES && b.plantedBy !== op.by) return { garden: g, ok: false, reason: 'not-yours' };
      beds[op.bed] = null;
      return done({ beds });
  }
}

/** What visits the garden right now (drawn by the garden scene). */
export function wildlife(g: HomeGarden, night: boolean): { butterflies: number; bees: number; bird: boolean; fireflies: number } {
  const growing = g.beds.filter((b) => b && b.stage >= 2).length;
  const flowering = g.beds.some((b) => b && b.crop === 'berries' && b.stage >= 2);
  return {
    butterflies: night ? 0 : Math.min(3, growing),
    bees: night ? 0 : (g.decor.includes('bee-hotel') ? 2 : 0) + (flowering ? 1 : 0),
    bird: !night && g.decor.includes('birdbath'),
    fireflies: night ? 3 + Math.min(4, growing) : 0,
  };
}

function sanitizeBed(x: unknown): Bed | null {
  if (!isObj(x)) return null;
  if (!CROPS.some((c) => c.id === x.crop)) return null;
  const crop = x.crop as CropId;
  return {
    crop, plantedBy: oneOf(x.plantedBy, ['T', 'M'] as const, 'T'), plantedAt: num(x.plantedAt, 0, 0),
    stage: num(x.stage, 0, 0, STAGES), wateredAt: x.wateredAt === null || x.wateredAt === undefined ? null : num(x.wateredAt, 0, 0),
  };
}
export function sanitizeHomeGarden(raw: unknown): HomeGarden {
  const e = emptyHomeGarden();
  if (!isObj(raw)) return e;
  const beds = Array.isArray(raw.beds) ? raw.beds.slice(0, GARDEN_BEDS).map(sanitizeBed) : e.beds;
  while (beds.length < GARDEN_BEDS) beds.push(null);
  return {
    beds, harvests: num(raw.harvests, 0, 0, 1e6),
    decor: arr(raw.decor, (d) => (DECORS.includes(d as Decor) ? (d as Decor) : null), 10),
    applied: arr(raw.applied, (x) => (typeof x === 'string' && x.length <= 60 ? x : null), 100),
  };
}
export function homeGardenStore(storage?: KeyValueStorage | null) {
  return createStore<HomeGarden>({ key: 'home-garden', version: 1, defaults: emptyHomeGarden, sanitize: sanitizeHomeGarden }, storage);
}
