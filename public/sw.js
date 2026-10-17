// SuPuja Creations Progressive Web App Service Worker
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `supuja-creations-static-${CACHE_VERSION}`;
const DOCUMENT_CACHE = `supuja-creations-documents-${CACHE_VERSION}`;
const SESSION_CACHE = `supuja-creations-session-${CACHE_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, DOCUMENT_CACHE, SESSION_CACHE];
const ACTIVE_USER_KEY = new Request(`${self.location.origin}/__offline_active_user__`);
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable.png',
  '/apple-icon.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn('SW Precache item notice:', asset, e.message);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

function isWorkspacePath(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return false;
  if (url.pathname === '/login' || url.pathname === '/chat') return false;
  if (url.pathname.startsWith('/saas-studio/')) return false;
  if (url.searchParams.has('view_as') || url.searchParams.has('impersonate')) return false;
  return true;
}

function documentKey(userId, url) {
  const encodedUser = encodeURIComponent(userId);
  const encodedPage = encodeURIComponent(url.pathname + url.search);
  return new Request(`${self.location.origin}/__offline_document__/${encodedUser}/${encodedPage}`);
}

async function getActiveUser() {
  const cache = await caches.open(SESSION_CACHE);
  const response = await cache.match(ACTIVE_USER_KEY);
  return response ? response.text() : '';
}

async function setActiveUser(userId) {
  const cache = await caches.open(SESSION_CACHE);
  await cache.put(ACTIVE_USER_KEY, new Response(userId || ''));
}

function isValidWorkspaceDocument(response) {
  return response?.ok && !response.redirected &&
    response.headers.get('content-type')?.includes('text/html') &&
    !new URL(response.url).pathname.startsWith('/login');
}

async function cacheWorkspaceDocument(userId, pageUrl) {
  const url = new URL(pageUrl, self.location.origin);
  if (!isWorkspacePath(url) || !userId) return;
  try {
    const response = await fetch(url.href, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
      cache: 'no-store'
    });
    if (!isValidWorkspaceDocument(response)) return;
    const cache = await caches.open(DOCUMENT_CACHE);
    await cache.put(documentKey(userId, url), response);
  } catch (error) {
    // Previously saved workspace remains available when a warmup request fails.
  }
}

async function cacheLoadedAssets(assetUrls) {
  const cache = await caches.open(STATIC_CACHE);
  const urls = (assetUrls || []).slice(0, 100);
  for (let index = 0; index < urls.length; index += 8) {
    await Promise.allSettled(urls.slice(index, index + 8).map(async (assetUrl) => {
      const url = new URL(assetUrl, self.location.origin);
      if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) return;
      if (await cache.match(url.href)) return;
      const response = await fetch(url.href);
      if (response.ok) await cache.put(url.href, response);
    }));
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'OFFLINE_SESSION_READY' && typeof data.userId === 'string' && data.userId) {
    event.waitUntil((async () => {
      await setActiveUser(data.userId);
      await Promise.allSettled([
        cacheWorkspaceDocument(data.userId, data.pageUrl || '/'),
        cacheLoadedAssets(data.assetUrls)
      ]);
    })());
  } else if (data.type === 'OFFLINE_SESSION_ENDED') {
    event.waitUntil(setActiveUser(''));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && (url.pathname === '/login' || url.pathname.startsWith('/auth/'))) {
    event.waitUntil(setActiveUser(''));
    return;
  }

  const isDevHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (url.pathname.startsWith('/_next/static/') || PRECACHE_ASSETS.includes(url.pathname)) {
    // In local development or hot-reloading, bypass cache-first to prevent stale chunk traps
    if (isDevHost && url.pathname.startsWith('/_next/static/')) {
      event.respondWith(fetch(request).catch(() => caches.match(request)));
      return;
    }

    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      return response;
    })());
    return;
  }

  // Next.js RSC, actions, API calls and account routes are never served from
  // another user's document cache. Only a full workspace navigation may fall back.
  if (request.mode !== 'navigate' || !isWorkspacePath(url)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (isValidWorkspaceDocument(response)) {
        const userId = await getActiveUser();
        if (userId) {
          const cache = await caches.open(DOCUMENT_CACHE);
          event.waitUntil(cache.put(documentKey(userId, url), response.clone()).catch(() => {}));
        }
      }
      return response;
    } catch (error) {
      const userId = await getActiveUser();
      if (userId) {
        const cache = await caches.open(DOCUMENT_CACHE);
        const cached = await cache.match(documentKey(userId, url));
        if (cached) return cached;
      }
      return new Response('<!doctype html><html><body><h1>Offline page unavailable</h1><p>Open this page once while connected, then try again.</p></body></html>', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
  })());
});
