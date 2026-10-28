/**
 * Nap Spots — cat deduction. Four cats, four nap spots in a row (left → right). Each puzzle is
 * brute-force checked (24 permutations) to have exactly one solution — see the tests.
 */
export type NapCat = 'T' | 'M' | 'B' | 'G';
export const NAP_CATS: readonly NapCat[] = ['T', 'M', 'B', 'G'];
export const NAP_CAT_NAMES: Record<NapCat, string> = { T: 'Tangerine', M: 'Midnight', B: 'Biscuit', G: 'Mochi' };
export const SPOTS = ['Window seat', 'Sofa', 'Sun patch', 'Basket'] as const;

export type Clue =
  | { type: 'at'; cat: NapCat; spot: number }
  | { type: 'notAt'; cat: NapCat; spot: number }
  | { type: 'leftOf'; a: NapCat; b: NapCat }
  | { type: 'nextTo'; a: NapCat; b: NapCat }
  | { type: 'notNextTo'; a: NapCat; b: NapCat }
  | { type: 'end'; cat: NapCat };

export interface NapPuzzle {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  clues: Clue[];
}

export type Assignment = Partial<Record<NapCat, number>>;

export function clueText(c: Clue): string {
  const n = NAP_CAT_NAMES;
  switch (c.type) {
    case 'at': return `${n[c.cat]} naps on the ${SPOTS[c.spot].toLowerCase()}.`;
    case 'notAt': return `${n[c.cat]} is not on the ${SPOTS[c.spot].toLowerCase()}.`;
    case 'leftOf': return `${n[c.a]} naps somewhere to the left of ${n[c.b]}.`;
    case 'nextTo': return `${n[c.a]} naps right next to ${n[c.b]}.`;
    case 'notNextTo': return `${n[c.a]} and ${n[c.b]} are not next to each other.`;
    case 'end': return `${n[c.cat]} naps at one end of the row.`;
  }
}

export function clueHolds(c: Clue, a: Required<Assignment>): boolean {
  switch (c.type) {
    case 'at': return a[c.cat] === c.spot;
    case 'notAt': return a[c.cat] !== c.spot;
    case 'leftOf': return a[c.a] < a[c.b];
    case 'nextTo': return Math.abs(a[c.a] - a[c.b]) === 1;
    case 'notNextTo': return Math.abs(a[c.a] - a[c.b]) !== 1;
    case 'end': return a[c.cat] === 0 || a[c.cat] === SPOTS.length - 1;
  }
}

function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export function solveNap(clues: readonly Clue[]): Required<Assignment>[] {
  return permutations([0, 1, 2, 3]).map((p) => ({ T: p[0], M: p[1], B: p[2], G: p[3] })).filter((a) => clues.every((c) => clueHolds(c, a)));
}

export function isComplete(a: Assignment): a is Required<Assignment> {
  const spots = NAP_CATS.map((c) => a[c]);
  return spots.every((s) => typeof s === 'number') && new Set(spots).size === NAP_CATS.length;
}

export function brokenClues(p: NapPuzzle, a: Assignment): number[] {
  if (!isComplete(a)) return [];
  return p.clues.map((c, i) => (clueHolds(c, a) ? -1 : i)).filter((i) => i >= 0);
}

export const NAP_PUZZLES: readonly NapPuzzle[] = [
  { id: 'n1', title: 'Lazy afternoon', difficulty: 'easy', clues: [
    { type: 'at', cat: 'T', spot: 2 }, { type: 'end', cat: 'G' }, { type: 'leftOf', a: 'G', b: 'M' }, { type: 'nextTo', a: 'B', b: 'T' }, { type: 'notAt', cat: 'B', spot: 1 },
  ] },
  { id: 'n2', title: 'Rainy day', difficulty: 'medium', clues: [
    { type: 'end', cat: 'M' }, { type: 'nextTo', a: 'T', b: 'M' }, { type: 'leftOf', a: 'B', b: 'G' }, { type: 'notAt', cat: 'M', spot: 3 }, { type: 'notNextTo', a: 'T', b: 'G' },
  ] },
  { id: 'n3', title: 'Who took the sun patch?', difficulty: 'hard', clues: [
    { type: 'notNextTo', a: 'T', b: 'M' }, { type: 'leftOf', a: 'G', b: 'T' }, { type: 'notAt', cat: 'B', spot: 0 }, { type: 'notAt', cat: 'T', spot: 3 }, { type: 'nextTo', a: 'B', b: 'M' },
  ] },
];
