/**
 * Puzzle rules (Milestone 6) — pure and unit tested. The UI lives in components/AdventurePanels.
 */
export const LENS_SYMBOLS = ['sun', 'moon', 'star', 'wave'] as const;
export type LensSymbol = (typeof LENS_SYMBOLS)[number];
/** Inner, middle, outer ring = the boats north → south: star, moon, sun. */
export const LENS_SOLUTION: readonly LensSymbol[] = ['star', 'moon', 'sun'];

export function rotateRing(rings: readonly number[], i: number, dir = 1): number[] {
  return rings.map((r, k) => (k === i ? (r + dir + LENS_SYMBOLS.length) % LENS_SYMBOLS.length : r));
}
export function lensSolved(rings: readonly number[]): boolean {
  return rings.length === 3 && rings.every((r, i) => LENS_SYMBOLS[r] === LENS_SOLUTION[i]);
}

/** The constellation board: 12 stars on a 4 x 3 grid (x, y in 0..1). */
export const SKY_STARS: readonly { id: number; x: number; y: number }[] = [
  { id: 0, x: 0.12, y: 0.18 }, { id: 1, x: 0.38, y: 0.12 }, { id: 2, x: 0.62, y: 0.1 }, { id: 3, x: 0.88, y: 0.2 },
  { id: 4, x: 0.18, y: 0.5 }, { id: 5, x: 0.4, y: 0.45 }, { id: 6, x: 0.6, y: 0.48 }, { id: 7, x: 0.84, y: 0.52 },
  { id: 8, x: 0.1, y: 0.84 }, { id: 9, x: 0.42, y: 0.8 }, { id: 10, x: 0.58, y: 0.82 }, { id: 11, x: 0.9, y: 0.86 },
];
/** Lumi's pattern: a top star, two wings, two feet. */
export const LUMI_SOLUTION: readonly number[] = [2, 4, 7, 9, 10].sort((a, b) => a - b);

export function toggleStar(sel: readonly number[], id: number, max = 5): number[] {
  if (sel.includes(id)) return sel.filter((s) => s !== id);
  if (sel.length >= max) return [...sel];
  return [...sel, id];
}
export function constellationSolved(sel: readonly number[]): boolean {
  const s = [...sel].sort((a, b) => a - b);
  return s.length === LUMI_SOLUTION.length && s.every((v, i) => v === LUMI_SOLUTION[i]);
}

/** Two plates / pedestals pressed at once: by a cat standing on each, or by a placed stone. */
export function platesPressed(
  plates: readonly { id: string; x: number; y: number }[],
  cats: readonly { x: number; y: number }[],
  stones: ReadonlySet<string>,
  radius = 9,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of plates) out[p.id] = stones.has(p.id) || cats.some((c) => Math.hypot(c.x - p.x, c.y - p.y) <= radius);
  return out;
}

/** Fishing: what bites depends on the place, the time and the weather (no grinding, no failure cost). */
export function fishFor(place: 'harbor' | 'cove', night: boolean, rainy: boolean, roll: number): string {
  if (place === 'cove') return roll < 0.5 ? 'fish-koi' : night ? 'fish-moonfish' : 'fish-goldfish';
  if (night && roll < 0.55) return 'fish-lanternfish';
  if (rainy && roll < 0.35) return 'fish-raincarp';
  return roll < 0.75 ? 'fish-herring' : 'fish-sardine';
}
