/**
 * Milestone 8.1: where a cat sits for a "bench" spot.
 * Root cause of cats buried in benches/gazebos: `sitAt` put the cat at `spot.y - 13` = prop.y - 1, i.e. one
 * pixel *behind* the prop's baseline, so the y-sorted renderer drew the bench over the cat.
 * Now the seat is resolved from the actual prop: the cat's baseline is 1px in front of the prop (drawn after it)
 * and `lift` raises the sitting sprite onto the seat surface measured from the prop art.
 */
export interface SeatProp { kind: string; x: number; y: number; variant?: number }
export interface Seat { x: number; y: number; lift: number; facing: 'down' | 'up' }

/** Seat-surface height above the prop baseline, in pixels (from the sprite art). */
export const SEAT_HEIGHT: Readonly<Record<string, number>> = {
  bench: 8, parkbench: 7, gazebo: 5, windowseat: 6, cafetable: 0, picnicblanket0: 0, picnicblanket1: 0, picnic: 0,
};
const SEAT_KINDS = Object.keys(SEAT_HEIGHT);

export function seatFor(point: { x: number; y: number }, props: readonly SeatProp[]): Seat {
  let best: SeatProp | null = null, bd = 30;
  for (const p of props) {
    const k = p.kind === 'picnicblanket' ? 'picnic' : p.kind;
    if (!SEAT_KINDS.includes(k)) continue;
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return { x: point.x, y: point.y - 8, lift: 0, facing: 'down' };
  const h = SEAT_HEIGHT[best.kind] ?? 0;
  // tables: sit on the chair in front of the table, not on the tabletop
  if (best.kind === 'cafetable') return { x: best.x, y: best.y + 6, lift: 0, facing: 'down' };
  return { x: best.x, y: best.y + 1, lift: h, facing: best.kind === 'bench' && best.y > 336 && best.y < 405 ? 'up' : 'down' };
}

/** Where the cat stands after getting up: just below the seat, clear of the prop's collider. */
export function standPoint(seat: { x: number; y: number }): { x: number; y: number } {
  return { x: seat.x, y: seat.y + 12 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Multi-seat furniture. A bench is a place for a COUPLE: every seat has its own position and its own occupancy
// (net/occupancy.ts). Before, `seatFor` returned one point at the middle of the bench, so a second cat sat exactly on the first.
// ---------------------------------------------------------------------------------------------------------------------
/** Seat centres across each kind of furniture, as x offsets from its middle. Two cats side by side need 18 px between centres
 *  (a sitting cat's sprite is up to 18 px wide, whiskers included — measured with the software rasteriser in the tests). */
export const SEAT_X_OFFSETS: Readonly<Record<string, readonly number[]>> = {
  bench: [-9, 9], parkbench: [-9, 9], windowseat: [-9, 9], picnic: [-9, 9], picnicblanket0: [-9, 9], picnicblanket1: [-9, 9],
  gazebo: [-14, 14], cafetable: [0],
};
export interface SeatSlot extends Seat { index: number }

/** Every seat of the piece of furniture nearest to `point` (the first is the old single seat's side). */
export function seatSlots(point: { x: number; y: number }, props: readonly SeatProp[]): SeatSlot[] {
  const base = seatFor(point, props);
  let best: SeatProp | null = null, bd = 30;
  for (const p of props) {
    const k = p.kind === 'picnicblanket' ? 'picnic' : p.kind;
    if (!SEAT_KINDS.includes(k)) continue;
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bd) { bd = d; best = p; }
  }
  const offsets = (best && (SEAT_X_OFFSETS[best.kind === 'picnicblanket' ? 'picnic' : best.kind] ?? [0])) ?? [0];
  return offsets.map((dx, index) => ({ ...base, x: base.x + dx, index }));
}
