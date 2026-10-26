// Short-lived page snapshots only. SIP credentials never enter browser storage.
const PREFIX = 'crm-call-pages-v1:';
const TTL = 120000;
const memory = new Map();
const pending = new Map();

export function mergeEndpointLists(existing = [], incoming = []) {
  const merged = [...existing];
  for (const endpoint of incoming) {
    const ids = [endpoint.endpoint_id, endpoint.endpoint_key].filter(Boolean).map(String);
    const username = String(endpoint.username || '').toLowerCase();
    const index = merged.findIndex(item => [item.endpoint_id, item.endpoint_key].filter(Boolean).some(id => ids.includes(String(id)))
      || (username && String(item.username || '').toLowerCase() === username));
    if (index < 0) merged.push(endpoint);
    else merged[index] = { ...merged[index], ...endpoint, password: endpoint.password || merged[index].password || null };
  }
  return merged;
}
export const viewScope = (userId, tenantId, company, access = '') => userId
  ? JSON.stringify([userId, tenantId || '', company || '', access]) : '';

export function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object') return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|auth.?token|credential|secret/i.test(key) && key !== 'has_password') continue;
    safe[key] = withoutSecrets(item);
  }
  if (value.plivo_password || value.password) safe.has_password = true;
  return safe;
}

export function readViewCache(scope, section) {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const key = PREFIX + scope + ':' + section;
    const entry = memory.get(key) || JSON.parse(window.sessionStorage.getItem(key) || 'null');
    if (!entry || entry.expires < Date.now()) return null;
    return withoutSecrets(entry.data);
  } catch { return null; }
}

export function writeViewCache(scope, section, data) {
  if (!scope || typeof window === 'undefined') return;
  const key = PREFIX + scope + ':' + section;
  const entry = { data: withoutSecrets(data), expires: Date.now() + TTL };
  // Bound in-memory snapshots; no timer or background polling is involved.
  if (memory.size >= 40 && !memory.has(key)) memory.clear();
  memory.set(key, entry);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
    const indexKey = PREFIX + 'index';
    const index = JSON.parse(window.sessionStorage.getItem(indexKey) || '[]').filter(item => item !== key);
    index.push(key);
    while (index.length > 40) window.sessionStorage.setItem(index.shift(), 'null');
    window.sessionStorage.setItem(indexKey, JSON.stringify(index));
  } catch { /* Storage can be unavailable. */ }
}

export function clearViewCache(scope, section) {
  if (!scope) return;
  writeViewCache(scope, section, null);
}

export async function fetchPageData(url, { fresh = false } = {}) {
  // Strict Mode / rapid tab revisits share only an in-flight GET, never stale credentials.
  if (!fresh && pending.has(url)) return pending.get(url);
  const promise = (async () => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw Object.assign(new Error(data.error || 'Could not load this page. Please retry.'), { status: response.status });
    }
    return data;
  })();
  pending.set(url, promise);
  try { return await promise; } finally { if (pending.get(url) === promise) pending.delete(url); }
}
