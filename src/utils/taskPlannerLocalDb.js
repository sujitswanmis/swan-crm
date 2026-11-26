'use client';

/**
 * SuPuja Creations CRM - Task Planner LocalDB & Delta Sync Cache Engine
 * High-speed IndexedDB client-side cache and offline persistence for Task Planner
 */

const DB_NAME = 'supuja_task_planner_cache';
const DB_VERSION = 1;

let cachedDbInstance = null;
let dbOpenPromise = null;

/**
 * Initializes and returns a singleton reference to the Task Planner IndexedDB
 */
export function openTaskPlannerDB() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  if (cachedDbInstance) {
    return Promise.resolve(cachedDbInstance);
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store 1: Task Items Store
        if (!db.objectStoreNames.contains('task_items')) {
          const store = db.createObjectStore('task_items', { keyPath: 'id' });
          store.createIndex('tenant_id', 'tenant_id', { unique: false });
          store.createIndex('employee_email', 'employee_email', { unique: false });
          store.createIndex('planned_date', 'planned_date', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Store 2: Sync Metadata Store (tracks lastSyncedAt timestamp per user scope)
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'scope' });
        }
      };

      request.onsuccess = (event) => {
        cachedDbInstance = event.target.result;
        cachedDbInstance.onversionchange = () => {
          if (cachedDbInstance) {
            cachedDbInstance.close();
            cachedDbInstance = null;
            dbOpenPromise = null;
          }
        };
        resolve(cachedDbInstance);
      };

      request.onerror = (err) => {
        console.warn('Failed to open Task Planner LocalDB:', err);
        dbOpenPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('Task Planner LocalDB open blocked.');
        dbOpenPromise = null;
        resolve(null);
      };
    } catch (e) {
      console.warn('Task Planner IndexedDB initialization exception:', e);
      dbOpenPromise = null;
      resolve(null);
    }
  });

  return dbOpenPromise;
}

/**
 * Helper to generate a consistent scope key per tenant and employee
 */
export function getTaskPlannerScopeKey(tenantId = '', employeeEmail = '') {
  const t = String(tenantId || 'default').trim().toLowerCase();
  const e = String(employeeEmail || 'all').trim().toLowerCase();
  return `${t}::${e}`;
}

/**
 * Get the last delta sync timestamp for a given scope
 */
export async function getLastSyncTimestamp(scopeKey) {
  try {
    const db = await openTaskPlannerDB();
    if (!db) return null;

    const tx = db.transaction('sync_meta', 'readonly');
    const store = tx.objectStore('sync_meta');
    const request = store.get(scopeKey);

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result?.lastSyncedAt || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error reading last sync timestamp:', err);
    return null;
  }
}

/**
 * Save the last delta sync timestamp for a given scope
 */
export async function setLastSyncTimestamp(scopeKey, timestamp) {
  try {
    const db = await openTaskPlannerDB();
    if (!db) return;

    const tx = db.transaction('sync_meta', 'readwrite');
    const store = tx.objectStore('sync_meta');
    store.put({
      scope: scopeKey,
      lastSyncedAt: timestamp,
      updatedAt: new Date().toISOString()
    });

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error saving last sync timestamp:', err);
  }
}

/**
 * Retrieve cached active tasks for current filters (Instant 0ms UI load)
 */
export async function getCachedTaskPlannerItems({
  tenantId = '',
  scopeKey = '',
  employeeEmail = '',
  date = null,
  startDate = null,
  endDate = null,
  status = null,
  requesterFilter = 'ALL',
  branchCode = null
} = {}) {
  try {
    const db = await openTaskPlannerDB();
    if (!db) return [];

    const tx = db.transaction('task_items', 'readonly');
    const store = tx.objectStore('task_items');
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        let rows = request.result || [];
        const cleanEmail = employeeEmail ? String(employeeEmail).trim().toLowerCase() : null;
        const cleanTenant = tenantId && tenantId !== 'ALL' && tenantId !== 'All' ? String(tenantId).trim().toLowerCase() : null;

        // Scope / Tenant isolation
        if (scopeKey) {
          rows = rows.filter(r => r.__scopeKey ? r.__scopeKey === scopeKey : (!cleanTenant || String(r.tenant_id || '').toLowerCase() === cleanTenant));
        } else if (cleanTenant) {
          rows = rows.filter(r => !r.tenant_id || String(r.tenant_id).toLowerCase() === cleanTenant);
        }

        // Filter by employee email if specified
        if (cleanEmail) {
          rows = rows.filter(r => r.employee_email && String(r.employee_email).trim().toLowerCase() === cleanEmail);
        }

        // Filter out soft-deleted (CANCELLED) unless specifically requested
        if (status && status !== 'ALL') {
          rows = rows.filter(r => r.status === status);
        } else {
          rows = rows.filter(r => r.status !== 'CANCELLED');
        }

        // Date / Range filters
        if (date) {
          rows = rows.filter(r => r.planned_date === date);
        } else if (startDate && endDate) {
          rows = rows.filter(r => r.planned_date >= startDate && r.planned_date <= endDate);
        } else if (startDate) {
          rows = rows.filter(r => r.planned_date >= startDate);
        }

        // Requester filter (Self vs Given by Others)
        if (requesterFilter === 'SELF') {
          rows = rows.filter(r => !r.requested_by_name || r.requested_by_name.trim() === '');
        } else if (requesterFilter === 'OTHERS') {
          rows = rows.filter(r => r.requested_by_name && r.requested_by_name.trim() !== '');
        } else if (requesterFilter && requesterFilter !== 'ALL') {
          const q = requesterFilter.toLowerCase();
          rows = rows.filter(r => (r.requested_by_name || '').toLowerCase().includes(q));
        }

        // Branch filter if not All
        if (branchCode && branchCode !== 'All' && branchCode !== 'ALL') {
          rows = rows.filter(r => !r.branch_code || r.branch_code === 'All' || r.branch_code === branchCode);
        }

        // Sort by planned_date asc, time_slot_start asc, created_at asc
        rows.sort((a, b) => {
          if (a.planned_date !== b.planned_date) {
            return String(a.planned_date || '').localeCompare(String(b.planned_date || ''));
          }
          if (a.time_slot_start !== b.time_slot_start) {
            return String(a.time_slot_start || '').localeCompare(String(b.time_slot_start || ''));
          }
          return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });

        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Error reading from Task Planner LocalDB:', err);
    return [];
  }
}

/**
 * Retrieve cached soft-deleted tasks for Trash tab (Instant 0ms UI load)
 */
export async function getCachedDeletedTasks({
  tenantId = '',
  scopeKey = '',
  employeeEmail = '',
  branchCode = null
} = {}) {
  try {
    const db = await openTaskPlannerDB();
    if (!db) return [];

    const tx = db.transaction('task_items', 'readonly');
    const store = tx.objectStore('task_items');
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        let rows = (request.result || []).filter(r => r.status === 'CANCELLED');
        const cleanEmail = employeeEmail ? String(employeeEmail).trim().toLowerCase() : null;
        const cleanTenant = tenantId && tenantId !== 'ALL' && tenantId !== 'All' ? String(tenantId).trim().toLowerCase() : null;

        if (scopeKey) {
          rows = rows.filter(r => r.__scopeKey ? r.__scopeKey === scopeKey : (!cleanTenant || String(r.tenant_id || '').toLowerCase() === cleanTenant));
        } else if (cleanTenant) {
          rows = rows.filter(r => !r.tenant_id || String(r.tenant_id).toLowerCase() === cleanTenant);
        }

        if (cleanEmail) {
          rows = rows.filter(r => r.employee_email && String(r.employee_email).trim().toLowerCase() === cleanEmail);
        }

        if (branchCode && branchCode !== 'All' && branchCode !== 'ALL') {
          rows = rows.filter(r => !r.branch_code || r.branch_code === 'All' || r.branch_code === branchCode);
        }

        // Sort by updated_at descending
        rows.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Error reading deleted tasks from Task Planner LocalDB:', err);
    return [];
  }
}

/**
 * Bulk upsert tasks into LocalDB (used during initial load, full refresh, and delta sync)
 */
export async function saveTaskPlannerItemsToCache(items = [], scopeKey = '', lastSyncedAt = null, replaceScope = false) {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0 && !(scopeKey && (lastSyncedAt || replaceScope))) return true;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction(['task_items', 'sync_meta'], 'readwrite');
    const itemStore = tx.objectStore('task_items');
    const metaStore = tx.objectStore('sync_meta');

    if (replaceScope && scopeKey) {
      const incomingIds = new Set(safeItems.filter(i => i?.id).map(i => i.id));
      const allReq = itemStore.getAll();
      allReq.onsuccess = () => {
        const existing = allReq.result || [];
        for (const row of existing) {
          const belongsToScope = row.__scopeKey ? row.__scopeKey === scopeKey : true;
          if (belongsToScope && !row.__offline_pending && !incomingIds.has(row.id)) {
            itemStore.delete(row.id);
          }
        }
        for (const item of safeItems) {
          if (item && item.id) {
            itemStore.put(scopeKey ? { ...item, __scopeKey: scopeKey } : item);
          }
        }
      };
    } else {
      for (const item of safeItems) {
        if (item && item.id) {
          itemStore.put(scopeKey ? { ...item, __scopeKey: scopeKey } : item);
        }
      }
    }

    if (scopeKey && lastSyncedAt) {
      metaStore.put({
        scope: scopeKey,
        lastSyncedAt,
        updatedAt: new Date().toISOString()
      });
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error saving tasks to LocalDB cache:', err);
    return false;
  }
}

/**
 * Optimistic local save for add/edit operations (Immediate 0ms response)
 */
export async function optimisticSaveTaskLocally(task, scopeKey = '') {
  if (!task || !task.id) return null;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return null;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    const updated = {
      ...task,
      ...(scopeKey ? { __scopeKey: scopeKey } : {}),
      updated_at: task.updated_at || new Date().toISOString()
    };
    store.put(updated);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error optimistically saving task locally:', err);
    return null;
  }
}

/**
 * Atomically replace a temporary offline task ID with the persisted server task record
 */
export async function replaceLocalTaskId(tempId, serverTask, scopeKey = '') {
  if (!serverTask || !serverTask.id) return null;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return null;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    if (tempId && tempId !== serverTask.id) {
      store.delete(tempId);
    }
    const cleanServerTask = {
      ...serverTask,
      ...(scopeKey ? { __scopeKey: scopeKey } : {}),
      __offline_pending: false
    };
    store.put(cleanServerTask);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(cleanServerTask);
      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error replacing temporary local task ID:', err);
    return null;
  }
}

/**
 * Optimistic local status update (e.g. toggle Planned -> In Progress -> Completed)
 */
export async function optimisticUpdateStatusLocally(id, newStatus, notes = '', actualMinutes = null) {
  if (!id) return false;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    const getReq = store.get(id);

    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          resolve(false);
          return;
        }

        const nowIso = new Date().toISOString();
        const updated = {
          ...item,
          status: newStatus,
          updated_at: nowIso
        };

        if (notes) updated.notes = notes;
        if (actualMinutes !== null) updated.actual_minutes = parseInt(actualMinutes, 10);
        if (newStatus === 'COMPLETED' && !updated.completed_at) {
          updated.completed_at = nowIso;
        } else if (newStatus !== 'COMPLETED') {
          updated.completed_at = null;
        }

        store.put(updated);
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error updating status locally:', err);
    return false;
  }
}

/**
 * Optimistic local carry forward
 */
export async function optimisticCarryForwardLocally(id, targetDate) {
  if (!id || !targetDate) return false;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    const getReq = store.get(id);

    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          resolve(false);
          return;
        }

        const updated = {
          ...item,
          planned_date: targetDate,
          status: 'CARRIED_FORWARD',
          carry_forward_count: (item.carry_forward_count || 0) + 1,
          updated_at: new Date().toISOString()
        };

        store.put(updated);
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error carrying forward task locally:', err);
    return false;
  }
}

/**
 * Optimistic local soft delete (Move to Trash)
 */
export async function optimisticSoftDeleteLocally(id) {
  if (!id) return false;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    const getReq = store.get(id);

    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          resolve(false);
          return;
        }

        const updated = {
          ...item,
          status: 'CANCELLED',
          updated_at: new Date().toISOString()
        };

        store.put(updated);
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error soft deleting task locally:', err);
    return false;
  }
}

/**
 * Optimistic local restore from Trash
 */
export async function optimisticRestoreLocally(id) {
  if (!id) return false;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    const getReq = store.get(id);

    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          resolve(false);
          return;
        }

        const updated = {
          ...item,
          status: 'PLANNED',
          updated_at: new Date().toISOString()
        };

        store.put(updated);
        resolve(true);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error restoring task locally:', err);
    return false;
  }
}

/**
 * Optimistic permanent deletion (Remove key from LocalDB)
 */
export async function optimisticPermanentDeleteLocally(id) {
  if (!id) return false;

  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction('task_items', 'readwrite');
    const store = tx.objectStore('task_items');
    store.delete(id);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error permanently deleting task locally:', err);
    return false;
  }
}

/**
 * Clear all cached items for a reset
 */
export async function clearTaskPlannerCache() {
  try {
    const db = await openTaskPlannerDB();
    if (!db) return false;

    const tx = db.transaction(['task_items', 'sync_meta'], 'readwrite');
    tx.objectStore('task_items').clear();
    tx.objectStore('sync_meta').clear();

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Error clearing Task Planner cache:', err);
    return false;
  }
}
