/**
 * Adventure state (Milestone 6): world progress, quests, journal, key items, discovered places.
 *
 * Personal by default and saved on this device (versioned, sanitised, size-capped like every other
 * Pawville record). A small whitelisted set of WORLD flags — region unlocks and restorations — is
 * SHARED with your partner over the private couple channel and merged as a union (a flag can only
 * ever be gained, so merging is order-independent and a stale or duplicated message can never undo
 * progress). See adventure/sync.ts.
 */
import { arr, createStore, isObj, num, str, type KeyValueStorage } from '../persistence.ts';
import { emptyStory, sanitizeStory, type StoryState } from '../story/model.ts';
import { makeStoryView, type StoryView } from '../story/progress.ts';

export type RegionId = 'town' | 'harbor' | 'forest' | 'cave' | 'highlands' | 'isles' | 'city' | 'arcade-hall'
  // Milestone 8
  | 'city-park' | 'old-town' | 'rooftops' | 'hearth' | 'library' | 'purring-cup'
  // Funfair
  | 'funfair'
  // The Song Beneath the Stars: the old temple at the end of the trail
  | 'temple';
export const REGION_IDS: readonly RegionId[] = ['town', 'harbor', 'forest', 'cave', 'highlands', 'isles', 'city', 'arcade-hall', 'city-park', 'old-town', 'rooftops', 'hearth', 'library', 'purring-cup', 'funfair', 'temple'];

export type QuestStatus = 'locked' | 'available' | 'active' | 'done';

export interface QuestProgress {
  status: 'active' | 'done';
  /** Index of the current objective (== objectives.length once done). */
  step: number;
  /** Progress counters for the CURRENT objective (unique targets are stored by id). */
  count: number;
  hits: string[];
  startedAt: number;
  doneAt?: number;
  /** Completed because your partner finished the shared part (you still get the rewards once). */
  together?: boolean;
}

export interface AdventureState {
  flags: string[];
  quests: Record<string, QuestProgress>;
  journal: string[];
  keyItems: Record<string, number>;
  /** Reward ids already granted — the duplicate-reward guard. */
  rewarded: string[];
  /** Places / landmarks / regions you have seen (the world map's fog of war). */
  seen: string[];
  /** Spots that have been used up (collected pieces, picked shells…). */
  used: string[];
  /** Where you were (restored on reload / after a game). */
  lastRegion: RegionId;
  lastPos: { x: number; y: number } | null;
  /** Optional choices made in dialogue (npc:choice -> value). */
  choices: Record<string, string>;
  /** Milestone 7: friendship with NPCs (0..10). Grows through choices and stories, never decays. */
  friends: Record<string, number>;
  /** "The Song Beneath the Stars" (story/): tones, scenes, clues, phrases, journal. Old saves start it fresh. */
  story: StoryState;
}

export const emptyAdventure = (): AdventureState => ({
  flags: [], quests: {}, journal: [], keyItems: {}, rewarded: [], seen: ['region:town'], used: [], lastRegion: 'town', lastPos: null, choices: {}, friends: {}, story: emptyStory(),
});

const idOk = (x: unknown, max = 60): string | null => (typeof x === 'string' && x.length > 0 && x.length <= max && /^[a-z0-9:_\-.]+$/i.test(x) ? x : null);

export function sanitizeAdventure(raw: unknown): AdventureState {
  const r = isObj(raw) ? raw : {};
  const e = emptyAdventure();
  const quests: Record<string, QuestProgress> = {};
  if (isObj(r.quests)) {
    for (const [k, v] of Object.entries(r.quests).slice(0, 80)) {
      if (!idOk(k) || !isObj(v)) continue;
      quests[k] = {
        status: v.status === 'done' ? 'done' : 'active',
        step: Math.floor(num(v.step, 0, 0, 50)),
        count: Math.floor(num(v.count, 0, 0, 99)),
        hits: arr(v.hits, (x) => idOk(x), 20),
        startedAt: num(v.startedAt, 0, 0),
        doneAt: typeof v.doneAt === 'number' ? num(v.doneAt, 0, 0) : undefined,
        together: v.together === true ? true : undefined,
      };
    }
  }
  const keyItems: Record<string, number> = {};
  if (isObj(r.keyItems)) for (const [k, v] of Object.entries(r.keyItems).slice(0, 60)) { const id = idOk(k); const n = Math.floor(num(v, 0, 0, 99)); if (id && n > 0) keyItems[id] = n; }
  const choices: Record<string, string> = {};
  if (isObj(r.choices)) for (const [k, v] of Object.entries(r.choices).slice(0, 600)) { const id = idOk(k); if (id && typeof v === 'string') choices[id] = v.slice(0, 30); }
  const lp = isObj(r.lastPos) ? r.lastPos : null;
  const lastRegion = (REGION_IDS as readonly string[]).includes(r.lastRegion as string) ? (r.lastRegion as RegionId) : 'town';
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    flags: uniq(arr(r.flags, (x) => idOk(x), 300)),
    quests,
    journal: uniq(arr(r.journal, (x) => idOk(x), 600)),
    keyItems,
    rewarded: uniq(arr(r.rewarded, (x) => idOk(x), 200)),
    seen: uniq([...e.seen, ...arr(r.seen, (x) => idOk(x), 300)]),
    used: uniq(arr(r.used, (x) => idOk(x), 400)),
    lastRegion,
    lastPos: lp && typeof lp.x === 'number' && typeof lp.y === 'number' ? { x: num(lp.x, 0, 0, 4000), y: num(lp.y, 0, 0, 4000) } : null,
    choices,
    friends: (() => {
      const out: Record<string, number> = {};
      if (isObj(r.friends)) for (const [k, v] of Object.entries(r.friends).slice(0, 200)) { const id = idOk(k); if (id) out[id] = Math.floor(num(v, 0, 0, 10)); }
      return out;
    })(),
    story: sanitizeStory(r.story),
  };
}

export function adventureStore(storage?: KeyValueStorage | null) {
  // v2 (The Song Beneath the Stars) added `story`. Nothing else changed, so migrating is just "keep the data":
  // sanitizeAdventure() starts the new field at the beginning of the story.
  return createStore<AdventureState>({ key: 'adventure', version: 2, defaults: emptyAdventure, sanitize: sanitizeAdventure, migrate: (_old, raw) => raw }, storage);
}

// ---- read helpers (the "view" every condition is evaluated against) ------------------------

export interface AdvView {
  has(flag: string): boolean;
  quest(id: string): QuestProgress | undefined;
  /** True while quest `id` is active and on objective index `step`. */
  onStep(id: string, step: number): boolean;
  done(id: string): boolean;
  item(id: string): number;
  used(spot: string): boolean;
  seen(id: string): boolean;
  /** Inventory count in the WORLD save (fish, shells…), supplied by the page. */
  inv(id: string): number;
  /** Milestone 7: friendship level with an NPC (0..10) and remembered dialogue choices. */
  friend(id: string): number;
  choice(key: string): string | undefined;
  /** The Song Beneath the Stars: progress, tones, clues, phrases. */
  story: StoryView;
}

export function viewOf(s: AdventureState, inventory: Partial<Record<string, number>> = {}): AdvView {
  const flags = new Set(s.flags);
  const used = new Set(s.used);
  const seen = new Set(s.seen);
  const story = makeStoryView(s.story, { has: (f) => flags.has(f), questDone: (id) => s.quests[id]?.status === 'done' });
  return {
    story,
    has: (f) => flags.has(f),
    quest: (id) => s.quests[id],
    onStep: (id, step) => s.quests[id]?.status === 'active' && s.quests[id]!.step === step,
    done: (id) => s.quests[id]?.status === 'done',
    item: (id) => s.keyItems[id] ?? 0,
    used: (spot) => used.has(spot),
    seen: (id) => seen.has(id),
    inv: (id) => inventory[id] ?? 0,
    friend: (id) => s.friends?.[id] ?? 0,
    choice: (key) => s.choices[key],
  };
}

export type Cond = (v: AdvView) => boolean;
export const always: Cond = () => true;

/**
 * World flags that are shared with a partner (union-merged). Everything else — quest steps,
 * journal, key items, rewards — stays personal.
 */
export const SHARED_FLAG_PREFIXES = ['region:', 'restored:', 'sshared:'] as const;
export const SHARED_FLAGS = new Set<string>([
  'pier-repaired', 'harbor-restored', 'lighthouse-lit', 'beach-clean', 'cave-open', 'crystal-door-open', 'observatory-open',
  'constellation-lumi', 'pip-home', 'bramble-home', 'cable-car-fixed', 'bridge-repaired', 'our-constellation', 'lumi-home', 'pedestals-awake', 'clock-fixed',
]);
export function isSharedFlag(f: string): boolean {
  return SHARED_FLAGS.has(f) || SHARED_FLAG_PREFIXES.some((p) => f.startsWith(p));
}

export function addFlags(s: AdventureState, flags: readonly string[]): { state: AdventureState; added: string[] } {
  const have = new Set(s.flags);
  const added = flags.filter((f) => idOk(f) && !have.has(f));
  if (!added.length) return { state: s, added };
  return { state: { ...s, flags: [...s.flags, ...added] }, added };
}

export function removeFlags(s: AdventureState, flags: readonly string[]): AdventureState {
  const drop = new Set(flags);
  return s.flags.some((f) => drop.has(f)) ? { ...s, flags: s.flags.filter((f) => !drop.has(f)) } : s;
}

export function befriend(s: AdventureState, npc: string, by: number): AdventureState {
  const cur = s.friends?.[npc] ?? 0;
  const next = Math.max(0, Math.min(10, cur + by));
  return next === cur ? s : { ...s, friends: { ...(s.friends ?? {}), [npc]: next } };
}

export function remember(s: AdventureState, key: string, value: string): AdventureState {
  return s.choices[key] === value ? s : { ...s, choices: { ...s.choices, [key]: value.slice(0, 30) } };
}

export function markSeen(s: AdventureState, ids: readonly string[]): AdventureState {
  const have = new Set(s.seen);
  const add = ids.filter((i) => idOk(i) && !have.has(i));
  return add.length ? { ...s, seen: [...s.seen, ...add] } : s;
}

export function markUsed(s: AdventureState, spot: string): AdventureState {
  return s.used.includes(spot) ? s : { ...s, used: [...s.used, spot] };
}

export function giveKeyItem(s: AdventureState, id: string, n = 1): AdventureState {
  return { ...s, keyItems: { ...s.keyItems, [id]: Math.max(0, Math.min(99, (s.keyItems[id] ?? 0) + n)) } };
}

export function str60(x: unknown): string {
  return str(x, '', 60);
}
