/*
 * Pawville service worker (Milestone 6).
 *  - Network-first for page navigations (so a new deployment is picked up immediately), with the
 *    cached app shell only as an OFFLINE fallback.
 *  - Cache-first for hashed build assets (/assets/*) and icons — their names change every build.
 *  - NEVER caches Supabase / any cross-origin request (auth, realtime, database stay live-only).
 *  - Versioned cache; old caches are deleted on activate. Updates wait for the page to opt in
 *    (SKIP_WAITING message) so a running game is never swapped mid-session.
 */
const VERSION = 'pawville-v10-2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // Cache each shell file on its own: addAll() is all-or-nothing, so ONE missing icon used to leave the whole offline shell uncached.
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).catch(() => undefined));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & everything external: straight to the network
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(VERSION);
        c.put('/index.html', fresh.clone()).catch(() => undefined);
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || new Response('Pawville is offline.', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg') {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone()).catch(() => undefined);
      return res;
    })());
  }
});
