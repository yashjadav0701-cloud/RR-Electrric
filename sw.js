const CACHE_NAME = 'rr-electrric-core-v1';
const SAFE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/assets/logo-short.svg',
    '/assets/logo-full.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
        }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Ignore non-GET requests, API requests, and third-party URLs entirely
    if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Network-first strategy for absolute safety: ALWAYS try network, fallback to cache ONLY if offline
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});