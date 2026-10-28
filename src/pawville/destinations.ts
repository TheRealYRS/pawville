/**
 * Game registry + destinations. The single place that decides what is advertised as playable and
 * how each game is reached. Adding a game: write its page, add an entry here and a case in
 * App.tsx's page table — town panels, the Event Board and the Places menu pick it up.
 */
import type { DestinationId } from './world/townMap.ts';

/**
 * Milestone 7: Cat Battleship was retired from the playable catalogue (its rules module and tests
 * stay in the repository, unused). PawType moved into the arcade.
 */
export type GameId = 'paw-vs-paw' | 'pawtype' | 'cat-boxing' | 'memory-paws' | 'puzzle-garden' | 'whack-a-cat' | 'paw-snap';
export type RoutedGameId = Exclude<GameId, 'paw-vs-paw'>;

export interface GameEntry {
  id: GameId;
  title: string;
  tagline: string;
  status: 'playable';
  route: string;
  destination: DestinationId;
  description: string;
  modes: readonly string[];
  /** Two-player modes and how they connect. Honest about what is online vs local. */
  together: string;
}

export const PATHS = {
  town: '/',
  townAlias: '/town',
  arcade: '/arcade',
  home: '/home',
  scrapbook: '/scrapbook',
  game: (id: RoutedGameId) => `/games/${id}`,
} as const;

export const GAMES: readonly GameEntry[] = [
  {
    id: 'paw-vs-paw', title: 'Paw vs Paw', tagline: 'Tangerine vs Midnight. Two cats, nine squares.', status: 'playable', route: PATHS.arcade, destination: 'arcade',
    description: 'Real-time cat Tic-Tac-Toe: invite a friend online, battle the computer on three difficulties, or pass & play on one device.',
    modes: ['Online with a friend', 'vs Computer', 'Pass & Play'], together: 'Online rooms (server-authoritative) or Pass & Play',
  },
  {
    id: 'paw-snap', title: 'Paw Snap', tagline: 'Wait for the fish… snap!', status: 'playable', route: PATHS.game('paw-snap'), destination: 'harbor',
    description: 'A tiny reaction duel for two on one device. Snap too early and your partner gets the point.',
    modes: ['Two players, one device'], together: 'Same device',
  },
  {
    id: 'pawtype', title: 'PawType', tagline: 'A friendly typing race — sweet, silly, all lowercase.', status: 'playable', route: PATHS.game('pawtype'), destination: 'arcade',
    description: 'Type short lowercase phrases to race your cat down the track. 15 s, 30 s or finish-the-phrases races.',
    modes: ['Solo practice', 'vs Pace cat (computer)', 'Duel with your partner'], together: 'Couple duel over your private pair connection',
  },
  {
    id: 'cat-boxing', title: 'Cat Boxing', tagline: 'Soft gloves, wobbly stars, no hard feelings.', status: 'playable', route: PATHS.game('cat-boxing'), destination: 'boxing-ring',
    description: 'Jab, heavy paw, block, dodge and a fluffy flurry. Best of three rounds.',
    modes: ['Practice', 'vs Computer (3 levels)', 'Couple match'], together: 'Couple match over your private pair connection (host-run, see README)',
  },
  {
    id: 'memory-paws', title: 'Memory Paws', tagline: 'Flip the cards, find the pairs.', status: 'playable', route: PATHS.game('memory-paws'), destination: 'puzzle-garden',
    description: 'A card-matching game with Tangerine, Midnight and their accessories — on boards of 12, 20 or 30 cards.',
    modes: ['Solo', 'Two players, one device'], together: 'Same device',
  },
  {
    id: 'puzzle-garden', title: 'Puzzle Garden', tagline: 'Quiet logic puzzles among the flowerbeds.', status: 'playable', route: PATHS.game('puzzle-garden'), destination: 'puzzle-garden',
    description: 'Paw-print patterns, flower-bed grids and a cat nap deduction puzzle — plus a daily garden puzzle.',
    modes: ['Paw Patterns', 'Flower Beds', 'Nap Spots', 'Daily puzzle'], together: 'Solve side by side on one screen',
  },
  {
    id: 'whack-a-cat', title: 'Whack-a-Cat', tagline: 'Boop the cats before they hide (gently!).', status: 'playable', route: PATHS.game('whack-a-cat'), destination: 'whack-a-cat',
    description: 'A 30-second reflex round at the booth: boop popping cats, build combos, and leave the napping kittens alone.',
    modes: ['Easy · Medium · Hard'], together: 'Take turns and compare scores',
  },
];

export interface DestinationInfo {
  id: DestinationId;
  name: string;
  blurb: string;
  accent: 'orange' | 'lavender' | 'teal' | 'blue' | 'green' | 'gold';
}

export const DESTINATIONS: readonly DestinationInfo[] = [
  { id: 'arcade', name: 'Arcade', blurb: 'Home of Paw vs Paw. The cabinets are warm and the cats are ready.', accent: 'orange' },
  { id: 'harbor', name: 'Harbor', blurb: 'Fishing boats bob at the dock. Paw Snap is played on the jetty — wait for the fish, then snap!', accent: 'blue' },
  { id: 'puzzle-garden', name: 'Puzzle Garden', blurb: 'A quiet greenhouse full of flowers, cards and puzzles.', accent: 'green' },
  { id: 'event-board', name: 'Event Board', blurb: 'Daily discoveries, the week’s special and what’s happening around town.', accent: 'gold' },
  { id: 'whack-a-cat', name: 'Whack-a-Cat booth', blurb: 'Boxes, a striped awning and a lot of cheeky cats.', accent: 'lavender' },
  { id: 'boxing-ring', name: 'The Ring', blurb: 'Fluffy gloves, a soft mat and a referee who mostly naps.', accent: 'orange' },
  { id: 'home', name: 'Our Home', blurb: 'Your cozy little place — decorations, the scrapbook and the mailbox.', accent: 'gold' },
];

export function destinationInfo(id: DestinationId): DestinationInfo {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown destination ${id}`);
  return d;
}

export function gamesAt(id: DestinationId): GameEntry[] {
  return GAMES.filter((g) => g.destination === id);
}

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}

export interface DailyChallenge {
  id: string;
  title: string;
  detail: string;
  route: string;
}

export const DAILY_CHALLENGES: readonly DailyChallenge[] = [
  { id: 'cpu-medium', title: 'Outsmart the computer', detail: 'Win a round of Paw vs Paw against the computer on Medium.', route: '/play/computer' },
  { id: 'pawtype-30', title: 'Thirty-second sprint', detail: 'Finish a 30-second PawType race with 95% accuracy or better.', route: '/games/pawtype' },
  { id: 'boxing', title: 'Gentle champion', detail: 'Win a Cat Boxing match against the computer on Medium.', route: '/games/cat-boxing' },
  { id: 'paw-snap', title: 'Snappy whiskers', detail: 'Win a round of Paw Snap at the harbor jetty.', route: '/games/paw-snap' },
  { id: 'memory-medium', title: 'Sharp whiskers', detail: 'Clear a Medium Memory Paws board in 18 moves or fewer.', route: '/games/memory-paws' },
  { id: 'whack-combo', title: 'Combo cat', detail: 'Reach a 10-boop combo at the Whack-a-Cat booth.', route: '/games/whack-a-cat' },
  { id: 'garden-daily', title: 'Daily garden puzzle', detail: "Solve today's Puzzle Garden puzzle without a hint.", route: '/games/puzzle-garden' },
];

/** Weekly special (rotates every Monday, same for everyone). Purely additive — nothing is lost by skipping it. */
export const WEEKLY_EVENTS: readonly { id: string; title: string; detail: string }[] = [
  { id: 'picnic-week', title: 'Picnic week', detail: 'The meadow is in bloom — share a snack at a picnic together.' },
  { id: 'angler-week', title: 'Harbor festival', detail: 'Fish are biting at the pier. Can you find a rare one?' },
  { id: 'stargaze-week', title: 'Meteor nights', detail: 'More wishes than usual on Stargazing Hill after dark.' },
  { id: 'garden-week', title: 'Green paws week', detail: 'Plant something new in the shared garden.' },
];

export function weeklyEvent(date: Date) {
  const monday = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000 + 3) / 7);
  return WEEKLY_EVENTS[monday % WEEKLY_EVENTS.length];
}

export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function daySeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function challengeForDate(date: Date): DailyChallenge {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000);
  return DAILY_CHALLENGES[day % DAILY_CHALLENGES.length];
}
