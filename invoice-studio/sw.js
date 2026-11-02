/* RR ELECTRRIC Invoice Studio PWA service worker.
 * The cloned response is created before any body can be consumed. Cache writes
 * are awaited before exposing the original response to the page.
 */
const CACHE_NAME = 'rr-invoice-studio-pwa-v2';
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => console.warn('[Invoice Studio SW] App shell cache skipped:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('rr-invoice-studio-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function fetchAndCache(request, cacheKey) {
  const response = await fetch(request);
  if (!response || !response.ok) return response;

  // This must happen synchronously before awaiting caches.open/cache.put.
  let responseCopy;
  try {
    responseCopy = response.clone();
  } catch (error) {
    console.warn('[Invoice Studio SW] Could not clone response for cache:', error);
    return response;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, responseCopy);
  } catch (error) {
    // Cache failure must never turn a successful network response into an app error.
    console.warn('[Invoice Studio SW] Cache write skipped:', error);
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStudioAsset = url.pathname.startsWith('/invoice-studio/') &&
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest'));

  if (isStudioAsset) {
    event.respondWith(
      fetchAndCache(request, request).catch(async error => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
      })
    );
    return;
  }

  if (request.mode === 'navigate' && url.pathname.startsWith('/invoice-studio')) {
    event.respondWith(
      fetchAndCache(request, '/invoice-studio/index.html').catch(async error => {
        const cached = await caches.match('/invoice-studio/index.html');
        if (cached) return cached;
        throw error;
      })
    );
    return;
  }

  if (url.pathname.startsWith('/invoice-studio/icons/') || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return fetchAndCache(request, request);
    })());
  }
});
