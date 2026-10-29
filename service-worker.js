// ==========================================
// 🔧 HaniTech Pharmacy Tracker - Service Worker
// Version: 2.0.0
// ==========================================

const CACHE_NAME = 'pharmacy-v2';
const RUNTIME_CACHE = 'pharmacy-runtime-v2';

// App Shell - በ install ጊዜ የሚቀመጡ
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png', // የአፑ አይኮን (ካለ)
  // External CDN libraries
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js',
  // Default Icons (ከመስመር ላይ የሚመጡ)
  'https://cdn-icons-png.flaticon.com/192/2966/2966327.png',
  'https://cdn-icons-png.flaticon.com/512/2966/2966327.png'
];

// ==========================================
// INSTALL - App Shell አስቀምጥ
// ==========================================
self.addEventListener('install', event => {
  console.log('[SW] Installing v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        // አንዳንድ ፋይሎች ካልተገኙ ስህተት እንዳይሰጥ በተናጠል እንጨምራቸው
        return Promise.all(
          ASSETS.map(url => {
            return cache.add(url).catch(err => {
              console.warn('[SW] Failed to cache:', url, err);
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// ==========================================
// ACTIVATE - አሮጌ cache አጽዳ
// ==========================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating v2...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// ==========================================
// FETCH - ጥያቄዎችን አስተናግድ
// ==========================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ❌ Skip non-GET requests (POST, PUT, DELETE)
  if (request.method !== 'GET') {
    return;
  }

  // ❌ Skip Firebase API calls - ሁልጊዜ network ይሂዱ
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('firestore')) {
    return;
  }

  // ❌ Skip chrome-extension, etc.
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 🧭 Navigation (HTML ገጾች) - Network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 📦 Static assets - Cache first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Background update (stale-while-revalidate)
        fetch(request).then(response => {
          if (response && response.status === 200) {
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, response.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }

      // Cache miss - try network
      return fetch(request)
        .then(response => {
          // Cache successful responses only
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(() => {
          // Image fallback
          if (request.destination === 'image') {
            return caches.match('https://cdn-icons-png.flaticon.com/512/2966/2966327.png');
          }
        });
    })
  );
});

// ==========================================
// MESSAGE - ከ index.html የሚመጡ መልዕክቶች
// ==========================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ HaniTech Service Worker v2 loaded');
