/**
 * Cat Café Rush (Milestone 8.2) — an arcade cabinet in the Whiskerwick Arcade.
 *
 * Cats sit down at three counter stools and order one or two treats. Build the order on your
 * tray (keys 1–4 or the menu buttons), then serve it to the right cat (keys Q/W/E or tap the cat).
 * Every cat has a patience bar; serving quickly earns a tip. A wrong tray costs patience, a cat who
 * leaves hungry costs a heart. Three hearts, 90 seconds.
 *
 * Pure and deterministic: time is passed in, randomness is injected. Unit tested.
 */

export const RUSH_MENU = ['milk', 'cookie', 'fish', 'cake'] as const;
export type RushItem = (typeof RUSH_MENU)[number];
export const RUSH_ITEM_NAMES: Record<RushItem, string> = { milk: 'Warm milk', cookie: 'Paw cookie', fish: 'Fish bite', cake: 'Berry cake' };
export const RUSH_SEATS = 3;
export const RUSH_TRAY_MAX = 3;
export const RUSH_GAME_MS = 90_000;
export const RUSH_HEARTS = 3;
/** Customer coats (purely cosmetic, picked by index). */
export const RUSH_COATS = ['tangerine', 'midnight', 'cloud', 'cocoa', 'mint', 'blossom', 'pebble'] as const;

export interface RushCustomer {
  id: number;
  order: RushItem[];
  /** Patience remaining / total (ms). */
  patience: number;
  max: number;
  coat: number;
  /** Set briefly after a wrong tray, for a "huff" animation. */
  huffAt?: number;
}

export interface RushState {
  t: number;
  seats: (RushCustomer | null)[];
  tray: RushItem[];
  score: number;
  served: number;
  tips: number;
  hearts: number;
  nextSpawn: number;
  nextId: number;
  over: boolean;
  /** Last event, for feedback text / sounds. */
  last: null | { kind: 'served'; seat: number; points: number; tip: boolean } | { kind: 'wrong'; seat: number } | { kind: 'left'; seat: number } | { kind: 'tray-full' } | { kind: 'empty-seat' } | { kind: 'arrive'; seat: number };
}

export function newRush(): RushState {
  return { t: 0, seats: new Array(RUSH_SEATS).fill(null), tray: [], score: 0, served: 0, tips: 0, hearts: RUSH_HEARTS, nextSpawn: 600, nextId: 1, over: false, last: null };
}

/** How long a new customer will wait (gets shorter as the shift goes on, never below 7 s). */
export function patienceAt(t: number): number {
  return Math.max(7000, 15000 - Math.floor(t / 15000) * 1500);
}
/** Gap until the next customer arrives (busier later). */
export function spawnGapAt(t: number, rand: () => number): number {
  const base = Math.max(1800, 4200 - t / 30);
  return Math.round(base * (0.75 + rand() * 0.5));
}

function makeOrder(t: number, rand: () => number): RushItem[] {
  const two = rand() < Math.min(0.75, 0.25 + t / 120000);
  const a = RUSH_MENU[Math.floor(rand() * RUSH_MENU.length)];
  if (!two) return [a];
  return [a, RUSH_MENU[Math.floor(rand() * RUSH_MENU.length)]];
}

/** Advance the shift by `dt` ms. */
export function tickRush(s: RushState, dt: number, rand: () => number): RushState {
  if (s.over || dt <= 0) return s;
  const t = Math.min(RUSH_GAME_MS, s.t + dt);
  let hearts = s.hearts;
  let last: RushState['last'] = null;
  const seats = s.seats.map((c, i) => {
    if (!c) return c;
    const patience = c.patience - dt;
    if (patience <= 0) { hearts -= 1; last = { kind: 'left', seat: i }; return null; }
    return { ...c, patience };
  });
  let { nextSpawn, nextId } = s;
  if (t >= nextSpawn) {
    const free = seats.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (free.length) {
      const seat = free[Math.floor(rand() * free.length)];
      const max = patienceAt(t);
      seats[seat] = { id: nextId, order: makeOrder(t, rand), patience: max, max, coat: Math.floor(rand() * RUSH_COATS.length) };
      nextId += 1;
      if (!last) last = { kind: 'arrive', seat };
    }
    nextSpawn = t + spawnGapAt(t, rand);
  }
  const over = hearts <= 0 || t >= RUSH_GAME_MS;
  return { ...s, t, seats, hearts: Math.max(0, hearts), nextSpawn, nextId, over, last };
}

export function addToTray(s: RushState, item: RushItem): RushState {
  if (s.over) return s;
  if (s.tray.length >= RUSH_TRAY_MAX) return { ...s, last: { kind: 'tray-full' } };
  return { ...s, tray: [...s.tray, item], last: null };
}
export function clearTray(s: RushState): RushState {
  return s.over ? s : { ...s, tray: [], last: null };
}

/** Same items, any order. */
export function trayMatches(tray: readonly RushItem[], order: readonly RushItem[]): boolean {
  if (tray.length !== order.length) return false;
  const a = [...tray].sort(), b = [...order].sort();
  return a.every((x, i) => x === b[i]);
}

/** Serve the tray to the cat on `seat`. */
export function serve(s: RushState, seat: number): RushState {
  if (s.over || seat < 0 || seat >= RUSH_SEATS) return s;
  const c = s.seats[seat];
  if (!c) return { ...s, last: { kind: 'empty-seat' } };
  if (!s.tray.length) return s;
  if (!trayMatches(s.tray, c.order)) {
    // a wrong tray: the cat huffs and loses a third of their patience; the tray is cleared
    const seats = s.seats.slice();
    seats[seat] = { ...c, patience: Math.max(1, c.patience - c.max / 3), huffAt: s.t };
    return { ...s, seats, tray: [], last: { kind: 'wrong', seat } };
  }
  const tip = c.patience / c.max >= 0.5;
  const points = 10 * c.order.length + (tip ? 5 : 0);
  const seats = s.seats.slice();
  seats[seat] = null;
  return { ...s, seats, tray: [], score: s.score + points, served: s.served + 1, tips: s.tips + (tip ? 1 : 0), last: { kind: 'served', seat, points, tip } };
}

/** Tokens for a finished shift (then capped per day by the economy). */
export function rushTokens(served: number): number {
  return served >= 18 ? 5 : served >= 12 ? 4 : served >= 8 ? 3 : served >= 4 ? 2 : served >= 1 ? 1 : 0;
}
