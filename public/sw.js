// SuPuja Creations Progressive Web App Service Worker
const CACHE_VERSION = 'v5';
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
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/apps/')) return false;
  if (url.pathname === '/login' || url.pathname === '/chat') return false;
  if (url.pathname.startsWith('/saas-studio/')) return false;
  if (url.searchParams.has('view_as') || url.searchParams.has('impersonate')) return false;
  return true;
}

function userDocPrefix(userId) {
  return `${self.location.origin}/__offline_document__/${encodeURIComponent(userId)}/`;
}

function documentKey(userId, pathAndSearch) {
  return new Request(`${userDocPrefix(userId)}${encodeURIComponent(pathAndSearch)}`);
}

function lastShellKey(userId) {
  return new Request(`${self.location.origin}/__offline_last_shell__/${encodeURIComponent(userId)}`);
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

async function storeWorkspaceResponse(userId, url, response) {
  if (!userId || !isValidWorkspaceDocument(response)) return;
  const docCache = await caches.open(DOCUMENT_CACHE);
  const exactReq = documentKey(userId, url.pathname + url.search);
  await docCache.put(exactReq, response.clone());
  if (url.search) {
    await docCache.put(documentKey(userId, url.pathname), response.clone());
  }
  const sessionCache = await caches.open(SESSION_CACHE);
  await sessionCache.put(lastShellKey(userId), new Response(exactReq.url));
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
    await storeWorkspaceResponse(userId, url, response);
  } catch (error) {
    // Previously saved workspace remains available when a warmup request fails.
  }
}

async function findCachedWorkspaceDocument(userId, url) {
  if (!userId) return null;
  const docCache = await caches.open(DOCUMENT_CACHE);

  // 1. Exact URL match (pathname + search)
  const exact = await docCache.match(documentKey(userId, url.pathname + url.search));
  if (exact) return exact;

  // 2. Pathname-only match (ignores query parameters like ?tab=...)
  if (url.search) {
    const byPath = await docCache.match(documentKey(userId, url.pathname));
    if (byPath) return byPath;
  }

  // 3. Last saved workspace shell or /home fallback for the same authenticated user
  try {
    const sessionCache = await caches.open(SESSION_CACHE);
    const lastShellResp = await sessionCache.match(lastShellKey(userId));
    if (lastShellResp) {
      const lastKeyUrl = await lastShellResp.text();
      if (lastKeyUrl) {
        const lastCached = await docCache.match(lastKeyUrl);
        if (lastCached) return lastCached;
      }
    }
  } catch {}

  for (const fallbackPath of ['/home', '/']) {
    const shell = await docCache.match(documentKey(userId, fallbackPath));
    if (shell) return shell;
  }

  // 4. Any previously cached workspace document belonging strictly to this user
  const prefix = userDocPrefix(userId);
  const keys = await docCache.keys();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].url.startsWith(prefix)) {
      const match = await docCache.match(keys[i]);
      if (match) return match;
    }
  }
  return null;
}

function buildInteractiveOfflineResponse() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Offline - SPC Workspace</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #0f172a;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border-radius: 18px;
      padding: 28px 22px;
      text-align: center;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    }
    .icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: #fef3c7;
      color: #d97706;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    h1 { margin: 0 0 8px; font-size: 1.18rem; font-weight: 800; color: #0f172a; }
    p { margin: 0 0 18px; font-size: 0.88rem; line-height: 1.5; color: #475569; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    button {
      width: 100%;
      border: none;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary { background: #2563eb; color: #ffffff; }
    .btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; }
    .btn-ghost { background: #ffffff; color: #475569; border: 1px solid #e2e8f0; }
    .hint { margin-top: 14px; font-size: 0.76rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Internet Connection Band Hai</h1>
    <p>Yeh page abhi offline cache me saved nahi mila. Internet ON karke Refresh dabaiye ya pichhle page par wapas jayein.</p>
    <div class="actions">
      <button type="button" class="btn-primary" onclick="window.location.reload()">🔄 Refresh / Retry</button>
      <button type="button" class="btn-secondary" onclick="if (window.history.length > 1) { window.history.back(); } else { window.location.replace('/home'); }">⬅️ Go Back</button>
      <button type="button" class="btn-ghost" onclick="window.location.replace('/home')">🏠 Home Workspace</button>
    </div>
    <div class="hint" id="net-status">Network aate hi page apne-aap reload ho jayega...</div>
  </div>
  <script>
    window.addEventListener('online', function () {
      var el = document.getElementById('net-status');
      if (el) el.textContent = 'Internet connected! Reloading...';
      window.location.reload();
    });
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

async function cacheLoadedAssets(assetUrls) {
  const cache = await caches.open(STATIC_CACHE);
  const urls = (assetUrls || []).slice(0, 120);
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
      const tasks = [
        cacheWorkspaceDocument(data.userId, data.pageUrl || '/home'),
        cacheLoadedAssets(data.assetUrls)
      ];
      if (data.baseShellUrl) {
        tasks.push(cacheWorkspaceDocument(data.userId, data.baseShellUrl));
      }
      await Promise.allSettled(tasks);
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
      try {
        const response = await fetch(request);
        if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
        return response;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
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
          event.waitUntil(storeWorkspaceResponse(userId, url, response.clone()).catch(() => {}));
        }
      }
      return response;
    } catch (error) {
      const userId = await getActiveUser();
      const cached = await findCachedWorkspaceDocument(userId, url);
      if (cached) return cached;
      return buildInteractiveOfflineResponse();
    }
  })());
});
