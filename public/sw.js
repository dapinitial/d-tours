// D-Tours service worker — makes the app installable and resilient to the spotty
// signal you get in the hills. Strategy:
//   • navigations  → network-first, fall back to cache (last-good page offline)
//   • /api/*       → network-only (never serve stale detours/positions)
//   • static asset → cache-first (icons, css, js)
//   • 📦 packet    → an explicit, user-triggered precache of the whole reference
//     kit (dossiers, towns, skills, field-guide photos) that SURVIVES version
//     bumps and is served first, so the trip reads fully offline.
const VERSION = 'dtours-v1';
const PACKET = 'dtours-packet'; // the offline packet — never auto-evicted on activate
const SHELL = ['/drive', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Drop old shell caches on version bump, but PRESERVE the downloaded packet.
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== VERSION && k !== PACKET).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  const sameOrigin = url.origin === location.origin;

  // Never cache same-origin API — detours/positions must be live.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // Leave cross-origin non-images alone (map tiles, the YouTube player, scripts):
  // no reason to put the SW on their critical path.
  if (!sameOrigin && request.destination !== 'image') return;

  // Packet first: if the trip was downloaded, serve saved pages/images instantly —
  // this is what makes it read fully offline. Covers precached cross-origin images
  // (e.g. an un-proxied dossier photo) too, falling back to network when not saved.
  const fallback = sameOrigin ? () => fromNetwork(request) : () => fetch(request);
  e.respondWith(
    caches.open(PACKET).then((c) => c.match(request)).then((hit) => hit || fallback()),
  );
});

// Network-first for navigations (so edits show), cache-first for assets; both
// fall back to whatever we have offline, with the packet as the deepest fallback.
function fromNetwork(request) {
  if (request.mode === 'navigate') {
    return fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match(request).then((r) => r || caches.match('/packet')).then((r) => r || caches.match('/drive')));
  }
  return caches.match(request).then((cached) => cached || fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(request, copy));
    return res;
  }));
}

// ── 📦 packet messaging: the /packet page drives download / clear / status ──
self.addEventListener('message', (e) => {
  const msg = e.data || {};
  const reply = (data) => e.source && e.source.postMessage(data);

  if (msg.type === 'cache-packet') {
    e.waitUntil(cachePacket(msg.urls || [], msg.version, reply));
  } else if (msg.type === 'clear-packet') {
    e.waitUntil(caches.delete(PACKET).then(() => reply({ type: 'packet-cleared' })));
  } else if (msg.type === 'packet-status') {
    e.waitUntil(packetStatus().then((s) => reply({ type: 'packet-status', ...s })));
  }
});

async function cachePacket(urls, version, reply) {
  const cache = await caches.open(PACKET);
  const list = [...new Set(urls.filter(Boolean))];
  const total = list.length;
  let done = 0, failed = 0;
  const CONCURRENCY = 6;
  let i = 0;
  async function addOne(u) {
    const cross = new URL(u, location.origin).origin !== location.origin;
    if (cross) {
      // Opaque (no-cors) responses can't go through cache.add (it rejects non-OK),
      // so fetch + put manually — they still serve fine in an <img> offline.
      const res = await fetch(u, { mode: 'no-cors', cache: 'reload' });
      await cache.put(u, res);
    } else {
      await cache.add(new Request(u, { cache: 'reload' }));
    }
  }
  async function worker() {
    while (i < list.length) {
      const u = list[i++];
      try {
        await addOne(u);
      } catch {
        failed++;
      }
      done++;
      reply({ type: 'packet-progress', done, total, failed });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  if (version) await cache.put('/__packet_version', new Response(version));
  const status = await packetStatus();
  reply({ type: 'packet-done', done, total, failed, ...status });
}

// Count + approximate byte size (from Content-Length) + stored version.
async function packetStatus() {
  const has = await caches.has(PACKET);
  if (!has) return { cached: false, items: 0, bytes: 0, version: null };
  const cache = await caches.open(PACKET);
  const keys = await cache.keys();
  let bytes = 0, items = 0, version = null;
  for (const req of keys) {
    if (req.url.endsWith('/__packet_version')) { version = await (await cache.match(req)).text(); continue; }
    items++;
    const res = await cache.match(req);
    const len = res && res.headers.get('content-length');
    if (len) bytes += parseInt(len, 10) || 0;
  }
  return { cached: items > 0, items, bytes, version };
}
