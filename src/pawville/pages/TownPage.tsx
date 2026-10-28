import { useCallback, useEffect, useRef, useState } from 'react';
import { CatCharacter } from '../../components/CatCharacter';
import { PawPrint } from '../../components/PawPrint';
import { SoundToggle } from '../../components/SoundToggle';
import { Toast } from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { SEEDS } from '../activities/park.ts';
import { startAmbience, type Ambience } from '../ambience.ts';
import { ActivityDock, useMemoryRecorder } from '../components/ActivityDock';
import { CouplePanel } from '../components/CouplePanel';
import { DestinationPanel, presenceSummary } from '../components/DestinationPanel';
import { PhotoMode } from '../components/PhotoMode';
import { SessionBar } from '../components/SessionBar';
import { TownCanvas, createControls, type CaptureFn, type SelfState, type TownControls, type TownLive } from '../components/TownCanvas';
import { coupleView, townLabel } from '../couple/coupleView.ts';
import { BagPanel, EmoteMenu, EnvPanel, PlacesPanel, QuickEmotes } from '../components/TownMenus';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { Wardrobe } from '../components/Wardrobe';
import { newSid, type ActivityKind } from '../couple/activitySession.ts';
import { FAIR_LAYOUT } from '../city/funfair.ts';
import { canPerform, createEmoteLimiter, emoteDef, sanitizeQuick } from '../couple/emotes.ts';
import { createStore } from '../persistence.ts';
import { skyObject } from '../adventure/telescope.ts';
import { dispatch, onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import { PATHS } from '../destinations.ts';
import { clearReturnPoint, loadTownIdentity, peekReturnPoint, saveReturnPoint } from '../identity';
import { goTo } from '../navigation';
import { applyEmote, applySnapshot, compactSnapshot, createSendGate, interpolateRemotes, sanitizeSnapshot, type EmoteId, type RemoteCat } from '../net/presenceProtocol.ts';
import { EMPTY_DYNAMICS } from '../render/townRenderer.ts';
import { cue } from '../sound';
import { useEnvironment } from '../useEnvironment.ts';
import { selfSnapshot, usePlazaPresence } from '../usePlazaPresence';
import { useWorldSave } from '../useWorldSave.ts';
import { recordMemory } from '../worldSave.ts';
import { PHASE_LABEL, WEATHER_LABEL, clockLabel } from '../world/environment.ts';
import { distance, type Vec2 } from '../world/geometry.ts';
import { INTERACTABLES, SPAWN_POINT, type DestinationId, type Interactable } from '../world/townMap.ts';
// ---- Milestone 6: regions, quests, journal, world map ----
import { AdventureLayerHud, useAdventureLayer } from '../adventure/AdventureLayer';
import { getScene, MAX_SCENE_SIZE, type SceneSpot } from '../world/scene.ts';
import type { RegionId } from '../adventure/state.ts';
import { configureVoices, setVoiceVolume, speak, voiceForEmote } from '../city/voices.ts';
import { isSoundEnabled, sharedAudioContext } from '../../lib/soundService';
configureVoices({ isEnabled: isSoundEnabled, context: sharedAudioContext });

type Overlay =
  | { kind: 'destination'; id: DestinationId }
  | { kind: 'places' } | { kind: 'wardrobe' } | { kind: 'couple' } | { kind: 'emotes' } | { kind: 'env' } | { kind: 'bag' } | { kind: 'photo' }
  | null;

const LEAVE_MS = 260;
const quickStore = () => createStore<EmoteId[]>({ key: 'quick-emotes', version: 1, defaults: () => sanitizeQuick(undefined), sanitize: sanitizeQuick });
const GAME_FOR_KIND: Partial<Record<ActivityKind, string>> = { pawtype: '/games/pawtype', boxing: '/games/cat-boxing' };

export function TownPage() {
  const { toast, show } = useToast();
  const hub = usePairHub();
  const role = hub.pair?.myRole;
  const [identity, setIdentity] = useState(() => loadTownIdentity(role));
  useEffect(() => setIdentity(loadTownIdentity(role)), [role]);
  const [startPos] = useState<Vec2>(() => peekReturnPoint() ?? SPAWN_POINT);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [activity, setActivity] = useState<Interactable | null>(null);
  const [target, setTarget] = useState<SceneSpot | null>(null);
  const areaRef = useRef('Pawville');
  const [area, setAreaState] = useState('Pawville');
  const setArea = useCallback((a: string) => { areaRef.current = a; setAreaState(a); }, []);
  const [showHint, setShowHint] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [partnerNear, setPartnerNear] = useState(false);
  const { env, settings, update: updateEnv } = useEnvironment();
  const { save, update } = useWorldSave();
  const record = useMemoryRecorder(update, show);
  const controls = useRef<TownControls>(createControls());
  const capture = useRef<CaptureFn | null>(null);
  const playerPos = useRef<Vec2>(startPos);
  const presence = usePlazaPresence(identity, startPos);
  const leaveTimer = useRef<number | null>(null);
  const live = useRef<TownLive>({
    env, dyn: { ...EMPTY_DYNAMICS, collected: new Set(save.collected) }, seat: null, emote: null, holding: false, partner: null, pairId: hub.pair?.pairId ?? null, lowPower: settings.lowPower,
  });
  live.current.env = env;
  live.current.pairId = hub.pair?.pairId ?? null;
  live.current.lowPower = settings.lowPower;
  setVoiceVolume(settings.voices ?? 0.7);

  // Milestone 6: the adventure layer (region, quests, NPCs, spots, panels).
  const openRouteRef = useRef<(route: string) => void>(() => undefined);
  const layer = useAdventureLayer({ save, update, notify: show, partnerOnline: hub.partnerOnline, startPos, controls, playerPos, live, record, area: () => areaRef.current, env, openRoute: (r) => openRouteRef.current(r), coat: identity.coat, role: identity.cat, share: (m) => { sendPair(m); } });
  const regionRef = useRef<RegionId>(layer.region);
  regionRef.current = layer.region;

  // keep render-side world state in sync with saves
  useEffect(() => {
    live.current.dyn = {
      ...live.current.dyn,
      collected: new Set(save.collected),
      garden: save.garden.plots.flatMap((pl, i) => (pl ? [{ plot: i, stage: pl.growth, color: SEEDS.find((x) => x.id === pl.seed)!.color }] : [])),
    };
  }, [save.collected, save.garden]);

  useEffect(() => { clearReturnPoint(); }, []);
  useEffect(() => () => { if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current); }, []);
  useEffect(() => {
    if (!save.achievements['first-steps'] && area === 'Paw Park') update((s) => ({ ...s, achievements: { ...s.achievements, 'first-steps': Date.now() } }));
  }, [area, save.achievements, update]);

  // ---- partner over the pair connection (real messages only; nothing is simulated) ----
  const partnerMap = useRef(new Map<string, RemoteCat>());
  useEffect(() => onPairMessage((m) => {
    if (m.t === 'pos') {
      const snap = sanitizeSnapshot(m.s, MAX_SCENE_SIZE);
      if (!snap) return;
      applySnapshot(partnerMap.current, { ...snap, id: 'partner' }, performance.now());
      live.current.partner = partnerMap.current.get('partner') ?? null;
      if (live.current.partner) live.current.partner.uid = snap.id; // the partner is stored under 'partner': keep their REAL id for seat conflicts
      live.current.partnerRegion = snap.region;
    } else if (m.t === 'sky' && typeof m.id === 'string') {
      // Milestone 8.1: the partner found something through a telescope (validated against the sky catalog)
      const o = skyObject(m.id);
      if (o) show(`Your partner spotted ${o.title} through a telescope!`, 'info');
    } else if (m.t === 'emote' && typeof m.id === 'string' && emoteDef(m.id) && live.current.partner) {
      // Validated: known id, allowed for the partner's canonical character, fresh (age-limited), not spam.
      const p = live.current.partner;
      const id = canPerform(m.id, p.coat) ? (m.id as EmoteId) : 'wave';
      const seq = typeof m.seq === 'number' && Number.isFinite(m.seq) ? Math.floor(m.seq) : p.emoteSeq + 1;
      const age = typeof m.age === 'number' && Number.isFinite(m.age) ? Math.max(0, Math.min(60_000, m.age)) : 0;
      if (age < (emoteDef(id)?.ms ?? 0)) {
        applyEmote(p, { emote: id, emoteAge: age, emoteSeq: seq }, performance.now());
        if (id === 'puchu-loud-purr' && (live.current.partnerRegion ?? 'town') === regionRef.current) cue('purr');
      }
    }
  }), []);
  useEffect(() => {
    if (!hub.partnerOnline) {
      partnerMap.current.clear();
      live.current.partner = null;
      live.current.holding = false;
    }
  }, [hub.partnerOnline]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = live.current.partner;
      if (p && performance.now() - p.lastUpdate > 8000) {
        partnerMap.current.clear();
        live.current.partner = null;
      }
      const near = !!live.current.partner && (live.current.partnerRegion ?? 'town') === regionRef.current && distance(live.current.partner.pos, playerPos.current) < 40;
      setPartnerNear((v) => (v === near ? v : near));
      interpolateRemotes(partnerMap.current, 0, performance.now());
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  const pairGate = useRef(createSendGate(100, 4000));
  const onSelfState = useCallback((s: SelfState) => {
    if (!hub.partnerOnline) return;
    // 8.1: only on change (+ a 4 s heartbeat) instead of 10×/s while standing still
    const snap = selfSnapshot(identity, { x: s.x, y: s.y }, s.facing, s.moving, { pose: s.pose, lift: s.lift, emote: s.emote, emoteAge: s.emoteAge, emoteSeq: s.emoteSeq, run: s.run, pair: hub.pair?.pairId ?? null, region: s.region, claim: s.claim });
    if (!pairGate.current(performance.now(), compactSnapshot(snap))) return;
    sendPair({ t: 'pos', s: snap });
  }, [hub.partnerOnline, hub.pair?.pairId, identity]);

  // ---- shared emotes and paw-holding through the activity coordinator ----
  const emoteSeq = useRef(0);
  const limiter = useRef(createEmoteLimiter());
  const [quick, setQuick] = useState<EmoteId[]>(() => quickStore().load());
  const toggleQuick = (id: EmoteId) => setQuick((q) => {
    const next = q.includes(id) ? q.filter((x) => x !== id) : [...q, id].slice(-6);
    quickStore().save(next);
    return next;
  });
  const s = hub.session;
  useEffect(() => {
    if (s.phase !== 'running') return;
    if (s.kind === 'emote' && typeof s.params.emote === 'string' && emoteDef(s.params.emote)) {
      const id = s.params.emote as EmoteId;
      emoteSeq.current += 1;
      live.current.emote = { id, at: performance.now(), seq: emoteSeq.current };
      if (live.current.partner) applyEmote(live.current.partner, { emote: id, emoteAge: 0, emoteSeq: live.current.partner.emoteSeq + 1 }, performance.now());
      cue('join');
      record({ kind: 'shared-emote', title: emoteDef(id)!.label, detail: 'A little moment together.', place: area, withPartner: true });
      const t = window.setTimeout(() => dispatch({ type: 'end' }), emoteDef(id)!.ms);
      return () => window.clearTimeout(t);
    }
    if (s.kind === 'pawhold') {
      live.current.holding = true;
      record({ kind: 'paw-hold', title: 'Paw in paw', detail: `A walk together around ${area}.`, place: area, withPartner: true }, 'paw-in-paw');
      return () => { live.current.holding = false; };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.kind, s.sid]);
  useEffect(() => {
    if (s.phase === 'ended' || s.phase === 'cancelled') {
      live.current.holding = false;
      if (s.kind === 'emote' || s.kind === 'pawhold') {
        const t = window.setTimeout(() => dispatch({ type: 'reset' }), s.phase === 'ended' ? 300 : 3500);
        return () => window.clearTimeout(t);
      }
    }
    return undefined;
  }, [s.phase, s.kind]);

  // ---- ambience ----
  const ambience = useRef<Ambience | null>(null);
  useEffect(() => {
    if (!settings.ambience) return;
    ambience.current = startAmbience();
    return () => {
      ambience.current?.stop();
      ambience.current = null;
    };
  }, [settings.ambience]);
  useEffect(() => {
    ambience.current?.set(env, area === 'Harbor Docks' || area === 'Lily Pond' || /Dock|Beach|Cove|Falls|Sandbar|Pond|Lake/.test(area));
  }, [env, area]);

  const interactRef = useRef<(item: SceneSpot) => void>(() => undefined);
  const interact = useCallback((item: SceneSpot) => interactRef.current(item), []);
  interactRef.current = (item: SceneSpot) => {
    if (item.kind === 'adventure') { cue('tap'); layer.useSpot(item); return; }
    sfxFor(item);
    if (item.kind === 'destination') setOverlay({ kind: 'destination', id: item.action as DestinationId });
    else if (item.action === 'photo-arch') setOverlay({ kind: 'photo' });
    else setActivity(item);
  };

  const openRoute = (route: string) => {
    if (leaving) return;
    saveReturnPoint(playerPos.current);
    layer.rememberWhere(playerPos.current);
    setOverlay(null);
    setActivity(null);
    setLeaving(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    leaveTimer.current = window.setTimeout(() => goTo(route), reduce ? 0 : LEAVE_MS);
  };
  openRouteRef.current = openRoute;

  const travel = (i: Interactable) => {
    setOverlay(null);
    setActivity(null);
    if (layer.region !== 'town') { layer.goTo({ region: 'town', x: i.point.x, y: i.point.y + 4 }); return; }
    controls.current.teleport = { x: i.point.x, y: i.point.y + 4 };
  };

  const onAccepted = (kind: ActivityKind) => {
    if (kind === 'bumper') { // join the match at the arena (the panel itself opens as soon as the session is live)
      if (layer.region !== 'funfair') layer.goTo({ region: 'funfair', x: FAIR_LAYOUT.bumper.x, y: FAIR_LAYOUT.bumper.y + 20 });
      return;
    }
    const route = GAME_FOR_KIND[kind];
    if (route) return openRoute(route);
    const spotId = typeof hub.session.params.spot === 'string' ? hub.session.params.spot : null;
    const spot = INTERACTABLES.find((i) => i.id === spotId);
    if (spot) {
      if (layer.region !== 'town') layer.goTo({ region: 'town', x: spot.point.x, y: spot.point.y });
      else controls.current.teleport = { x: spot.point.x, y: spot.point.y };
      setActivity(spot);
    }
  };

  const emote = (id: EmoteId, shared: boolean) => {
    // Exclusive emotes are checked against the canonical character, never the nickname.
    if (!canPerform(id, identity.coat)) {
      show('That one belongs to another cat.', 'info');
      return;
    }
    if (!shared) {
      if (!limiter.current(performance.now())) return; // spam guard
      emoteSeq.current += 1;
      live.current.emote = { id, at: performance.now(), seq: emoteSeq.current };
      sendPair({ t: 'emote', id, seq: emoteSeq.current, age: 0 });
      cue(id === 'mini-starpaw-serenade' ? 'join' : id === 'puchu-loud-purr' ? 'purr' : 'pop');
      { const vk = voiceForEmote(id); if (vk) speak(identity.coat, vk); } // Milestone 7: character voices
      return;
    }
    dispatch({ type: 'invite', sid: newSid(), kind: 'emote', params: { emote: id } });
  };

  // Photo poses loop for as long as photo mode is open (so you can pick the best moment).
  const setPhotoPose = useCallback((e: EmoteId | null) => {
    emoteSeq.current += 1;
    live.current.emote = e ? { id: e, at: performance.now(), seq: emoteSeq.current, loop: true } : null;
  }, []);
  const setPhotoBias = useCallback((b: { x: number; y: number } | null) => { live.current.photoBias = b; }, []);
  // Leaving photo mode always restores normal controls and camera.
  useEffect(() => {
    if (overlay?.kind !== 'photo') live.current.photoBias = null;
  }, [overlay]);

  const paused = overlay !== null || leaving || layer.blocking;
  const hidden = overlay?.kind === 'photo';
  // Town headcount and partner availability are DIFFERENT facts (a partner can be online in a
  // game or on the invite page while not in the plaza) — both are derived, never stored.
  const presenceLabel = townLabel(presence.status, presence.others.length);
  const holding = s.kind === 'pawhold' && s.phase === 'running';
  const cv = coupleView(hub);
  const pairLabel = hub.pair ? cv.label : 'Pair up';

  return (
    <main className={`pv-town ${leaving ? 'is-leaving' : ''} ${hidden ? 'is-photo' : ''} ${layer.traveling ? 'is-traveling' : ''} pv-region--${layer.region}`}>
      <TownCanvas key={layer.sceneKey} scene={getScene(layer.region)} identity={identity} startPos={layer.entry} paused={paused} controls={controls} presence={presence.ref} playerPos={playerPos} live={live} capture={capture}
        onTargetChange={setTarget} onInteract={interact} onAreaChange={setArea} onFirstMove={() => setShowHint(false)}
        onHoldBroken={() => { dispatch({ type: 'end', reason: 'separated' }); show('You drifted apart — paws released.', 'info'); }}
        onSelfState={onSelfState} hideTags={hidden} />
      {!hidden && (
        <>
          <header className="pv-hud pv-hud--top">
            <div className="pv-hud__group">
              <div className="pv-brand" aria-label="Pawville"><PawPrint size={18} /><span className="pv-brand__name">Pawville</span></div>
              <span className="pv-area" aria-live="polite">{area}</span>
              <AdventureLayerHud layer={layer} />
              <button type="button" className="pv-sky-chip" onClick={() => setOverlay({ kind: 'env' })} aria-label={`Weather: ${WEATHER_LABEL[env.weather]}, ${PHASE_LABEL[env.phase]}. Open sky and sound settings`}>
                <span className={`pv-sky-chip__icon is-${env.weather} ${env.darkness > 0.5 ? 'is-night' : ''}`} aria-hidden="true" />
                {WEATHER_LABEL[env.weather]} · {clockLabel(env.hour)}{env.localOnly ? ' *' : ''}
              </button>
            </div>
            <div className="pv-hud__group">
              <span className={`pv-presence pv-presence--${presence.status}`} title={presenceSummary(presence.status, presence.others.length)}>
                <span className={`pv-dot pv-dot--${presence.status}`} aria-hidden="true" />{presenceLabel}
              </span>
              <button type="button" className={`pill-btn pv-couple-btn ${cv.tone === 'ok' ? 'is-online' : ''}`} title={cv.detail} onClick={() => setOverlay({ kind: 'couple' })}>
                <span aria-hidden="true">♥</span> {pairLabel}
              </button>
              <button type="button" className="icon-btn pv-icon-btn" onClick={() => layer.open('map')} aria-label="World map (M)">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>
              </button>
              <button type="button" className="pill-btn pv-me" onClick={() => setOverlay({ kind: 'wardrobe' })} aria-label="Wardrobe: your cat's look">
                <CatCharacter cat={identity.cat} coat={identity.coat} pose="head" size={26} accessory={identity.accessory} still />
                <span>{identity.name}</span>
              </button>
              <SoundToggle />
            </div>
          </header>
          <nav className="pv-actionbar" aria-label="Town actions">
            <QuickEmotes quick={quick} coat={identity.coat} onEmote={(id) => emote(id, false)} onMore={() => setOverlay({ kind: 'emotes' })} />
            {hub.pair && hub.partnerOnline && (holding
              ? <button type="button" className="pv-actionbar__btn is-on" onClick={() => dispatch({ type: 'end', reason: 'released' })}>Let go of paws</button>
              : <button type="button" className="pv-actionbar__btn" disabled={!partnerNear || s.phase !== 'idle'} title={partnerNear ? undefined : 'Stand next to your partner'}
                onClick={() => dispatch({ type: 'invite', sid: newSid(), kind: 'pawhold' })}>Hold paws</button>)}
            <button type="button" className="pv-actionbar__btn" onClick={() => setOverlay({ kind: 'photo' })}>Photo</button>
            <button type="button" className="pv-actionbar__btn" onClick={() => layer.open('journal')} aria-label="Journal (J)">Journal</button>
            <button type="button" className="pv-actionbar__btn" onClick={() => setOverlay({ kind: 'bag' })}>Bag</button>
            <button type="button" className="pv-actionbar__btn" onClick={() => openRoute(PATHS.scrapbook)}>Scrapbook</button>
          </nav>
          <div className="pv-hud pv-hud--bottom">
            <SessionBar onAccepted={onAccepted} kinds={['emote', 'pawhold', 'swing', 'seesaw', 'stargaze', 'picnic', 'fishing', 'bench']} />
            {!activity && (target ? (
              <button type="button" className="pv-prompt" onClick={() => interact(target)}>
                <kbd className="pv-key">E</kbd><span>{target.label}</span>
              </button>
            ) : showHint ? (
              <p className="pv-hint">
                <span className="pv-hint--desktop"><kbd className="pv-key">W A S D</kbd> walk · <kbd className="pv-key">Shift</kbd> run · <kbd className="pv-key">E</kbd> interact · <kbd className="pv-key">J</kbd> journal · <kbd className="pv-key">M</kbd> map</span>
                <span className="pv-hint--touch">Drag the pad to walk · tap the paw near something</span>
              </p>
            ) : null)}
          </div>
          {activity && (
            <ActivityDock key={activity.id} spot={activity} identity={identity} env={env} live={live} save={save} update={update} notify={show} area={area}
              onClose={() => setActivity(null)} onPhoto={() => { setActivity(null); setOverlay({ kind: 'photo' }); }}
              onMailbox={() => { try { window.sessionStorage.setItem('pawville:home-tab', 'mail'); } catch { /* ignore */ } setActivity(null); openRoute(PATHS.home); }} />
          )}
          <p className="sr-only" aria-live="polite">{target ? `${target.label}. Press E or use the button.` : ''}</p>
          <VirtualJoystick controls={controls} disabled={paused || !!activity} />
          <button type="button" className={`pv-action ${target ? 'is-ready' : ''}`} aria-label={target ? target.label : 'Interact (walk up to something first)'}
            disabled={!target || paused} onClick={() => { if (target) interact(target); }}>
            <PawPrint size={30} />
          </button>
        </>
      )}
      <DestinationPanel id={overlay?.kind === 'destination' ? overlay.id : null} identity={identity} presence={{ status: presence.status, others: presence.others.length }} env={env}
        onClose={() => setOverlay(null)} onOpen={openRoute} />
      <PlacesPanel open={overlay?.kind === 'places'} onClose={() => setOverlay(null)} onTravel={travel} />
      {layer.panels({ onTownPlaces: () => { layer.close(); setOverlay({ kind: 'places' }); }, onPhoto: () => setOverlay({ kind: 'photo' }) })}
      <Wardrobe open={overlay?.kind === 'wardrobe'} onClose={() => setOverlay(null)} identity={identity} save={save}
        onSaved={() => { setIdentity(loadTownIdentity(role)); show('Looking sharp! Saved for every Pawville game.', 'success'); }} />
      <CouplePanel open={overlay?.kind === 'couple'} onClose={() => setOverlay(null)} identity={identity} />
      <EmoteMenu open={overlay?.kind === 'emotes'} onClose={() => setOverlay(null)} onEmote={emote} partnerNear={partnerNear} partnerOnline={hub.partnerOnline}
        coat={identity.coat} quick={quick} onToggleQuick={toggleQuick}
        waiting={s.kind === 'emote' && (s.phase === 'inviting' || s.phase === 'lobby' || s.phase === 'starting') && typeof s.params.emote === 'string' ? (s.params.emote as EmoteId) : null} />
      <EnvPanel open={overlay?.kind === 'env'} onClose={() => setOverlay(null)} env={env} settings={settings} onChange={updateEnv} />
      <BagPanel open={overlay?.kind === 'bag'} onClose={() => setOverlay(null)} save={save} />
      <PhotoMode open={overlay?.kind === 'photo'} capture={capture} place={area} onClose={() => setOverlay(null)} coat={identity.coat}
        sharedPose={s.kind === 'emote' && s.phase === 'running' && typeof s.params.emote === 'string' ? (s.params.emote as EmoteId) : null}
        onPose={setPhotoPose} onBias={setPhotoBias}
        onSaved={({ photoId, caption }) => {
          update((sv) => recordMemory(sv, { kind: 'photo', title: caption || `A photo at ${area}`, detail: `${WEATHER_LABEL[env.weather]} · ${PHASE_LABEL[env.phase]}`, at: Date.now(), place: area, withPartner: !!live.current.partner && partnerNear, photoId }));
          show('Saved to your scrapbook.', 'success');
        }} />
      <div className="pv-curtain" aria-hidden="true" />
      <Toast toast={toast} />
    </main>
  );
}

function sfxFor(item: Interactable) {
  cue(item.kind === 'destination' ? 'pop' : 'tap');
}
