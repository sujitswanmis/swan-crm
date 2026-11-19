import 'server-only';
import { createClient } from '@/utils/supabase/server';
import { DEFAULT_TENANT_ID } from '@/utils/saasEntitlements';

export const SAAS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const legacySwanCompanies = new Set(['new swan group', 'nsmlr', 'nstlp', 'nstl', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl']);
const normalized = value => String(value || '').trim().toLowerCase();

export async function getSaasActor(admin) {
  const session = await createClient();
  const { data: { user } = {}, error } = await session.auth.getUser();
  if (error || !user) throw new Error('Please sign in again.');
  const { data: role, error: roleError } = await admin.from('user_roles').select('user_id, tenant_id, company, role, module_access, is_approved, emp_status').eq('user_id', user.id).maybeSingle();
  if (roleError) throw new Error('Unable to verify SaaS access. Please retry.');
  const master = normalized(user.email) === 'supujacreations@gmail.com'
    || ['masteradmin', 'master_admin'].includes(normalized(role?.role)) || role?.module_access?.is_master_admin === true;
  if (!master && (!role || role.is_approved === false || ['inactive', 'terminated', 'resigned', 'hold'].includes(normalized(role.emp_status)))) {
    throw new Error('Your workspace access is not active.');
  }
  return { user, role: role || {}, master };
}

export async function requireSaasMaster(admin) {
  const actor = await getSaasActor(admin);
  if (!actor.master) throw new Error('Only Master Admin can manage SaaS workspaces.');
  return actor;
}

export async function getSaasActorTenant(admin, actor) {
  const explicit = actor.role.tenant_id || actor.role.module_access?._tenantId;
  if (explicit && SAAS_UUID.test(String(explicit))) return explicit;
  const company = String(actor.role.company || '').trim();
  if (company) {
    const { data, error } = await admin.from('tenants').select('id, name, tenant_code');
    if (error) throw new Error('Unable to resolve your workspace.');
    const matches = (data || []).filter(t => [normalized(t.name), normalized(t.tenant_code)].includes(normalized(company)));
    if (matches.length === 1) return matches[0].id;
    if (legacySwanCompanies.has(normalized(company))) return DEFAULT_TENANT_ID;
  }
  throw new Error('Workspace binding is missing. Please contact Master Admin.');
}

export async function requireSaasTenant(admin, tenantId, { manage = false } = {}) {
  const actor = await getSaasActor(admin);
  if (!SAAS_UUID.test(String(tenantId || ''))) throw new Error('A valid workspace is required.');
  if (actor.master) return actor;
  const ownTenant = await getSaasActorTenant(admin, actor);
  if (ownTenant !== tenantId) throw new Error('Access to another workspace is not allowed.');
  if (manage && !['admin', 'tenant_admin', 'superadmin'].includes(normalized(actor.role.role))) {
    throw new Error('Only your workspace administrator can request add-ons.');
  }
  return actor;
}

export function userBelongsToSaasTenant(user, tenant, tenants = []) {
  if (!user || normalized(user.role) === 'customer') return false;
  if (user.tenant_id) return user.tenant_id === tenant.id;
  const company = normalized(user.company);
  const matches = tenants.filter(t => [normalized(t.name), normalized(t.tenant_code)].includes(company));
  if (matches.length > 1) return false;
  if (matches.length === 1) return matches[0].id === tenant.id;
  if (company && [normalized(tenant.name), normalized(tenant.tenant_code)].includes(company)) return true;
  return tenant.id === DEFAULT_TENANT_ID && legacySwanCompanies.has(company);
}

export function isSaasUserActive(user) {
  return user.is_approved === true && !['inactive', 'terminated', 'resigned', 'hold'].includes(normalized(user.emp_status));
}
