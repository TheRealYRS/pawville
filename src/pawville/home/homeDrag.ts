/**
 * Drag-and-drop helpers for decorating (pure, tested). The room is a 12×8 grid; the pointer is somewhere over it;
 * these turn "pointer at (x, y)" into "this piece's top-left tile", so the piece follows the pointer the way you
 * would expect (the pointer holds the middle of the piece, and the piece is kept inside the room).
 */
import { ROOM_H, ROOM_W, WALL_ROWS, decorDef, type DecorId } from './decor.ts';
import { needsHeadroom, type Cell } from './homeWalk.ts';

export interface RectLike { left: number; top: number; width: number; height: number }

/** The room tile under a screen point, or null when the point is outside the grid. */
export function cellAt(grid: RectLike, x: number, y: number): Cell | null {
  if (grid.width <= 0 || grid.height <= 0) return null;
  const fx = (x - grid.left) / grid.width, fy = (y - grid.top) / grid.height;
  if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null;
  return { x: Math.floor(fx * ROOM_W), y: Math.floor(fy * ROOM_H) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Footprint size of an item at a rotation. */
export function sizeOf(item: DecorId, rot: 0 | 90): { w: number; h: number } {
  const d = decorDef(item);
  return rot === 90 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/**
 * Top-left tile for a piece held at `cell`: the pointer holds the piece's middle, then the piece is kept inside the
 * room and on the right part of it (wall pieces on the wall, everything else on the floor). Pieces a cat has to sit on
 * (climbing shelves, window perch) always snap to the lower wall row so the cat fits.
 */
export function dropOrigin(item: DecorId, rot: 0 | 90, cell: Cell): Cell {
  const d = decorDef(item);
  const { w, h } = sizeOf(item, rot);
  const x = clamp(cell.x - Math.floor(w / 2), 0, ROOM_W - w);
  if (d.layer === 'wall') {
    const y = needsHeadroom(item) ? WALL_ROWS - h : clamp(cell.y - Math.floor(h / 2), 0, WALL_ROWS - h);
    return { x, y: Math.max(0, y) };
  }
  return { x, y: clamp(cell.y - Math.floor(h / 2), WALL_ROWS, ROOM_H - h) };
}

/** Small moves are clicks, bigger ones are drags. */
export const DRAG_THRESHOLD_PX = 6;
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;

/** The undo history keeps the last `max` states (oldest dropped). */
export function pushHistory<T>(hist: readonly T[], state: T, max = 30): T[] {
  const next = [...hist, state];
  return next.length > max ? next.slice(next.length - max) : next;
}
