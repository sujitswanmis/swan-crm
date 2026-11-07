// Dedicated read-only audit cache. Never upgrades or touches the operational
// lead/offline database or its write queue.
import { summarizeWhatsappMessageLogs } from './whatsappMessageAnalytics.js';

const DATABASE = 'crm_whatsapp_api_logs_v1';
const FAST_PREFIX = 'crm_whatsapp_api_logs:';
const CACHE_FORMAT = 3;
const memory = new Map();
let databasePromise;

export function createWhatsappMessageLogsScope({ userId, tenantId, userCompany, userRole, moduleAccess, fromDate, toDate }) {
  if (!userId) return null;
  // Keep older cache entries intact; they lack stable customer identity and
  // must not qualify for delta-only hydration of this view.
  return JSON.stringify([CACHE_FORMAT, userId, tenantId || userCompany || 'own', userRole,
    moduleAccess?.is_master_admin === true, moduleAccess?.whatsapp_official || null, fromDate, toDate]);
}

export const whatsappMessageLogsStorageKey = scope => `${FAST_PREFIX}${scope}`;

export function mergeWhatsappMessageLogs(previous = [], incoming = []) {
  if (!incoming.length) return previous;
  const rows = new Map(previous.map(row => [row.id, row]));
  incoming.forEach(row => { if (row?.id) rows.set(row.id, row); });
  return [...rows.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
}

function remember(scope, entry) {
  memory.set(scope, entry);
  if (memory.size > 12) memory.delete(memory.keys().next().value);
  return entry;
}

export function readFastWhatsappMessageLogs(scope) {
  if (!scope || typeof window === 'undefined') return null;
  if (memory.has(scope)) return memory.get(scope);
  try {
    const entry = JSON.parse(window.localStorage.getItem(whatsappMessageLogsStorageKey(scope)) || 'null');
    if (!entry || !Array.isArray(entry.rows)) return null;
    // A small web-storage preview is never sufficient for delta-only syncing.
    return remember(scope, { ...entry, complete: false, syncedThrough: null });
  } catch { return null; }
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
        if (!db) databasePromise = undefined;
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), 1500);
      try {
        const request = window.indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('rows')) {
            const rows = db.createObjectStore('rows', { keyPath: 'cacheKey' });
            rows.createIndex('scope', 'scope', { unique: false });
          }
          if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata');
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

export async function readWhatsappMessageLogsLocally(scope) {
  if (!scope) return null;
  try {
    const db = await database();
    if (!db) return readFastWhatsappMessageLogs(scope);
    const entry = await new Promise(resolve => {
      const tx = db.transaction(['rows', 'metadata'], 'readonly');
      const metadata = tx.objectStore('metadata').get(scope);
      const rows = tx.objectStore('rows').index('scope').getAll(scope);
      const timer = setTimeout(() => resolve(null), 2000);
      tx.oncomplete = () => {
        clearTimeout(timer);
        const meta = metadata.result;
        if (!meta) { resolve(null); return; }
        const values = (rows.result || []).map(item => item.row);
        resolve({ ...meta, rows: mergeWhatsappMessageLogs([], values), complete: meta.complete === true && values.length === meta.rowCount });
      };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); resolve(null); };
    });
    const current = memory.get(scope);
    if (!entry || (current?.savedAt > entry.savedAt)) return current || entry;
    return remember(scope, entry);
  } catch { return readFastWhatsappMessageLogs(scope); }
}

export async function upsertWhatsappMessageLogsLocally(scope, incoming, entry) {
  if (!scope) return;
  const value = { ...entry, savedAt: Date.now(), rowCount: entry.rows.length };
  // Cache only the complete period's small summary. The full customer/template
  // breakdown stays in IndexedDB rows, outside the 100-row web-storage preview.
  // A partial delta must not replace the last completed summary.
  if (entry.complete && entry.snapshotComplete !== false) {
    try {
      value.dashboardSummary = summarizeWhatsappMessageLogs(entry.rows);
      value.dashboardAsOf = entry.syncedThrough;
    } catch { /* Logs remain usable if a secondary summary cannot be computed. */ }
  }
  remember(scope, value);
  try {
    const db = await database();
    if (db) await new Promise(resolve => {
      const tx = db.transaction(['rows', 'metadata'], 'readwrite');
      const store = tx.objectStore('rows');
      // Only changed/new audit rows are written, even during a delta refresh.
      incoming.forEach(row => store.put({ cacheKey: JSON.stringify([scope, row.id]), scope, row }));
      const { rows: _rows, ...meta } = value;
      tx.objectStore('metadata').put(meta, scope);
      const timer = setTimeout(resolve, 2000);
      tx.oncomplete = tx.onerror = tx.onabort = () => { clearTimeout(timer); resolve(); };
    });
    window.localStorage.setItem(whatsappMessageLogsStorageKey(scope), JSON.stringify({ ...value, rows: value.rows.slice(0, 100), complete: false, syncedThrough: null }));
  } catch { /* Private browsing or full storage must not block viewing logs. */ }
}
