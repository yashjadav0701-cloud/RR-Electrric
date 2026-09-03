const CACHE_NAME = 'rr-electrric-core-v4';
const IMAGE_CACHE = 'rr-images-v1';

const SAFE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/admin.css',
    '/app.js',
    '/admin.js',
    '/manifest.json',
    '/assets/logo-short.svg',
    '/assets/logo-full.svg',
    '/assets/icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => {
            // Keep both the core cache and the persistent image cache
            if (key !== CACHE_NAME && key !== IMAGE_CACHE) return caches.delete(key);
        }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);

    // 1. SUPABASE IMAGES: Cache-First Strategy
    // Radically improves scrolling FPS by serving product images from memory instantly
    if (url.origin.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                
                return fetch(e.request).then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(IMAGE_CACHE).then((cache) => cache.put(e.request, responseClone));
                    return networkResponse;
                }).catch(() => {
                    // Fail gracefully if offline
                    return new Response(null, { status: 404 });
                });
            })
        );
        return;
    }

    // 2. CORE ASSETS: Stale-While-Revalidate
    // Serves the app instantly from cache, then silently updates in the background
    if (url.origin === self.location.origin) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                const fetchPromise = fetch(e.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse.clone()));
                    return networkResponse;
                }).catch(() => cachedResponse); // Fallback to cache if offline
                
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }
});

// --- ADMIN PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/assets/icon.png',
            badge: '/assets/logo-short.svg',
            vibrate: [100, 50, 100],
            data: { url: data.url || '/admin.html' }
        };
        event.waitUntil(self.registration.showNotification(data.title, options));
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToTarget = event.notification.data.url;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('/admin.html') && 'focus' in client) {
                    return client.focus().then(() => client.navigate(urlToTarget));
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToTarget);
            }
        })
    );
});