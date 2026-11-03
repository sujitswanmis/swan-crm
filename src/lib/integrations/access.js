import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSubItemPermissions } from '../../utils/permissionUtils.js';
import { INTEGRATION_PAGE_IDS } from '../../config/integrationsConfig.js';
import { IntegrationError, assertEnabled, hashSecret } from './security.js';
import { checked, consumeRateLimit, integrationDb } from './store.js';
import { loadTenantPolicy, assertTenantFeature, tenantCanManageIntegrations } from './tenantPolicy.js';

export const TENANT_CODE = /^TNT\d{5,}$/;
export const BRANCH_CODE = /^TNT\d{5,}-B\d{4,}$/;
const normalized = value => String(value || '').trim().toLowerCase();

export async function tenantDirectory(db, {tenantId} = {}) {
  let tenantQuery=db.from('tenants').select('id,tenant_code,name,status').limit(1000);
  if(tenantId) tenantQuery=tenantQuery.eq('id',tenantId);
  const tenants = checked(await tenantQuery) || [];
  let local = [];
  try {
    const content = JSON.parse(await readFile(path.join(process.cwd(), 'src/config/tenant_branches.json'), 'utf8'));
    local = Object.values(content).flat().filter(item => TENANT_CODE.test(item.tenant_code || '') && BRANCH_CODE.test(item.branch_code || ''));
  } catch { /* No invented branches or tenant defaults when configuration is unavailable. */ }
  let branchQuery=db.from('tenant_branches').select('*').limit(5000);
  if(tenantId) branchQuery=branchQuery.eq('tenant_id',tenantId);
  const remote = await branchQuery;
  if (remote.error && !['42P01', 'PGRST205'].includes(remote.error.code)) checked(remote);
  const branches = [...(remote.data || []), ...local];
  return tenants.map(tenant => {
    const tenantBranches = branches.filter(branch => branch.tenant_id === tenant.id && branch.is_active !== false);
    const code = TENANT_CODE.test(tenant.tenant_code || '') ? tenant.tenant_code : tenantBranches.find(branch => TENANT_CODE.test(branch.tenant_code || ''))?.tenant_code;
    if (!code) return null;
    const byCode = new Map();
    for (const branch of tenantBranches) {
      const branchCode = branch.branch_code || branch.id;
      if (BRANCH_CODE.test(branchCode || '') && branchCode.startsWith(code + '-B') && !byCode.has(branchCode)) {
        byCode.set(branchCode, { code: branchCode, name: branch.branch_name || branchCode, operatingCompany: branch.legacy_code || branch.branch_name || tenant.name });
      }
    }
    return { ...tenant, code, branches: [...byCode.values()] };
  }).filter(Boolean);
}
export function isMasterIdentity(user, role) {
  return normalized(user?.email) === 'supujacreations@gmail.com'
    || ['masteradmin', 'master_admin'].includes(normalized(role?.role))
    || role?.module_access?.is_master_admin === true;
}
export function ownedTenant(directory, role) {
  const identity = role.tenant_id || role.module_access?._tenantId;
  if (identity) return directory.find(tenant => tenant.id === identity || tenant.code === identity);
  // Legacy company identity is accepted only when it unambiguously names one verified tenant.
  const matches = directory.filter(tenant => [tenant.name, tenant.code, tenant.tenant_code].some(value => normalized(value) === normalized(role.company)));
  return matches.length === 1 ? matches[0] : null;
}
export function allowedBranches(tenant, role, master = false) {
  if (master || ['admin', 'superadmin', 'super_admin'].includes(normalized(role.role))) return tenant.branches;
  const explicit = role.module_access?.integration_branch_codes;
  if (Array.isArray(explicit)) return tenant.branches.filter(branch => explicit.includes(branch.code));
  return tenant.branches.filter(branch => [branch.code, branch.name].some(value => normalized(value) === normalized(role.branch_name || role.work_location_name)));
}
export function authorizeScope({ directory, role, user, tenantCode, branchCode = null }) {
  const master = isMasterIdentity(user, role), own = ownedTenant(directory, role);
  const tenant = tenantCode ? directory.find(item => item.code === tenantCode) : own || (master ? directory[0] : null);
  if (!tenant || (!master && own?.id !== tenant.id)) throw new IntegrationError('Tenant access denied.', 403, 'scope_denied');
  if (['SUSPENDED', 'ARCHIVED', 'DRAFT'].includes(String(tenant.status).toUpperCase())) throw new IntegrationError('Integrations are unavailable for this tenant.', 403, 'tenant_inactive');
  const branches = allowedBranches(tenant, role, master);
  const tenantWide = master || ['admin', 'superadmin', 'super_admin'].includes(normalized(role.role));
  const selected = branchCode || (tenantWide ? null : branches.length === 1 ? branches[0].code : null);
  if (selected && !branches.some(branch => branch.code === selected)) throw new IntegrationError('Branch access denied.', 403, 'scope_denied');
  if (!selected && !tenantWide) throw new IntegrationError('Select one of your authorized branches.', 403, 'branch_required');
  return { tenant, branchCode: selected, branches, tenantWide, master };
}
async function verifiedIntegrationSession() {
  const { createClient } = await import('../../utils/supabase/server.js');
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new IntegrationError('Please sign in again.', 401, 'unauthorized');
  const db = integrationDb();
  const role = checked(await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle());
  if (!role || role.is_approved === false || ['inactive', 'terminated', 'suspended'].includes(normalized(role.emp_status || role.module_access?.emp_status))) throw new IntegrationError('Workspace access denied.', 403);
  const master = isMasterIdentity(user, role);
  if(!master && role.can_read===false) throw new IntegrationError('Workspace read access denied.',403);
  const actor=String(role.emp_code || role.emp_id || 'Workspace user');
  return {db,user,role,master,actorCode:/^[0-9a-f-]{36}$/i.test(actor)?'Workspace user':actor};
}
export async function requireMasterIntegrationAccess() {
  const context=await verifiedIntegrationSession();
  if(!context.master) throw new IntegrationError('Only Master Admin can configure tenant integration access.',403,'master_required');
  return {...context,directory:await tenantDirectory(context.db)};
}
export async function requireSessionAccess(input = {}, page = 'integrations', manage = false) {
  if (!INTEGRATION_PAGE_IDS.includes(page)) throw new IntegrationError('Integration page not found.', 404);
  const {db,user,role,master,actorCode}=await verifiedIntegrationSession();
  const permissions = getSubItemPermissions(role.module_access, role.role, 'settings', page);
  if (!master && !permissions.view) throw new IntegrationError('Integration page access denied.', 403);
  const canManage = tenantCanManageIntegrations(role,permissions,master);
  if (manage && !canManage) throw new IntegrationError('Integration management permission is required.', 403);
  const directory = await tenantDirectory(db,!master && /^[0-9a-f-]{36}$/i.test(role.tenant_id || '')?{tenantId:role.tenant_id}:{});
  const scope = authorizeScope({ directory, role, user, tenantCode: input.tenantCode, branchCode: input.branchCode });
  const writable=String(scope.tenant.status).toUpperCase()!=='READ_ONLY';
  if(manage && !writable) throw new IntegrationError('This tenant is read-only.',403,'tenant_read_only');
  const policy=await loadTenantPolicy(db,scope.tenant.id,scope.branchCode,{tolerateSetup:true});
  if(manage) assertTenantFeature(policy);
  return { ...scope, db, user, role, policy, directory: master ? directory : directory.filter(item => item.id === scope.tenant.id), canManage:Boolean(canManage&&writable&&policy.enabled), actorCode };
}
export function authorizeKeyBranch(key, requested) {
  if (requested && !BRANCH_CODE.test(requested)) throw new IntegrationError('Invalid branch code.');
  if (key.branch_code && requested && key.branch_code !== requested) throw new IntegrationError('Branch access denied.', 403, 'scope_denied');
  return key.branch_code || requested || null;
}
export async function requireApiAccess(request, permission) {
  assertEnabled();
  const raw = request.headers.get('authorization') || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!/^crm_[A-Za-z0-9_-]{40,60}$/.test(token)) throw new IntegrationError('Invalid or missing API key.', 401, 'unauthorized');
  const db = integrationDb();
  const key = checked(await db.from('integration_api_keys').select('*').eq('key_hash', hashSecret(token)).maybeSingle());
  if (!key || key.revoked_at || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) throw new IntegrationError('API key is invalid, expired or revoked.', 401, 'unauthorized');
  if (!Array.isArray(key.scopes) || !key.scopes.includes(permission)) throw new IntegrationError('This API key does not permit that operation.', 403, 'scope_denied');
  await consumeRateLimit(db, `key:${key.code}`, Math.min(key.requests_per_minute || 120, 600));
  await consumeRateLimit(db, `tenant:${key.tenant_id}`, 600);
  const directory = await tenantDirectory(db,{tenantId:key.tenant_id}), tenant = directory.find(item => item.id === key.tenant_id);
  if (!tenant || ['SUSPENDED', 'ARCHIVED', 'DRAFT'].includes(String(tenant.status).toUpperCase())) throw new IntegrationError('Tenant access unavailable.', 403);
  if(['leads:create','leads:update'].includes(permission) && String(tenant.status).toUpperCase()==='READ_ONLY') throw new IntegrationError('This tenant is read-only.',403,'tenant_read_only');
  const params = new URL(request.url).searchParams;
  if (params.get('tenant_code') && params.get('tenant_code') !== tenant.code) throw new IntegrationError('Tenant access denied.', 403, 'scope_denied');
  const branchCode = authorizeKeyBranch(key, params.get('branch_code'));
  if (branchCode && !tenant.branches.some(branch => branch.code === branchCode)) throw new IntegrationError('Branch access unavailable.', 403);
  const policy=await loadTenantPolicy(db,tenant.id,branchCode);
  assertTenantFeature(policy,['leads:read','lookups:read'].includes(permission)?'api_read':'api_write');
  checked(await db.from('integration_api_keys').update({ last_used_at: new Date().toISOString() }).eq('code', key.code).eq('tenant_id', tenant.id));
  return { db, tenant, branchCode, branches: tenant.branches, key, policy, integrationFeature:['leads:read','lookups:read'].includes(permission)?'api_read':'api_write', actorCode: key.code };
}
