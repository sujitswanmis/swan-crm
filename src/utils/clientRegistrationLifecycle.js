export const REGISTRATION_TABS = [
  { id: 'form', label: 'New Lead Registration', path: '/registration' },
  { id: 'drafts', label: 'Saved Drafts', path: '/registration/drafts' },
  { id: 'submitted', label: 'Lead Submitted', path: '/registration/submitted' },
  { id: 'deleted', label: 'Lead Deleted', path: '/registration/deleted' },
];

export function registrationView(path = '') {
  const id = String(path).split('?')[0].replace(/^\/+|\/+$/g, '').split('/')[1];
  return REGISTRATION_TABS.some(tab => tab.id === id) ? id : 'form';
}

export function registrationStatus(value, fallback = '1;01>New Stage>New Lead') {
  const status = String(value || '').trim();
  return !status || ['DRAFT', 'NONE'].includes(status.toUpperCase()) ? fallback : status;
}

export function isRegistrationRow(row, view) {
  if (view === 'deleted') return Boolean(row.registration_deleted_at);
  if (view === 'submitted') return Boolean(row.registration_submitted_at) && !row.registration_deleted_at && row.status !== 'DRAFT';
  return row.status === 'DRAFT' && !row.registration_deleted_at;
}

export function mergeRegistrationRows(previous = [], changes = [], view = 'drafts') {
  const rows = new Map(previous.map(row => [row.id, row]));
  for (const row of changes) {
    if (row._removed || !isRegistrationRow(row, view)) rows.delete(row.id);
    else rows.set(row.id, { ...rows.get(row.id), ...row });
  }
  return [...rows.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

const memory = new Map();
const cacheKey = scope => `crm_registration_v1:${scope}`;

export function getRegistrationSnapshot(scope) {
  if (memory.has(scope)) return memory.get(scope);
  try {
    if (typeof window !== 'undefined') {
      const cached = JSON.parse(localStorage.getItem(cacheKey(scope)) || 'null');
      if (cached && Array.isArray(cached.rows)) return cached;
    }
  } catch { /* Storage may be unavailable; the view remains usable online. */ }
  return { rows: [], cursor: null };
}

async function openRegistrationCache() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise(resolve => {
    const request = indexedDB.open('crm_registration_lifecycle', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function readRegistrationCache(scope) {
  const fast = getRegistrationSnapshot(scope);
  if (fast.cursor) return fast;
  try {
    const db = await openRegistrationCache();
    if (!db) return fast;
    return await new Promise(resolve => {
      const request = db.transaction('snapshots').objectStore('snapshots').get(scope);
      request.onsuccess = () => { db.close(); resolve(request.result || fast); };
      request.onerror = () => { db.close(); resolve(fast); };
    });
  } catch { return fast; }
}

export async function saveRegistrationCache(scope, snapshot) {
  memory.set(scope, snapshot);
  try { localStorage.setItem(cacheKey(scope), JSON.stringify(snapshot)); } catch { /* IndexedDB retains the full snapshot. */ }
  try {
    const db = await openRegistrationCache();
    if (!db) return;
    await new Promise(resolve => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(snapshot, scope);
      tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    });
  } catch { /* Cache failure must not block registration. */ }
}

export function notifyRegistrationChanged(lead) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('crm_registration_changed', { detail: lead }));
  try { localStorage.setItem('crm_registration_changed', String(Date.now())); } catch { /* Same-tab event still works. */ }
}
