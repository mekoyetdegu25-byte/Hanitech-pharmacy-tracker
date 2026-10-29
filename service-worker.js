// ==========================================
// 🔧 HaniTech Pharmacy Tracker - Service Worker
// Version: 2.0.1
// ==========================================

const CACHE_VERSION = 'v3'; // ← አንድ ቦታ ብቻ ይቀይሩ
const CACHE_NAME = `pharmacy-${CACHE_VERSION}`;
const RUNTIME_CACHE = `pharmacy-runtime-${CACHE_VERSION}`;

// ==========================================
// 🎯 App Shell - በ install ጊዜ የሚቀመጡ
// ==========================================
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// የአካባቢ ፋይሎች (icons በአካባቢው ካሉ ብቻ ይጨምሩ)
const LOCAL_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// External CDN libraries (ልዩ አያያዝ ይፈልጋሉ)
const CDN_ASSETS = [
  {
    url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    mode: 'cors'
  },
  {
    url: 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js',
    mode: 'cors'
  }
];

// ==========================================
// INSTALL - App Shell አስቀምጥ
// ==========================================
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${CACHE_VERSION}...`);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. Core assets (አስፈላጊ - ካልተሳኩ install ይከሽፋል)
      console.log('[SW] Caching core assets');
      await cache.addAll(CORE_ASSETS).catch(err => {
        console.warn('[SW] Core assets failed:', err);
      });

      // 2. Local assets (አማራጭ - ካልተሳኩ ችግር የለም)
      console.log('[SW] Caching local assets');
      await Promise.all(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn(`[SW] Failed to cache local: ${url}`, err.message);
          })
        )
      );

      // 3. CDN assets (በ CORS mode መጥራት ያስፈልጋል)
      console.log('[SW] Caching CDN assets');
      await Promise.all(
        CDN_ASSETS.map(async ({ url, mode }) => {
          try {
            const request = new Request(url, { mode, credentials: 'omit' });
            const response = await fetch(request);
            if (response.ok) {
              await cache.put(url, response);
              console.log(`[SW] ✅ Cached CDN: ${url}`);
            } else {
              console.warn(`[SW] ❌ CDN failed (${response.status}): ${url}`);
            }
          } catch (err) {
            console.warn(`[SW] ❌ CDN error: ${url}`, err.message);
          }
        })
      );

      // Skip waiting — አዲሱ SW ወዲያውኑ እንዲገባ ያደርጋል
      await self.skipWaiting();
      console.log(`[SW] ${CACHE_VERSION} installed`);
    })()
  );
});

// ==========================================
// ACTIVATE - አሮጌ cache አጽዳ
// ==========================================
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
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

  // ❌ Non-GET — ሁልጊዜ network
  if (request.method !== 'GET') return;

  // ❌ Firebase / Auth API — ሁልጊዜ network (ዳታ ማከማቸት አይፈቀድም)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // ❌ chrome-extension እና ሌሎች non-http
  if (!url.protocol.startsWith('http')) return;

  // 🧭 Navigation (HTML) — Network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match('./index.html'));
        })
    );
    return;
  }

  // 🎨 Fonts — Cache first, network fallback
  if (request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // 📦 Static assets — Cache first with background update
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) {
        // Background revalidation (Stale-While-Revalidate)
        fetch(request)
          .then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
              caches.open(RUNTIME_CACHE).then(cache => cache.put(request, response));
            }
          })
          .catch(() => {}); // ስህተት ቢኖር ግድ የለም

        return cached;
      }

      // Cache miss — network
      try {
        const response = await fetch(request);

        // የተሳካ response ብቻ አስቀምጥ
        if (
          response &&
          response.status === 200 &&
          response.type !== 'opaque' &&
          response.type !== 'opaqueredirect'
        ) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }

        return response;
      } catch (err) {
        // Image fallback
        if (request.destination === 'image') {
          const fallback = await caches.match('./icons/icon-192.png');
          if (fallback) return fallback;
        }
        // General fallback
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      }
    })()
  );
});

// ==========================================
// MESSAGE - ከ index.html የሚመጡ መልዕክቶች
// ==========================================
self.addEventListener('message', event => {
  const { data } = event;

  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received');
    self.skipWaiting();
  }

  if (data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }

  if (data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing all caches...');
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

console.log(`✅ HaniTech Service Worker ${CACHE_VERSION} loaded`);
