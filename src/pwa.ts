/**
 * PWA registration (Milestone 6). Only in production builds over HTTPS (or localhost), and never
 * inside the Capacitor/Electron shells (they ship their own files). When a new version is waiting,
 * the player gets a gentle "update ready" event instead of a forced reload mid-game.
 */
export function registerPawvilleSW(onUpdateReady?: (apply: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const shell = (window as unknown as { Capacitor?: unknown; pawvilleDesktop?: unknown });
  if (shell.Capacitor || shell.pawvilleDesktop || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const offer = (w: ServiceWorker | null) => {
        if (!w || !navigator.serviceWorker.controller) return;
        onUpdateReady?.(() => {
          w.postMessage('SKIP_WAITING');
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        });
      };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed') offer(nw); });
      });
    }).catch(() => undefined);
  });
}
