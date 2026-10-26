import 'server-only';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getModulePermissions, getSubItemPermissions } from '@/utils/permissionUtils';
import { getTeamMembers, getCallAdminData } from '@/app/actions/team';

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const normalizeTenant = value => value && value !== DEFAULT_TENANT ? value : null;
export const privateHeaders = { 'Cache-Control': 'private, no-store' };
const failure = (message, status) => Object.assign(new Error(message), { status });

// Only these page reads use this context. The fixed Softphone profile/actions stay independent.
export async function requireCallCenterAccess(req, { section = 'agents', operation = 'view', desk = false, body = null } = {}) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw failure('Please sign in again.', 401);
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: role, error } = await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !role) throw failure('Could not verify your workspace.', 403);
  const permissions = desk ? getModulePermissions(role.module_access, role.role, 'callcenter')
    : getSubItemPermissions(role.module_access, role.role, 'calladmin', section);
  if (!permissions.view || !permissions[operation]) throw failure('Access denied.', 403);
  const master = ['masteradmin', 'master_admin'].includes(String(role.role || '').toLowerCase())
    || role.module_access?.is_master_admin === true || String(role.email || '').toLowerCase() === 'supujacreations@gmail.com';
  const params = new URL(req.url).searchParams;
  const company = master ? (body?.company ?? params.get('company') ?? role.company ?? '') : (role.company || '');
  const tenantId = master ? (body?.tenantId ?? body?.tenant_id ?? params.get('tenant_id') ?? role.tenant_id ?? role.module_access?._tenantId ?? null)
    : (role.tenant_id || role.module_access?._tenantId || null);
  const requestedTenant = normalizeTenant(body?.tenantId || body?.tenant_id || params.get('tenant_id'));
  if (!master && requestedTenant && requestedTenant !== normalizeTenant(tenantId)) throw failure('Workspace access denied.', 403);
  return { db, user, role, company, tenantId, master };
}

export async function readWorkspaceAdmin(context, { includeEndpoints = true } = {}) {
  const [members, admin] = await Promise.all([
    getTeamMembers(context.company, context.tenantId),
    includeEndpoints ? getCallAdminData(context.company, context.tenantId) : context.db.from('call_agents').select('id, user_id, display_name, plivo_username')
  ]);
  if (admin.error) throw failure('Calling profiles could not be loaded. Please retry.', 503);
  const tenant = normalizeTenant(context.tenantId);
  const users = members.filter(member => {
    const memberTenant = normalizeTenant(member.tenant_id || member.module_access?._tenantId);
    return !memberTenant || memberTenant === tenant;
  }).map(member => ({
    ...Object.fromEntries(['user_id', 'emp_name', 'emp_id', 'emp_code', 'email', 'emp_official_mail_id',
      'emp_department', 'emp_designation', 'company', 'role', 'emp_status', 'work_location_name', 'work_location_type']
      .map(key => [key, member[key] ?? '']))
  }));
  const ids = new Set(users.map(user => user.user_id));
  return { users, agents: (admin.agents || admin.data || []).filter(agent => ids.has(agent.user_id)), endpoints: admin.endpoints || [] };
}

export const employeeLabel = (agent, users) => {
  const employee = users.find(user => user.user_id === agent.user_id);
  if (!employee) return agent.display_name || 'Employee';
  const name = employee.emp_name || employee.email || 'Employee';
  const id = employee.emp_id || employee.emp_code;
  return id && !String(name).includes(String(id)) ? `${name} - ${id}` : name;
};

export function pageParameters(params) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') || '25', 10) || 25));
  const offset = Math.max(0, Math.min(10000000, Number.parseInt(params.get('offset') || '0', 10) || 0));
  // Keep PostgREST filter syntax out of user search text.
  const search = String(params.get('search') || '').replace(/[,().%_*\\]/g, ' ').trim().slice(0, 120);
  return { limit, offset, search };
}

export async function readPageCalls(context, params, agents, users = []) {
  if (!agents.length) return { calls: [], total: 0 };
  const { limit, offset, search } = pageParameters(params);
  let query = context.db.from('call_sessions').select('*', { count: 'exact' }).in('agent_id', agents.map(agent => agent.id));
  const start = params.get('start_date');
  const end = params.get('end_date');
  if (start && Number.isFinite(Date.parse(start))) query = query.gte('created_at', start);
  if (end && Number.isFinite(Date.parse(end))) query = query.lte('created_at', end);
  if (search) {
    const matchingAgents = agents.filter(agent => employeeLabel(agent, users).toLowerCase().includes(search.toLowerCase()));
    const filters = [`customer_number.ilike.%${search}%`, `room_name.ilike.%${search}%`, `status.ilike.%${search}%`];
    if (matchingAgents.length) filters.push(`agent_id.in.(${matchingAgents.map(agent => agent.id).join(',')})`);
    query = query.or(filters.join(','));
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw failure('Call logs could not be loaded. Please retry.', 503);
  const agentMap = new Map(agents.map(agent => [agent.id, agent]));
  return { calls: (data || []).map(call => {
    const agent = agentMap.get(call.agent_id);
    return { ...call, call_agents: agent ? { display_name: employeeLabel(agent, users), plivo_username: agent.plivo_username } : null };
  }), total: count || 0 };
}
