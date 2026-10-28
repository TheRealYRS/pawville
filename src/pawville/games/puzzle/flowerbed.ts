/**
 * Flower Beds — a Latin-square logic grid: every row and every column holds each flower once.
 * Generated from a seed and only shown once the solver proves a UNIQUE solution.
 */
import { shuffle, seededRandom, type Rng } from '../shared.ts';

export type BedSize = 4 | 5;

export interface BedPuzzle {
  size: BedSize;
  seed: number;
  givens: (number | null)[];
  solution: number[];
}

export const FLOWERS = ['tulip', 'daisy', 'bluebell', 'sunflower', 'rose'] as const;

function solutionGrid(size: BedSize, rng: Rng): number[] {
  const rows = shuffle([...Array(size).keys()], rng);
  const cols = shuffle([...Array(size).keys()], rng);
  const syms = shuffle([...Array(size).keys()], rng);
  const out: number[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) out.push(syms[(rows[r] + cols[c]) % size]);
  return out;
}

export function countSolutions(size: number, grid: readonly (number | null)[], limit = 2): number {
  const g = grid.slice();
  let count = 0;
  const ok = (i: number, v: number) => {
    const r = Math.floor(i / size);
    const c = i % size;
    for (let k = 0; k < size; k++) {
      if (k !== c && g[r * size + k] === v) return false;
      if (k !== r && g[k * size + c] === v) return false;
    }
    return true;
  };
  const rec = (): void => {
    if (count >= limit) return;
    const i = g.indexOf(null);
    if (i === -1) {
      count++;
      return;
    }
    for (let v = 0; v < size; v++) {
      if (ok(i, v)) {
        g[i] = v;
        rec();
        g[i] = null;
        if (count >= limit) return;
      }
    }
  };
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    if (v !== null && !ok(i, v)) return 0;
  }
  rec();
  return count;
}

export function generateBed(size: BedSize, seed: number): BedPuzzle {
  const rng = seededRandom(seed);
  const solution = solutionGrid(size, rng);
  const givens: (number | null)[] = solution.slice();
  for (const i of shuffle([...givens.keys()], rng)) {
    const keep = givens[i];
    givens[i] = null;
    if (countSolutions(size, givens) !== 1) givens[i] = keep;
  }
  return { size, seed, givens, solution };
}

export function bedConflicts(size: number, grid: readonly (number | null)[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v === null) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    for (let k = 0; k < size; k++) {
      if (k !== c && grid[r * size + k] === v) bad.add(i);
      if (k !== r && grid[k * size + c] === v) bad.add(i);
    }
  }
  return bad;
}

export function isBedSolved(p: BedPuzzle, grid: readonly (number | null)[]): boolean {
  if (grid.length !== p.size * p.size || grid.some((v) => v === null)) return false;
  if (p.givens.some((g, i) => g !== null && grid[i] !== g)) return false;
  return bedConflicts(p.size, grid).size === 0;
}

export function bedHint(p: BedPuzzle, grid: readonly (number | null)[]): number | null {
  const idx = grid.findIndex((v, i) => p.givens[i] === null && v !== p.solution[i]);
  return idx === -1 ? null : idx;
}
