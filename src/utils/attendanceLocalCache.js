'use client';

const IDB_NAME = 'spc_attendance_local_db';
const IDB_VERSION = 1;
const STORE_CACHES = 'att_caches';
const STORE_META = 'att_sync_meta';

const FAST_SNAPSHOT_PREFIX = 'spc_att_fast_v1_';
const FAST_META_PREFIX = 'spc_att_meta_v1_';
const MAX_FAST_JSON_CHARS = 350000;

let dbPromise = null;

function normalizeToken(val, fallback = '') {
  const s = String(val ?? '').trim();
  return s || fallback;
}

/**
 * Strictly isolated scope key per user, tenant, company, and active branch filter.
 */
export function buildAttendanceScopeKey({
  userId = '',
  userEmail = '',
  tenantId = '',
  userCompany = '',
  adminCompanyFilter = 'All',
  branchScopeKey = ''
} = {}) {
  return [
    normalizeToken(userId || userEmail, 'anon').toLowerCase(),
    normalizeToken(userEmail, 'noemail').toLowerCase(),
    normalizeToken(tenantId, 'default').toLowerCase(),
    normalizeToken(userCompany, 'default').toLowerCase(),
    normalizeToken(adminCompanyFilter, 'all').toLowerCase(),
    normalizeToken(branchScopeKey, 'all').toLowerCase()
  ].join('|');
}

function openAttendanceDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CACHES)) {
          const store = db.createObjectStore(STORE_CACHES, { keyPath: 'cacheKey' });
          store.createIndex('scopeKey', 'scopeKey', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'scopeKey' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

export function getAttendanceFastSnapshot(cacheKey) {
  if (typeof window === 'undefined' || !cacheKey) return null;
  try {
    const raw = window.localStorage.getItem(`${FAST_SNAPSHOT_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAttendanceFastSnapshot(cacheKey, data) {
  if (typeof window === 'undefined' || !cacheKey || data === undefined) return;
  try {
    const payload = JSON.stringify({ data, savedAt: Date.now() });
    if (payload.length > MAX_FAST_JSON_CHARS) return;
    try {
      window.localStorage.setItem(`${FAST_SNAPSHOT_PREFIX}${cacheKey}`, payload);
    } catch {
      // Evict older attendance fast snapshots on quota pressure
      const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(FAST_SNAPSHOT_PREFIX));
      for (const oldKey of keys.slice(0, Math.max(1, Math.floor(keys.length / 2)))) {
        try { window.localStorage.removeItem(oldKey); } catch {}
      }
      try {
        window.localStorage.setItem(`${FAST_SNAPSHOT_PREFIX}${cacheKey}`, payload);
      } catch {}
    }
  } catch {}
}

export function getAttendanceFastMeta(scopeKey) {
  if (typeof window === 'undefined' || !scopeKey) return null;
  try {
    const raw = window.localStorage.getItem(`${FAST_META_PREFIX}${scopeKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAttendanceFastMeta(scopeKey, meta) {
  if (typeof window === 'undefined' || !scopeKey || !meta) return;
  try {
    window.localStorage.setItem(`${FAST_META_PREFIX}${scopeKey}`, JSON.stringify(meta));
  } catch {}
}

export async function getAttendanceLocalCache(cacheKey) {
  if (!cacheKey) return null;
  try {
    const db = await openAttendanceDB();
    if (!db) return getAttendanceFastSnapshot(cacheKey);
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CACHES, 'readonly');
        const req = tx.objectStore(STORE_CACHES).get(cacheKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return getAttendanceFastSnapshot(cacheKey);
  }
}

export async function saveAttendanceLocalCache(cacheKey, scopeKey, data, syncedAt = null) {
  if (!cacheKey || !scopeKey || data === undefined) return false;
  saveAttendanceFastSnapshot(cacheKey, data);
  try {
    const db = await openAttendanceDB();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CACHES, 'readwrite');
        tx.objectStore(STORE_CACHES).put({
          cacheKey,
          scopeKey,
          data,
          syncedAt: syncedAt || new Date().toISOString(),
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function getAllAttendanceLocalCachesForScope(scopeKey) {
  const resultMap = new Map();
  if (!scopeKey) return resultMap;
  try {
    const db = await openAttendanceDB();
    if (!db) return resultMap;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CACHES, 'readonly');
        const store = tx.objectStore(STORE_CACHES);
        const req = store.indexNames.contains('scopeKey')
          ? store.index('scopeKey').getAll(scopeKey)
          : store.getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          for (const row of rows) {
            if (row && row.cacheKey && row.scopeKey === scopeKey) {
              resultMap.set(row.cacheKey, row);
            }
          }
          resolve(resultMap);
        };
        req.onerror = () => resolve(resultMap);
      } catch {
        resolve(resultMap);
      }
    });
  } catch {
    return resultMap;
  }
}

export async function getAttendanceSyncMeta(scopeKey) {
  if (!scopeKey) return null;
  try {
    const db = await openAttendanceDB();
    if (!db) return getAttendanceFastMeta(scopeKey);
    const idbMeta = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get(scopeKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return idbMeta || getAttendanceFastMeta(scopeKey);
  } catch {
    return getAttendanceFastMeta(scopeKey);
  }
}

export async function saveAttendanceSyncMeta(scopeKey, meta) {
  if (!scopeKey || !meta) return false;
  const record = { scopeKey, ...meta, updatedAt: Date.now() };
  saveAttendanceFastMeta(scopeKey, record);
  try {
    const db = await openAttendanceDB();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function clearAttendanceScopeCaches(scopeKey) {
  if (!scopeKey) return false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(`${FAST_META_PREFIX}${scopeKey}`);
      const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(`${FAST_SNAPSHOT_PREFIX}${scopeKey}::`));
      for (const k of keys) {
        try { window.localStorage.removeItem(k); } catch {}
      }
    } catch {}
  }
  try {
    const db = await openAttendanceDB();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CACHES, STORE_META], 'readwrite');
        tx.objectStore(STORE_META).delete(scopeKey);
        const cachesStore = tx.objectStore(STORE_CACHES);
        const cursorReq = cachesStore.indexNames.contains('scopeKey')
          ? cachesStore.index('scopeKey').openKeyCursor(scopeKey)
          : cachesStore.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          if (cursor.primaryKey !== undefined) {
            cachesStore.delete(cursor.primaryKey);
          } else if (cursor.value?.scopeKey === scopeKey) {
            cachesStore.delete(cursor.value.cacheKey);
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
