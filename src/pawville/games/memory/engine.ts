/**
 * Memory Paws rules (pure).
 * - Every board contains each face exactly twice (shuffled with an injectable RNG). Cards are
 *   matched by face id; each face id belongs to exactly one pair.
 * - Up to two unmatched cards can be face up. A second flip counts one move.
 * - A pair stays matched. A mismatch locks input until `resolveMismatch`.
 * - Optional 2-player (pass & play) mode: a match scores a point and keeps the turn; a mismatch
 *   passes the turn after it is resolved.
 */
import { shuffle, type Rng } from '../shared.ts';

export type MemoryLevel = 'easy' | 'medium' | 'hard';

export const LEVELS: Record<MemoryLevel, { pairs: number; cols: number; label: string }> = {
  easy: { pairs: 6, cols: 4, label: 'Easy · 12 cards' },
  medium: { pairs: 10, cols: 5, label: 'Medium · 20 cards' },
  hard: { pairs: 15, cols: 6, label: 'Hard · 30 cards' },
};

export type CatFaceAccessory = 'none' | 'crown' | 'bow' | 'wizard' | 'bell';
export type CardFace =
  | { kind: 'cat'; id: string; cat: 'T' | 'M'; accessory: CatFaceAccessory; mood: 'happy' | 'surprised' | 'playful' | 'thinking'; label: string }
  | { kind: 'item'; id: string; item: 'fish' | 'yarn' | 'paw'; label: string };

export const FACES: readonly CardFace[] = [
  { kind: 'cat', id: 't-plain', cat: 'T', accessory: 'none', mood: 'happy', label: 'Tangerine' },
  { kind: 'cat', id: 't-crown', cat: 'T', accessory: 'crown', mood: 'happy', label: 'Tangerine with a crown' },
  { kind: 'cat', id: 't-bow', cat: 'T', accessory: 'bow', mood: 'playful', label: 'Tangerine with a bow' },
  { kind: 'cat', id: 't-wizard', cat: 'T', accessory: 'wizard', mood: 'thinking', label: 'Tangerine the wizard' },
  { kind: 'cat', id: 't-bell', cat: 'T', accessory: 'bell', mood: 'happy', label: 'Tangerine with a bell' },
  { kind: 'cat', id: 't-surprised', cat: 'T', accessory: 'none', mood: 'surprised', label: 'Surprised Tangerine' },
  { kind: 'cat', id: 'm-plain', cat: 'M', accessory: 'none', mood: 'happy', label: 'Midnight' },
  { kind: 'cat', id: 'm-crown', cat: 'M', accessory: 'crown', mood: 'happy', label: 'Midnight with a crown' },
  { kind: 'cat', id: 'm-bow', cat: 'M', accessory: 'bow', mood: 'playful', label: 'Midnight with a bow' },
  { kind: 'cat', id: 'm-wizard', cat: 'M', accessory: 'wizard', mood: 'thinking', label: 'Midnight the wizard' },
  { kind: 'cat', id: 'm-bell', cat: 'M', accessory: 'bell', mood: 'happy', label: 'Midnight with a bell' },
  { kind: 'cat', id: 'm-surprised', cat: 'M', accessory: 'none', mood: 'surprised', label: 'Surprised Midnight' },
  { kind: 'item', id: 'fish', item: 'fish', label: 'A fish' },
  { kind: 'item', id: 'yarn', item: 'yarn', label: 'A ball of yarn' },
  { kind: 'item', id: 'paw', item: 'paw', label: 'A golden paw' },
];

export interface MemoryCard {
  key: number;
  face: string;
}

export interface MemoryState {
  level: MemoryLevel;
  cards: MemoryCard[];
  faceUp: number[];
  matched: number[];
  moves: number;
  locked: boolean;
  lastResult: 'match' | 'mismatch' | null;
  players: 1 | 2;
  turn: 0 | 1;
  scores: [number, number];
}

export function facesForLevel(level: MemoryLevel, rng: Rng): string[] {
  return shuffle(FACES.map((f) => f.id), rng).slice(0, LEVELS[level].pairs);
}

export function createMemory(level: MemoryLevel, rng: Rng, players: 1 | 2 = 1): MemoryState {
  const faces = facesForLevel(level, rng);
  const deck = shuffle([...faces, ...faces], rng).map((face, key) => ({ key, face }));
  return { level, cards: deck, faceUp: [], matched: [], moves: 0, locked: false, lastResult: null, players, turn: 0, scores: [0, 0] };
}

export function flipCard(s: MemoryState, index: number): MemoryState {
  if (s.locked || index < 0 || index >= s.cards.length) return s;
  if (s.matched.includes(index) || s.faceUp.includes(index) || s.faceUp.length >= 2) return s;
  const faceUp = [...s.faceUp, index];
  if (faceUp.length < 2) return { ...s, faceUp, lastResult: null };
  const [a, b] = faceUp;
  const moves = s.moves + 1;
  if (s.cards[a].face === s.cards[b].face) {
    const scores: [number, number] = [...s.scores];
    scores[s.turn] += 1;
    return { ...s, faceUp: [], matched: [...s.matched, a, b], moves, lastResult: 'match', scores };
  }
  return { ...s, faceUp, moves, locked: true, lastResult: 'mismatch' };
}

export function resolveMismatch(s: MemoryState): MemoryState {
  if (!s.locked) return s;
  return { ...s, faceUp: [], locked: false, turn: s.players === 2 ? ((1 - s.turn) as 0 | 1) : s.turn };
}

export function isComplete(s: MemoryState): boolean {
  return s.matched.length === s.cards.length;
}

export function pairsFound(s: MemoryState): number {
  return s.matched.length / 2;
}

export function memoryWinner(s: MemoryState): 0 | 1 | 'tie' | null {
  if (!isComplete(s) || s.players === 1) return null;
  return s.scores[0] === s.scores[1] ? 'tie' : s.scores[0] > s.scores[1] ? 0 : 1;
}
