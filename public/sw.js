const CACHE_NAME = 'self-planner-cache-v1';

// Basit pre-cache (isteğe göre genişletebilirsin)
const PRECACHE_URLS = ['/', '/favicon.ico'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Sadece GET ve aynı origin istekleri ele al
    if (request.method !== 'GET' || new URL(request.url).origin !== self.origin) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    // Response cache'e yaz
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return networkResponse;
                })
                .catch(() => cachedResponse); // offline iken cache'e düş
            // Cache varsa anında dön, yoksa network’e git
            return cachedResponse || networkFetch;
        })
    );
});
