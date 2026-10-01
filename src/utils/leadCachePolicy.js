const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isCompleteLeadCache(meta, leads, { userId, userCompany, userRole, now = Date.now() }) {
  if (!meta || !Array.isArray(leads) || leads.length === 0) return false;
  if (meta.userId !== userId || meta.userCompany !== (userCompany || '') || meta.userRole !== userRole) return false;
  if (!meta.generation || !meta.fullSyncedAt || !meta.syncedAt) return false;
  if (!Number.isSafeInteger(meta.count) || meta.count < 1 || leads.length < meta.count) return false;
  const fullSyncTime = Date.parse(meta.fullSyncedAt);
  if (!Number.isFinite(fullSyncTime) || fullSyncTime > now || now - fullSyncTime >= FULL_RECONCILE_INTERVAL_MS) return false;
  return leads.every(lead => lead?.id && lead.__cacheScope === userId && lead.__cacheGeneration === meta.generation);
}
