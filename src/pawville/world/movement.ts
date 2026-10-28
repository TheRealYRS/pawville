/**
 * Cat movement: input -> velocity (with acceleration), axis-separated collision against
 * solid rectangles, and world-bound clamping. Pure functions, unit tested in tests/.
 */
import { clamp, rectsOverlap, type Rect, type Vec2 } from './geometry.ts';

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface MoveInput {
  x: number;
  y: number;
  run: boolean;
}

export interface Body {
  pos: Vec2;
  vel: Vec2;
  facing: Facing;
  moving: boolean;
}

export interface CollisionWorld {
  bounds: Rect;
  solids: readonly Rect[];
}

export const MOVEMENT = {
  walkSpeed: 80,
  runSpeed: 128,
  accel: 950,
  decel: 1300,
  hitboxW: 10,
  hitboxH: 6,
  maxStep: 4,
  maxDt: 0.05,
  deadZone: 0.12,
} as const;

export const KEY_BINDINGS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter', 'Space'],
} as const;

export function inputFromKeys(pressed: ReadonlySet<string>): MoveInput {
  const any = (codes: readonly string[]) => codes.some((c) => pressed.has(c));
  const x = (any(KEY_BINDINGS.right) ? 1 : 0) - (any(KEY_BINDINGS.left) ? 1 : 0);
  const y = (any(KEY_BINDINGS.down) ? 1 : 0) - (any(KEY_BINDINGS.up) ? 1 : 0);
  const n = normalizeInput(x, y);
  return { x: n.x, y: n.y, run: any(KEY_BINDINGS.run) };
}

export function normalizeInput(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len < MOVEMENT.deadZone) return { x: 0, y: 0 };
  if (len > 1) return { x: x / len, y: y / len };
  return { x, y };
}

export function combineInputs(a: MoveInput, b: MoveInput): MoveInput {
  const pick = Math.hypot(a.x, a.y) >= Math.hypot(b.x, b.y) ? a : b;
  return { x: pick.x, y: pick.y, run: a.run || b.run };
}

export function hitboxAt(pos: Vec2): Rect {
  return { x: pos.x - MOVEMENT.hitboxW / 2, y: pos.y - MOVEMENT.hitboxH, w: MOVEMENT.hitboxW, h: MOVEMENT.hitboxH };
}

export function collides(pos: Vec2, world: CollisionWorld): boolean {
  const box = hitboxAt(pos);
  return world.solids.some((s) => rectsOverlap(box, s));
}

export function clampToBounds(pos: Vec2, bounds: Rect): Vec2 {
  const hw = MOVEMENT.hitboxW / 2;
  return {
    x: clamp(pos.x, bounds.x + hw, bounds.x + bounds.w - hw),
    y: clamp(pos.y, bounds.y + MOVEMENT.hitboxH, bounds.y + bounds.h),
  };
}

const EPS = 0.001;

function sweepAxis(pos: Vec2, delta: number, axis: 'x' | 'y', world: CollisionWorld): { pos: Vec2; blocked: boolean } {
  if (delta === 0) return { pos, blocked: false };
  const next = axis === 'x' ? { x: pos.x + delta, y: pos.y } : { x: pos.x, y: pos.y + delta };
  const box = hitboxAt(next);
  let blocked = false;
  for (const s of world.solids) {
    if (!rectsOverlap(box, s)) continue;
    blocked = true;
    if (axis === 'x') next.x = delta > 0 ? s.x - MOVEMENT.hitboxW / 2 - EPS : s.x + s.w + MOVEMENT.hitboxW / 2 + EPS;
    else next.y = delta > 0 ? s.y - EPS : s.y + s.h + MOVEMENT.hitboxH + EPS;
    box.x = next.x - MOVEMENT.hitboxW / 2;
    box.y = next.y - MOVEMENT.hitboxH;
  }
  return { pos: next, blocked };
}

/** Moves a hitbox by `delta`, resolving X then Y so the cat slides along walls; sub-steps prevent tunnelling. */
export function moveAndCollide(pos: Vec2, delta: Vec2, world: CollisionWorld): { pos: Vec2; blockedX: boolean; blockedY: boolean } {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / MOVEMENT.maxStep));
  let p = pos;
  let blockedX = false;
  let blockedY = false;
  for (let i = 0; i < steps; i++) {
    const rx = sweepAxis(p, delta.x / steps, 'x', world);
    p = rx.pos;
    blockedX ||= rx.blocked;
    const ry = sweepAxis(p, delta.y / steps, 'y', world);
    p = ry.pos;
    blockedY ||= ry.blocked;
  }
  const clamped = clampToBounds(p, world.bounds);
  if (clamped.x !== p.x) blockedX = true;
  if (clamped.y !== p.y) blockedY = true;
  return { pos: clamped, blockedX, blockedY };
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/**
 * Milestone 10: facing with hysteresis. Near a diagonal (joystick at ~45°) the old rule flipped
 * between a side and a front/back sprite every frame. Now the current axis is kept until the other
 * axis clearly dominates (25%); from a standstill, diagonals still choose the side view.
 */
export function facingFor(x: number, y: number, previous: Facing): Facing {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax < 0.01 && ay < 0.01) return previous;
  const wasSide = previous === 'left' || previous === 'right';
  const side = wasSide ? ax * 1.25 >= ay : ax >= ay * 1.25;
  if (side) return x > 0 ? 'right' : 'left';
  if (ay < 0.01) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

/** `speedScale` lets paw-holding match the partner's pace (1 = normal). */
export function stepBody(body: Body, input: MoveInput, dtSeconds: number, world: CollisionWorld, speedScale = 1): Body {
  const dt = clamp(dtSeconds, 0, MOVEMENT.maxDt);
  const dir = normalizeInput(input.x, input.y);
  const speed = (input.run ? MOVEMENT.runSpeed : MOVEMENT.walkSpeed) * clamp(speedScale, 0, 1.5);
  const target = { x: dir.x * speed, y: dir.y * speed };
  const hasInput = dir.x !== 0 || dir.y !== 0;
  const rate = (hasInput ? MOVEMENT.accel : MOVEMENT.decel) * dt;
  const vel = { x: approach(body.vel.x, target.x, rate), y: approach(body.vel.y, target.y, rate) };
  const moved = moveAndCollide(body.pos, { x: vel.x * dt, y: vel.y * dt }, world);
  if (moved.blockedX) vel.x = 0;
  if (moved.blockedY) vel.y = 0;
  return {
    pos: moved.pos,
    vel,
    facing: facingFor(hasInput ? dir.x : 0, hasInput ? dir.y : 0, body.facing),
    moving: Math.hypot(vel.x, vel.y) > 6,
  };
}

export function findFreeSpot(wanted: Vec2, world: CollisionWorld): Vec2 {
  const start = clampToBounds(wanted, world.bounds);
  if (!collides(start, world)) return start;
  for (let radius = 4; radius <= 160; radius += 4) {
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2 + Math.PI / 2;
      const p = clampToBounds({ x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius }, world.bounds);
      if (!collides(p, world)) return p;
    }
  }
  return start;
}
