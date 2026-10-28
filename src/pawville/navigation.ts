/**
 * Navigation glue. All navigation still goes through the original Paw vs Paw `navigate()`;
 * Pawville re-reads the URL so the rendered screen always matches it.
 */
import { useSyncExternalStore } from 'react';
import { navigate } from '../router';

const NAV_EVENT = 'pawville:navigate';

function notify(): void {
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function goTo(path: string): void {
  if (window.location.pathname === path) {
    notify();
    return;
  }
  navigate(path);
  if (window.location.pathname !== path) {
    // The original router did not apply this URL synchronously (e.g. it doesn't know a Pawville
    // path). Apply it here so the URL and the screen can never diverge.
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  notify();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

export function usePathname(): string {
  const read = () => (typeof window === 'undefined' ? '/' : window.location.pathname);
  return useSyncExternalStore(subscribe, read, read);
}
