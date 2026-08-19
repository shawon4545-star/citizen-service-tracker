/* Minimal service worker — exists mainly to satisfy Android/Chrome's "installable PWA" requirement
   (add-to-home-screen needs a registered service worker) and to give a basic offline fallback.

   Strategy is network-first, not cache-first: this app's scripts change often, and a cache-first
   worker would silently re-serve stale JS the same way browser HTTP caching used to (see
   js/auth-gate.js's cache-busting) — so the network is always tried first, and the cache is only a
   fallback for when the device is genuinely offline. */

const CACHE_NAME = 'cst-shell-v1';
const SHELL_FILES = ['index.html', 'css/style.css', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('index.html')))
  );
});
