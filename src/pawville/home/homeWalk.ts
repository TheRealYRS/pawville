/**
 * Walking and contextual interactions inside the home (pure, tested).
 *
 * Collision rule (one rule, applied consistently): the cat walks on floor tiles; rugs are walkable;
 * every other FLOOR piece is solid. Wall pieces never block the floor. The cat only steps ONTO a
 * piece as part of that piece's seat-like action (sleep on the bed, sit on the sofa, climb the cat
 * tree…), and steps back off to the nearest free tile afterwards.
 */
import { ROOM_H, ROOM_W, SEAT_ACTIONS, WALL_ROWS, checkPlace, decorDef, footprint, type DecorId, type HomeAction, type PlaceCheck, type Placed } from './decor.ts';
import { T } from './homeArt.ts';

export interface Cell {
  x: number;
  y: number;
}

export function solidGrid(placed: readonly Placed[]): boolean[] {
  const g = new Array<boolean>(ROOM_W * ROOM_H).fill(false);
  for (let y = 0; y < WALL_ROWS; y++) for (let x = 0; x < ROOM_W; x++) g[y * ROOM_W + x] = true;
  for (const p of placed) {
    if (decorDef(p.item).layer !== 'floor') continue;
    const f = footprint(p);
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_H) g[y * ROOM_W + x] = true;
  }
  return g;
}

export const isWalkable = (g: readonly boolean[], c: Cell) => c.x >= 0 && c.y >= WALL_ROWS && c.x < ROOM_W && c.y < ROOM_H && !g[c.y * ROOM_W + c.x];

/** Shortest 4-way path from `from` to `to` (both included). null if unreachable. */
export function findPath(g: readonly boolean[], from: Cell, to: Cell): Cell[] | null {
  if (!isWalkable(g, to)) return null;
  const key = (c: Cell) => c.y * ROOM_W + c.x;
  const prev = new Map<number, number>();
  const start = key(from);
  const goal = key(to);
  const q: Cell[] = [from];
  prev.set(start, -1);
  while (q.length) {
    const c = q.shift()!;
    if (key(c) === goal) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!isWalkable(g, n) || prev.has(key(n))) continue;
      prev.set(key(n), key(c));
      q.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const out: Cell[] = [];
  for (let k = goal; k !== -1; k = prev.get(k)!) out.unshift({ x: k % ROOM_W, y: Math.floor(k / ROOM_W) });
  return out;
}

/** Nearest walkable tile to `c` (BFS through anything), used for spawning and stepping off. */
export function nearestFree(g: readonly boolean[], c: Cell): Cell | null {
  const seen = new Set<number>();
  const q: Cell[] = [c];
  while (q.length) {
    const n = q.shift()!;
    const k = n.y * ROOM_W + n.x;
    if (seen.has(k) || n.x < 0 || n.y < 0 || n.x >= ROOM_W || n.y >= ROOM_H) continue;
    seen.add(k);
    if (isWalkable(g, n)) return n;
    q.push({ x: n.x + 1, y: n.y }, { x: n.x - 1, y: n.y }, { x: n.x, y: n.y + 1 }, { x: n.x, y: n.y - 1 });
  }
  return null;
}

/** Floor tiles from which a piece can be used (around its footprint; for wall pieces, the tiles below). */
export function approachCells(p: Placed): Cell[] {
  const f = footprint(p);
  const out: Cell[] = [];
  if (decorDef(p.item).layer === 'wall') {
    for (let x = f.x; x < f.x + f.w; x++) out.push({ x, y: WALL_ROWS });
    return out;
  }
  for (let x = f.x; x < f.x + f.w; x++) { out.push({ x, y: f.y + f.h }); out.push({ x, y: f.y - 1 }); }
  for (let y = f.y; y < f.y + f.h; y++) { out.push({ x: f.x - 1, y }); out.push({ x: f.x + f.w, y }); }
  return out;
}

export interface InteractionPlan {
  action: HomeAction;
  /** Walk here first. */
  path: Cell[];
  /** Where the cat ends up for the action (on the piece for seat-like actions), in tile units (can be fractional). */
  spot: { x: number; y: number };
  /** Pixels the cat is lifted while on the piece. */
  lift: number;
  pose: 'stand' | 'sit' | 'loaf';
  facing: 'down' | 'up' | 'left' | 'right';
  /** Climbing pieces: the hops the cat makes from the floor up to its resting place (the last step IS `spot` / `lift`). */
  route?: ClimbStep[];
}

// ---------------------------------------------------------------------------------------------
// Climbing: the cat really hops up the shelves / tree instead of floating near the floor
// ---------------------------------------------------------------------------------------------

/** One landing of a climb: where the cat's feet are (tile units on the floor plane) and how many pixels up the wall that is. */
export interface ClimbStep { x: number; y: number; lift: number }

/** Milliseconds for one hop. */
export const HOP_MS = 340;
/** The floor-plane row the cat stands on while it is on a WALL piece (just in front of the wall). */
export const WALL_FEET_Y = WALL_ROWS + 0.85;
/** A resting cat is about this many pixels tall above its feet; its feet must be at least this far below the top of the picture. */
export const CAT_HEIGHT_PX = 22;

/** Pieces that need the lower wall row so a cat sitting on them still fits inside the room picture. */
export const NEEDS_HEADROOM: readonly DecorId[] = ['climb-shelves', 'window-perch'];
export const needsHeadroom = (item: DecorId): boolean => NEEDS_HEADROOM.includes(item);

/**
 * Surfaces a cat can stand on, in pixels from the piece's top-left corner, taken from the art in homeArt.ts
 * (climb-shelves: three boards at (2,14) (16,6) (30,14), 14 px wide; window-perch: cushion 9 px above the bottom edge; cat-tower: platforms at +8, -12 and a bed at -25).
 */
export function climbRoute(piece: Pick<Placed, 'item' | 'x' | 'y' | 'rot'>): ClimbStep[] | null {
  const def = decorDef(piece.item);
  const f = footprint(piece);
  if (piece.rot === 90 && def.w !== def.h) return null; // the art is only drawn upright
  const topPx = f.y * T, wPx = f.w * T, hPx = f.h * T;
  // "px from the footprint's left edge" → tile x
  const at = (dx: number) => f.x + dx / T;
  switch (piece.item) {
    case 'climb-shelves': {
      const feet = WALL_FEET_Y * T;
      return [
        { x: at(2 + 7), y: WALL_FEET_Y, lift: feet - (topPx + 14) }, // the low left board
        { x: at(16 + 7), y: WALL_FEET_Y, lift: feet - (topPx + 6) }, // the top board: where the cat rests
      ].map((s0) => clampStep(s0));
    }
    case 'window-perch': {
      const feet = WALL_FEET_Y * T;
      return [{ x: at(wPx / 2), y: WALL_FEET_Y, lift: feet - (topPx + hPx - 9) }].map((s0) => clampStep(s0));
    }
    case 'cat-tower': {
      const feetY = (f.y + 0.6) * T; // the same floor plane the plan has always used for the tree
      const y = feetY / T;
      return [
        { x: at(12), y, lift: feetY - (topPx + 8) }, // middle platform
        { x: at(12), y, lift: feetY - (topPx - 12) }, // upper platform
        { x: at(12), y, lift: feetY - (topPx - 25) }, // the top bed
      ].map((s0) => clampStep(s0));
    }
    default: return null;
  }
}

/** Never lift the cat so far that its head leaves the picture (legacy layouts with shelves on the very top wall row). */
function clampStep(s: ClimbStep): ClimbStep {
  const max = Math.max(0, s.y * T - CAT_HEIGHT_PX - 2);
  return s.lift > max ? { ...s, lift: max } : s;
}

/** Where the cat is `u` hops along a route that starts on the floor at `start` (u = 0 → start, u = route.length → the last step). Includes a small arc per hop. */
export function routePoint(start: ClimbStep, route: readonly ClimbStep[], u: number): ClimbStep {
  const pts = [start, ...route];
  const n = route.length;
  const k = Math.max(0, Math.min(n, u));
  const i = Math.min(n - 1, Math.floor(k));
  const a = pts[i], b = pts[i + 1];
  const f = k - i;
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; // ease in-out
  const arc = k >= n ? 0 : Math.sin(f * Math.PI) * (5 + Math.abs(b.lift - a.lift) * 0.12);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, lift: a.lift + (b.lift - a.lift) * e + arc };
}

const LIFT: Partial<Record<HomeAction, number>> = { sleep: 6, sit: 5, rest: 2, climb: 12, perch: 10, hide: 0, read: 4 };
const POSE: Record<HomeAction, InteractionPlan['pose']> = {
  sleep: 'loaf', sit: 'sit', rest: 'loaf', climb: 'sit', perch: 'sit', hide: 'loaf', read: 'sit',
  scratch: 'stand', play: 'stand', eat: 'stand', inspect: 'stand', wardrobe: 'stand',
  cook: 'stand', dine: 'sit', light: 'stand', display: 'sit', harvest: 'stand', music: 'sit',
};

/** Plan walking to (and using) a piece. null when it has no action or can't be reached. */
export function planInteraction(placed: readonly Placed[], piece: Placed, cat: Cell): InteractionPlan | null {
  const def = decorDef(piece.item);
  if (!def.action) return null;
  const g = solidGrid(placed);
  let best: Cell[] | null = null;
  for (const a of approachCells(piece)) {
    const path = findPath(g, cat, a);
    if (path && (!best || path.length < best.length)) best = path;
  }
  if (!best) return null;
  const end = best[best.length - 1];
  const f = footprint(piece);
  const seat = SEAT_ACTIONS.includes(def.action);
  let spot = { x: end.x + 0.5, y: end.y + 0.5 };
  let facing: InteractionPlan['facing'] = 'down';
  let route: ClimbStep[] | undefined;
  let lift = LIFT[def.action] ?? 0;
  if (seat) {
    const r = def.action === 'climb' || def.action === 'perch' ? climbRoute(piece) : null;
    if (r && r.length) {
      route = r;
      const last = r[r.length - 1];
      spot = { x: last.x, y: last.y };
      lift = last.lift;
    } else if (def.layer === 'wall') spot = { x: f.x + f.w / 2, y: WALL_FEET_Y }; // feet stay on the room's floor plane; lift reaches the shelf
    else if (def.action === 'climb') spot = { x: f.x + 0.5, y: f.y + 0.6 }; // top platform of the cat tree
    else spot = { x: f.x + f.w / 2, y: f.y + f.h / 2 + 0.25 };
    facing = def.action === 'perch' ? 'up' : 'down';
  } else {
    // face the piece
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    facing = Math.abs(cx - (end.x + 0.5)) > Math.abs(cy - (end.y + 0.5)) ? (cx > end.x + 0.5 ? 'right' : 'left') : cy < end.y + 0.5 ? 'up' : 'down';
  }
  return { action: def.action, path: best, spot, lift, pose: POSE[def.action], facing, route };
}

// ---------------------------------------------------------------------------------------------
// Doors and walking paths (decorating rules)
// ---------------------------------------------------------------------------------------------

/**
 * The front door is drawn on the left side wall and its doormat sits on floor tile (0, 4). That tile
 * must stay free, and the cat must be able to walk from there into the rest of the room.
 */
export const ENTRY_TILES: readonly Cell[] = [{ x: 0, y: 4 }];

/** Every floor tile a cat can walk to from the front door. */
export function reachableFromDoor(g: readonly boolean[]): Set<number> {
  const seen = new Set<number>();
  const q: Cell[] = ENTRY_TILES.filter((c) => isWalkable(g, c));
  for (const c of q) seen.add(c.y * ROOM_W + c.x);
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = n.y * ROOM_W + n.x;
      if (!isWalkable(g, n) || seen.has(k)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

/** Free tiles that may be walled in before a placement counts as blocking a path. */
export const POCKET_LIMIT = 3;

export type RoomPlaceCheck = PlaceCheck | 'blocks-door' | 'blocks-path' | 'needs-headroom';

/**
 * The full decorating rule: the geometric rules of `checkPlace`, plus "never block the front door and
 * never seal off a part of the room that could be walked to before". Existing saved layouts are never
 * re-validated with this (sanitizeHome keeps using `checkPlace`), so no old home loses a piece.
 */
export function checkPlaceInRoom(room: readonly Placed[], p: Pick<Placed, 'uid' | 'item' | 'x' | 'y' | 'rot'>): RoomPlaceCheck {
  const base = checkPlace(room, p);
  if (base !== 'ok') return base;
  const def = decorDef(p.item);
  if (needsHeadroom(p.item) && p.y !== WALL_ROWS - 1) return 'needs-headroom'; // a cat on the top shelf must fit inside the picture
  if (def.layer !== 'floor') return 'ok'; // rugs are walkable, wall pieces never touch the floor
  const others = room.filter((o) => o.uid !== p.uid);
  const before = reachableFromDoor(solidGrid(others));
  if (before.size === 0) return 'ok'; // a legacy layout that already has no way in: nothing to protect
  const after = reachableFromDoor(solidGrid([...others, { ...p, placedBy: 'T' } as Placed]));
  if (after.size === 0) return 'blocks-door';
  const f = footprint(p);
  let cutOff = 0;
  for (const k of before) {
    const x = k % ROOM_W, y = Math.floor(k / ROOM_W);
    const covered = x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
    if (!covered && !after.has(k)) cutOff++;
  }
  // a single sealed corner tile is just a corner; sealing off a real part of the room is not allowed
  return cutOff >= POCKET_LIMIT ? 'blocks-path' : 'ok';
}
