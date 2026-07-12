// Installability + standalone display, plus scoped offline caching for
// Lessons history (review past lessons without a connection). Everything
// else — every other /api route, static assets — stays plain network
// passthrough; this is deliberately NOT a general offline overhaul.
const LESSONS_CACHE = 'aula-lessons-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache from a previous version of this SW's caching scheme.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== LESSONS_CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

function isLessonsGetRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.pathname === '/api/lessons' || url.pathname === '/api/lesson-thread';
}

// Network-first, cache-fallback: always prefer a live response (so a new
// lesson or reply shows up immediately when online), fall back to the last
// cached copy only when the network fetch fails.
async function networkFirstWithCache(request) {
  const cache = await caches.open(LESSONS_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  if (!isLessonsGetRequest(event.request)) return;
  event.respondWith(networkFirstWithCache(event.request));
});
