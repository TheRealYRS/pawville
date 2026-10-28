import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ROOM_H, ROOM_W, SEAT_ACTIONS, WALL_ROWS, decorDef, footprint, type DecorId, type HomeAction, type HomeState, type Placed } from '../home/decor.ts';
import { ROOM_PX_H, ROOM_PX_W, SIDE, T, drawRoom, renderDecorThumb, type HomeCatView } from '../home/homeArt.ts';
import { HOP_MS, findPath, isWalkable, nearestFree, planInteraction, routePoint, solidGrid, type Cell, type ClimbStep, type InteractionPlan } from '../home/homeWalk.ts';
import type { TownIdentity } from '../identity';
import { browserCanvasFactory } from '../render/canvasTypes.ts';
import { CatSpriteCache } from '../render/catSprites.ts';
import { emoteFrame } from '../render/emoteAnim.ts';
import { cue } from '../sound';
import type { Facing } from '../world/movement.ts';

let cats: CatSpriteCache | null = null;
const STEP_MS = 230;

const ACTION_TEXT: Record<HomeAction, string> = {
  sleep: 'curls up for a nap on the bed', sit: 'settles into the cushions', rest: 'rests in the cat bed', climb: 'climbs to the top',
  perch: 'watches the world from the window perch', hide: 'hides — only the ears peek out', scratch: 'gives it a good scratch',
  play: 'bats at a toy', eat: 'has a little snack', inspect: 'looks closely', wardrobe: 'opens the wardrobe', read: 'sits at the desk',
  cook: 'stands at the stove', dine: 'sits down at the table', light: 'flicks the light', display: 'admires the keepsakes', harvest: 'picks fresh herbs', music: 'puts on a record',
};

interface Doing {
  plan: InteractionPlan;
  uid: string;
  since: number;
  /** Climbing pieces: when the cat started to hop back down (it is only "done" once it is on the floor again). */
  leaveAt?: number;
}

/**
 * The furnished room: a canvas scene (homeArt.ts) with an accessible grid of buttons on top.
 * Outside of decorating, click/tap a floor tile to walk there (or use the arrow keys / WASD when
 * the room has focus), and click a piece of furniture — or focus it and press Enter/E — to use it.
 */
export function HomeRoom({ room, editing, placing, me, ghost, selected, hideUid = null, onCell, onHover, onPiece, onPiecePointerDown, onAction, onLeave, sceneRef, children }: {
  room: HomeState;
  editing: boolean;
  /** Decorating: a piece is being placed (tiles become clickable, pieces don't). */
  placing: boolean;
  me: TownIdentity;
  ghost: (Pick<Placed, 'item' | 'x' | 'y' | 'rot'> & { ok: boolean }) | null;
  selected: string | null;
  /** Decorating: a piece that is being moved is not drawn at its old spot (only the ghost shows where it will land). */
  hideUid?: string | null;
  /** Decorating: a tile was clicked. */
  onCell: (x: number, y: number) => void;
  onHover: (c: Cell | null) => void;
  /** Decorating: a piece was clicked. */
  onPiece: (p: Placed) => void;
  /** Decorating: the pointer went down on a piece (the page turns a drag into a move). */
  onPiecePointerDown?: (p: Placed, e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Living: the cat started using a piece. */
  onAction: (action: HomeAction, piece: Placed) => void;
  /** Living: the cat stopped using a piece (e.g. close the wardrobe). */
  onLeave: (piece: Placed | null) => void;
  /** The page needs the scene's element to turn pointer positions into tiles while dragging. */
  sceneRef?: MutableRefObject<HTMLDivElement | null>;
  /** Overlays that live INSIDE the room (the selected piece's toolbar…). */
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const grid = solidGrid(room.placed);
  const spawn = nearestFree(grid, { x: 6, y: ROOM_H - 1 }) ?? { x: 6, y: ROOM_H - 1 };
  const [cat, setCat] = useState<Cell>(spawn);
  const [doing, setDoing] = useState<Doing | null>(null);
  const live = useRef({ pos: { x: spawn.x + 0.5, y: spawn.y + 0.5 }, path: [] as Cell[], facing: 'down' as Facing, stepAt: 0, pending: null as { plan: InteractionPlan; piece: Placed } | null, finishing: null as string | null, afterLeave: null as (() => void) | null, hop: 0 });
  const props = useRef({ room, editing, ghost, doing, me, hideUid });
  props.current = { room, editing, ghost, doing, me, hideUid };

  // If furniture moves onto the cat while decorating, hop to the nearest free tile.
  useEffect(() => {
    if (doing) return;
    const g = solidGrid(room.placed);
    const here = { x: Math.floor(live.current.pos.x), y: Math.floor(live.current.pos.y) };
    if (g[here.y * ROOM_W + here.x]) {
      const free = nearestFree(g, here);
      if (free) { live.current.pos = { x: free.x + 0.5, y: free.y + 0.5 }; live.current.path = []; setCat(free); }
    }
  }, [room.placed, doing]);

  /** The cat is on the floor again: put it back where it stood, forget the piece, run whatever was waiting for it. */
  const finish = useCallback((d: Doing) => {
    const L = live.current;
    const g = solidGrid(props.current.room.placed);
    const back = { x: Math.floor(L.pos.x), y: Math.floor(L.pos.y) };
    // climbers hop back down to where they started; seat pieces step off to the nearest free tile
    const free = d.plan.route && isWalkable(g, back) ? back : nearestFree(g, { x: Math.floor(d.plan.spot.x), y: Math.floor(d.plan.spot.y) }) ?? spawn;
    L.pos = { x: free.x + 0.5, y: free.y + 0.5 };
    L.path = [];
    L.finishing = null;
    props.current.doing = null; // right now: anything queued behind this must not still see the cat as busy
    setCat(free);
    setDoing(null);
    onLeave(props.current.room.placed.find((p) => p.uid === d.uid) ?? null);
    const then = L.afterLeave;
    L.afterLeave = null;
    then?.();
  }, [onLeave, spawn]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Get off whatever the cat is using. Climbers hop down first (then `then` runs); everything else is immediate. */
  const stopDoing = useCallback((then?: () => void) => {
    const d = props.current.doing;
    if (!d) { then?.(); return; }
    if (d.plan.route && d.plan.route.length) {
      if (then) live.current.afterLeave = then;
      if (!d.leaveAt) {
        const next = { ...d, leaveAt: performance.now() };
        props.current.doing = next;
        setDoing(next);
      }
      return;
    }
    live.current.afterLeave = then ?? null;
    finish(d);
  }, [finish]);

  const walkTo = useCallback((to: Cell) => {
    if (props.current.doing) { stopDoing(() => { walkTo(to); }); return true; }
    const g = solidGrid(props.current.room.placed);
    const from = { x: Math.floor(live.current.pos.x), y: Math.floor(live.current.pos.y) };
    const path = findPath(g, from, to);
    if (!path) { cue('nope'); return false; }
    live.current.path = path.slice(1);
    live.current.pending = null;
    return true;
  }, [stopDoing]);

  /** The cat has reached the piece: start using it. */
  const beginDoing = useCallback((plan: InteractionPlan, piece: Placed, now: number) => {
    live.current.hop = 0;
    live.current.pending = null;
    setDoing({ plan, uid: piece.uid, since: now });
    cue(plan.action === 'sleep' || plan.action === 'rest' ? 'tap' : 'pop');
    onAction(plan.action, piece);
  }, [onAction]);
  const beginRef = useRef(beginDoing);
  beginRef.current = beginDoing;

  const use = useCallback((piece: Placed) => {
    if (props.current.doing?.uid === piece.uid) { stopDoing(); return; }
    if (props.current.doing) { stopDoing(() => { use(piece); }); return; }
    const from = { x: Math.floor(live.current.pos.x), y: Math.floor(live.current.pos.y) };
    const plan = planInteraction(props.current.room.placed, piece, from);
    if (!plan) { cue('nope'); return; }
    live.current.path = plan.path.slice(1);
    live.current.pending = { plan, piece };
    if (!live.current.path.length) beginDoing(plan, piece, performance.now()); // already beside it: nothing to walk
  }, [stopDoing, beginDoing]);

  // Decorating starts with the cat on the floor (nobody is asleep on a bed that is about to be moved)
  useEffect(() => { if (editing) stopDoing(); }, [editing, stopDoing]);

  // Esc = get down / get up
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.code === 'Escape' && props.current.doing && !props.current.editing) stopDoing(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [stopDoing]);

  // Render + movement loop (throttled; cleaned up on unmount).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    cats ??= new CatSpriteCache(browserCanvasFactory);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 66) return; // ~15 fps is plenty for the room
      last = now;
      const L = live.current;
      const P = props.current;
      // walking
      if (L.path.length && now - L.stepAt > STEP_MS) {
        const next = L.path.shift()!;
        const dx = next.x + 0.5 - L.pos.x;
        const dy = next.y + 0.5 - L.pos.y;
        L.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        L.pos = { x: next.x + 0.5, y: next.y + 0.5 };
        L.stepAt = now;
        if (!L.path.length) {
          setCat(next);
          if (L.pending) {
            const { plan, piece } = L.pending;
            beginRef.current(plan, piece, now);
          }
        }
      }
      const d = P.doing;
      const t = now - (d?.since ?? 0);
      let view: HomeCatView;
      if (d) {
        const a = d.plan.action;
        const seat = SEAT_ACTIONS.includes(a);
        const base: HomeCatView = {
          coat: P.me.coat, accessory: P.me.accessory, extra: P.me.extra, x: seat ? d.plan.spot.x : L.pos.x, y: seat ? d.plan.spot.y : L.pos.y,
          lift: d.plan.lift, facing: d.plan.facing, pose: d.plan.pose, moving: false, frame: reduce ? 0 : Math.floor(t / 600) % 4,
        };
        // climbing: hop from the floor up the route (and back down again when leaving)
        const route = d.plan.route;
        if (route && route.length) {
          const n = route.length;
          const start: ClimbStep = { x: L.pos.x, y: L.pos.y, lift: 0 };
          const hopMs = reduce ? 1 : HOP_MS;
          const u = d.leaveAt ? n - (now - d.leaveAt) / hopMs : (now - d.since) / hopMs;
          const rp = routePoint(start, route, u);
          base.x = rp.x; base.y = rp.y; base.lift = rp.lift;
          const settled = !d.leaveAt && u >= n;
          if (!settled) { base.pose = 'stand'; base.facing = d.leaveAt ? 'down' : 'up'; base.frame = 0; }
          const landed = Math.floor(Math.max(0, Math.min(n, u)));
          if (!d.leaveAt && landed !== L.hop) { L.hop = landed; if (landed > 0) cue('tap'); }
          if (d.leaveAt && now - d.leaveAt >= n * hopMs && L.finishing !== d.uid) { L.finishing = d.uid; finishRef.current(d); }
        }
        if (a === 'sleep' || a === 'rest') base.eyes = 'closed';
        if (a === 'hide') base.hidden = true;
        if (a === 'scratch') { base.paw = 'forward'; base.pawLift = reduce ? 1 : Math.floor(t / 160) % 2 ? 2 : 0; }
        if (a === 'eat') { base.eyes = Math.floor(t / 400) % 2 ? 'closed' : 'happy'; }
        if (a === 'play') {
          const f = emoteFrame('bounce', t % 2000, !!reduce);
          if (f) { base.lift = -f.dy; base.eyes = f.eyes; }
        }
        if (a === 'inspect') base.ears = 'perk';
        view = base;
      } else {
        const moving = L.path.length > 0 || now - L.stepAt < STEP_MS;
        // smooth the step for drawing
        view = {
          coat: P.me.coat, accessory: P.me.accessory, extra: P.me.extra, x: L.pos.x, y: L.pos.y, lift: 0, facing: L.facing,
          pose: moving ? 'stand' : 'sit', moving, frame: reduce && !moving ? 0 : Math.floor((now - t0) / (moving ? 110 : 600)) % 4,
          eyes: !moving && !reduce && ((now - t0) % 4200) < 140 ? 'closed' : 'open',
        };
        // Milestone 8: idle life — ear twitches, grooming and yawns on separate, unsynchronised cycles
        if (!moving && !reduce) {
          const idle = now - L.stepAt;
          const cyc = (ms: number, off: number) => (idle + off) % ms;
          if (idle > 2500 && cyc(9100, 0) < 1500) { view.paw = 'forward'; view.pawLift = Math.floor(idle / 180) % 2 ? 2 : 1; view.eyes = 'happy'; } // groom
          else if (idle > 4000 && cyc(13700, 3100) < 900) { view.eyes = 'closed'; view.ears = 'down'; } // yawn
          else if (cyc(5300, 1700) < 220) view.ears = 'perk'; // ear twitch
        }
      }
      drawRoom(ctx, {
        room: P.hideUid ? P.room.placed.filter((q) => q.uid !== P.hideUid) : P.room.placed, wallpaper: P.room.wallpaper, cat: view, ghost: P.ghost, openUid: d?.plan.action === 'wardrobe' ? d.uid : null,
        time: (now - t0) / 1000, editing: P.editing, lightsOff: P.room.lightsOff,
      }, cats!);
      // little z's / nom over the cat
      if (d && (d.plan.action === 'sleep' || d.plan.action === 'rest') && !reduce) {
        const k = (t / 1400) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.fillStyle = '#c9bfe8';
        ctx.font = '700 7px Fredoka, Nunito, sans-serif';
        ctx.fillText('z', SIDE + view.x * T + 6 + k * 4, view.y * T - view.lift - 18 - k * 10);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard walking (only when the room itself has focus, so it never interferes with typing).
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const dir: Record<string, [number, number]> = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
    const d = dir[e.code];
    if (!d) return;
    e.preventDefault();
    const here = { x: Math.floor(live.current.pos.x), y: Math.floor(live.current.pos.y) };
    walkTo({ x: here.x + d[0], y: here.y + d[1] });
  };

  const pieces = [...room.placed].sort((a, b) => (decorDef(a.item).layer === 'rug' ? -1 : 0) - (decorDef(b.item).layer === 'rug' ? -1 : 0));
  return (
    <div ref={(el) => { wrapRef.current = el; if (sceneRef) sceneRef.current = el; }} className={`hm-scene ${editing ? 'is-editing' : ''} ${placing ? 'is-placing' : ''}`}
      style={{ '--hm-aspect': `${ROOM_PX_W} / ${ROOM_PX_H}`, '--hm-ratio': ROOM_PX_W / ROOM_PX_H } as CSSProperties}>
      <canvas ref={canvasRef} className="hm-scene__canvas" width={ROOM_PX_W} height={ROOM_PX_H} role="img"
        aria-label={`Your room with ${room.placed.length} pieces of furniture. ${doing ? `Your cat ${ACTION_TEXT[doing.plan.action]}.` : ''}`} />
      <div className="hm-scene__grid" tabIndex={editing ? -1 : 0} onKeyDown={onKey} onMouseLeave={() => onHover(null)} role="grid"
        aria-label={editing ? 'Room layout' : 'Room: click a spot to walk, click furniture to use it; arrow keys walk'}
        style={{ left: `${(SIDE / ROOM_PX_W) * 100}%`, width: `${((ROOM_W * T) / ROOM_PX_W) * 100}%`, height: `${((ROOM_H * T) / ROOM_PX_H) * 100}%`, '--cols': ROOM_W, '--rows': ROOM_H } as CSSProperties}>
        {Array.from({ length: ROOM_W * ROOM_H }, (_, i) => {
          const x = i % ROOM_W;
          const y = Math.floor(i / ROOM_W);
          const wall = y < WALL_ROWS;
          return (
            <button key={i} type="button" tabIndex={-1} className={`hm-cell ${wall ? 'is-wall' : ''}`} style={{ gridColumn: x + 1, gridRow: y + 1 }}
              disabled={editing ? false : wall}
              onMouseEnter={() => onHover({ x, y })} onFocus={() => onHover({ x, y })}
              onClick={() => (editing ? onCell(x, y) : walkTo({ x, y }))} aria-label={`${wall ? 'Wall' : 'Floor'} tile ${x + 1}, ${y + 1}`} />
          );
        })}
        {pieces.map((p) => {
          const f = footprint(p);
          const d = decorDef(p.item);
          const active = doing?.uid === p.uid;
          return (
            <button key={p.uid} type="button" className={`hm-piece hm-piece--${d.layer} ${selected === p.uid ? 'is-selected' : ''} ${active ? 'is-active' : ''} ${!editing && d.action ? 'is-usable' : ''}`}
              style={{ gridColumn: `${f.x + 1} / span ${f.w}`, gridRow: `${f.y + 1} / span ${f.h}`, ...(placing ? { pointerEvents: 'none' as const } : null) }}
              disabled={editing ? placing : !d.action}
              data-uid={p.uid}
              onPointerDown={(e) => { if (editing && !placing) onPiecePointerDown?.(p, e); }}
              onClick={() => (editing ? onPiece(p) : use(p))}
              onKeyDown={(e) => { if (!editing && e.code === 'KeyE') { e.preventDefault(); use(p); } }}
              aria-label={editing ? d.name : d.action ? `${d.name}: ${active ? 'stop' : ACTION_LABEL[d.action]}` : d.name}
              title={!editing && d.action ? ACTION_LABEL[d.action] : d.name} />
          );
        })}
      </div>
      {!editing && doing && !doing.leaveAt && (
        <div className="hm-doing" role="status">
          <span>{me.name} {ACTION_TEXT[doing.plan.action]}.</span>
          <button type="button" className="pill-btn" onClick={() => stopDoing()}>{doing.plan.route ? 'Get down' : 'Get up'}</button>
        </div>
      )}
      {children}
      <span className="sr-only" aria-live="polite">{cat.x},{cat.y}</span>
    </div>
  );
}

export const ACTION_LABEL: Record<HomeAction, string> = {
  sleep: 'Sleep on the bed', sit: 'Sit here', rest: 'Rest in the cat bed', climb: 'Climb up', perch: 'Sit at the window', hide: 'Hide inside',
  scratch: 'Scratch it', play: 'Play', eat: 'Have a snack', inspect: 'Take a closer look', wardrobe: 'Open the wardrobe', read: 'Sit at the desk',
  cook: 'Cook something', dine: 'Eat or share a meal', light: 'Switch the light', display: 'Look at your keepsakes', harvest: 'Pick herbs', music: 'Play a record',
};

/** Catalogue thumbnail drawn with the same art as the room. */
export function DecorThumb({ id }: { id: DecorId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const art = renderDecorThumb(browserCanvasFactory, id);
    c.width = art.width;
    c.height = art.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art as unknown as CanvasImageSource, 0, 0);
  }, [id]);
  return <canvas ref={ref} className="hm-thumb" aria-hidden="true" />;
}
