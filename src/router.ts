import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'room'; id: string }
  | { name: 'computer' }
  | { name: 'local' }
  | { name: 'notfound' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'home' };
  const room = /^\/room\/([^/]+)$/.exec(path);
  if (room) return { name: 'room', id: decodeURIComponent(room[1]) };
  if (path === '/play/computer') return { name: 'computer' };
  if (path === '/play/local') return { name: 'local' };
  return { name: 'notfound' };
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return parseRoute(path);
}
