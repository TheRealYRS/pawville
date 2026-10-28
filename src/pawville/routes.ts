/**
 * The whole application's routes, derived from ONE source: the URL path (see App.tsx).
 */
import { GAMES, type RoutedGameId } from './destinations.ts';

export type AppRoute =
  | { name: 'town' }
  | { name: 'arcade' }
  | { name: 'room'; id: string }
  | { name: 'computer' }
  | { name: 'local' }
  | { name: 'home' }
  | { name: 'scrapbook' }
  | { name: 'pair'; code: string }
  | { name: 'game'; id: RoutedGameId }
  | { name: 'notfound' };

const GAME_IDS = GAMES.map((g) => g.id).filter((id): id is RoutedGameId => id !== 'paw-vs-paw');

export function matchAppPath(pathname: string): AppRoute {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '' || path === '/town') return { name: 'town' };
  if (path === '/arcade' || path === '/games/paw-vs-paw') return { name: 'arcade' };
  if (path === '/play/computer') return { name: 'computer' };
  if (path === '/play/local') return { name: 'local' };
  if (path === '/home') return { name: 'home' };
  if (path === '/scrapbook') return { name: 'scrapbook' };
  const pair = /^\/pair\/([A-Za-z0-9]{6})$/.exec(path);
  if (pair) return { name: 'pair', code: pair[1].toUpperCase() };
  const room = /^\/room\/([^/]+)$/.exec(path);
  if (room) {
    try {
      return { name: 'room', id: decodeURIComponent(room[1]) };
    } catch {
      return { name: 'notfound' };
    }
  }
  const game = /^\/games\/([a-z0-9-]+)$/.exec(path);
  if (game) {
    const id = GAME_IDS.find((g) => g === game[1]);
    if (id) return { name: 'game', id };
  }
  return { name: 'notfound' };
}

export function screenKey(route: AppRoute): string {
  switch (route.name) {
    case 'room': return `room:${route.id}`;
    case 'game': return `game:${route.id}`;
    case 'pair': return `pair:${route.code}`;
    default: return route.name;
  }
}
