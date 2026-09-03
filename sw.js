const CACHE_NAME = 'rr-electrric-core-v6';
const IMAGE_CACHE = 'rr-images-v2';

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
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME && key !== IMAGE_CACHE) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    
    const url = new URL(e.request.url);

    // SAFETY CHECK: Let cross-origin requests (like Supabase images/APIs) bypass the service worker fetch interceptor entirely to avoid stream cloning crashes.
    if (url.origin !== self.location.origin) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Background update (Stale-while-revalidate)
                fetch(e.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(e.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(e.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                return caches.match('/index.html');
            });
        })
    );
});

// --- ADMIN PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body,
                icon: '/assets/icon.png',
                badge: '/assets/logo-short.svg',
                vibrate: [100, 50, 100],
                data: { url: data.url || '/admin.html' }
            };
            event.waitUntil(self.registration.showNotification(data.title, options));
        } catch (e) {
            console.error('Push data parse error:', e);
        }
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