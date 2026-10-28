/** Paw Patterns — "what comes next?" sequence puzzles (fixed set, answers verified in tests). */
export type Glyph = 'paw' | 'leaf' | 'tulip' | 'daisy' | 'sun' | 'moon' | 'star';

export interface Token {
  glyph: Glyph;
  count?: number;
  rot?: 0 | 90 | 180 | 270;
}

export interface PatternPuzzle {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  sequence: (Token | null)[];
  options: Token[];
  answer: number;
  hint: string;
}

export const tokenKey = (t: Token) => `${t.glyph}x${t.count ?? 1}r${t.rot ?? 0}`;
const T = (glyph: Glyph, count?: number, rot?: Token['rot']): Token => ({ glyph, count, rot });

export const PATTERN_PUZZLES: readonly PatternPuzzle[] = [
  { id: 'p1', title: 'Petal waltz', difficulty: 'easy', sequence: [T('tulip'), T('daisy'), T('tulip'), T('daisy'), T('tulip'), null],
    options: [T('tulip'), T('daisy'), T('leaf'), T('sun')], answer: 1, hint: 'Two flowers take turns.' },
  { id: 'p2', title: 'Pairs on the path', difficulty: 'easy', sequence: [T('paw'), T('paw'), T('leaf'), T('leaf'), T('paw'), T('paw'), null],
    options: [T('paw'), T('sun'), T('leaf'), T('daisy')], answer: 2, hint: 'Everything comes in twos.' },
  { id: 'p3', title: 'Day and night', difficulty: 'easy', sequence: [T('sun'), T('moon'), T('star'), T('sun'), T('moon'), null],
    options: [T('sun'), T('star'), T('moon'), T('leaf')], answer: 1, hint: 'A cycle of three.' },
  { id: 'p4', title: 'Turning paw', difficulty: 'medium', sequence: [T('paw', 1, 0), T('paw', 1, 90), T('paw', 1, 180), T('paw', 1, 270), T('paw', 1, 0), null],
    options: [T('paw', 1, 0), T('paw', 1, 180), T('paw', 1, 90), T('paw', 1, 270)], answer: 2, hint: 'The paw turns a quarter clockwise each step.' },
  { id: 'p5', title: 'Growing trail', difficulty: 'medium', sequence: [T('paw', 1), T('paw', 2), T('paw', 3), null],
    options: [T('paw', 3), T('paw', 5), T('paw', 4), T('leaf', 4)], answer: 2, hint: 'One more paw print each time.' },
  { id: 'p6', title: 'The missing bloom', difficulty: 'medium', sequence: [T('tulip'), T('tulip'), T('daisy'), T('tulip'), null, T('daisy')],
    options: [T('daisy'), T('tulip'), T('leaf'), T('star')], answer: 1, hint: 'The pattern repeats every three.' },
  { id: 'p7', title: 'Leaf and bloom count', difficulty: 'hard', sequence: [T('leaf', 1), T('daisy', 2), T('leaf', 3), T('daisy', 4), null],
    options: [T('daisy', 5), T('leaf', 4), T('leaf', 5), T('daisy', 6)], answer: 2, hint: 'Two rules at once: the plant alternates, the count grows.' },
  { id: 'p8', title: 'Mirror pond', difficulty: 'hard', sequence: [T('sun'), T('moon'), T('star'), T('moon'), null],
    options: [T('star'), T('sun'), T('moon'), T('leaf')], answer: 1, hint: 'The row reads the same from both ends.' },
];

export function isPatternAnswer(p: PatternPuzzle, optionIndex: number): boolean {
  return optionIndex === p.answer;
}
