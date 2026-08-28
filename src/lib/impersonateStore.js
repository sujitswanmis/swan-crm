/**
 * In-memory store for one-time impersonation tokens.
 * Each entry: UUID key -> { tokenHash, adminRestoreToken, name, role, expiresAt }
 * Entry is deleted on first access (one-time use) or after 5 min TTL.
 */

const globalKey = '__crm_impersonate_store__';
if (!global[globalKey]) {
  global[globalKey] = new Map();
}
const store = global[globalKey];

const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Save a one-time token entry. Returns the UUID key.
 */
export function saveImpersonateToken({ tokenHash, adminRestoreToken, name, role }) {
  const { randomUUID } = require('crypto');
  const key = randomUUID();
  const expiresAt = Date.now() + TTL_MS;
  store.set(key, { tokenHash, adminRestoreToken, name, role, expiresAt });
  setTimeout(() => store.delete(key), TTL_MS + 1000);
  return key;
}

/**
 * Consume a one-time token. Returns entry or null if expired/already used.
 * Deletes the entry on first access (one-time use).
 */
export function consumeImpersonateToken(key) {
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  store.delete(key); // one-time use
  return entry;
}
