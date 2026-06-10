const CACHE_NAME = 'sajulab-admin-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // GitHub API/raw 요청은 항상 네트워크
  if (url.hostname.includes('github')) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => cached || new Response('', { status: 408 }))
    )
  );
});
