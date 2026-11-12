/* sw.js — offline-first app shell.
 *
 * Everything the app needs is a static file, so the cache is the whole app.
 * Bump CACHE when you change any file in SHELL; the old cache is deleted on
 * activate and the new worker takes over immediately.
 */

const CACHE = 'adjektivendungen-v4';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './engine.js',
  './data.js',
  './pool.js',
  './ai.js',
  './validate.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if one file 404s; add individually so a
    // missing optional icon cannot break the offline build.
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached shell so a cold offline start works, and
  // refresh it in the background when there is a network.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Offline and nothing cached yet.', {
            status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Everything else: cache first, then network, and keep what comes back.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
