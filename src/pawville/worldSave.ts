/**
 * Personal world save (this device). Versioned via persistence.ts.
 * Holds: inventory, collected secrets, daily discoveries, garden, fish log, the memory log
 * (REAL recorded events only — used by the scrapbook), achievements and small stats.
 * Nothing here is ever punished for being missed: dailies are bonuses, there are no streaks.
 */
import { GARDEN_PLOTS, SEEDS, emptyGarden, type Garden, type Plot } from './activities/park.ts';
import { arr, createStore, isObj, num, oneOf, str, type KeyValueStorage } from './persistence.ts';

export type ItemId =
  | 'apple' | 'bouquet' | 'shell' | 'snack-milk' | 'snack-cookies' | 'snack-onigiri' | 'plush-tangerine' | 'plush-midnight' | 'plush-fish'
  | 'fish-sardine' | 'fish-minnow' | 'fish-goldfish' | 'fish-koi' | 'fish-moonfish' | 'fish-raincarp' | 'fish-snowtrout' | 'old-boot' | 'toy-mouse'
  // Milestone 6 (regions)
  | 'fish-herring' | 'fish-lanternfish' | 'sea-glass' | 'glow-mushroom' | 'pine-cone' | 'frost-crystal' | 'moon-pearl' | 'star-shard'
  // Milestone 8 (cooking, city discoveries)
  | 'flour' | 'berries' | 'herbs' | 'honey' | 'fish-pie' | 'apple-tart' | 'berry-tea' | 'herb-soup' | 'paw-pancakes' | 'picnic-basket' | 'old-stamp' | 'ice-cream' | 'bistro-plate'
  // Milestone 10 (home garden)
  | 'carrot' | 'catnip' | 'garden-salad';

export const ITEM_NAMES: Record<ItemId, string> = {
  apple: 'Apple', bouquet: 'Bouquet', shell: 'Seashell', 'snack-milk': 'Warm milk', 'snack-cookies': 'Paw cookies', 'snack-onigiri': 'Tuna onigiri',
  'plush-tangerine': 'Tangerine plush', 'plush-midnight': 'Midnight plush', 'plush-fish': 'Fish plush',
  'fish-sardine': 'Silver sardine', 'fish-minnow': 'Tiny minnow', 'fish-goldfish': 'Lucky goldfish', 'fish-koi': 'Spotted koi',
  'fish-moonfish': 'Moonfish', 'fish-raincarp': 'Rain carp', 'fish-snowtrout': 'Snow trout', 'old-boot': 'Old boot', 'toy-mouse': 'Squeaky mouse',
  'fish-herring': 'Pawport herring', 'fish-lanternfish': 'Lanternfish', 'sea-glass': 'Sea glass', 'glow-mushroom': 'Glowing mushroom', 'pine-cone': 'Pine cone',
  'frost-crystal': 'Frost crystal', 'moon-pearl': 'Moon pearl', 'star-shard': 'Star shard',
  flour: 'Bag of flour', berries: 'Park berries', herbs: 'Fresh herbs', honey: 'Jar of honey', 'fish-pie': 'Fish pie', 'apple-tart': 'Apple tart',
  'berry-tea': 'Berry tea', 'herb-soup': 'Herb soup', 'paw-pancakes': 'Paw pancakes', 'picnic-basket': 'Picnic basket', 'old-stamp': 'Old Whiskerwick stamp',
  'ice-cream': 'Ice-cream scoop', 'bistro-plate': 'Bistro supper',
  carrot: 'Garden carrot', catnip: 'Sprig of catnip', 'garden-salad': 'Garden salad',
};
export const ITEM_IDS = Object.keys(ITEM_NAMES) as ItemId[];

export type MemoryKind =
  | 'first-swing' | 'swing-together' | 'seesaw-together' | 'picnic' | 'stargaze' | 'wish' | 'fish' | 'garden-bloom' | 'pawtype-win' | 'boxing-win'
  | 'paw-hold' | 'shared-emote' | 'paired' | 'gift-received' | 'coin-wish' | 'secret-found' | 'photo' | 'adventure' | 'city';

export interface MemoryEvent {
  id: string;
  kind: MemoryKind;
  title: string;
  detail: string;
  at: number;
  place: string;
  withPartner: boolean;
  photoId?: string;
}

export type AchievementId = 'first-steps' | 'swing-high' | 'together-swing' | 'green-paws' | 'angler' | 'collector' | 'star-wisher' | 'picnic-pals' | 'paw-in-paw' | 'champ'
  | 'harbor-hero' | 'star-friend' | 'trailblazer' | 'beachcomber' | 'cable-car' | 'dreamer' | 'kitten-finder'
  | 'city-slicker' | 'claw-champ' | 'melody-maker' | 'encore'
  | 'decorator' | 'home-chef' | 'old-town-sleuth' | 'stamp-collector'
  // Milestone 8.2
  | 'cafe-star' | 'frenzy-fisher' | 'film-buff' | 'karaoke-star' | 'green-thumb';
export const ACHIEVEMENTS: Record<AchievementId, { name: string; detail: string }> = {
  'first-steps': { name: 'First steps', detail: 'Visit the park for the first time.' },
  'swing-high': { name: 'Swing high', detail: 'Pump the swing all the way up.' },
  'together-swing': { name: 'In sync', detail: 'Swing together with your partner.' },
  'green-paws': { name: 'Green paws', detail: 'Grow a flower to full bloom.' },
  angler: { name: 'Angler', detail: 'Catch 5 different fish.' },
  collector: { name: 'Collector', detail: 'Find all 3 shells and all 3 hidden toys.' },
  'star-wisher': { name: 'Star wisher', detail: 'Make a wish on a shooting star.' },
  'picnic-pals': { name: 'Picnic pals', detail: 'Share a snack at a picnic.' },
  'paw-in-paw': { name: 'Paw in paw', detail: 'Walk paw-in-paw with your partner.' },
  champ: { name: 'Gentle champ', detail: 'Win a Cat Boxing match.' },
  'harbor-hero': { name: 'Harbor hero', detail: 'Reopen Pawport Harbor (unlocks the captain’s hat).' },
  'star-friend': { name: 'Star friend', detail: 'Help Lumi home in “The Lost Star” (unlocks the star charm).' },
  trailblazer: { name: 'Trailblazer', detail: 'Reopen the trail to Frostbell Highlands.' },
  beachcomber: { name: 'Beachcomber', detail: 'Collect five Pawport shells.' },
  'cable-car': { name: 'All aboard', detail: 'Get the Frostbell cable car running.' },
  dreamer: { name: 'Dreamer', detail: 'Wake the star pedestals in the Dreaming Isles.' },
  'kitten-finder': { name: 'Kitten finder', detail: 'Bring Pip home.' },
  'city-slicker': { name: 'City slicker', detail: 'Take the train to Whiskerwick City.' },
  'claw-champ': { name: 'Claw champ', detail: 'Win a plush from the Whiskerwick claw machine.' },
  'melody-maker': { name: 'Melody maker', detail: 'Reach round 6 in Meow Melody.' },
  encore: { name: 'Encore!', detail: 'Help Biscuit finish his song.' },
  decorator: { name: 'Decorator', detail: 'Buy a piece of furniture at Hearth & Whisker.' },
  'home-chef': { name: 'Home chef', detail: 'Cook three different recipes.' },
  'old-town-sleuth': { name: 'Old Town sleuth', detail: 'Get the clock tower ticking again.' },
  'stamp-collector': { name: 'Stamp collector', detail: 'Find all five old Whiskerwick stamps.' },
  'cafe-star': { name: 'Café star', detail: 'Serve 12 cats in one shift of Cat Café Rush.' },
  'frenzy-fisher': { name: 'Frenzy fisher', detail: 'Score 80 points in Fish Frenzy.' },
  'film-buff': { name: 'Film buff', detail: 'Watch every picture showing at the Bijou.' },
  'karaoke-star': { name: 'Karaoke star', detail: 'Earn three stars on a karaoke song.' },
  'green-thumb': { name: 'Green thumb', detail: 'Harvest a crop from your home garden.' },
};

export interface WorldSave {
  inventory: Partial<Record<ItemId, number>>;
  collected: string[];
  daily: Record<string, string>; // e.g. "coin" -> "2026-10-24"
  dailyCounts: Record<string, number>; // e.g. "vending:2026-10-24" -> 2
  garden: Garden;
  fishSeen: string[];
  memories: MemoryEvent[];
  achievements: Partial<Record<AchievementId, number>>;
  stats: { splashes: number; coins: number; fishCaught: number; picnics: number };
  /**
   * Milestone 7 (Whiskerwick): paw tokens — the relaxed city currency (earned by selling finds,
   * arcade play and small one-time gifts; spent in shops, the claw machine and vending machines).
   * Missing in older saves = 0. Never negative.
   */
  tokens: number;
  /** Milestone 7: one-time grants already claimed (makes rewards idempotent across retries). */
  claims: string[];
  /** Milestone 7: personal records (e.g. "meow-melody" best round, "claw-wins"). */
  records: Record<string, number>;
  /** Milestone 8: furniture bought at Hearth & Whisker (decor id → copies owned). Optional: absent in older saves. */
  furniture?: Record<string, number>;
  /** Milestone 8: recipes cooked at least once (the recipe book). */
  recipes?: string[];
}

export const MAX_MEMORIES = 300;

export const emptySave = (): WorldSave => ({
  inventory: {}, collected: [], daily: {}, dailyCounts: {}, garden: emptyGarden(), fishSeen: [], memories: [], achievements: {},
  stats: { splashes: 0, coins: 0, fishCaught: 0, picnics: 0 }, tokens: 0, claims: [], records: {},
});

function sanitizePlot(x: unknown): Plot | null {
  if (!isObj(x)) return null;
  const seed = oneOf(x.seed, SEEDS.map((s) => s.id), 'daisy');
  return {
    seed, plantedBy: oneOf(x.plantedBy, ['T', 'M'] as const, 'T'), plantedAt: num(x.plantedAt, 0), growth: num(x.growth, 0, 0, 3),
    lastGrowAt: num(x.lastGrowAt, 0), wateredBy: arr(x.wateredBy, (r) => (r === 'T' || r === 'M' ? r : null), 2),
  };
}

const MEMORY_KINDS: readonly MemoryKind[] = ['first-swing', 'swing-together', 'seesaw-together', 'picnic', 'stargaze', 'wish', 'fish', 'garden-bloom', 'pawtype-win', 'boxing-win', 'paw-hold', 'shared-emote', 'paired', 'gift-received', 'coin-wish', 'secret-found', 'photo', 'adventure', 'city'];

export function sanitizeSave(raw: unknown): WorldSave {
  const r = isObj(raw) ? raw : {};
  const e = emptySave();
  const inventory: Partial<Record<ItemId, number>> = {};
  if (isObj(r.inventory)) for (const id of ITEM_IDS) { const n = num(r.inventory[id], 0, 0, 999); if (n > 0) inventory[id] = Math.floor(n); }
  const g = isObj(r.garden) ? r.garden : {};
  const plots = Array.isArray(g.plots) ? g.plots.slice(0, GARDEN_PLOTS).map(sanitizePlot) : e.garden.plots;
  while (plots.length < GARDEN_PLOTS) plots.push(null);
  const recs = (x: unknown, max: number) => {
    const out: Record<string, string> = {};
    if (isObj(x)) for (const [k, v] of Object.entries(x).slice(0, max)) if (typeof v === 'string') out[k.slice(0, 60)] = v.slice(0, 20);
    return out;
  };
  const counts: Record<string, number> = {};
  if (isObj(r.dailyCounts)) for (const [k, v] of Object.entries(r.dailyCounts).slice(-60)) counts[k.slice(0, 60)] = num(v, 0, 0, 99);
  const ach: Partial<Record<AchievementId, number>> = {};
  if (isObj(r.achievements)) for (const k of Object.keys(ACHIEVEMENTS) as AchievementId[]) { const v = num(r.achievements[k], 0); if (v > 0) ach[k] = v; }
  const stats = isObj(r.stats) ? r.stats : {};
  return {
    inventory,
    collected: arr(r.collected, (x) => (typeof x === 'string' && x.length < 40 ? x : null), 100),
    daily: recs(r.daily, 40),
    dailyCounts: counts,
    garden: { plots, applied: arr(g.applied, (x) => (typeof x === 'string' ? x.slice(0, 60) : null), 200), bloomed: num(g.bloomed, 0, 0) },
    fishSeen: arr(r.fishSeen, (x) => (typeof x === 'string' ? x.slice(0, 20) : null), 20),
    memories: arr(r.memories, (x) => {
      if (!isObj(x)) return null;
      const kind = oneOf(x.kind, MEMORY_KINDS, 'photo');
      return {
        id: str(x.id, `m${num(x.at, 0)}`, 60), kind, title: str(x.title, 'A memory', 80), detail: str(x.detail, '', 200), at: num(x.at, 0),
        place: str(x.place, 'Pawville', 40), withPartner: x.withPartner === true, photoId: typeof x.photoId === 'string' ? x.photoId.slice(0, 60) : undefined,
      };
    }, MAX_MEMORIES),
    achievements: ach,
    stats: { splashes: num(stats.splashes, 0, 0), coins: num(stats.coins, 0, 0), fishCaught: num(stats.fishCaught, 0, 0), picnics: num(stats.picnics, 0, 0) },
    tokens: Math.floor(num(r.tokens, 0, 0, MAX_TOKENS)),
    claims: [...new Set(arr(r.claims, (x) => (typeof x === 'string' && x.length <= 60 ? x : null), 300))],
    records: sanitizeRecords(r.records),
    // Milestone 8: only present once used, so older saves round-trip unchanged
    ...(isObj(r.furniture) ? { furniture: sanitizeRecords(r.furniture) } : {}),
    ...(Array.isArray(r.recipes) ? { recipes: [...new Set(arr(r.recipes, (x) => (typeof x === 'string' && x.length <= 30 ? x : null), 40))] } : {}),
  };
}

export const MAX_TOKENS = 9999;
function sanitizeRecords(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x).slice(0, 60)) if (k.length <= 40) out[k] = Math.floor(num(v, 0, 0, 1e6));
  return out;
}

export function worldSaveStore(storage?: KeyValueStorage | null) {
  return createStore<WorldSave>({ key: 'world', version: 1, defaults: emptySave, sanitize: sanitizeSave }, storage);
}

// ---- pure helpers ------------------------------------------------------------------------
export function addItem(s: WorldSave, id: ItemId, n = 1): WorldSave {
  return { ...s, inventory: { ...s.inventory, [id]: Math.min(999, Math.max(0, (s.inventory[id] ?? 0) + n)) } };
}

export function takeItem(s: WorldSave, id: ItemId, n = 1): WorldSave | null {
  if ((s.inventory[id] ?? 0) < n) return null;
  return addItem(s, id, -n);
}

export function recordMemory(s: WorldSave, m: Omit<MemoryEvent, 'id'> & { id?: string }): WorldSave {
  const id = m.id ?? `m${m.at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  return { ...s, memories: [{ ...m, id }, ...s.memories].slice(0, MAX_MEMORIES) };
}

export function hasMemory(s: WorldSave, kind: MemoryKind): boolean {
  return s.memories.some((m) => m.kind === kind);
}

export function unlock(s: WorldSave, id: AchievementId, at: number): { save: WorldSave; isNew: boolean } {
  if (s.achievements[id]) return { save: s, isNew: false };
  return { save: { ...s, achievements: { ...s.achievements, [id]: at } }, isNew: true };
}

/** Daily bonus: available once per calendar day (missing a day costs nothing). */
export function dailyAvailable(s: WorldSave, key: string, day: string): boolean {
  return s.daily[key] !== day;
}

export function claimDaily(s: WorldSave, key: string, day: string): WorldSave {
  return { ...s, daily: { ...s.daily, [key]: day } };
}

export function dailyCount(s: WorldSave, key: string, day: string): number {
  return s.dailyCounts[`${key}:${day}`] ?? 0;
}

export function bumpDailyCount(s: WorldSave, key: string, day: string): WorldSave {
  const k = `${key}:${day}`;
  const kept = Object.fromEntries(Object.entries(s.dailyCounts).filter(([x]) => x.endsWith(day)));
  return { ...s, dailyCounts: { ...kept, [k]: (s.dailyCounts[k] ?? 0) + 1 } };
}
