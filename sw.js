const CACHE_NAME = 'rr-electrric-core-v7';
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

// --- UNIFIED RICH PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            
            // Rich Media Formatting (Amazon / McDonald's Style)
            const options = {
                body: data.body,
                icon: data.icon || '/assets/icon.png', // Large brand identifier on the left
                badge: '/assets/badge.png', // Small monochrome status bar silhouette
                image: data.image || null, // Massive edge-to-edge promotional image
                vibrate: [200, 100, 200, 100, 200], // Premium haptic rhythm
                actions: data.actions || [], // Interactive buttons (e.g. [🛒 Checkout])
                data: { 
                    url: data.url || '/',
                    isAdmin: data.isAdmin || false 
                }
            };
            
            event.waitUntil(self.registration.showNotification(data.title, options));
        } catch (e) {
            console.error('Push data parse error:', e);
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    let urlToTarget = event.notification.data.url;
    const isAdmin = event.notification.data.isAdmin;
    
    // Action Button Routing Interception
    if (event.action) {
        if (event.action === 'checkout') urlToTarget = '/#checkout';
        if (event.action === 'cart') urlToTarget = '/#cart';
        if (event.action === 'home') urlToTarget = '/';
    }
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // Check if we already have the correct app open (Admin vs Storefront)
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                const isTargetAdmin = urlToTarget.includes('admin.html');
                const isClientAdmin = client.url.includes('admin.html');
                
                // If it's the right domain and app type, focus and navigate smoothly via SPA
                if (client.url.includes(self.location.origin) && isTargetAdmin === isClientAdmin && 'focus' in client) {
                    return client.focus().then(() => client.navigate(urlToTarget));
                }
            }
            // If the app is closed, open a fresh window
            if (clients.openWindow) {
                return clients.openWindow(urlToTarget);
            }
        })
    );
});