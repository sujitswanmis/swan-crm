'use client';

const IDB_NAME = 'spc_field_tasks_local_db';
const IDB_VERSION = 1;
const STORE_TASKS = 'tasks_scopes';
const STORE_META = 'meta_scopes';

const FAST_TASKS_PREFIX = 'spc_ftm_fast_tasks_v1_';
const FAST_META_PREFIX = 'spc_ftm_fast_meta_v1_';
const MAX_FAST_SNAPSHOT_TASKS = 500;

function normalizeToken(val, fallback = '') {
  const s = String(val ?? '').trim();
  return s || fallback;
}

/**
 * Build a strictly isolated scope key for Field Task Manager task caches.
 * Prevents cross-user, cross-tenant, cross-company, or cross-tab data leakage.
 */
export function buildFieldTaskScopeKey({
  userId = '',
  tenantId = '',
  company = 'TNT00001',
  adminCompanyFilter = 'All',
  viewScope = 'assigned_by_me',
} = {}) {
  return [
    normalizeToken(userId, 'anon'),
    normalizeToken(tenantId, 'default'),
    normalizeToken(company, 'TNT00001').toLowerCase(),
    normalizeToken(adminCompanyFilter, 'All').toLowerCase(),
    normalizeToken(viewScope, 'assigned_by_me').toLowerCase(),
  ].join('|');
}

/**
 * Build a strictly isolated scope key for forms & team members metadata.
 */
export function buildFieldTaskMetaScopeKey({
  userId = '',
  tenantId = '',
  company = 'TNT00001',
  adminCompanyFilter = 'All',
  branchScopeKey = '',
} = {}) {
  return [
    normalizeToken(userId, 'anon'),
    normalizeToken(tenantId, 'default'),
    normalizeToken(company, 'TNT00001').toLowerCase(),
    normalizeToken(adminCompanyFilter, 'All').toLowerCase(),
    normalizeToken(branchScopeKey, 'all'),
  ].join('|');
}

function openFieldTasksDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          db.createObjectStore(STORE_TASKS, { keyPath: 'scopeKey' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'scopeKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(storeName, key) {
  try {
    const db = await openFieldTasksDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbPut(storeName, record) {
  try {
    const db = await openFieldTasksDB();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(record);
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

/**
 * Synchronous localStorage fast snapshot read for 0ms initial hydration.
 */
export function getFastFieldTasksSnapshot(scopeKey) {
  if (typeof window === 'undefined' || !scopeKey) return null;
  try {
    const raw = window.localStorage.getItem(`${FAST_TASKS_PREFIX}${scopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return {
      tasks: parsed.tasks,
      syncedAt: parsed.syncedAt || null,
      savedAt: parsed.savedAt || null,
    };
  } catch {
    return null;
  }
}

export function saveFastFieldTasksSnapshot(scopeKey, { tasks = [], syncedAt = null } = {}) {
  if (typeof window === 'undefined' || !scopeKey || !Array.isArray(tasks)) return;
  try {
    const payload = {
      tasks: tasks.slice(0, MAX_FAST_SNAPSHOT_TASKS),
      syncedAt: syncedAt || new Date().toISOString(),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(`${FAST_TASKS_PREFIX}${scopeKey}`, JSON.stringify(payload));
  } catch {
    // Non-fatal if browser storage quota is exceeded or disabled
  }
}

export function getFastFieldTaskMetaSnapshot(metaScopeKey) {
  if (typeof window === 'undefined' || !metaScopeKey) return null;
  try {
    const raw = window.localStorage.getItem(`${FAST_META_PREFIX}${metaScopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      forms: Array.isArray(parsed.forms) ? parsed.forms : [],
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : [],
      syncedAt: parsed.syncedAt || null,
    };
  } catch {
    return null;
  }
}

export function saveFastFieldTaskMetaSnapshot(metaScopeKey, { forms = [], teamMembers = [], syncedAt = null } = {}) {
  if (typeof window === 'undefined' || !metaScopeKey) return;
  try {
    // Store lightweight team fields needed by FieldTaskManager dropdowns
    const slimMembers = (Array.isArray(teamMembers) ? teamMembers : []).map((m) => ({
      id: m.id,
      user_id: m.user_id,
      emp_name: m.emp_name,
      name: m.name,
      email: m.email,
      emp_designation: m.emp_designation,
      company: m.company,
      branch_name: m.branch_name,
    }));
    const payload = {
      forms: Array.isArray(forms) ? forms : [],
      teamMembers: slimMembers,
      syncedAt: syncedAt || new Date().toISOString(),
    };
    window.localStorage.setItem(`${FAST_META_PREFIX}${metaScopeKey}`, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }
}

export async function getLocalFieldTasksCache(scopeKey) {
  if (!scopeKey) return null;
  const row = await idbGet(STORE_TASKS, scopeKey);
  if (!row || !Array.isArray(row.tasks)) return null;
  return {
    scopeKey: row.scopeKey,
    tasks: row.tasks,
    syncedAt: row.syncedAt || null,
  };
}

export async function saveLocalFieldTasksCache(scopeKey, { tasks = [], syncedAt = null } = {}) {
  if (!scopeKey || !Array.isArray(tasks)) return false;
  const iso = syncedAt || new Date().toISOString();
  saveFastFieldTasksSnapshot(scopeKey, { tasks, syncedAt: iso });
  return idbPut(STORE_TASKS, {
    scopeKey,
    tasks,
    syncedAt: iso,
    updatedAt: Date.now(),
  });
}

export async function getLocalFieldTaskMetaCache(metaScopeKey) {
  if (!metaScopeKey) return null;
  const row = await idbGet(STORE_META, metaScopeKey);
  if (!row) return null;
  return {
    scopeKey: row.scopeKey,
    forms: Array.isArray(row.forms) ? row.forms : [],
    teamMembers: Array.isArray(row.teamMembers) ? row.teamMembers : [],
    syncedAt: row.syncedAt || null,
  };
}

export async function saveLocalFieldTaskMetaCache(metaScopeKey, { forms = [], teamMembers = [], syncedAt = null } = {}) {
  if (!metaScopeKey) return false;
  const iso = syncedAt || new Date().toISOString();
  saveFastFieldTaskMetaSnapshot(metaScopeKey, { forms, teamMembers, syncedAt: iso });
  return idbPut(STORE_META, {
    scopeKey: metaScopeKey,
    forms: Array.isArray(forms) ? forms : [],
    teamMembers: Array.isArray(teamMembers) ? teamMembers : [],
    syncedAt: iso,
    updatedAt: Date.now(),
  });
}

function getTaskSortTimestamp(task) {
  const ts = Date.parse(task?.created_at || task?.scheduled_start_time || 0);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Merge delta-fetched tasks into existing cached tasks and reconcile against activeIds.
 * Any cached task whose ID is absent from activeIds (reassigned out of scope or deleted) is removed.
 */
export function mergeFieldTasksDelta(existingTasks = [], deltaTasks = [], activeIds = null) {
  const byId = new Map();
  for (const t of Array.isArray(existingTasks) ? existingTasks : []) {
    if (t && t.id) byId.set(t.id, t);
  }

  if (Array.isArray(activeIds)) {
    const activeSet = new Set(activeIds);
    for (const id of byId.keys()) {
      if (!activeSet.has(id)) {
        byId.delete(id);
      }
    }
  }

  for (const t of Array.isArray(deltaTasks) ? deltaTasks : []) {
    if (t && t.id) {
      const prev = byId.get(t.id);
      byId.set(t.id, prev ? { ...prev, ...t } : t);
    }
  }

  return Array.from(byId.values()).sort((a, b) => getTaskSortTimestamp(b) - getTaskSortTimestamp(a));
}
