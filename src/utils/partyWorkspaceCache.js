// Separate from the lead/offline database: only Party and Channel Operations use this cache.
const MAX_AGE_MS = 30 * 60 * 1000;
const entries = new Map();
const pending = new Map();
const memoryRevisions = new Map();
let databasePromise;

export const PARTY_WORKSPACE_UPDATED = 'party_workspace_updated';

export function createPartyWorkspaceScope({ tenantId, company, userId, userEmail, userRole, moduleAccess }) {
  const user = String(userId || userEmail || '').trim().toLowerCase();
  if (!tenantId || !user) return null;
  const workspace = JSON.stringify([tenantId, String(company || '').trim().toLowerCase()]);
  return {
    workspace,
    key: JSON.stringify([workspace, user, userRole || '', moduleAccess || {}])
  };
}

function revision(scope) {
  try { return window.localStorage.getItem(`party_workspace_revision:${scope.workspace}`) || memoryRevisions.get(scope.workspace) || ''; }
  catch { return memoryRevisions.get(scope.workspace) || ''; }
}

function istDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function cacheKey(scope, resource) {
  return JSON.stringify([scope.key, resource]);
}

function remember(key, entry) {
  entries.set(key, entry);
  if (entries.size > 24) entries.delete(entries.keys().next().value);
}

function usable(entry, scope) {
  return entry && entry.day === istDay() && entry.revision === revision(scope) &&
    Number.isFinite(entry.savedAt) && Date.now() >= entry.savedAt && Date.now() - entry.savedAt <= MAX_AGE_MS;
}

function database() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (!databasePromise) {
    databasePromise = new Promise(resolve => {
      let settled = false;
      const finish = db => {
        if (settled) { db?.close(); return; }
        settled = true;
        clearTimeout(timer);
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), 1200);
      try {
        const request = window.indexedDB.open('crm_party_workspace_v1', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); databasePromise = undefined; };
          finish(db);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
  }
  return databasePromise;
}

export async function readPartyWorkspaceCache(scope, resource) {
  if (!scope) return null;
  const key = cacheKey(scope, resource);
  if (usable(entries.get(key), scope)) return entries.get(key).data;
  try {
    const db = await database();
    if (!db) return null;
    const entry = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 1200);
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').get(key);
      request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); resolve(null); };
    });
    if (!usable(entry, scope)) return null;
    // A slow IndexedDB read must never replace a newer network snapshot.
    const current = entries.get(key);
    if (usable(current, scope) && current.savedAt >= entry.savedAt) return current.data;
    remember(key, entry);
    return entry.data;
  } catch { return null; }
}

async function persist(key, entry) {
  try {
    const db = await database();
    if (db) db.transaction('snapshots', 'readwrite').objectStore('snapshots').put(entry, key);
  } catch { /* Storage unavailable/full: the network and in-memory data still work. */ }
}

export async function fetchPartyWorkspaceResource(scope, resource, loader) {
  if (!scope) return loader();
  const key = cacheKey(scope, resource);
  const startedRevision = revision(scope);
  const day = istDay();
  const requestKey = JSON.stringify([key, startedRevision, day]);
  if (pending.has(requestKey)) return pending.get(requestKey);
  const request = Promise.resolve().then(loader).then(data => {
    if (revision(scope) !== startedRevision || day !== istDay()) throw new Error('Workspace changed while loading; a newer refresh is required.');
    const entry = { data, savedAt: Date.now(), revision: startedRevision, day };
    remember(key, entry);
    void persist(key, entry);
    return data;
  }).finally(() => { pending.delete(requestKey); });
  pending.set(requestKey, request);
  return request;
}

export function invalidatePartyWorkspace(scope, source) {
  if (!scope) return;
  const nextRevision = `${Date.now()}:${Math.random()}`;
  memoryRevisions.set(scope.workspace, nextRevision);
  try {
    window.localStorage.setItem(`party_workspace_revision:${scope.workspace}`, nextRevision);
  } catch { /* In-memory invalidation still works if browser storage is disabled. */ }
  try {
    window.dispatchEvent(new CustomEvent(PARTY_WORKSPACE_UPDATED, { detail: { workspace: scope.workspace, source } }));
  } catch { /* Cache invalidation does not depend on event delivery. */ }
}
