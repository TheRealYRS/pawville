/**
 * The adventure controller hook (Milestone 6): owns the persistent adventure state, runs world
 * events through the quest engine, applies rewards to the world save exactly once, and shares
 * world flags with a connected partner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QUESTS, journalEntry, questById } from './content.ts';
import { dispatch, settle, type Grant, type Note, type QuestEvent } from './engine.ts';
import { ADV_MESSAGE, mergeShared, sharedFlagsOf } from './sync.ts';
import { adventureStore, isSharedFlag, viewOf, type AdventureState } from './state.ts';
import { addItem, ITEM_IDS, recordMemory, unlock, type AchievementId, type ItemId, type WorldSave } from '../worldSave.ts';
import { onPairMessage, sendPair } from '../couple/pairHub.ts';

export interface AdventureApi {
  state: AdventureState;
  view: ReturnType<typeof viewOf>;
  /** Run a world event through the quest engine (rewards + notifications included). */
  fire(ev: QuestEvent): void;
  /** Change the state directly (key items, used spots, flags…), then settle quests. */
  change(fn: (s: AdventureState) => AdventureState): void;
}

type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;

export function useAdventure(opts: {
  save: WorldSave;
  update: (fn: (s: WorldSave) => WorldSave) => void;
  notify: Notify;
  partnerOnline: boolean;
  place: () => string;
}): AdventureApi {
  const [state, setState] = useState<AdventureState>(() => adventureStore().load());
  const ref = useRef(state);
  const latest = useRef(opts);
  latest.current = opts;

  const applyGrants = useCallback((grants: Grant[]) => {
    if (!grants.length) return;
    latest.current.update((sv) => {
      let s = sv;
      for (const g of grants) {
        if (g.kind === 'item' && (ITEM_IDS as readonly string[]).includes(g.id)) s = addItem(s, g.id as ItemId, g.n);
        else if (g.kind === 'achievement') s = unlock(s, g.id as AchievementId, Date.now()).save;
        else if (g.kind === 'tokens') s = { ...s, tokens: Math.min(9999, s.tokens + g.n) };
        else if (g.kind === 'memory') s = recordMemory(s, { kind: 'adventure', title: g.title, detail: g.detail, at: Date.now(), place: latest.current.place(), withPartner: latest.current.partnerOnline, id: `adv-${g.quest}` });
      }
      return s;
    });
  }, []);

  const announce = useCallback((notes: Note[]) => {
    const n = latest.current.notify;
    for (const note of notes) {
      if (note.kind === 'start') n(`New quest: ${note.text}`, 'info');
      else if (note.kind === 'objective') n(`✓ ${note.text}`, 'success');
      else if (note.kind === 'progress') n(note.text, 'info');
      else if (note.kind === 'done') n(`${note.together ? 'Completed together' : 'Quest complete'}: ${note.text}!`, 'success');
      else if (note.kind === 'journal') { const j = journalEntry(note.id); if (j) n(`Journal: ${j.title}`, 'info'); }
    }
  }, []);

  const commit = useCallback((next: AdventureState, before: AdventureState) => {
    ref.current = next;
    adventureStore().save(next);
    setState(next);
    // share any NEW world flags with the partner (idempotent union on their side)
    const gained = next.flags.filter((f) => isSharedFlag(f) && !before.flags.includes(f));
    if (gained.length && latest.current.partnerOnline) sendPair({ t: ADV_MESSAGE, flags: sharedFlagsOf(next) });
  }, []);

  const fire = useCallback((ev: QuestEvent) => {
    const before = ref.current;
    const r = dispatch(QUESTS, before, ev, Date.now(), latest.current.save.inventory);
    if (r.state === before) return;
    commit(r.state, before);
    announce(r.notes);
    applyGrants(r.grants);
  }, [announce, applyGrants, commit]);

  const change = useCallback((fn: (s: AdventureState) => AdventureState) => {
    const before = ref.current;
    const mid = fn(before);
    const r = settle(QUESTS, mid, Date.now(), latest.current.save.inventory);
    // flags that appeared because of this change are processed as events too
    let st = r.state;
    const notes = [...r.notes];
    const grants = [...r.grants];
    for (const f of mid.flags.filter((x) => !before.flags.includes(x))) {
      const rr = dispatch(QUESTS, st, { type: 'flag', flag: f }, Date.now(), latest.current.save.inventory);
      st = rr.state; notes.push(...rr.notes); grants.push(...rr.grants);
    }
    if (st === before) return;
    commit(st, before);
    announce(notes);
    applyGrants(grants);
  }, [announce, applyGrants, commit]);

  // settle once on load (auto-start quests whose prerequisites are already met, e.g. old saves)
  useEffect(() => {
    const r = settle(QUESTS, ref.current, Date.now(), latest.current.save.inventory);
    if (r.state !== ref.current) { commit(r.state, ref.current); applyGrants(r.grants); }
  }, [applyGrants, commit]);

  // partner sync: receive their shared flags; send ours whenever they (re)appear
  useEffect(() => onPairMessage((m) => {
    if (m.t !== ADV_MESSAGE) return;
    const before = ref.current;
    const merged = mergeShared(before, m.flags as unknown);
    if (!merged.added.length) return;
    change(() => merged.state);
    latest.current.notify('Your partner’s discoveries are now in your world too.', 'info');
  }), [change]);
  useEffect(() => {
    if (opts.partnerOnline) sendPair({ t: ADV_MESSAGE, flags: sharedFlagsOf(ref.current) });
  }, [opts.partnerOnline]);

  // keep the view in sync with BOTH stores (quest gates can depend on bag items, e.g. a fish)
  const view = useMemo(() => viewOf(state, opts.save.inventory), [state, opts.save.inventory]);
  return { state, view, fire, change };
}

/** Spot ids that belong to a current objective (for quest markers). */
export function highlightedSpots(state: AdventureState, spots: readonly { id: string; role: string; npc?: string; collect?: { item: string }; to?: { region: string }; setFlags?: string[] }[]): Set<string> {
  const out = new Set<string>();
  for (const [id, p] of Object.entries(state.quests)) {
    if (p.status !== 'active') continue;
    const q = questById(id);
    const obj = q?.objectives[p.step];
    if (!obj) continue;
    const m = obj.on;
    const match = (x: string) => (m.target.endsWith('*') ? x.startsWith(m.target.slice(0, -1)) : x === m.target);
    for (const s of spots) {
      if (m.type === 'talk' && s.role === 'npc' && s.npc && match(s.npc)) out.add(s.id);
      else if (m.type === 'use' && match(s.id)) out.add(s.id);
      else if (m.type === 'collect' && s.collect && match(s.collect.item)) out.add(s.id);
      else if (m.type === 'enter' && s.to && match(s.to.region)) out.add(s.id);
      else if (m.type === 'flag' && (s.setFlags?.includes(m.target) || FLAG_SPOTS[m.target]?.includes(s.id))) out.add(s.id);
    }
  }
  return out;
}

/** Spots that lead to a flag through a puzzle or a world mechanism. */
const FLAG_SPOTS: Record<string, string[]> = {
  'lighthouse-lit': ['lighthouse-door'],
  'observatory-open': ['lighthouse-door'],
  'crystal-door-open': ['plate-a', 'plate-b', 'moonstone'],
  'pedestals-awake': ['pedestal-a', 'pedestal-b', 'starstone'],
  'region:isles': ['observatory-scope'],
  'region:forest': ['glow-prints'],
  'cave-open': ['vine-curtain'],
  'pier-repaired': ['pier-repair'],
  'cable-car-fixed': ['cablecar-station'],
  'region:highlands': ['talk-juniper'],
};
