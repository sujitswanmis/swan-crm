const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function matchesLeadCacheContext(meta, { userId, userCompany, userRole }) {
  return Boolean(meta && meta.userId === userId &&
    meta.userCompany === (userCompany || '') && meta.userRole === userRole);
}

// Freshness determines whether reconciliation is needed, not whether cached
// rows can be displayed while that reconciliation runs in the background.
export function isDisplayableLeadCache(meta, leads, context) {
  if (!meta || !Array.isArray(leads) || leads.length === 0) return false;
  if (!matchesLeadCacheContext(meta, context)) return false;
  if (!meta.generation || !meta.fullSyncedAt || !meta.syncedAt) return false;
  if (!Number.isSafeInteger(meta.count) || meta.count < 1) return false;
  // Realtime can add rows after the last manifest was written. Missing rows,
  // duplicate IDs, and mixed generations must never qualify for delta-only sync.
  if (leads.length < meta.count) return false;
  const ids = new Set();
  return leads.every(lead => {
    if (!lead?.id || lead.__cacheScope !== context.userId ||
      lead.__cacheGeneration !== meta.generation || ids.has(lead.id)) return false;
    ids.add(lead.id);
    return true;
  });
}

export function isCompleteLeadCache(meta, leads, context) {
  if (!isDisplayableLeadCache(meta, leads, context)) return false;
  const now = context.now ?? Date.now();
  const fullSyncTime = Date.parse(meta.fullSyncedAt);
  const syncTime = Date.parse(meta.syncedAt);
  return Number.isFinite(fullSyncTime) && Number.isFinite(syncTime) &&
    fullSyncTime <= syncTime && syncTime <= now &&
    now - fullSyncTime < FULL_RECONCILE_INTERVAL_MS;
}

export function mergeLeadCacheForDisplay(cached, current, {
  protectedIds = new Set(), removedIds = new Set(), keepMissing = true
} = {}) {
  const rows = new Map(cached.filter(lead => lead?.id && !removedIds.has(lead.id))
    .map(lead => [lead.id, lead]));
  for (const live of current) {
    if (!live?.id || removedIds.has(live.id)) continue;
    const stored = rows.get(live.id);
    const protectedRow = live.is_offline_pending || protectedIds.has(live.id);
    if (!stored) {
      if (keepMissing || protectedRow) rows.set(live.id, live);
    } else if (protectedRow || Date.parse(live.updated_at) > Date.parse(stored.updated_at || stored.created_at)) {
      rows.set(live.id, { ...stored, ...live,
        lead_notes: live.lead_notes?.length ? live.lead_notes : stored.lead_notes || [] });
    }
  }
  return Array.from(rows.values());
}
