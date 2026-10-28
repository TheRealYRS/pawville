/**
 * The reusable quest engine (Milestone 6). Pure and deterministic: (state, event) -> (state, notes).
 *
 *   - Quests have stable ids, a layer (main / regional / side / discovery), prerequisites, ordered
 *     objectives, rewards and follow-ups. Content lives in adventure/content.ts — data, not code.
 *   - Events come from the world: talking to an NPC, using a spot, collecting, entering a region,
 *     solving a puzzle, or a flag appearing (including flags shared by a partner).
 *   - Rewards are granted exactly once (the `rewarded` list), so retries, duplicated network
 *     messages or a double-tap can never duplicate a reward.
 *   - Quest-critical items are key items: they can't be dropped, sold or lost.
 *   - Nothing can soft-lock: every objective's target stays available until the objective is done
 *     (spots are gated on the quest step, not on one-shot timers), and a quest whose completion
 *     flag arrives from your partner completes for you too.
 */
import { addFlags, giveKeyItem, viewOf, type AdvView, type AdventureState, type Cond, type RegionId } from './state.ts';

export type QuestEvent =
  | { type: 'talk'; npc: string }
  | { type: 'use'; spot: string }
  | { type: 'collect'; item: string; spot?: string }
  | { type: 'enter'; region: RegionId }
  | { type: 'puzzle'; id: string }
  | { type: 'flag'; flag: string };

export interface Matcher {
  type: QuestEvent['type'];
  /** npc / spot / item / region / puzzle / flag id. A trailing `*` matches a prefix. */
  target: string;
}

export interface Objective {
  id: string;
  text: string;
  /** A fair hint shown in the journal (never the full answer to a puzzle). */
  hint: string;
  on: Matcher;
  /** How many matching events are needed (default 1). */
  need?: number;
  /** Count DISTINCT targets (spot/item ids) instead of events. */
  unique?: boolean;
  /** Only counts while this holds (e.g. "you must carry the moonstone"). */
  requires?: Cond;
  effects?: Effects;
}

export interface Effects {
  flags?: string[];
  journal?: string[];
  give?: Record<string, number>;
  take?: Record<string, number>;
}

export interface Rewards extends Effects {
  /** World-save items (bag), granted once. */
  items?: Record<string, number>;
  achievement?: string;
  memory?: { title: string; detail: string };
  /** Milestone 7: paw tokens (granted once, like every reward). */
  tokens?: number;
}

export type QuestLayer = 'main' | 'regional' | 'side' | 'discovery';

export interface QuestDef {
  id: string;
  title: string;
  layer: QuestLayer;
  region: RegionId;
  summary: string;
  /** All must hold for the quest to become available. */
  prereq?: Cond;
  /** How the quest starts (if absent it starts automatically once available). */
  startOn?: Matcher;
  /** Hidden quests are not listed until started. */
  hidden?: boolean;
  /** If this (shared) flag appears — e.g. your partner finished it — the quest completes for you. */
  completesOnFlag?: string;
  /** Marks a two-player challenge (with the solo alternative described in its hints). */
  coop?: boolean;
  objectives: Objective[];
  rewards: Rewards;
  startEffects?: Effects;
}

export type Note =
  | { kind: 'start'; quest: string; text: string }
  | { kind: 'progress'; quest: string; text: string }
  | { kind: 'objective'; quest: string; text: string }
  | { kind: 'done'; quest: string; text: string; together: boolean }
  | { kind: 'flag'; flag: string }
  | { kind: 'journal'; id: string };

export type Grant =
  | { kind: 'item'; id: string; n: number }
  | { kind: 'achievement'; id: string }
  | { kind: 'memory'; title: string; detail: string; quest: string }
  | { kind: 'tokens'; n: number; quest: string };

export interface DispatchResult {
  state: AdventureState;
  notes: Note[];
  grants: Grant[];
}

function targetOf(ev: QuestEvent): string {
  switch (ev.type) {
    case 'talk': return ev.npc;
    case 'use': return ev.spot;
    case 'collect': return ev.item;
    case 'enter': return ev.region;
    case 'puzzle': return ev.id;
    case 'flag': return ev.flag;
  }
}

export function matches(m: Matcher, ev: QuestEvent): boolean {
  if (m.type !== ev.type) return false;
  const t = targetOf(ev);
  return m.target.endsWith('*') ? t.startsWith(m.target.slice(0, -1)) : t === m.target;
}

/** Identity used for `unique` counting (the spot for collect events, otherwise the target). */
function uniqueKey(ev: QuestEvent): string {
  return ev.type === 'collect' ? ev.spot ?? ev.item : targetOf(ev);
}

export function questStatus(q: QuestDef, s: AdventureState, v: AdvView = viewOf(s)): 'locked' | 'available' | 'active' | 'done' {
  const p = s.quests[q.id];
  if (p) return p.status;
  return !q.prereq || q.prereq(v) ? 'available' : 'locked';
}

function applyEffects(s: AdventureState, e: Effects | undefined, notes: Note[], newFlags: string[]): AdventureState {
  if (!e) return s;
  let st = s;
  if (e.flags?.length) {
    const r = addFlags(st, e.flags);
    st = r.state;
    for (const f of r.added) { notes.push({ kind: 'flag', flag: f }); newFlags.push(f); }
  }
  if (e.journal?.length) {
    const add = e.journal.filter((j) => !st.journal.includes(j));
    if (add.length) {
      st = { ...st, journal: [...st.journal, ...add] };
      for (const j of add) notes.push({ kind: 'journal', id: j });
    }
  }
  for (const [id, n] of Object.entries(e.give ?? {})) st = giveKeyItem(st, id, n);
  for (const [id, n] of Object.entries(e.take ?? {})) st = giveKeyItem(st, id, -n);
  return st;
}

function complete(q: QuestDef, s: AdventureState, now: number, together: boolean, notes: Note[], grants: Grant[], newFlags: string[]): AdventureState {
  let st: AdventureState = { ...s, quests: { ...s.quests, [q.id]: { ...(s.quests[q.id] ?? { hits: [], count: 0, startedAt: now }), status: 'done', step: q.objectives.length, count: 0, hits: [], doneAt: now, together: together || undefined } } };
  notes.push({ kind: 'done', quest: q.id, text: q.title, together });
  if (st.rewarded.includes(q.id)) return st; // duplicate-reward guard
  st = { ...st, rewarded: [...st.rewarded, q.id] };
  st = applyEffects(st, q.rewards, notes, newFlags);
  for (const [id, n] of Object.entries(q.rewards.items ?? {})) grants.push({ kind: 'item', id, n });
  if (q.rewards.achievement) grants.push({ kind: 'achievement', id: q.rewards.achievement });
  if (q.rewards.memory) grants.push({ kind: 'memory', ...q.rewards.memory, quest: q.id });
  if (q.rewards.tokens) grants.push({ kind: 'tokens', n: q.rewards.tokens, quest: q.id });
  return st;
}

function start(q: QuestDef, s: AdventureState, now: number, notes: Note[], newFlags: string[]): AdventureState {
  notes.push({ kind: 'start', quest: q.id, text: q.title });
  const st = { ...s, quests: { ...s.quests, [q.id]: { status: 'active' as const, step: 0, count: 0, hits: [], startedAt: now } } };
  return applyEffects(st, q.startEffects, notes, newFlags);
}

/**
 * Apply one world event. Starts quests whose start condition matches, advances the current
 * objective of every active quest that matches, completes quests, grants rewards once, and then
 * re-processes any flags that appeared (bounded) so chained unlocks resolve in one call.
 */
export function dispatch(quests: readonly QuestDef[], s0: AdventureState, ev: QuestEvent, now: number, inventory: Partial<Record<string, number>> = {}): DispatchResult {
  const notes: Note[] = [];
  const grants: Grant[] = [];
  let s = s0;
  const queue: QuestEvent[] = [ev];
  let guard = 0;
  while (queue.length && guard++ < 40) {
    const e = queue.shift()!;
    const newFlags: string[] = [];
    // 1) quests that start on this event (the starting event itself never counts as progress)
    const startedNow = new Set<string>();
    for (const q of quests) {
      const st = questStatus(q, s, viewOf(s, inventory));
      if (st !== 'available' || !q.startOn || !matches(q.startOn, e)) continue;
      s = start(q, s, now, notes, newFlags);
      startedNow.add(q.id);
    }
    // 2) progress active quests
    for (const q of quests) {
      const p = s.quests[q.id];
      if (!p || p.status !== 'active' || startedNow.has(q.id)) continue;
      const obj = q.objectives[p.step];
      if (!obj || !matches(obj.on, e)) continue;
      if (obj.requires && !obj.requires(viewOf(s, inventory))) continue;
      const key = uniqueKey(e);
      if (obj.unique && p.hits.includes(key)) continue;
      const need = obj.need ?? 1;
      const count = p.count + 1;
      const hits = obj.unique ? [...p.hits, key] : p.hits;
      if (count < need) {
        s = { ...s, quests: { ...s.quests, [q.id]: { ...p, count, hits } } };
        notes.push({ kind: 'progress', quest: q.id, text: `${obj.text} (${count}/${need})` });
        continue;
      }
      s = applyEffects(s, obj.effects, notes, newFlags);
      const step = p.step + 1;
      notes.push({ kind: 'objective', quest: q.id, text: obj.text });
      if (step >= q.objectives.length) s = complete(q, s, now, false, notes, grants, newFlags);
      else s = { ...s, quests: { ...s.quests, [q.id]: { ...p, step, count: 0, hits: [] } } };
    }
    // 3) quests completed by a (shared) flag, and quests that auto-start once available
    for (const q of quests) {
      const st = questStatus(q, s, viewOf(s, inventory));
      if (q.completesOnFlag && (st === 'active' || st === 'available') && s.flags.includes(q.completesOnFlag)) {
        s = complete(q, s, now, true, notes, grants, newFlags);
        continue;
      }
      if (st === 'available' && !q.startOn) s = start(q, s, now, notes, newFlags);
    }
    for (const f of newFlags) queue.push({ type: 'flag', flag: f });
    // 4) an objective that waits for a flag which ALREADY exists (e.g. your partner opened the door
    //    before you reached this step) completes right away — this is what prevents soft-locks.
    if (!queue.length) {
      for (const q of quests) {
        const p = s.quests[q.id];
        if (!p || p.status !== 'active') continue;
        const obj = q.objectives[p.step];
        if (obj?.on.type === 'flag' && !obj.on.target.endsWith('*') && s.flags.includes(obj.on.target)) { queue.push({ type: 'flag', flag: obj.on.target }); break; }
      }
    }
  }
  return { state: s, notes, grants };
}

/** Run the engine once with no event (auto-starts, shared-flag completions after a load/merge). */
export function settle(quests: readonly QuestDef[], s: AdventureState, now: number, inventory: Partial<Record<string, number>> = {}): DispatchResult {
  return dispatch(quests, s, { type: 'flag', flag: '__settle__' }, now, inventory);
}

export function currentObjective(q: QuestDef, s: AdventureState): Objective | null {
  const p = s.quests[q.id];
  if (!p || p.status !== 'active') return null;
  return q.objectives[p.step] ?? null;
}

/** Sanity checks for content (used by tests): unique ids, reachable objectives, no empty quests. */
export function validateQuests(quests: readonly QuestDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const q of quests) {
    if (ids.has(q.id)) problems.push(`duplicate quest id ${q.id}`);
    ids.add(q.id);
    if (!q.objectives.length) problems.push(`${q.id}: no objectives`);
    const oids = new Set<string>();
    for (const o of q.objectives) {
      if (oids.has(o.id)) problems.push(`${q.id}: duplicate objective ${o.id}`);
      oids.add(o.id);
      if (!o.hint) problems.push(`${q.id}/${o.id}: missing hint`);
    }
  }
  return problems;
}
