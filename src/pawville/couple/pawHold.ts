/**
 * Paw-holding (pure). Both players consented via the activity coordinator; either can release.
 * Each client steers ONLY its own cat:
 *   - with no input, your cat walks to your side of your partner;
 *   - with input, you walk normally, but slow down if you'd drift too far ahead (coordinated pace);
 *   - if the two cats get separated (walls, teleport, lag) beyond BREAK_DISTANCE, the hold releases.
 * Nobody can be moved by the other player: the partner's position is only ever an input to
 * your own steering, and your own controls always win.
 */
import type { Vec2 } from '../world/geometry.ts';
import type { MoveInput } from '../world/movement.ts';
import type { Role } from './pairModel.ts';

export const SIDE_OFFSET = 13;
export const COMFORT = 6;
export const STRETCH = 26;
export const BREAK_DISTANCE = 70;

export interface HoldStep {
  input: MoveInput;
  speedScale: number;
  release: boolean;
}

export function sideSpot(partner: Vec2, myRole: Role): Vec2 {
  return { x: partner.x + (myRole === 'T' ? -SIDE_OFFSET : SIDE_OFFSET), y: partner.y };
}

export function holdStep(me: Vec2, partner: Vec2, myRole: Role, myInput: MoveInput): HoldStep {
  const spot = sideSpot(partner, myRole);
  const dx = spot.x - me.x;
  const dy = spot.y - me.y;
  const d = Math.hypot(dx, dy);
  if (Math.hypot(me.x - partner.x, me.y - partner.y) > BREAK_DISTANCE) return { input: myInput, speedScale: 1, release: true };
  const hasInput = Math.hypot(myInput.x, myInput.y) > 0.1;
  if (!hasInput) {
    if (d <= COMFORT) return { input: { x: 0, y: 0, run: false }, speedScale: 1, release: false };
    const k = Math.min(1, d / 20);
    return { input: { x: (dx / d) * k, y: (dy / d) * k, run: d > 30 }, speedScale: 1, release: false };
  }
  // Moving: if my input heads away from my spot and I'm already stretched, slow down.
  const away = d > 0 ? -(myInput.x * dx + myInput.y * dy) / d : 0;
  const speedScale = d > STRETCH && away > 0 ? Math.max(0.35, 1 - (d - STRETCH) / 30) : 1;
  return { input: myInput, speedScale, release: false };
}
