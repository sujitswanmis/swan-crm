/**
 * Offline LocalDB Store-and-Forward Vault (IndexedDB)
 * Stores GPS breadcrumbs, check-in pings, and form submissions when
 * the device has zero network / godown mode. Automatically flushes (Delta Sync)
 * to Supabase when network connectivity resumes.
 */

const DB_NAME = 'supuja_field_offline_vault';
const DB_VERSION = 1;
const STORE_PINGS = 'queued_gps_pings';
const STORE_SUBMISSIONS = 'queued_form_submissions';

function openVaultDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PINGS)) {
        db.createObjectStore(STORE_PINGS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('Could not open offline IndexedDB vault:', request.error);
      resolve(null);
    };
  });
}

/**
 * Queue a live GPS ping while offline
 */
export async function queueOfflineGpsPing(pingData) {
  const db = await openVaultDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PINGS, 'readwrite');
      const store = tx.objectStore(STORE_PINGS);
      store.add({
        ...pingData,
        queued_at: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Queue an offline check-in or custom form submission
 */
export async function queueOfflineFormSubmission(submissionData) {
  const db = await openVaultDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.add({
        ...submissionData,
        is_offline_synced: true,
        queued_at: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Get count of pending items waiting to sync
 */
export async function getPendingOfflineCounts() {
  const db = await openVaultDB();
  if (!db) return { pings: 0, submissions: 0, total: 0 };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_PINGS, STORE_SUBMISSIONS], 'readonly');
      const pingsReq = tx.objectStore(STORE_PINGS).count();
      const subsReq = tx.objectStore(STORE_SUBMISSIONS).count();

      tx.oncomplete = () => {
        const pings = pingsReq.result || 0;
        const subs = subsReq.result || 0;
        resolve({ pings, submissions: subs, total: pings + subs });
      };
      tx.onerror = () => resolve({ pings: 0, submissions: 0, total: 0 });
    } catch (_) {
      resolve({ pings: 0, submissions: 0, total: 0 });
    }
  });
}

/**
 * Flushes all queued offline GPS pings and form submissions to server
 */
export async function flushOfflineVault(syncPingsFn, syncSubmissionFn) {
  const db = await openVaultDB();
  if (!db) return { syncedPings: 0, syncedSubmissions: 0 };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedPings: 0, syncedSubmissions: 0, offline: true };
  }

  let syncedPings = 0;
  let syncedSubmissions = 0;

  // 1. Flush GPS Pings in safe 50-row batches deleting ONLY uploaded IDs
  try {
    while (true) {
      const txPings = db.transaction(STORE_PINGS, 'readonly');
      const pingsReq = txPings.objectStore(STORE_PINGS).getAll(null, 50);
      const pings = await new Promise((res) => {
        pingsReq.onsuccess = () => res(pingsReq.result || []);
        pingsReq.onerror = () => res([]);
      });

      if (!pings.length || typeof syncPingsFn !== 'function') break;

      const payload = pings.map(({ id, queued_at, ...rest }) => rest);
      const success = await syncPingsFn(payload);
      if (!success) break;

      await new Promise((resolve) => {
        const delTx = db.transaction(STORE_PINGS, 'readwrite');
        const store = delTx.objectStore(STORE_PINGS);
        pings.forEach((p) => {
          if (p?.id != null) store.delete(p.id);
        });
        delTx.oncomplete = () => resolve(true);
        delTx.onerror = () => resolve(false);
        delTx.onabort = () => resolve(false);
      });
      syncedPings += pings.length;
      if (pings.length < 50) break;
    }
  } catch (err) {
    console.warn('Error syncing queued offline pings:', err);
  }

  // 2. Flush Form Submissions
  try {
    const txSubs = db.transaction(STORE_SUBMISSIONS, 'readonly');
    const subsReq = txSubs.objectStore(STORE_SUBMISSIONS).getAll();
    const subs = await new Promise((res) => {
      subsReq.onsuccess = () => res(subsReq.result || []);
      subsReq.onerror = () => res([]);
    });

    if (subs.length > 0 && typeof syncSubmissionFn === 'function') {
      for (const item of subs) {
        const ok = await syncSubmissionFn(item);
        if (ok) {
          const deleteTx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
          deleteTx.objectStore(STORE_SUBMISSIONS).delete(item.id);
          syncedSubmissions++;
        }
      }
    }
  } catch (err) {
    console.warn('Error syncing queued offline submissions:', err);
  }

  return { syncedPings, syncedSubmissions };
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function queueOfflineAction(actionType, payload) {
  return queueOfflineFormSubmission({ actionType, payload });
}

export async function getPendingQueue() {
  const counts = await getPendingOfflineCounts();
  return new Array(counts.total);
}

export async function syncOfflineQueue(syncFn) {
  return flushOfflineVault(null, syncFn);
}
