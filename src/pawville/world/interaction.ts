/** Interaction targeting + camera maths for the town. Pure and unit tested. */
import { clamp, distance, type Vec2 } from './geometry.ts';

/** Anything the player can stand near and interact with. */
export interface Targetable {
  id: string;
  point: Vec2;
  radius: number;
}

export interface InteractionTarget<T extends Targetable> {
  item: T;
  distance: number;
}

/** The closest item whose radius contains the player's feet (and that is currently available). */
export function findInteractable<T extends Targetable>(pos: Vec2, items: readonly T[], available: (t: T) => boolean = () => true): InteractionTarget<T> | null {
  let best: InteractionTarget<T> | null = null;
  for (const item of items) {
    const d = distance(pos, item.point);
    if (d > item.radius || !available(item)) continue;
    if (!best || d < best.distance) best = { item, distance: d };
  }
  return best;
}

/** Prompt hysteresis: keep the current target until the player is a few pixels beyond its radius. */
export function stickyInteractable<T extends Targetable>(
  pos: Vec2,
  items: readonly T[],
  currentId: string | null,
  available: (t: T) => boolean = () => true,
  slack = 6,
): InteractionTarget<T> | null {
  const found = findInteractable(pos, items, available);
  if (found || !currentId) return found;
  const current = items.find((i) => i.id === currentId);
  if (!current || !available(current)) return null;
  const d = distance(pos, current.point);
  return d <= current.radius + slack ? { item: current, distance: d } : null;
}

export interface Viewport {
  w: number;
  h: number;
}

/** Top-left camera position centred on `target`, clamped to the world (or centred if the world is smaller). */
export function cameraFor(target: Vec2, view: Viewport, world: Viewport): Vec2 {
  const axis = (t: number, v: number, w: number) => (v >= w ? Math.round((w - v) / 2) : Math.round(clamp(t - v / 2, 0, w - v)));
  return { x: axis(target.x, view.w, world.w), y: axis(target.y - 8, view.h, world.h) };
}

/** Eases the camera towards its target so movement and teleports feel smooth. */
export function smoothCamera(current: Vec2, target: Vec2, dtSeconds: number, snapDistance = 200): Vec2 {
  if (distance(current, target) > snapDistance) return { ...target };
  const k = 1 - Math.exp(-Math.max(0, dtSeconds) * 10);
  return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}

/**
 * Milestone 8.1: integer camera position derived *relative to the followed cat*.
 * Root cause of the 1px walking jitter: the cat was drawn at round(cat.x) and the camera at round(cam.x),
 * rounded independently; while the camera eased behind the cat the difference flickered between two values.
 * Rounding the cat→camera offset once keeps the cat's screen position stable while the world scrolls.
 */
export function snapCamera(cam: Vec2, follow: Vec2): Vec2 {
  const ox = Math.round(follow.x - cam.x), oy = Math.round(follow.y - cam.y);
  return { x: Math.round(follow.x) - ox, y: Math.round(follow.y) - oy };
}

/** Integer zoom so pixel art stays crisp: ~2× on phones, 3× on laptops, 4× on big screens. */
export function pixelScaleFor(cssW: number, cssH: number): number {
  const s = Math.floor(Math.min(cssW / 360, cssH / 220));
  return clamp(s, 2, 4);
}
