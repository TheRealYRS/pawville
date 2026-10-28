/**
 * The adventure layer of the town page (Milestone 6): which region you're in, travel between
 * regions, NPC dialogue, quest spots, puzzles, cooperative plates/pedestals, regional activities,
 * the journal and the world map. TownPage stays the single host page; this hook keeps the new
 * systems out of its existing logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { TownControls, TownLive } from '../components/TownCanvas';
import { DialogueSheet, FishingSheet, JournalModal, PuzzleModal, QuestTracker, WorldMapModal, type DialogueOpen } from '../components/AdventurePanels';
import { cue } from '../sound';
import { addItem, ITEM_IDS, ITEM_NAMES, recordMemory, unlock, type ItemId, type MemoryEvent, type WorldSave } from '../worldSave.ts';
import type { Environment } from '../world/environment.ts';
import type { Vec2 } from '../world/geometry.ts';
import { SPAWN_POINT } from '../world/townMap.ts';
import { createStore, isObj, num } from '../persistence.ts';
import { getScene } from '../world/scene.ts';
import { FISH_IDS, journalEntry } from './content.ts';
import { cityDialogue, dialogueFor } from './dialogue.ts';
import { layerConversation, profileKey, profileOf } from '../story/residents.ts';
import { applyStoryFx, toneOfChoice } from '../story/model.ts';
import {makeTownLiving} from '../living/town.ts';
import { NEW_RESIDENTS, residentFor } from '../living/roster.ts';
import { makeLivingWorld, residentDialogue, tickLiving, livingSnapshot, restoreLiving } from '../living/engine.ts';
import { ClawPanel, MelodyPanel, RecordsPanel, ShopPanel, TicketPanel, VendingPanel } from '../components/CityPanels';
import { grantOnce, spend, type ShopId } from '../city/economy.ts';
import { seatSlots, standPoint } from '../world/seating.ts';
import { keepSeat, releaseSeat, takeSeat, type Slot } from '../world/seatClaims.ts';
import { claimOnce } from '../world/claims.ts';
import { TelescopeView } from '../components/TelescopeView';
import { SITE_NAME, moonPhaseAt, skyJournalId, type ScopeSite, type SkyContext, type SkyObject } from './telescope.ts';
import { PanelSheet } from '../components/PanelSheet';
import { FurnitureShopPanel } from '../components/HomeLifePanels';
import { NEW_CITY_REGIONS } from '../city/cityDistricts.ts';
import { singNote, speak } from '../city/voices.ts';
import { CafeRushPanel, CinemaPanel, FishFrenzyPanel, KaraokePanel } from '../components/ShowPanels';
import { showingFilms } from '../city/cinema.ts';
import { BumperPawsPanel, RingTossPanel } from '../components/FunfairGames';
import { onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import { PickBox, STORY_PICK, parsePick } from '../story/pairing.ts';
import { afterSceneForNpc, afterSceneForSpot, applyAnswer, applyFx, companionTalk, finishScene, lumiAt, openAfter, openPlain, openScene, sceneById, sceneForNpc, sceneForSpot, storyObjective, type StoryDialogue } from '../story/engine.ts';
import { storyEntry } from '../story/journal.ts';
import { storyGlyphs } from '../story/world.ts';
import { playCue, stopStoryMusic } from '../story/musicPlayer.ts';
import { ListenSheet } from '../components/StoryPanels';
import { useFunfair, type FairApi } from './useFunfair';
import type { CoatId } from '../appearance.ts';
import { fishFor, platesPressed } from './puzzles.ts';
import { closedGates, visibleNpcs, visibleSpots, type AdventureSpot, type NpcDef } from './regionKit.ts';
import { CAVE_PLATES, ISLE_PEDESTALS, regionDef, townNpcs, townSpots } from './regions.ts';
import { addFlags, befriend, giveKeyItem, markSeen, markUsed, remember, removeFlags, REGION_IDS, type AdventureState, type RegionId } from './state.ts';
import { highlightedSpots, useAdventure, type AdventureApi } from './useAdventure.ts';

type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;

/** Where you were (region + position), saved separately from progress so it can update often. */
interface Where { region: RegionId; x: number; y: number }
const whereStore = () => createStore<Where | null>({
  key: 'where', version: 1, defaults: () => null,
  sanitize: (raw) => (isObj(raw) && (REGION_IDS as readonly string[]).includes(raw.region as string) ? { region: raw.region as RegionId, x: num(raw.x, 0, 0, 2000), y: num(raw.y, 0, 0, 2000) } : null),
});

export function regionUnlocked(r: RegionId, s: Pick<AdventureState, 'flags'>): boolean {
  if (r === 'town' || r === 'city' || r === 'arcade-hall' || NEW_CITY_REGIONS.includes(r)) return true; // the city (and its districts) is always a train ride away
  if (r === 'cave') return s.flags.includes('cave-open');
  return s.flags.includes(`region:${r}`);
}

const TOWN_SPOTS = townSpots();
const TOWN_NPCS = [...townNpcs(),...NEW_RESIDENTS.filter(n=>n.region==='town').map((n):NpcDef=>({id:n.id,name:n.name,coat:n.coat,extra:n.extra,x:n.stops[0].x,y:n.stops[0].y,facing:'down'}))];
TOWN_SPOTS.push(...NEW_RESIDENTS.filter(n=>n.region==='town').map((n):AdventureSpot=>({id:`talk-${n.id}`,kind:'adventure',role:'npc',npc:n.id,label:`Talk to ${n.name}`,point:{x:n.stops[0].x,y:n.stops[0].y},radius:29})));
const spotsOf = (r: RegionId): readonly AdventureSpot[] => (r === 'town' ? TOWN_SPOTS : regionDef(r).spots);
const npcsOf = (r: RegionId): readonly NpcDef[] => (r === 'town' ? TOWN_NPCS : regionDef(r).npcs);
const spawnOf = (r: RegionId): Vec2 => (r === 'town' ? SPAWN_POINT : regionDef(r).spawn);

export interface AdventureLayer {
  adv: AdventureApi;
  region: RegionId;
  entry: Vec2;
  sceneKey: string;
  traveling: boolean;
  /** Something modal is open (movement pauses). */
  blocking: boolean;
  useSpot(s: AdventureSpot): void;
  goTo(to: { region: RegionId; x: number; y: number; travel?: string }): void;
  rememberWhere(p: Vec2): void;
  open(which: 'journal' | 'map'): void;
  close(): void;
  panels(o: { onTownPlaces: () => void; onPhoto: () => void }): ReactNode;
}

export function useAdventureLayer(o: {
  save: WorldSave;
  update: (fn: (s: WorldSave) => WorldSave) => void;
  notify: Notify;
  partnerOnline: boolean;
  startPos: Vec2;
  controls: MutableRefObject<TownControls>;
  playerPos: MutableRefObject<Vec2>;
  live: MutableRefObject<TownLive>;
  record: (m: Omit<MemoryEvent, 'id' | 'at'>) => void;
  area: () => string;
  env: Environment;
  /** Milestone 7: launch an existing game page (arcade cabinets). */
  openRoute: (route: string) => void;
  /** Milestone 7: the player's character (for voices). */
  coat: CoatId;
  /** Funfair: Tangerine / Midnight (breaks an exact tie when both partners claim the same ride seat). */
  role?: 'T' | 'M';
  /** Milestone 8.1: send a small message to the partner over the pair channel (telescope discoveries). */
  share?: (m: { t: string; [k: string]: unknown }) => void;
}): AdventureLayer {
  const adv = useAdventure({ save: o.save, update: o.update, notify: o.notify, partnerOnline: o.partnerOnline, place: o.area });
  // ---- where we start: a game's return point → last saved place → town spawn ----
  const [{ region, entry, key }, setPlace] = useState(() => {
    const w = whereStore().load();
    const st = adv.state;
    if (w && regionUnlocked(w.region, st)) return { region: w.region, entry: w.region === 'town' && o.startPos !== SPAWN_POINT ? o.startPos : { x: w.x, y: w.y }, key: 0 };
    return { region: 'town' as RegionId, entry: o.startPos, key: 0 };
  });
  const [traveling, setTraveling] = useState(false);
  const [dialog, setDialog] = useState<DialogueOpen | null>(null);
  const [puzzle, setPuzzle] = useState<string | null>(null);
  const [panel, setPanel] = useState<'journal' | 'map' | null>(null);
  const [fishing, setFishing] = useState<AdventureSpot | null>(null);
  const [listening, setListening] = useState<{ title: string; ms: number; run: () => void } | null>(null);
  const latest = useRef(o);
  latest.current = o;
  const fairRef = useRef<FairApi | null>(null);
  const advRef = useRef(adv);
  advRef.current = adv;
  const regionRef = useRef(region);
  regionRef.current = region;

  // Funfair rides (Ferris wheel, carousel, swing ride): boarding, seats, partner sync and clean-up live in useFunfair.
  const fair = useFunfair({ region, live: o.live, controls: o.controls, playerPos: o.playerPos, notify: o.notify, update: o.update, partnerOnline: o.partnerOnline, myRole: o.role ?? 'T', coat: o.coat, darkness: () => latest.current.env.darkness });
  fairRef.current = fair;
  const rememberWhere = useCallback((p: Vec2) => { whereStore().save({ region: regionRef.current, x: Math.round(p.x), y: Math.round(p.y) }); }, []);
  // save where we are every few seconds, and when the tab is hidden (mobile background / lock)
  useEffect(() => {
    const save = () => rememberWhere(latest.current.playerPos.current);
    const id = window.setInterval(save, 4000);
    const vis = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', save);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', save); };
  }, [rememberWhere]);

  const goTo = useCallback((to: { region: RegionId; x: number; y: number; travel?: string }) => {
    const a = advRef.current;
    if (!regionUnlocked(to.region, a.state)) { latest.current.notify('That way is still closed.', 'info'); return; }
    setDialog(null); setPuzzle(null); setPanel(null); setFishing(null); setScope(null); setListening(null);
    releaseSeat(latest.current.live.current); latest.current.live.current.seat = null; sitRef.current = null;
    if (to.region === regionRef.current) { latest.current.controls.current.teleport = { x: to.x, y: to.y }; return; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTraveling(true);
    if (to.travel === 'boat') latest.current.notify('All aboard! Captain Marlow takes the wheel…', 'info');
    if (to.travel === 'cablecar') latest.current.notify('The cable car hums along the wire…', 'info');
    if (to.travel === 'train') latest.current.notify(to.region === 'city' ? 'Choo-choo! Next stop: Whiskerwick City.' : 'The train rattles home to Pawville…', 'info');
    setSitting(false);
    window.setTimeout(() => {
      setPlace((p) => ({ region: to.region, entry: { x: to.x, y: to.y }, key: p.key + 1 }));
      whereStore().save({ region: to.region, x: to.x, y: to.y });
      a.change((s) => {
        const seen = markSeen(s, [`region:${to.region}`]);
        // Milestone 7: first arrival in the city sets its (personal) region flag and a memory
        return to.region === 'city' && !seen.flags.includes('region:city') ? addFlags(seen, ['region:city']).state : seen;
      });
      const FIRST: Partial<Record<RegionId, [string, string]>> = {
        'city-park': ['Grand City Park', 'Ducks, a gazebo and a hedge maze.'], 'old-town': ['Old Town', 'Cobblestones and a clock stuck at eleven.'],
        rooftops: ['Up on the rooftops', 'The whole city spread out below.'],
      };
      const first = FIRST[to.region];
      if (first) latest.current.update((sv) => {
        const id = `first-${to.region}`;
        return sv.memories.some((m) => m.id === id) ? sv : recordMemory(sv, { id, kind: 'city', title: `First visit: ${first[0]}`, detail: first[1], at: Date.now(), place: first[0], withPartner: latest.current.partnerOnline });
      });
      if (to.region === 'city') latest.current.update((sv) => {
        if (sv.claims.includes('memory:first-city')) return sv;
        const withMem = recordMemory(sv, { id: 'city-first', kind: 'city', title: 'First trip to Whiskerwick', detail: 'Off the train and into the big city.', at: Date.now(), place: 'Whiskerwick Station', withPartner: latest.current.partnerOnline });
        return unlock({ ...withMem, claims: [...withMem.claims, 'memory:first-city'] }, 'city-slicker', Date.now()).save;
      });
      advRef.current.fire({ type: 'enter', region: to.region });
      window.setTimeout(() => setTraveling(false), reduce ? 0 : 120);
    }, reduce ? 0 : 260);
  }, []);

  // Milestone 7: being in the city (by train, the ticket machine, or a restored session) counts as having found it
  useEffect(() => {
    if ((region === 'city' || region === 'arcade-hall') && !advRef.current.state.flags.includes('region:city')) {
      advRef.current.change((s) => markSeen(addFlags(s, ['region:city']).state, ['region:city']));
    }
  }, [region]);

  // ---- what the canvas needs from the adventure layer (spots, gates, NPCs, markers) ----
  const view = adv.view;
  // A single simulator exists only for the open scene. Other regions cost no CPU.
  // The visual states are client-local; no rewards or authoritative multiplayer mutations occur.
  const living = useMemo(() => region === 'town' ? makeTownLiving() : makeLivingWorld(regionDef(region), NEW_RESIDENTS.filter((n) => n.region === region)), [region]);
  useEffect(()=>{try{restoreLiving(living,JSON.parse(localStorage.getItem(`pawville:living:v1:${region}`)??'null'));}catch{/* optional local state */}return ()=>{try{localStorage.setItem(`pawville:living:v1:${region}`,JSON.stringify(livingSnapshot(living)));}catch{/* disabled storage */}};},[living,region]);
  const [livingFrame, setLivingFrame] = useState(0);
  useEffect(() => {
    if (!living || !living.residents.length) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') {
        tickLiving(living, now - last, now, latest.current.playerPos.current);
        setLivingFrame((x) => x + 1);
      }
      last = now;
    }, 180);
    return () => window.clearInterval(timer);
  }, [living]);

  const spots = useMemo(() => visibleSpots(spotsOf(region), view), [region, view]);
  const blockers = useMemo(() => (region === 'town' ? [] : closedGates(regionDef(region), view)), [region, view]);
  // Milestone 7: NPC routines — where each resident is right now (time of day + rain)
  const world = { phase: o.env.phase, rain: o.env.weather === 'light-rain' || o.env.weather === 'heavy-rain' };
  const npcs = useMemo(() => visibleNpcs(npcsOf(region), view).map((n) => {
    const pos = living?.states.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y, facing: pos.facing, pose: pos.activity === 'nap' ? 'loaf' as const : pos.activity === 'sit' ? 'sit' as const : 'stand' as const } : n.schedule ? { ...n, ...n.schedule(world) } : n;
  }), [region, view, world.phase, world.rain, living, livingFrame]); // eslint-disable-line react-hooks/exhaustive-deps
  const spotsLive = useMemo(() => spots.map((sp) => {
    if (sp.role !== 'npc') return sp;
    const n = npcs.find((x) => x.id === sp.npc);
    return n && (n.x !== sp.point.x || n.y !== sp.point.y) ? { ...sp, point: { x: n.x, y: n.y } } : sp;
  }), [spots, npcs]);
  const highlight = useMemo(() => {
    const h = highlightedSpots(adv.state, spotsLive);
    const sid = storyObjective(view).scene; // The Song Beneath the Stars: mark the spot of the next scene
    const sp = sid ? sceneById(sid)?.spot?.id : undefined;
    if (sp && spotsLive.some((x) => x.id === sp)) h.add(sp);
    return h;
  }, [adv.state, spotsLive, view]);
  const glyphs = useMemo(() => storyGlyphs(region, view), [region, view]);
  const live = o.live.current;
  live.blockers = blockers;
  live.adv = { view, spots: spotsLive, highlight, pressed: live.adv?.pressed, glyphs };
  live.npcs = npcs.filter((n) => n.species !== 'lumi').map((n) => ({
    id: `npc:${n.id}`, name: n.name, coat: n.coat, accessory: 'none', extra: n.extra ?? 'none', x: n.x, y: n.y, facing: n.facing ?? 'down', moving: !!living?.states.get(n.id)?.moving,
    pose: n.pose ?? 'stand', lift: 0, animTime: 0, isSelf: false,
  }));
  live.creatures = npcs.filter((n) => n.species === 'lumi').map((n) => ({ x: n.x, y: n.y, kind: 'lumi' as const }));
  // the canvas reads `live.spots`: the scene's own interactables (the town's originals) + ours
  live.spots = [...getScene(region).baseSpots, ...spotsLive];

  // ---- cooperative plates (cave) and pedestals (isles): pressed by cats or by a placed stone ----
  useEffect(() => {
    if (region !== 'cave' && region !== 'isles') { if (latest.current.live.current.adv) latest.current.live.current.adv.pressed = undefined; return; }
    const isCave = region === 'cave';
    const plates = isCave ? CAVE_PLATES : ISLE_PEDESTALS;
    const prefix = isCave ? 'plate-stone' : 'ped-stone';
    const goal = isCave ? 'crystal-door-open' : 'pedestals-awake';
    const id = window.setInterval(() => {
      const a = advRef.current;
      if (a.view.has(goal)) return;
      const l = latest.current.live.current;
      const cats: Vec2[] = [latest.current.playerPos.current];
      if (l.partner && (l.partnerRegion ?? 'town') === region) cats.push(l.partner.pos);
      const stones = new Set(['a', 'b'].filter((k) => a.view.has(`${prefix}:${k}`)));
      const pressed = platesPressed(plates, cats, stones);
      if (l.adv) l.adv.pressed = pressed;
      if (pressed.a && pressed.b) {
        cue('join');
        a.change((s) => {
          let n = addFlags(s, [goal]).state;
          // the stone goes back into your bag so it can never be lost
          for (const k of ['a', 'b']) if (n.flags.includes(`${prefix}:${k}`)) n = giveKeyItem(removeFlags(n, [`${prefix}:${k}`]), isCave ? 'moonstone' : 'starstone', 1);
          return n;
        });
        a.fire({ type: 'puzzle', id: isCave ? 'twin-plates' : 'twin-pedestals' });
        latest.current.notify(isCave ? 'Both plates glow — the crystal door slides open!' : 'Both pedestals blaze with starlight!', 'success');
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [region]);

  // ---- using a spot ----
  const claimed = useRef(new Set<string>());
  const say = useCallback((title: string, lines: string[], extra: Partial<DialogueOpen> = {}) => setDialog({ title, lines, ...extra }), []);
  // ---- The Song Beneath the Stars: scenes, answers (shared with a partner), music --------------------------------
  const pairBox = useRef(new PickBox());
  useEffect(() => onPairMessage((m) => { const p = parsePick(m); if (p) pairBox.current.receive(p.ask, p.opt); }), []);
  useEffect(() => { if (!o.partnerOnline) pairBox.current.clear(); }, [o.partnerOnline]);
  useEffect(() => () => stopStoryMusic(), []);
  const storyCtx = () => { const e = latest.current.env; return { phase: e.phase, rain: e.weather === 'light-rain' || e.weather === 'heavy-rain' }; };
  /** Change the adventure save through a story reducer, and announce any new Story So Far entry. */
  const applyStory = useCallback((fn: (st: AdventureState) => AdventureState) => {
    const seen: { before?: AdventureState; after?: AdventureState } = {};
    advRef.current.change((st) => { seen.before = st; seen.after = fn(st); return seen.after; });
    if (!seen.before || !seen.after) return;
    for (const id of seen.after.story.journal) if (!seen.before.story.journal.includes(id)) { const e = storyEntry(id); if (e) latest.current.notify(`Story So Far: ${e.title}`, 'info'); }
    if (seen.after.story.phrases.length > seen.before.story.phrases.length) latest.current.notify('A new phrase joins the melody.', 'success');
  }, []);
  const openStory = useCallback((sd: StoryDialogue, opts: { npc?: string; portrait?: DialogueOpen['portrait'] } = {}) => {
    setDialog({
      title: sd.title, lines: sd.lines, who: sd.who, choices: sd.choices, listen: sd.listen, portrait: opts.portrait ?? null,
      onListen: (c) => { playCue(c, advRef.current.state.story); },
      pair: latest.current.partnerOnline ? { online: true, role: latest.current.role ?? 'T', send: (ask, opt) => sendPair({ t: STORY_PICK, ask, opt }), box: pairBox.current } : undefined,
      onChoose: (c, meta) => {
        const own = c.story;
        if (!own) return;
        const resolved = meta?.resolved.story ?? own;
        applyStory((st) => applyAnswer(st, own, resolved, meta?.partnerOpt ?? undefined));
        if (resolved.fx?.play) playCue(resolved.fx.play, advRef.current.state.story);
        cue('pop');
      },
      onFinish: sd.finishOnClose && sd.scene ? () => { const id = sd.scene!.id; applyStory((st) => finishScene(st, id)); } : undefined,
      onDone: opts.npc ? () => advRef.current.fire({ type: 'talk', npc: opts.npc! }) : undefined,
    });
  }, [applyStory]);
  /** A spot that belongs to a story scene (a chime, a stone, the old gate…). The Wind Steps ask you to hold still first. */
  const startScene = useCallback((s: AdventureSpot) => {
    const v = advRef.current.view;
    const sc = sceneForSpot(s.id, v);
    if (sc) {
      const run = () => { openStory(openScene(sc, advRef.current.view, storyCtx())); advRef.current.fire({ type: 'use', spot: s.id }); };
      const resumed = Object.keys(advRef.current.state.story.picks).some((k) => k.startsWith(`${sc.id}.`));
      if (sc.hold && !resumed) { setListening({ title: sc.title, ms: sc.hold, run }); return; }
      run();
      return;
    }
    const af = afterSceneForSpot(s.id, v, storyCtx());
    if (af) openStory(openAfter(af.scene, af.page));
  }, [openStory]); // eslint-disable-line react-hooks/exhaustive-deps

  const useSpot = useCallback((s: AdventureSpot) => {
    const a = advRef.current;
    const v = a.view;
    const textOf = (t: AdventureSpot['text']) => (typeof t === 'function' ? t(v) : t ?? '');
    const newJournal = (s.journal ?? []).filter((j) => !a.state.journal.includes(j));
    if (s.locked && s.locked.when(v)) { cue('nope'); say(s.label, [s.locked.text]); return; }
    if (s.scene) { startScene(s); return; }
    // discoveries: landmarks/creatures seen, journal entries
    if (s.seen || newJournal.length) {
      a.change((st) => {
        let n = s.seen ? markSeen(st, [s.seen]) : st;
        if (newJournal.length) n = { ...n, journal: [...n.journal, ...newJournal] };
        return n;
      });
      for (const j of newJournal) { const e = journalEntry(j); if (e) latest.current.notify(`Journal: ${e.title}`, 'info'); }
    }
    switch (s.role) {
      case 'exit':
        if (s.to) goTo(s.to);
        return;
      case 'npc': {
        const npc = s.npc!;
        const e = latest.current.env;
        // The Song Beneath the Stars: a scene, a "welcome back" line, or a companion's hint takes the conversation first
        {
          const here = regionRef.current;
          const storyDef = npcsOf(here).find((n) => n.id === npc);
          const portrait: DialogueOpen['portrait'] = storyDef?.species === 'lumi' ? 'lumi' : storyDef ? { coat: storyDef.coat, extra: storyDef.extra } : null;
          const hit = sceneForNpc(npc, here, v);
          if (hit) { if (storyDef && storyDef.species !== 'lumi') speak(storyDef.coat, 'greet'); openStory(openScene(hit, v, storyCtx()), { npc, portrait }); return; }
          const after = afterSceneForNpc(npc, here, v, storyCtx());
          if (after) { openStory(openAfter(after.scene, after.page), { npc, portrait }); return; }
          const companion = v.story.unlocked && ((npc === 'lumi' && lumiAt(v)?.region === here) || ((npc === 'biscuit' || npc === 'velvet') && here === 'temple'));
          if (companion) { openStory(openPlain(storyDef?.name ?? npc, companionTalk(npc as 'lumi' | 'biscuit' | 'velvet', v)), { npc, portrait }); return; }
        }
        const livingPerson = residentFor(npc, regionRef.current);
        const rain = e.weather === 'light-rain' || e.weather === 'heavy-rain';
        const base = livingPerson
          ? { name: livingPerson.name, lines: residentDialogue(livingPerson, e.phase, rain, advRef.current.state.friends?.[npc] ?? 0), meet: true, choices: undefined }
          : cityDialogue(npc, v, { phase: e.phase, rain }) ?? dialogueFor(npc, v, regionRef.current);
        // Every character has a personality layer on top of their established dialogue (story/residents.ts): a question, a follow-up
        // that opens on its own trigger, and what they remember afterwards. It never replaces a conversation that already has choices.
        const prof = profileOf(profileKey(npc, regionRef.current));
        const d = prof ? layerConversation(base, prof, v, { phase: e.phase, rain }) : base;
        const def = npcsOf(regionRef.current).find((n) => n.id === npc);
        if (def && def.species !== 'lumi') speak(def.coat, 'greet');
        setDialog({
          title: d.name, lines: d.lines, portrait: def?.species === 'lumi' ? 'lumi' : def ? { coat: def.coat, extra: def.extra } : null,
          choices: d.choices,
          onChoose: (c) => {
            // remembered answers + friendship (persisted in the adventure save)
            advRef.current.change((st) => {
              let n = c.remember ? remember(st, c.remember.key, c.remember.value) : st;
              if (c.friend) n = befriend(n, npc, c.friend);
              if (c.journal && !n.journal.includes(c.journal)) n = { ...n, journal: [...n.journal, c.journal] };
              // ordinary conversations feed the same gentle tendency as the story (never a score; see story/model.ts)
              const tone = toneOfChoice(c.tone);
              if (tone) n = { ...n, story: applyStoryFx(n.story, undefined, tone) };
              return n;
            });
            if (c.friend) latest.current.notify(`${d.name} seems happy you said that.`, 'info');
          },
          onDone: () => {
            if (d.meet) {
              advRef.current.change((st) => addFlags(st, [`met:${npc}`]).state);
              // Clementine's one-time welcome gift (idempotent)
              if (npc === 'clementine') {
                let got = false;
                latest.current.update((sv) => { const r = grantOnce(sv, 'city-welcome', 10); got = r.ok; return r.ok ? r.save : sv; });
                if (got) latest.current.notify('Clementine gives you 10 paw tokens. “Welcome to Whiskerwick!”', 'success');
              }
            }
            // Bramble only warms up if you actually have a fish to share (one is used up).
            if (npc === 'bramble' && advRef.current.view.onStep('stray-friend', 0)) {
              const fish = FISH_IDS.find((f) => (latest.current.save.inventory[f as ItemId] ?? 0) > 0);
              if (fish) { latest.current.update((sv) => addItem(sv, fish as ItemId, -1)); latest.current.notify(`You share a ${ITEM_NAMES[fish as ItemId]} with Bramble.`, 'success'); }
            }
            advRef.current.fire({ type: 'talk', npc });
          },
        });
        return;
      }
      case 'collect': {
        const c = s.collect!;
        // 8.1: a one-time spot stays visible until React re-renders; pressing E twice in that window used to
        // grant the item twice. Claim it synchronously first.
        if (c.once && !claimOnce(claimed.current, s.id)) return;
        a.change((st) => {
          let n = c.key ? giveKeyItem(st, c.item, 1) : st;
          if (c.once) n = markUsed(n, s.id);
          return n;
        });
        const bag = c.item === 'harbor-shell' ? 'shell' : c.item;
        if (!c.key && (ITEM_IDS as readonly string[]).includes(bag)) latest.current.update((sv) => addItem(sv, bag as ItemId, c.item === 'pine-cone' ? 3 : 1));
        cue('pop');
        latest.current.notify(c.text, 'success');
        advRef.current.fire({ type: 'collect', item: c.item, spot: s.id });
        return;
      }
      case 'use': case 'sign': {
        const pz = s.puzzle?.(v);
        if (pz) { setPuzzle(pz); return; }
        if (s.consume && !claimOnce(claimed.current, s.id)) return;
        if (s.setFlags?.length || s.consume) a.change((st) => {
          let n = s.setFlags?.length ? addFlags(st, s.setFlags).state : st;
          if (s.consume) n = markUsed(n, s.id);
          return n;
        });
        if (s.setFlags?.length) cue('join');
        if (s.story) { const fx = s.story; applyStory((st) => applyFx(st, fx)); cue('pop'); }
        if (s.cue) playCue(s.cue, advRef.current.state.story);
        advRef.current.fire({ type: 'use', spot: s.id });
        const t = textOf(s.text);
        if (t) say(s.label, [t]);
        return;
      }
      case 'activity': {
        if (s.activity === 'fish') { setFishing(s); return; }
        if (s.activity === 'sled') { sledRide(); return; }
        if (s.activity === 'aurora') {
          const e = latest.current.env;
          const clear = e.weather === 'sunny' || e.weather === 'windy' || e.weather === 'cloudy';
          if (e.darkness > 0.5 && clear) {
            latest.current.update((sv) => sv.memories.some((m) => m.id === 'adv-aurora') ? sv : recordMemory(sv, { id: 'adv-aurora', kind: 'adventure', title: 'The aurora over Frostbell', detail: 'Green and violet ribbons of light.', at: Date.now(), place: 'Aurora Point', withPartner: latest.current.partnerOnline }));
            say('Aurora Point', ['You curl up on the bench. Above the pines, green and violet light ripples across the sky.'], { action: { label: 'Take a photo', run: () => pendingPhoto.current?.() } });
          } else say('Aurora Point', ['A perfect spot for the aurora. It only shows on clear nights — set the sky to night in the weather panel for a photo, or come back later.']);
          return;
        }
        if (s.activity === 'telescope') { setSitting(false); releaseSeat(latest.current.live.current); latest.current.live.current.seat = null; sitRef.current = null; setScope(s.scope ?? 'city'); advRef.current.fire({ type: 'use', spot: s.id }); return; }
        if (s.activity === 'watch') { say(s.label, [textOf(s.text)]); advRef.current.fire({ type: 'use', spot: s.id }); return; }
        if (s.activity === 'ride' && s.ride) { fairRef.current?.board(s.ride); advRef.current.fire({ type: 'use', spot: s.id }); return; }
        // ---- Milestone 7: Whiskerwick activities ----
        if (s.activity === 'shop' && s.shop === 'furniture') { setMachine('furniture'); return; }
        if (s.activity === 'shop' && s.shop) { setShop(s.shop as ShopId); return; }
        if (s.activity === 'photo') { pendingPhoto.current?.(); return; }
        if (s.activity === 'bench') { sitAt(s.point, s.id); return; }
        if (s.activity === 'wish') { wish(); return; }
        if (s.activity === 'machine') {
          if (s.route) { speak(latest.current.coat, 'playful'); latest.current.openRoute(s.route); return; }
          setMachine(s.machine ?? null);
          return;
        }
        if (s.activity === 'place-stone') {
          const isCave = s.id.startsWith('plate-');
          const k = s.id.endsWith('-a') ? 'a' : 'b';
          const flag = `${isCave ? 'plate-stone' : 'ped-stone'}:${k}`;
          const item = isCave ? 'moonstone' : 'starstone';
          if (v.has(flag)) {
            a.change((st) => giveKeyItem(removeFlags(st, [flag]), item, 1));
            latest.current.notify(`You pick the ${item} back up.`, 'info');
          } else if (v.item(item) > 0) {
            a.change((st) => addFlags(giveKeyItem(st, item, -1), [flag]).state);
            cue('pop');
            latest.current.notify(`You set the ${item} on the ${isCave ? 'plate' : 'pedestal'}. It glows — now the other one needs a paw.`, 'success');
          } else say(s.label, [textOf(s.text), latest.current.partnerOnline ? 'Stand on one while your partner stands on the other.' : `Alone? Something heavy could hold one down for you — look for the ${item}.`]);
          return;
        }
        return;
      }
    }
  }, [goTo, say, startScene, openStory, applyStory]);

  // ---- sledding: ride down Sled Hill (a seated slide along the track) ----
  const sledRide = useCallback(() => {
    const l = latest.current.live.current;
    const start = { x: 496, y: 124 }, end = { x: 496, y: 388 };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cue('pop');
    if (reduce) { latest.current.controls.current.teleport = end; return; }
    const t0 = performance.now();
    const dur = 2200;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k * k * (3 - 2 * k);
      l.seat = { x: start.x + Math.sin(k * 12) * 3, y: start.y + (end.y - start.y) * e, pose: 'sit', facing: 'down', lift: 0 };
      if (k < 1 && regionRef.current === 'highlands') requestAnimationFrame(step);
      else { l.seat = null; latest.current.controls.current.teleport = end; latest.current.notify('Wheee! That was fast.', 'success'); }
    };
    requestAnimationFrame(step);
  }, []);

  const pendingPhoto = useRef<(() => void) | null>(null);

  // ---- Milestone 7: sitting on city benches, wishing at the fountain ----
  const [sitting, setSitting] = useState(false);
  /** The furniture I am sitting on (its stable id and every seat of it), for conflict checks and for standing up. */
  const sitRef = useRef<{ id: string; slots: Slot[] } | null>(null);
  const standUp = useCallback(() => {
    const l = latest.current.live.current;
    if (l.seat) latest.current.controls.current.teleport = standPoint(l.seat);
    releaseSeat(l); // frees ONLY my seat (and my claim); anyone else sitting there stays exactly where they are
    l.seat = null;
    sitRef.current = null;
    setSitting(false);
  }, []);
  const sitAt = useCallback((p: Vec2, spotId: string) => {
    const r = regionRef.current;
    const props = r === 'town' ? [] : regionDef(r).props;
    // Every bench / window seat / blanket has its own seats (a couple fits side by side); take a free one, my usual side first.
    const slots: Slot[] = seatSlots(p, props).map((s) => ({ index: s.index, x: s.x, y: s.y, lift: s.lift, facing: s.facing }));
    const id = `${r}:${spotId}`;
    const taken = takeSeat(latest.current.live.current, id, slots, latest.current.role === 'M' ? 1 : 0, Date.now());
    if (!taken) { latest.current.notify('Every seat here is taken right now.', 'info'); return; }
    sitRef.current = { id, slots };
    setSitting(true);
    speak(latest.current.coat, 'sleepy');
  }, []);
  useEffect(() => {
    if (!sitting) return;
    const onKey = (e: KeyboardEvent) => { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.code)) standUp(); };
    window.addEventListener('keydown', onKey);
    // two players can sit down within one network round trip: the one who outranks keeps the seat, the other moves to a free one
    const timer = window.setInterval(() => {
      const s = sitRef.current;
      if (!s) return;
      const r = keepSeat(latest.current.live.current, s.slots, Date.now());
      if (r === 'moved') latest.current.notify('Someone sat down first — you shuffle along to the other seat.', 'info');
      else if (r === 'full') { latest.current.notify('That seat was taken — you stand up.', 'info'); standUp(); }
    }, 200);
    return () => { window.removeEventListener('keydown', onKey); window.clearInterval(timer); };
  }, [sitting, standUp]);
  const wish = useCallback(() => {
    const day = new Date().toISOString().slice(0, 10);
    let res = 'ok' as 'ok' | 'poor' | 'again';
    latest.current.update((sv) => {
      if ((sv.dailyCounts[`city-wish:${day}`] ?? 0) >= 1) { res = 'again'; return sv; }
      const r = spend(sv, 1, 'A wish');
      if (!r.ok) { res = 'poor'; return sv; }
      const n = { ...r.save, dailyCounts: { ...r.save.dailyCounts, [`city-wish:${day}`]: 1 } };
      return n.claims.includes('memory:city-wish') ? n : recordMemory({ ...n, claims: [...n.claims, 'memory:city-wish'] }, { id: 'city-wish', kind: 'city', title: 'A wish in Whiskerwick', detail: 'A paw token, a plink, and a secret wish.', at: Date.now(), place: 'Central Plaza', withPartner: latest.current.partnerOnline });
    });
    if (res === 'poor') { cue('nope'); say('The fountain', ['A wish costs one paw token. (Mr. Pemberton at the Corner Market buys fish and finds.)']); return; }
    if (res === 'again') { say('The fountain', ['You already made today’s wish. The fountain winks at you.']); return; }
    cue('pop');
    latest.current.live.current.emote = { id: 'heart', at: performance.now() };
    say('The fountain', ['Plink! The token arcs through the air and lands among the shimmering coins. You make a wish.']);
  }, [say]);

  const onSolved = useCallback((id: string) => {
    const a = advRef.current;
    cue('join');
    if (id === 'lens') a.change((s) => addFlags(s, ['lighthouse-lit']).state);
    if (id === 'constellation') a.change((s) => addFlags(s, ['observatory-open']).state);
    a.fire({ type: 'puzzle', id });
  }, []);

  const onCatch = useCallback(() => {
    const e = latest.current.env;
    const fish = fishFor(fishing?.id === 'fish-cove' ? 'cove' : 'harbor', e.darkness > 0.5, e.weather.includes('rain'), Math.random()) as ItemId;
    latest.current.update((sv) => ({ ...addItem(sv, fish, 1), fishSeen: sv.fishSeen.includes(fish) ? sv.fishSeen : [...sv.fishSeen, fish], stats: { ...sv.stats, fishCaught: sv.stats.fishCaught + 1 } }));
    latest.current.notify(`You caught a ${ITEM_NAMES[fish]}!`, 'success');
    cue('join');
  }, [fishing]);

  // keyboard shortcuts: J = journal, M = map (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.modal-backdrop, .pv-scope')) return;
      if (e.code === 'KeyJ') setPanel((p) => (p === 'journal' ? null : 'journal'));
      if (e.code === 'KeyM') setPanel((p) => (p === 'map' ? null : 'map'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Milestone 8.1: telescope ----
  const [scope, setScope] = useState<ScopeSite | null>(null);
  const skyKnown = useMemo(() => new Set(adv.state.journal.filter((j) => j.startsWith('sky-')).map((j) => j.slice(4))), [adv.state.journal]);
  const skyContext = useCallback(() => {
    const e = latest.current.env;
    return { darkness: e.darkness, clear: e.weather === 'sunny' || e.weather === 'windy', moonPhase: moonPhaseAt(Date.now()), flags: new Set(advRef.current.state.flags) };
  }, []);
  const onSkyDiscover = useCallback((o: SkyObject, c: SkyContext) => {
    if (!claimOnce(claimed.current, `sky:${o.id}`)) return;
    const jid = skyJournalId(o.id);
    advRef.current.change((st) => (st.journal.includes(jid) ? st : { ...st, journal: [...st.journal, jid] }));
    let got = false;
    latest.current.update((sv) => { const r = grantOnce(sv, `sky:${o.id}`, 1); got = r.ok; return r.ok ? r.save : sv; });
    cue('join');
    latest.current.notify(`Sky log: ${o.title}${got ? ' · +1 paw token' : ''}`, 'success');
    if (o.kind === 'event' || o.id === 'whisker-comet') latest.current.update((sv) => sv.memories.some((m) => m.id === `sky-${o.id}`) ? sv
      : recordMemory(sv, { id: `sky-${o.id}`, kind: 'adventure', title: o.title, detail: o.text(c), at: Date.now(), place: SITE_NAME[c.site], withPartner: latest.current.partnerOnline }));
    latest.current.share?.({ t: 'sky', id: o.id });
  }, []);
  const [shop, setShop] = useState<ShopId | null>(null);
  const [machine, setMachine] = useState<string | null>(null);
  // Bumper Paws for two: once a Bumper Paws session is live (you accepted the invitation, or your partner did), the arena opens on its own.
  const bumperSession = usePairHub().session;
  const bumperLive = bumperSession.kind === 'bumper' && (bumperSession.phase === 'lobby' || bumperSession.phase === 'starting' || bumperSession.phase === 'running' || bumperSession.phase === 'ended');
  useEffect(() => { if (bumperLive) setMachine((m) => m ?? 'bumper'); }, [bumperLive]);
  const ticketOptions = useMemo(() => {
    const st = adv.state;
    const opt = (r: RegionId, why: string) => ({ region: r, ok: regionUnlocked(r, st) && (r === 'town' || r === 'city' || st.seen.includes(`region:${r}`)), why });
    return [opt('town', ''), opt('harbor', 'Reopen Pawport first'), opt('forest', 'Find the way into Whisperwood first'), opt('highlands', 'Reach Frostbell on foot first')].filter((x) => x.region !== region);
  }, [adv.state, region]);

  return {
    adv, region, entry, sceneKey: `${region}:${key}`, traveling,
    blocking: !!dialog || !!puzzle || !!panel || !!fishing || !!shop || !!machine || !!scope,
    useSpot, goTo, rememberWhere,
    open: (w) => setPanel(w),
    close: () => setPanel(null),
    panels: ({ onTownPlaces, onPhoto }) => {
      pendingPhoto.current = onPhoto;
      return (
        <>
          <DialogueSheet open={dialog} onClose={() => { const d = dialog; setDialog(null); d?.onDone?.(); }} />
          <PuzzleModal id={puzzle} onClose={() => setPuzzle(null)} onSolved={onSolved} />
          <FishingSheet open={!!fishing} label={fishing?.label ?? 'Fishing'} onClose={() => setFishing(null)} onCatch={onCatch} />
          <JournalModal open={panel === 'journal'} onClose={() => setPanel(null)} state={adv.state} partnerOnline={latest.current.partnerOnline} onHear={(c) => { playCue(c, adv.state.story); }} />
          {listening && <ListenSheet title={listening.title} ms={listening.ms} pos={() => latest.current.playerPos.current}
            onDone={(patient) => { const l = listening; setListening(null); if (patient) latest.current.notify('The wind arrives…', 'success'); l.run(); }} onCancel={() => setListening(null)} />}
          <ShopPanel shop={shop} save={latest.current.save} update={latest.current.update} onClose={() => setShop(null)} />
          <TicketPanel open={machine === 'tickets'} onClose={() => setMachine(null)} options={ticketOptions}
            onGo={(r) => { setMachine(null); const sp = r === 'town' ? { x: 128, y: 312 } : spawnOf(r); goTo({ region: r, x: sp.x, y: sp.y, travel: r === 'town' ? 'train' : undefined }); }} />
          <VendingPanel open={machine === 'vending'} save={latest.current.save} update={latest.current.update} onClose={() => setMachine(null)} />
          <ClawPanel open={machine === 'claw'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)}
            onWin={() => { speak(latest.current.coat, 'happy'); latest.current.live.current.emote = { id: 'celebrate', at: performance.now() }; }} />
          <MelodyPanel open={machine === 'melody'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)}
            onRound={(r) => { if (r >= 5) advRef.current.fire({ type: 'puzzle', id: 'melody-5' }); }} />
          <FurnitureShopPanel open={machine === 'furniture'} save={latest.current.save} update={latest.current.update} onClose={() => setMachine(null)} />
          <BumperPawsPanel open={machine === 'bumper'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} coat={latest.current.coat} onClose={() => setMachine(null)} />
          <RingTossPanel open={machine === 'ringtoss'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)} />
          <RecordsPanel open={machine === 'records'} save={latest.current.save} onClose={() => setMachine(null)} />
          {/* Milestone 8.2: new cabinets, the Bijou and karaoke */}
          <CafeRushPanel open={machine === 'rush'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)}
            onDone={(n) => { if (n >= 8) { speak(latest.current.coat, 'happy'); latest.current.live.current.emote = { id: 'celebrate', at: performance.now() }; } }} />
          <FishFrenzyPanel open={machine === 'frenzy'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)} />
          <CinemaPanel open={machine === 'cinema'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)}
            films={showingFilms(adv.view)} partnerOnline={latest.current.partnerOnline} onWatched={() => advRef.current.fire({ type: 'use', spot: 'city-cinema' })} />
          <KaraokePanel open={machine === 'karaoke'} save={latest.current.save} update={latest.current.update} notify={latest.current.notify} onClose={() => setMachine(null)} view={adv.view}
            voice={(f) => singNote(latest.current.coat, f)} />
          {sitting && (
            <PanelSheet label="Sitting" className="pv-sitbar" actions={<button type="button" className="pill-btn" onClick={standUp}>Stand up</button>}>
              <p>You’re sitting comfortably{latest.current.partnerOnline ? ' — your partner can sit beside you' : ''}. Watch the world go by.</p>
            </PanelSheet>
          )}
          {fair.bar}
          {scope && <TelescopeView site={scope} context={skyContext} known={skyKnown} onDiscover={onSkyDiscover} onClose={() => setScope(null)} />}
          <WorldMapModal onDistrict={d=>goTo({region:d.region,x:d.x,y:d.y})} open={panel === 'map'} onClose={() => setPanel(null)} state={adv.state} here={region} onTownPlaces={onTownPlaces}
            onTravel={(r) => { const sp = spawnOf(r); goTo({ region: r, x: sp.x, y: sp.y }); }} />
        </>
      );
    },
  };
}

export function AdventureLayerHud({ layer }: { layer: AdventureLayer }) {
  return <QuestTracker state={layer.adv.state} onOpen={() => layer.open('journal')} />;
}
