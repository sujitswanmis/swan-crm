import { createClient } from '@supabase/supabase-js';
import { IntegrationError, redact } from './security.js';

export function integrationDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new IntegrationError('Database configuration is unavailable.', 503, 'setup_required');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(12000) }) } });
}
export function checked(result) {
  if (result.error) {
    const setup = integrationSetupPending(result.error);
    throw new IntegrationError(setup ? 'Integration database setup is pending. Apply the integration migrations first.' : 'Integration database operation failed. Please retry.', 503, setup ? 'setup_required' : 'database_unavailable');
  }
  return result.data;
}
export function integrationSetupPending(error) {
  return ['42P01', 'PGRST202', 'PGRST205', '42883', 'setup_required'].includes(error?.code);
}
export async function integrationReadiness(db, tenantId, actorId) {
  try {
    // GET preserves PostgREST's structured schema errors; HEAD can lose its error body.
    // limit(0) verifies the schema and tenant filter without loading any connection data.
    checked(await db.from('integration_connections').select('code').eq('tenant_id', tenantId).limit(0));
    // A table can exist while the rate-limit function is still missing from a partial setup.
    await consumeRateLimit(db, `management:${actorId}`, 60);
    return {databaseReady:true};
  } catch (error) {
    if (!integrationSetupPending(error)) throw error;
    return {databaseReady:false};
  }
}
export async function audit(db, context, operation, code = '') {
  checked(await db.from('integration_audit_logs').insert({
    tenant_id: context.tenant.id, branch_code: context.branchCode, actor_code: context.actorCode,
    operation, resource_code: code, metadata: redact({ operation, status: 'success' }),
  }));
}
export function scopeQuery(query, context) {
  query = query.eq('tenant_id', context.tenant.id);
  if (context.branchCode) query = query.eq('branch_code', context.branchCode);
  return query;
}
export function connectionView(row) {
  const config={...row.config};
  // Provider cursors are operational state, not editable connection settings.
  Reflect.deleteProperty(config,'cursor');
  return {
    code: row.code, name: row.name, type: row.type, branch_code: row.branch_code,
    status: row.status, config, last_run_at: row.last_run_at,
    next_run_at: row.next_run_at, created_at: row.created_at, updated_at: row.updated_at,
    has_credentials: Boolean(row.credentials),
  };
}
export async function consumeRateLimit(db, identity, limit = 120) {
  const allowed = checked(await db.rpc('integration_take_rate_limit', { p_identity: identity, p_limit: limit }));
  if (!allowed) throw new IntegrationError('Integration rate limit reached. Retry after one minute.', 429, 'rate_limited');
}
export async function findConnection(db, context, code, types) {
  if (!/^CON_[A-Za-z0-9_-]{8,60}$/.test(String(code))) throw new IntegrationError('Connection not found.', 404);
  const row = checked(await scopeQuery(db.from('integration_connections').select('*').eq('code', code), context).maybeSingle());
  if (!row || (types && !types.includes(row.type))) throw new IntegrationError('Connection not found.', 404);
  return row;
}
