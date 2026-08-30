const CACHE_NAME = 'ak-gst-cache-__CACHE_VERSION__';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do not intercept non-GET requests, API requests, the service worker itself, or browser extension assets
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/sw.js') ||
    event.request.url.startsWith('chrome-extension:')
  ) {
    return;
  }

  // Navigation requests (the HTML shell for any route, e.g. /, /admin,
  // /dashboard) always go network-first. This is what decides which JS
  // bundle the page runs — serving a stale cached shell here after a new
  // deploy can leave an installed PWA running old code (with its own,
  // possibly inconsistent, in-memory/module state) well after a fresh
  // build has shipped, which is especially confusing for a standalone
  // installed app that isn't manually refreshed. The cache is kept purely
  // as an offline fallback, not as the primary source.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Static, hashed build assets (JS/CSS/images) are safe to serve
  // cache-first: their filenames change whenever their content changes,
  // so a cache hit is always the correct, current version.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache newly requested static assets dynamically
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Fallback to index.html for SPA client-side routing
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Skip waiting update hook
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'AK-LOGIC AI GST';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: data.url || '/dashboard'
    },
    tag: data.tag || 'gst-invoice-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Push notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL(event.notification.data.url || '/dashboard', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // Check if a tab with this app is already open on the exact page
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If we didn't find an exact URL match, focus the first window and navigate it
      if (windowClients.length > 0) {
        const client = windowClients[0];
        if ('focus' in client && 'navigate' in client) {
          client.focus();
          return client.navigate(urlToOpen);
        }
      }
      
      // If no windows are open at all, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
