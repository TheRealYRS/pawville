/** Original PawType passages (written for Pawville; no third-party text). */
export type PassageLength = 'short' | 'medium' | 'long';
export type PassageTheme = 'everyday' | 'cats' | 'punctuation';

export interface Passage {
  id: string;
  length: PassageLength;
  theme: PassageTheme;
  text: string;
}

export const PASSAGES: readonly Passage[] = [
  { id: 's1', length: 'short', theme: 'cats', text: 'Tangerine naps in the warm sun by the fountain.' },
  { id: 's2', length: 'short', theme: 'everyday', text: 'The lamps glow softly as the town settles down for the night.' },
  { id: 's3', length: 'short', theme: 'cats', text: 'Midnight tiptoes across the dock without making a sound.' },
  { id: 's4', length: 'short', theme: 'everyday', text: 'A small boat bobs in the harbor, waiting for the morning tide.' },
  { id: 'm1', length: 'medium', theme: 'cats', text: 'Every cat in Pawville has a favourite bench. Tangerine likes the one closest to the fountain, where the spray keeps the stones cool on summer afternoons.' },
  { id: 'm2', length: 'medium', theme: 'everyday', text: 'The greenhouse smells of wet soil and tomato leaves. Rows of seedlings lean towards the glass, and a watering can drips quietly by the door.' },
  { id: 'm3', length: 'medium', theme: 'cats', text: 'Midnight keeps a list of the best places to watch the stars: the harbor wall, the arcade roof, and the top step of the old garden path.' },
  { id: 'm4', length: 'medium', theme: 'everyday', text: 'When the arcade lights flicker on, the whole street turns orange. Friends gather by the door to argue about who will win the first match.' },
  { id: 'p1', length: 'medium', theme: 'punctuation', text: '"Ready?" asked Midnight. "Always," said Tangerine, stretching one paw, then the other; the race was about to begin!' },
  { id: 'p2', length: 'medium', theme: 'punctuation', text: 'Shopping list: fish (two), yarn (blue, not green), and a tiny bell. Total cost? Three coins, maybe four.' },
  { id: 'p3', length: 'short', theme: 'punctuation', text: "It's 7:45 a.m., the fountain's on, and the bakery's open." },
  { id: 'l1', length: 'long', theme: 'cats', text: 'Nobody remembers who built the Typing Arena, but every cat in town has raced there at least once. The track is short, the crowd is loud, and the finish banner flaps whenever someone crosses the line. Tangerine trains every morning; Midnight claims not to train at all, which nobody believes.' },
  { id: 'l2', length: 'long', theme: 'everyday', text: 'At the edge of town, the harbor wakes up before anyone else. Ropes are coiled, nets are checked, and the gulls circle patiently. By the time the bakery opens, the first boats have already returned, and the smell of fresh bread drifts down to the water to meet them.' },
  { id: 'l3', length: 'long', theme: 'punctuation', text: 'The rules of the garden are simple: walk on the paths, not the beds; water in the evening, not at noon; and never, ever chase the butterflies (they always win). Visitors who follow them are welcome to stay as long as they like.' },
];

export function passagesBy(length: PassageLength | 'any'): Passage[] {
  return PASSAGES.filter((p) => length === 'any' || p.length === length);
}
