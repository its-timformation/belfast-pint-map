// Belfast Pint Map — Service Worker
// Strategy: Cache-first for static assets, network-first for API calls

const CACHE = 'bpm-v1';

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192x192.png',
];

// Install: pre-cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activate: purge old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for /api/, cache-first for everything else
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls: network-only (never cache)
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
