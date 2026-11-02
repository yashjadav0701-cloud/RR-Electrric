const CACHE_NAME = 'rr-invoice-studio-pwa-v1';
const APP_SHELL = [
  '/invoice-studio/',
  '/invoice-studio/index.html',
  '/invoice-studio/manifest.webmanifest',
  '/invoice-studio/icons/icon-192.png',
  '/invoice-studio/icons/icon-512.png',
  '/assets/logo-full.svg',
  '/assets/logo-short.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('rr-invoice-studio-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/invoice-studio/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest'))) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  if (request.mode === 'navigate' && url.pathname.startsWith('/invoice-studio')) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/invoice-studio/index.html', response.clone()));
      return response;
    }).catch(() => caches.match('/invoice-studio/index.html')));
    return;
  }
  if (url.pathname.startsWith('/invoice-studio/icons/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
