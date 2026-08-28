// ============================================================================
// SuPuja Creations CRM - Robust IndexedDB Offline Storage & Auto-Sync Engine
// ============================================================================

export const MAX_OFFLINE_SECONDS_PER_DAY = 5 * 60 * 60; // Maximum 5 Hours Offline Limit Per Day (18,000 Seconds)

const DB_NAME = 'supuja_crm_offline_db';
const DB_VERSION = 1;
const STORES = {
  LEADS_CACHE: 'leads_cache',
  SYNC_QUEUE: 'sync_queue',
  SYNC_HISTORY: 'sync_history'
};

function getTodayQuotaKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `supuja_offline_sec_${year}-${month}-${day}`;
}

/**
 * Returns current day's cumulative offline usage and remaining quota
 */
export function getDailyOfflineUsage() {
  if (typeof window === 'undefined') {
    return { secondsUsed: 0, secondsRemaining: MAX_OFFLINE_SECONDS_PER_DAY, isExceeded: false, percentUsed: 0, formattedUsed: '0m', formattedRemaining: '5h 0m' };
  }
  try {
    const key = getTodayQuotaKey();
    const raw = localStorage.getItem(key);
    const secondsUsed = raw ? parseInt(raw, 10) || 0 : 0;
    const secondsRemaining = Math.max(0, MAX_OFFLINE_SECONDS_PER_DAY - secondsUsed);
    const isExceeded = secondsUsed >= MAX_OFFLINE_SECONDS_PER_DAY;
    const percentUsed = Math.min(100, Math.round((secondsUsed / MAX_OFFLINE_SECONDS_PER_DAY) * 100));

    const usedHours = Math.floor(secondsUsed / 3600);
    const usedMins = Math.floor((secondsUsed % 3600) / 60);
    const remHours = Math.floor(secondsRemaining / 3600);
    const remMins = Math.floor((secondsRemaining % 3600) / 60);

    return {
      secondsUsed,
      secondsRemaining,
      isExceeded,
      percentUsed,
      formattedUsed: usedHours > 0 ? `${usedHours}h ${usedMins}m` : `${usedMins}m`,
      formattedRemaining: remHours > 0 ? `${remHours}h ${remMins}m` : `${remMins}m`
    };
  } catch (e) {
    return { secondsUsed: 0, secondsRemaining: MAX_OFFLINE_SECONDS_PER_DAY, isExceeded: false, percentUsed: 0, formattedUsed: '0m', formattedRemaining: '5h 0m' };
  }
}

/**
 * Increments cumulative offline seconds for today
 */
export function incrementDailyOfflineSeconds(incSec = 1) {
  if (typeof window === 'undefined') return 0;
  try {
    const key = getTodayQuotaKey();
    const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    const updated = current + incSec;
    localStorage.setItem(key, String(updated));
    return updated;
  } catch (e) {
    return 0;
  }
}

/**
 * Validates if an offline update is permitted under 5-hour daily cap
 */
export function canPerformOfflineAction() {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    return { allowed: true };
  }
  const usage = getDailyOfflineUsage();
  if (usage.isExceeded) {
    return {
      allowed: false,
      reason: `🛑 Daily Offline Limit Exceeded (5 Hours Max Reached)!\n\nAap aaj ke din ka maximum 5 ghante ka offline work quota pura kar chuke hain.\n\nData security aur company policy ke mutabiq, naye records add karne ya update karne ke liye kripya abhee Internet connect karein.`
    };
  }
  return { allowed: true, usage };
}

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
  // Enforce Maximum 5-Hour Daily Offline Quota
  const offlineCheck = canPerformOfflineAction();
  if (!offlineCheck.allowed) {
    if (typeof window !== 'undefined') {
      alert(offlineCheck.reason);
    }
    return null;
  }

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
            const nowIso = payload.updated_at || new Date().toISOString();
            const existingNotes = Array.isArray(existing.lead_notes) ? [...existing.lead_notes] : [];
            if (payload.noteText || payload.remarks) {
              const noteText = payload.noteText || payload.remarks;
              existingNotes.unshift({
                id: `local_note_${Date.now()}`,
                lead_id: payload.id,
                note_text: noteText,
                created_by: payload.actor || payload.userName || 'System',
                created_at: nowIso
              });
            }
            cacheStore.put({
              ...existing,
              ...payload,
              lead_notes: existingNotes,
              is_offline_pending: true,
              updated_at: nowIso,
              last_timestamp: nowIso,
              latest_remark: payload.latest_remark || payload.noteText || payload.remarks || existing.latest_remark || ''
            });
          };
        } else {
          const nowIso = payload.created_at || new Date().toISOString();
          cacheStore.put({
            ...payload,
            id: payload.id || queueItem.queueId,
            is_offline_pending: true,
            created_at: nowIso,
            updated_at: nowIso,
            last_timestamp: nowIso
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
      } else if (item.entityType === 'lead_note') {
        const payload = item.payload;
        if (payload.lead_id && !String(payload.lead_id).startsWith('queue_')) {
          const { error } = await supabaseClient
            .from('lead_notes')
            .insert([{
              lead_id: payload.lead_id,
              note_text: payload.note_text,
              created_by: payload.created_by
            }]);
          if (error) throw error;
        }
        await removeQueueItem(item.queueId, { ...item, title: `Note: ${payload.note_text?.slice(0, 20)}` });
        successCount++;
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
