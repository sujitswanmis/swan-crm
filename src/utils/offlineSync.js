// ============================================================================
// SuPuja Creations CRM - Robust IndexedDB Offline Storage & Auto-Sync Engine
// ============================================================================

const DB_NAME = 'supuja_crm_offline_db';
const DB_VERSION = 1;
const STORES = {
  LEADS_CACHE: 'leads_cache',
  SYNC_QUEUE: 'sync_queue',
  SYNC_HISTORY: 'sync_history'
};

/**
 * Initializes and returns a reference to the browser's IndexedDB
 */
export function openOfflineDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.LEADS_CACHE)) {
        db.createObjectStore(STORES.LEADS_CACHE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'queueId' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_HISTORY)) {
        const historyStore = db.createObjectStore(STORES.SYNC_HISTORY, { keyPath: 'id' });
        historyStore.createIndex('syncedAt', 'syncedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('IndexedDB open error:', request.error);
      resolve(null);
    };
  });
}

/**
 * Cache current leads array to IndexedDB for zero-latency / offline browsing
 */
export async function saveLeadsLocally(leads) {
  if (!Array.isArray(leads) || leads.length === 0) return;
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction(STORES.LEADS_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.LEADS_CACHE);
    
    // Clear and batch rewrite
    store.clear();
    leads.forEach((lead) => {
      if (lead && lead.id) {
        store.put(lead);
      }
    });

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Failed to cache leads locally:', err);
  }
}

/**
 * Read cached leads from IndexedDB when offline
 */
export async function getLocalLeads() {
  try {
    const db = await openOfflineDB();
    if (!db) return [];

    const tx = db.transaction(STORES.LEADS_CACHE, 'readonly');
    const store = tx.objectStore(STORES.LEADS_CACHE);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Failed to read local leads:', err);
    return [];
  }
}

/**
 * Queue an offline action (create / update / delete) to disk
 */
export async function enqueueOfflineAction(actionType, entityType, payload) {
  try {
    const db = await openOfflineDB();
    if (!db) return null;

    const queueItem = {
      queueId: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      actionType, // 'create' | 'update' | 'delete'
      entityType, // 'lead' | 'note' | 'attendance'
      payload,
      title: payload.name || payload.company || payload.title || `${actionType.toUpperCase()} ${entityType}`,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0
    };

    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    store.put(queueItem);

    // Also optimistically save to local leads cache if it's a lead
    if (entityType === 'lead') {
      try {
        const cacheTx = db.transaction(STORES.LEADS_CACHE, 'readwrite');
        const cacheStore = cacheTx.objectStore(STORES.LEADS_CACHE);
        if (actionType === 'update' && payload.id) {
          const getReq = cacheStore.get(payload.id);
          getReq.onsuccess = () => {
            const existing = getReq.result || {};
            cacheStore.put({
              ...existing,
              ...payload,
              is_offline_pending: true,
              updated_at: new Date().toISOString()
            });
          };
        } else {
          cacheStore.put({
            ...payload,
            id: payload.id || queueItem.queueId,
            is_offline_pending: true,
            created_at: payload.created_at || new Date().toISOString()
          });
        }
      } catch (e) {}
    }

    // Trigger local storage event for instant UI reactive sync
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supuja_offline_queue_changed', { detail: queueItem }));
    }

    return queueItem;
  } catch (err) {
    console.error('Failed to enqueue offline action:', err);
    return null;
  }
}

/**
 * Get all pending actions in the sync queue
 */
export async function getPendingQueue() {
  try {
    const db = await openOfflineDB();
    if (!db) return [];

    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const items = request.result || [];
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Failed to read sync queue:', err);
    return [];
  }
}

/**
 * Get synced history
 */
export async function getSyncHistory() {
  try {
    const db = await openOfflineDB();
    if (!db) return [];

    const tx = db.transaction(STORES.SYNC_HISTORY, 'readonly');
    const store = tx.objectStore(STORES.SYNC_HISTORY);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const items = request.result || [];
        items.sort((a, b) => b.syncedAt - a.syncedAt);
        resolve(items.slice(0, 20));
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Clear a specific item from sync queue after successful sync
 */
export async function removeQueueItem(queueId, syncedData = null) {
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction([STORES.SYNC_QUEUE, STORES.SYNC_HISTORY], 'readwrite');
    const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
    const historyStore = tx.objectStore(STORES.SYNC_HISTORY);

    queueStore.delete(queueId);

    if (syncedData) {
      historyStore.put({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: syncedData.title || syncedData.name || 'Synced Item',
        entityType: syncedData.entityType || 'lead',
        actionType: syncedData.actionType || 'create',
        syncedAt: Date.now()
      });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supuja_offline_queue_changed'));
    }
  } catch (err) {
    console.warn('Failed to remove queue item:', err);
  }
}

/**
 * Synchronizes all pending items with Supabase Postgres database
 */
export async function syncPendingQueue(supabaseClient, onProgress = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, reason: 'offline', count: 0 };
  }

  const queue = await getPendingQueue();
  if (queue.length === 0) {
    return { success: true, count: 0 };
  }

  let successCount = 0;
  let failCount = 0;

  for (const item of queue) {
    try {
      if (onProgress) onProgress(item, 'syncing');

      if (item.entityType === 'lead') {
        if (item.actionType === 'create') {
          const { is_offline_pending, queueId, ...cleanPayload } = item.payload;
          if (cleanPayload.id && String(cleanPayload.id).startsWith('queue_')) {
            delete cleanPayload.id;
          }

          const { data, error } = await supabaseClient
            .from('leads')
            .insert([cleanPayload])
            .select()
            .single();

          if (error) throw error;
          await removeQueueItem(item.queueId, { ...item, title: cleanPayload.name || cleanPayload.company });
          successCount++;
        } else if (item.actionType === 'update') {
          const { id, is_offline_pending, queueId, ...cleanPayload } = item.payload;
          if (!id || String(id).startsWith('queue_')) {
            await removeQueueItem(item.queueId);
            continue;
          }

          const { error } = await supabaseClient
            .from('leads')
            .update(cleanPayload)
            .eq('id', id);

          if (error) throw error;
          await removeQueueItem(item.queueId, item);
          successCount++;
        } else if (item.actionType === 'delete') {
          if (item.payload.id && !String(item.payload.id).startsWith('queue_')) {
            await supabaseClient.from('leads').delete().eq('id', item.payload.id);
          }
          await removeQueueItem(item.queueId, item);
          successCount++;
        }
      } else if (item.entityType === 'attendance') {
        const payload = item.payload;
        if (payload.out_time) {
          const { error } = await supabaseClient
            .from('attendance_records')
            .update({
              out_time: payload.out_time,
              out_location: payload.out_location,
              out_method: payload.out_method,
              total_working_minutes: payload.total_working_minutes,
              status: payload.status,
              remarks: payload.remarks
            })
            .match({ email: payload.email, attendance_date: payload.attendance_date });

          if (error) throw error;
          await removeQueueItem(item.queueId, { ...item, title: `Punch-Out: ${payload.empName}` });
          successCount++;
        } else {
          const { error } = await supabaseClient
            .from('attendance_records')
            .upsert([payload], { onConflict: 'email,attendance_date' });

          if (error) throw error;
          await removeQueueItem(item.queueId, { ...item, title: `Punch-In: ${payload.empName}` });
          successCount++;
        }
      }
    } catch (itemErr) {
      console.warn('Sync failed for item:', item.queueId, itemErr);
      failCount++;
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supuja_offline_sync_completed', { 
      detail: { successCount, failCount } 
    }));
  }

  return { success: failCount === 0, count: successCount, failed: failCount };
}
