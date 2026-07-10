// Minimal service worker — installability + standalone display only.
// No caching/offline support by design (see CLAUDE.md mobile conventions).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally no-op: network passthrough only, no offline cache.
});
