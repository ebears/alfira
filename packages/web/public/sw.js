// Increment this when the precache list changes — triggers SW update for all clients.
const CACHE = 'alfira-v1';

// App shell assets precached on install. Served cache-first, updated in background.
const PRECACHE = [
  '/main.js',
  '/index.css',
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/fonts/chiron-go-round-tc-400-latin.woff2',
  '/fonts/jetbrains-mono-400-latin.woff2',
  '/fonts/cherry-bomb-one-400-latin.woff2',
  '/fonts/jetbrains-mono-500-latin.woff2',
];

// ---------------------------------------------------------------------------
// Install — precache the app shell so it's available offline immediately.
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
    })()
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — purge old cache versions so stale assets don't linger.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    })()
  );
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Fetch — strategy depends on the request type.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests — let the browser handle cross-origin.
  if (url.origin !== self.location.origin) {
    return;
  }

  // --- API / WebSocket requests: network-only, never cache ---
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  // --- Navigation requests: network-first with offline fallback ---
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match('/index.html');
          return cached ?? new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // --- Static assets: cache-first (stale-while-revalidate) ---
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);

      // Fire-and-forget: update the cache in the background. We don't await
      // this so the cached response is returned immediately.
      void (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
          }
        } catch {
          // Network fetch failed — nothing to cache, cached response still served.
        }
      })();

      return cached ?? (await fetch(request));
    })()
  );
});
