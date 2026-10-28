/** Puzzle Garden catalogue + the daily puzzle (same for everyone on the same calendar day). */
import { daySeed } from '../../destinations.ts';
import { generateBed, type BedSize } from './flowerbed.ts';
import { NAP_PUZZLES } from './napspots.ts';
import { PATTERN_PUZZLES } from './patterns.ts';

export type PuzzleKind = 'pattern' | 'bed' | 'nap';

export interface PuzzleRef {
  key: string;
  kind: PuzzleKind;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const BEDS: { size: BedSize; seed: number; title: string; difficulty: PuzzleRef['difficulty'] }[] = [
  { size: 4, seed: 11, title: 'Sprout bed I', difficulty: 'easy' },
  { size: 4, seed: 12, title: 'Sprout bed II', difficulty: 'easy' },
  { size: 5, seed: 21, title: 'Bloom bed I', difficulty: 'medium' },
  { size: 5, seed: 22, title: 'Bloom bed II', difficulty: 'hard' },
];

export const CATEGORIES: { kind: PuzzleKind; title: string; blurb: string; puzzles: PuzzleRef[] }[] = [
  { kind: 'pattern', title: 'Paw Patterns', blurb: 'Spot the rule in a trail of prints and petals, then pick what comes next.',
    puzzles: PATTERN_PUZZLES.map((p) => ({ key: `pattern:${p.id}`, kind: 'pattern' as const, title: p.title, difficulty: p.difficulty })) },
  { kind: 'bed', title: 'Flower Beds', blurb: 'Plant every row and column with one of each flower. A calm grid of logic.',
    puzzles: BEDS.map((b) => ({ key: `bed:${b.size}:${b.seed}`, kind: 'bed' as const, title: b.title, difficulty: b.difficulty })) },
  { kind: 'nap', title: 'Nap Spots', blurb: 'Four sleepy cats, four cosy spots. Read the clues and tuck everyone in.',
    puzzles: NAP_PUZZLES.map((p) => ({ key: `nap:${p.id}`, kind: 'nap' as const, title: p.title, difficulty: p.difficulty })) },
];

export function findPuzzle(key: string): PuzzleRef | undefined {
  return CATEGORIES.flatMap((c) => c.puzzles).find((p) => p.key === key);
}

export function dailyPuzzle(day: string): PuzzleRef {
  const seed = daySeed(day);
  const kind = (['pattern', 'bed', 'nap'] as const)[seed % 3];
  if (kind === 'pattern') {
    const p = PATTERN_PUZZLES[Math.floor(seed / 3) % PATTERN_PUZZLES.length];
    return { key: `daily:${day}:pattern:${p.id}`, kind, title: `Daily · ${p.title}`, difficulty: p.difficulty };
  }
  if (kind === 'nap') {
    const p = NAP_PUZZLES[Math.floor(seed / 3) % NAP_PUZZLES.length];
    return { key: `daily:${day}:nap:${p.id}`, kind, title: `Daily · ${p.title}`, difficulty: p.difficulty };
  }
  const size: BedSize = (seed >> 4) % 2 === 0 ? 4 : 5;
  const bedSeed = 100000 + (seed % 900000);
  return { key: `daily:${day}:bed:${size}:${bedSeed}`, kind, title: `Daily · ${size === 4 ? 'Sprout' : 'Bloom'} bed`, difficulty: size === 4 ? 'easy' : 'medium' };
}

export function puzzleData(key: string):
  | { kind: 'pattern'; id: string }
  | { kind: 'nap'; id: string }
  | { kind: 'bed'; puzzle: ReturnType<typeof generateBed> }
  | null {
  const parts = key.startsWith('daily:') ? key.split(':').slice(2) : key.split(':');
  if (parts[0] === 'pattern' && PATTERN_PUZZLES.some((p) => p.id === parts[1])) return { kind: 'pattern', id: parts[1] };
  if (parts[0] === 'nap' && NAP_PUZZLES.some((p) => p.id === parts[1])) return { kind: 'nap', id: parts[1] };
  if (parts[0] === 'bed') {
    const size = Number(parts[1]);
    const seed = Number(parts[2]);
    if ((size === 4 || size === 5) && Number.isInteger(seed)) return { kind: 'bed', puzzle: generateBed(size, seed) };
  }
  return null;
}
