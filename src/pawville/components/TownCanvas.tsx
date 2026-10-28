import { useEffect, useRef, type MutableRefObject } from 'react';
import { emoteDef, resolveEmote } from '../couple/emotes.ts';
import { holdStep } from '../couple/pawHold.ts';
import type { TownIdentity } from '../identity';
import { interpolateRemotes, remoteEmoteNow, type EmoteId, type RemoteCat } from '../net/presenceProtocol.ts';
import type { TownPresence } from '../net/townPresence.ts';
import { browserCanvasFactory } from '../render/canvasTypes.ts';
import type { CatPose } from '../render/catSprites.ts';
import type { CatRenderState, WorldDynamics } from '../render/townRenderer.ts';
import type { AdvFrame } from '../render/adventureFx.ts';
import { getScene, getTownLayout as sceneTownLayout, type Scene, type SceneSpot } from '../world/scene.ts';
import type { RegionId } from '../adventure/state.ts';
import { selfSnapshot } from '../usePlazaPresence';
import { isAvailable, type Environment } from '../world/environment.ts';
import type { Vec2 } from '../world/geometry.ts';
import { cameraFor, pixelScaleFor, smoothCamera, snapCamera, stickyInteractable } from '../world/interaction.ts';
import { framingRect, type Framing } from '../memories/photoFraming.ts';
import { KEY_BINDINGS, combineInputs, findFreeSpot, inputFromKeys, stepBody, type Body, type CollisionWorld, type Facing } from '../world/movement.ts';
import type { TownLayout } from '../world/townMap.ts';
import type { Rect } from '../world/geometry.ts';
import { playStep } from '../world/footsteps.ts';
import type { FairFrame } from '../render/funfairArt.ts';
import { FAIR_LAYOUT, RIDE_IDS, fairClock, seatPose, type RideId } from '../city/funfair.ts';
import { occupancy, type Holder, type SeatClaim } from '../net/occupancy.ts';

export interface TownControls {
  joy: Vec2;
  interactRequested: boolean;
  teleport: Vec2 | null;
}

export function createControls(): TownControls {
  return { joy: { x: 0, y: 0 }, interactRequested: false, teleport: null };
}

/** Everything the page feeds into the render loop without re-rendering React every frame. */
export interface TownLive {
  env: Environment;
  dyn: WorldDynamics;
  /** When set, the player's cat is placed here (sitting on a swing, bench, etc.). */
  seat: { x: number; y: number; pose: CatPose; facing: Facing; lift: number; /** Funfair: draw order and "in the air" (no ground shadow). */ sortY?: number; noShadow?: boolean } | null;
  /** Funfair: the camera looks at this point instead of the cat (so a rider orbiting a wheel doesn't make the whole view circle). */
  focus?: Vec2 | null;
  /** Funfair: the partner is on a ride — draw them in their seat (computed from the shared ride clock, so both screens agree). */
  partnerSeat?: { x: number; y: number; lift: number; facing: Facing; sortY: number; noShadow: boolean } | null;
  /** Funfair: which seats are taken (for the lit gondolas) and the seat the local player is waiting for. */
  fair?: Pick<FairFrame, 'occupied' | 'waiting'>;
  /**
   * The emote this cat is playing. `at` is the local start time; `seq` increases with every new
   * emote (so others can tell a restart from a repeat); `loop` keeps replaying it (photo poses).
   */
  emote: { id: EmoteId; at: number; seq?: number; loop?: boolean } | null;
  holding: boolean;
  /** Partner cat from the pair connection (null if not connected). */
  partner: RemoteCat | null;
  pairId: string | null;
  lowPower: boolean;
  /** Milestone 6: fewer, calmer effects (accessibility setting; also follows the OS reduced-motion). */
  reduceEffects?: boolean;
  /**
   * Photo mode: shift the camera so the subject sits in the middle of the area NOT covered by the
   * photo controls (fractions of the canvas size, + = right/down), and stop clamping at the edges.
   */
  photoBias?: { x: number; y: number } | null;
  /** Milestone 6: the interactables of the current scene (base + adventure spots), set by the page. */
  spots?: readonly SceneSpot[];
  /** Milestone 6: extra solid rectangles (closed gates). Change the array to apply. */
  blockers?: readonly Rect[];
  /** Milestone 6: NPC cats (render-only) and creatures. */
  npcs?: readonly (CatRenderState & { name: string })[];
  creatures?: readonly { x: number; y: number; kind: 'lumi' }[];
  /** Milestone 6: the adventure layer for the renderer (markers, flags). */
  adv?: AdvFrame;
  /** Milestone 6: the partner's region (their cat is shown only when you're in the same place). */
  partnerRegion?: RegionId;
  /** The seat the LOCAL player holds (bench / ride seat). Published to everyone in the snapshot (net/occupancy.ts). */
  claim?: SeatClaim | null;
  /** Seats held by OTHER players in this place, rebuilt every frame from presence + the partner link. */
  occupied?: ReadonlyMap<string, Holder>;
  /** The local player's id (the instance id of this tab). */
  selfId?: string;
}

export type { Framing };
export interface CaptureOpts {
  framing: Framing;
  hideTags: boolean;
  /** Soft background blur (only where the browser supports canvas filters). */
  blurBackground?: boolean;
}
export interface CaptureResult {
  canvas: HTMLCanvasElement;
  /** Where the subjects ended up (output pixels) — used by tests/UI to confirm they're in frame. */
  subjects: { x: number; y: number }[];
  /** True when a couple framing was requested but the partner wasn't available. */
  partnerMissing: boolean;
}
export type CaptureFn = (opts: CaptureOpts) => CaptureResult | null;

interface TownCanvasProps {
  identity: TownIdentity;
  startPos: Vec2;
  paused: boolean;
  controls: MutableRefObject<TownControls>;
  presence: MutableRefObject<TownPresence | null>;
  playerPos: MutableRefObject<Vec2>;
  live: MutableRefObject<TownLive>;
  capture: MutableRefObject<CaptureFn | null>;
  onTargetChange: (target: SceneSpot | null) => void;
  onInteract: (item: SceneSpot) => void;
  onAreaChange: (name: string) => void;
  onFirstMove: () => void;
  onHoldBroken: () => void;
  /** Called ~10×/s with our state so the page can share it with the partner. */
  onSelfState: (s: SelfState) => void;
  hideTags: boolean;
  /** Milestone 6: which scene (region) to show. Defaults to the town. */
  scene?: Scene;
}

export interface SelfState { x: number; y: number; facing: Facing; moving: boolean; pose: CatPose; lift: number; emote: EmoteId | null; emoteAge: number; emoteSeq: number; run: boolean; region: RegionId; claim: SeatClaim | null }

export function getTownLayout(): TownLayout {
  return sceneTownLayout();
}

const MOVE_CODES = new Set<string>([...KEY_BINDINGS.up, ...KEY_BINDINGS.down, ...KEY_BINDINGS.left, ...KEY_BINDINGS.right, ...KEY_BINDINGS.run]);
const INTERACT_CODES = new Set<string>(KEY_BINDINGS.interact);
/** The local emote at `now`, with exclusivity re-checked against the canonical appearance. */
function localEmote(live: TownLive, coat: TownIdentity['coat'], now: number): { id: EmoteId; t: number } | null {
  const e = live.emote;
  if (!e) return null;
  const d = emoteDef(e.id);
  if (!d) return null;
  const id = resolveEmote(e.id, coat);
  let t = now - e.at;
  if (e.loop) t = ((t % d.ms) + d.ms) % d.ms;
  return t >= 0 && t < (emoteDef(id)?.ms ?? 0) ? { id, t } : null;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function TownCanvas(props: TownCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const tagLayer = tagsRef.current;
    if (!wrap || !canvas || !tagLayer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scene = latest.current.scene ?? getScene('town', browserCanvasFactory);
    const WORLD_W = scene.size.w;
    const WORLD_H = scene.size.h;
    let blockersRef: readonly Rect[] | undefined = latest.current.live.current.blockers;
    const world: CollisionWorld = { bounds: scene.bounds, solids: [...scene.baseSolids, ...(blockersRef ?? [])] };
    let body: Body = { pos: findFreeSpot(latest.current.startPos, world), vel: { x: 0, y: 0 }, facing: 'up', moving: false };
    latest.current.playerPos.current = body.pos;
    const keys = new Set<string>();
    let scale = 3;
    let viewW = 0;
    let viewH = 0;
    let raf = 0;
    let last = performance.now();
    const start = last;
    let selfAnim = 0;
    let wasMoving = false;
    let targetId: string | null = null;
    let area = '';
    let areaCheck = 0;
    let movedOnce = false;
    let lastShare = 0;
    let cam: Vec2 | null = null;
    let lastPrint = 0;
    let running = false;
    let lastStepFrame = -1;
    const prints: { x: number; y: number; age: number }[] = [];
    const remoteAnim = new Map<string, number>();
    const tags = new Map<string, HTMLDivElement>();
    const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let hidden = document.visibilityState === 'hidden';

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      scale = pixelScaleFor(r.width, r.height);
      viewW = Math.max(1, Math.ceil(r.width / scale));
      viewH = Math.max(1, Math.ceil(r.height / scale));
      canvas.width = viewW;
      canvas.height = viewH;
      canvas.style.width = `${viewW * scale}px`;
      canvas.style.height = `${viewH * scale}px`;
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const available = (i: SceneSpot) => (i.kind === 'adventure' ? true : isAvailable(i.when, latest.current.live.current.env));
    const onKeyDown = (e: KeyboardEvent) => {
      if (latest.current.paused || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (MOVE_CODES.has(e.code)) {
        keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      } else if (INTERACT_CODES.has(e.code)) {
        if ((e.code === 'Enter' || e.code === 'Space') && e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (!e.repeat) latest.current.controls.current.interactRequested = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const clearKeys = () => keys.clear();
    const onVisibility = () => {
      hidden = document.visibilityState === 'hidden';
      keys.clear();
      last = performance.now();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', onVisibility);

    const tag = (id: string, text: string, x: number, y: number, c: Vec2, cls: string, emote: EmoteId | null, show: boolean) => {
      let el = tags.get(id);
      if (!el) {
        el = document.createElement('div');
        tagLayer.appendChild(el);
        tags.set(id, el);
      }
      const content = text;
      if (el.textContent !== content) el.textContent = content;
      const klass = `pv-nametag ${cls}${emote ? ' has-emote' : ''}`;
      if (el.className !== klass) el.className = klass;
      el.style.display = show ? '' : 'none';
      el.style.transform = `translate(${Math.round((x - c.x) * scale)}px, ${Math.round((y - c.y - 25) * scale)}px) translate(-50%, -100%)`;
    };

    const remoteRideSeat = (c: SeatClaim | null | undefined, sceneId: string) => {
      if (!c || c.kind !== 'ride' || c.phase !== 'riding' || sceneId !== 'funfair' || !(RIDE_IDS as readonly string[]).includes(c.id)) return null;
      const ride = c.id as RideId;
      const p = seatPose(ride, FAIR_LAYOUT[ride], c.seat, fairClock());
      return { x: p.x, y: p.y, lift: p.lift, facing: p.facing, sortY: p.sortY, noShadow: ride === 'ferris' };
    };
    const buildCats = (now: number): CatRenderState[] => {
      const p = latest.current;
      const live = p.live.current;
      const cats: CatRenderState[] = [];
      const presence = p.presence.current;
      const seat = live.seat;
      const selfX = seat?.x ?? body.pos.x;
      const selfY = seat?.y ?? body.pos.y;
      if (presence) {
        for (const r of presence.remotes.values()) {
          if ((r.region ?? 'town') !== scene.id) continue; // only cats in the same place
          if (live.partner && r.pair && r.pair === live.pairId && r.cat === live.partner.cat) continue; // shown via the pair link
          const e = remoteEmoteNow(r, now);
          // A cat riding a funfair ride is placed from the SHARED ride clock and its claimed seat — exactly where that seat is on
          // every screen, with the draw order and "no ground shadow" the local rider gets. (Placing it from 10 Hz snapshots left
          // remote riders lagging behind their seat, hidden behind the ride, and hovering with a shadow on the ground.)
          const ride = remoteRideSeat(r.claim, scene.id);
          cats.push({ id: r.id, coat: r.coat, accessory: r.accessory, extra: r.extra, x: ride?.x ?? r.pos.x, y: ride?.y ?? r.pos.y, facing: ride?.facing ?? r.facing, moving: ride ? false : r.moving, pose: ride ? 'sit' : r.pose, lift: ride?.lift ?? r.lift, animTime: remoteAnim.get(r.id) ?? 0, isSelf: false, emote: ride ? null : e?.id ?? null, emoteT: e?.t ?? 0, running: ride ? false : r.run, ...(ride ? { sortY: ride.sortY, noShadow: ride.noShadow } : null) });
        }
      }
      const mine = localEmote(live, p.identity.coat, now);
      for (const n of live.npcs ?? []) cats.push({ ...n, animTime: now / 1000 + n.x * 0.01 });
      if (live.partner && (live.partnerRegion ?? 'town') === scene.id) {
        const r = live.partner;
        const e = remoteEmoteNow(r, now);
        const ps = live.partnerSeat;
        cats.push({
          id: 'partner', coat: r.coat, accessory: r.accessory, extra: r.extra, x: ps?.x ?? r.pos.x, y: ps?.y ?? r.pos.y, facing: ps?.facing ?? r.facing, moving: ps ? false : r.moving, pose: ps ? 'sit' : r.pose, lift: ps?.lift ?? r.lift,
          animTime: remoteAnim.get('partner') ?? 0, isSelf: false, emote: ps ? null : e?.id ?? null, emoteT: e?.t ?? 0, towardX: selfX, running: ps ? false : r.run,
          ...(ps ? { sortY: ps.sortY, noShadow: ps.noShadow } : null),
        });
      }
      const sharedDef = mine ? emoteDef(mine.id) : undefined;
      cats.push({
        id: p.identity.id, coat: p.identity.coat, accessory: p.identity.accessory, extra: p.identity.extra,
        x: selfX, y: selfY, facing: seat?.facing ?? body.facing, moving: !seat && body.moving, pose: seat?.pose ?? (mine ? sharedDef!.pose : 'stand'), lift: seat?.lift ?? 0,
        animTime: selfAnim, isSelf: true, emote: mine?.id ?? null, emoteT: mine?.t ?? 0,
        towardX: sharedDef?.shared && live.partner ? live.partner.pos.x : null, running: running && !seat,
        ...(seat?.sortY !== undefined ? { sortY: seat.sortY } : null), ...(seat?.noShadow ? { noShadow: true } : null),
      });
      return cats;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (hidden) return;
      const p = latest.current;
      const live = p.live.current;
      if (live.blockers !== blockersRef) {
        blockersRef = live.blockers;
        world.solids = [...scene.baseSolids, ...(blockersRef ?? [])];
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const controls = p.controls.current;
      if (controls.teleport) {
        const to = findFreeSpot(controls.teleport, world);
        // a short hop (stepping off a ride, standing up) keeps the eased camera; a real jump snaps it
        if (Math.hypot(to.x - body.pos.x, to.y - body.pos.y) > 120) cam = null;
        body = { ...body, pos: to, vel: { x: 0, y: 0 }, facing: 'down' };
        controls.teleport = null;
      }
      if (p.paused) {
        keys.clear();
        controls.interactRequested = false;
      }
      let input = p.paused || live.seat ? { x: 0, y: 0, run: false } : combineInputs(inputFromKeys(keys), { x: controls.joy.x, y: controls.joy.y, run: Math.hypot(controls.joy.x, controls.joy.y) > 0.92 });
      let speedScale = 1;
      if (live.holding && live.partner && !live.seat && (live.partnerRegion ?? 'town') === scene.id) {
        const step = holdStep(body.pos, live.partner.pos, p.identity.cat, input);
        if (step.release) p.onHoldBroken();
        else {
          input = step.input;
          speedScale = step.speedScale;
        }
      }
      if (!live.seat) body = stepBody(body, input, dt, world, speedScale);
      running = input.run && body.moving;
      p.playerPos.current = live.seat ? { x: live.seat.x, y: live.seat.y + 14 } : body.pos;
      if (body.moving !== wasMoving) { selfAnim = 0; lastStepFrame = -1; }
      wasMoving = body.moving;
      selfAnim += dt;
      // Milestone 8.2: footsteps follow the walk cycle (frames 0 and 2 = a paw touching down)
      if (body.moving && !live.seat && !p.paused) {
        const sf = Math.floor(selfAnim * (running ? 13 : 9)) % 4;
        if (sf !== lastStepFrame && (sf === 0 || sf === 2)) playStep(live.env.snowCover > 0.5 ? 'snow' : scene.surface(body.pos), running);
        lastStepFrame = sf;
      }
      if (body.moving && !movedOnce) {
        movedOnce = true;
        p.onFirstMove();
      }
      // snow paw prints (always in snowy regions)
      if ((scene.snowy || live.env.snowCover > 0.2) && body.moving && now - lastPrint > 180) {
        lastPrint = now;
        prints.push({ x: body.pos.x + (prints.length % 2 ? 2 : -2), y: body.pos.y - 1, age: 0 });
        if (prints.length > 80) prints.shift();
      }
      for (const pr of prints) pr.age += dt;
      while (prints.length && prints[0].age > 20) prints.shift();

      const target = live.seat ? null : stickyInteractable(body.pos, live.spots ?? scene.baseSpots, targetId, available);
      const nextId = target?.item.id ?? null;
      if (nextId !== targetId) {
        targetId = nextId;
        p.onTargetChange(target?.item ?? null);
      }
      if (controls.interactRequested) {
        controls.interactRequested = false;
        if (target && !p.paused) p.onInteract(target.item);
      }
      if (now - areaCheck > 250) {
        areaCheck = now;
        const a = scene.areaName(body.pos);
        if (a !== area) {
          area = a;
          p.onAreaChange(a);
        }
      }
      const presence = p.presence.current;
      // Who holds which seat RIGHT NOW (everybody else in this place: plaza cats + the pair partner). Rebuilt each frame from the
      // snapshots we already receive, so a player who leaves or disconnects frees their seat the moment they leave the roster.
      live.selfId = p.identity.id;
      live.occupied = occupancy([...(presence ? presence.remotes.values() : []), ...(live.partner && (live.partnerRegion ?? 'town') === scene.id ? [live.partner] : [])], scene.id);
      const mine = localEmote(live, p.identity.coat, now);
      const emote = mine?.id ?? null;
      const seat = live.seat;
      const selfState: SelfState = {
        x: seat?.x ?? body.pos.x, y: seat?.y ?? body.pos.y, facing: seat?.facing ?? body.facing, moving: !seat && body.moving,
        pose: (seat?.pose ?? (emote ? emoteDef(emote)!.pose : 'stand')) as CatPose, lift: seat?.lift ?? 0, emote,
        emoteAge: mine ? Math.round(mine.t) : 0, emoteSeq: live.emote?.seq ?? 0, run: running && !seat, region: scene.id, claim: seat ? live.claim ?? null : null,
      };
      if (presence) {
        presence.update(selfSnapshot(p.identity, { x: selfState.x, y: selfState.y }, selfState.facing, selfState.moving, { pose: selfState.pose, lift: selfState.lift, emote, emoteAge: selfState.emoteAge, emoteSeq: selfState.emoteSeq, run: selfState.run, pair: live.pairId, region: scene.id, claim: selfState.claim }));
        interpolateRemotes(presence.remotes, dt, now);
        for (const r of presence.remotes.values()) remoteAnim.set(r.id, (remoteAnim.get(r.id) ?? Math.random()) + dt);
      }
      if (live.partner) {
        const m = new Map([['partner', live.partner]]);
        interpolateRemotes(m, dt, now);
        remoteAnim.set('partner', (remoteAnim.get('partner') ?? 0) + dt);
      }
      if (now - lastShare > 100) {
        lastShare = now;
        p.onSelfState(selfState);
      }
      const cats = buildCats(now);
      const bias = live.photoBias;
      const wanted = bias
        // Photo mode: put the subject in the middle of the uncovered area; don't clamp at the world edge
        // (so the cat can never end up underneath the controls).
        ? { x: Math.round(selfState.x - viewW * (0.5 + bias.x)), y: Math.round(selfState.y - 14 - viewH * (0.5 + bias.y)) }
        : cameraFor(live.focus ?? { x: selfState.x, y: selfState.y }, { w: viewW, h: viewH }, { w: WORLD_W, h: WORLD_H });
      cam = cam ? smoothCamera(cam, wanted, dt) : wanted;
      const c = snapCamera(cam, live.focus ?? { x: selfState.x, y: selfState.y });
      scene.draw(ctx, {
        camX: c.x, camY: c.y, viewW, viewH, time: (now - start) / 1000, cats, target: targetId,
        reducedMotion: !!reducedMotionQuery?.matches || !!live.reduceEffects, env: scene.envFor(live.env), dyn: { ...live.dyn, pawprints: prints }, lowPower: live.lowPower,
        adv: live.adv, creatures: live.creatures, fair: { clockMs: Date.now(), occupied: live.fair?.occupied, waiting: live.fair?.waiting },
      });
      const showTags = !p.hideTags;
      tag('self', p.identity.name, selfState.x, selfState.y - selfState.lift, c, 'pv-nametag--self', emote, showTags);
      const seen = new Set<string>(['self']);
      for (const n of live.npcs ?? []) {
        tag(n.id, n.name, n.x, n.y - n.lift, c, 'pv-nametag--npc', null, showTags);
        seen.add(n.id);
      }
      if (presence) for (const r of presence.remotes.values()) {
        if ((r.region ?? 'town') !== scene.id) continue;
        if (live.partner && r.pair && r.pair === live.pairId && r.cat === live.partner.cat) continue;
        tag(r.id, r.name, r.pos.x, r.pos.y - r.lift, c, '', remoteEmoteNow(r, now)?.id ?? null, showTags);
        seen.add(r.id);
      }
      if (live.partner && (live.partnerRegion ?? 'town') === scene.id) {
        tag('partner', `♥ ${live.partner.name}`, live.partner.pos.x, live.partner.pos.y - live.partner.lift, c, 'pv-nametag--partner', remoteEmoteNow(live.partner, now)?.id ?? null, showTags);
        seen.add('partner');
      }
      for (const [id, el] of tags) if (!seen.has(id)) { el.remove(); tags.delete(id); remoteAnim.delete(id); }
    };
    raf = requestAnimationFrame(frame);

    latest.current.capture.current = ({ framing, hideTags, blurBackground }) => {
      // Render the CURRENT scene again offscreen (the real game scene — no DOM, no controls, no
      // cursor), framed around the subject(s), then scale it up crisply.
      const now = performance.now();
      const live = latest.current.live.current;
      const self = { x: live.seat?.x ?? body.pos.x, y: live.seat?.y ?? body.pos.y };
      const wantsPartner = framing === 'couple';
      const partner = live.partner && (live.partnerRegion ?? 'town') === scene.id ? { x: live.partner.pos.x, y: live.partner.pos.y } : null;
      const subjects = wantsPartner && partner ? [self, partner] : [self];
      const r = framingRect(framing, subjects, { w: WORLD_W, h: WORLD_H });
      const small = document.createElement('canvas');
      small.width = r.w;
      small.height = r.h;
      const sctx = small.getContext('2d');
      if (!sctx) return null;
      const cats = buildCats(now);
      scene.draw(sctx, {
        camX: r.x, camY: r.y, viewW: r.w, viewH: r.h, time: (now - start) / 1000, cats, target: null, reducedMotion: false,
        env: scene.envFor(live.env), dyn: { ...live.dyn, pawprints: prints }, lowPower: false, adv: live.adv ? { ...live.adv, highlight: new Set() } : undefined, creatures: live.creatures,
        fair: { clockMs: Date.now(), occupied: live.fair?.occupied, waiting: live.fair?.waiting },
      });
      const out = document.createElement('canvas');
      out.width = r.w * r.zoom;
      out.height = r.h * r.zoom;
      const octx = out.getContext('2d');
      if (!octx) return null;
      octx.imageSmoothingEnabled = false;
      if (blurBackground && 'filter' in octx) {
        // Simulated depth of field: a softly blurred copy behind a sharp oval around the subjects.
        octx.filter = `blur(${Math.max(2, r.zoom)}px)`;
        octx.drawImage(small, 0, 0, out.width, out.height);
        octx.filter = 'none';
        octx.save();
        octx.beginPath();
        const sx = ((Math.min(...subjects.map((q) => q.x)) + Math.max(...subjects.map((q) => q.x))) / 2 - r.x) * r.zoom;
        const sy = ((Math.min(...subjects.map((q) => q.y)) + Math.max(...subjects.map((q) => q.y))) / 2 - 14 - r.y) * r.zoom;
        const rx = (Math.max(...subjects.map((q) => q.x)) - Math.min(...subjects.map((q) => q.x)) + 70) * r.zoom * 0.62;
        octx.ellipse(sx, sy, rx, 48 * r.zoom * 0.62 + 20, 0, 0, Math.PI * 2);
        octx.clip();
        octx.drawImage(small, 0, 0, out.width, out.height);
        octx.restore();
      } else {
        octx.drawImage(small, 0, 0, out.width, out.height);
      }
      if (!hideTags) {
        octx.font = `600 ${6 * r.zoom}px Fredoka, Nunito, sans-serif`;
        octx.textAlign = 'center';
        for (const cat of cats) {
          const name = cat.isSelf ? latest.current.identity.name : cat.id === 'partner' ? live.partner?.name ?? '' : (live.npcs ?? []).find((n) => n.id === cat.id)?.name ?? '';
          if (!name) continue;
          const tx = (cat.x - r.x) * r.zoom;
          const ty = (cat.y - cat.lift - r.y - 26) * r.zoom;
          octx.fillStyle = 'rgba(13,11,18,0.7)';
          const tw = octx.measureText(name).width + 6 * r.zoom;
          octx.fillRect(tx - tw / 2, ty - 7 * r.zoom, tw, 9 * r.zoom);
          octx.fillStyle = '#fff3e6';
          octx.fillText(name, tx, ty);
        }
      }
      return {
        canvas: out,
        subjects: subjects.map((q) => ({ x: (q.x - r.x) * r.zoom, y: (q.y - r.y) * r.zoom })),
        partnerMissing: wantsPartner && !partner,
      };
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const el of tags.values()) el.remove();
      tags.clear();
      latest.current.capture.current = null;
    };
  }, []);

  return (
    <div ref={wrapRef} className="pv-canvas-wrap">
      <canvas ref={canvasRef} className="pv-canvas" role="img" aria-label="Pawville town. Walk with W A S D or the arrow keys, hold Shift to run, press E to interact." />
      <div ref={tagsRef} className="pv-nametags" aria-hidden="true" />
    </div>
  );
}
