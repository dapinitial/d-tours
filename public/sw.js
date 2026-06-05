// D-Tours service worker — makes the app installable and resilient to the spotty
// signal you get in the hills. Strategy:
//   • navigations  → network-first, fall back to cache (last-good page offline)
//   • /api/*       → network-only (never serve stale detours/positions)
//   • static asset → cache-first (icons, css, js)
const VERSION = 'dtours-v1';
const SHELL = ['/drive', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // let cross-origin (Overpass etc.) pass through

  // Never cache API responses — detours and positions must be live.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first so edits show, cache as offline fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then((r) => r || caches.match('/drive'))),
    );
    return;
  }

  // Static assets: cache-first, fill cache on miss.
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return res;
    })),
  );
});
