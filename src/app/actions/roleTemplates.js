'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { MODULES_CONFIG } from '@/config/modulesConfig';
import { ROLE_PRESETS } from '@/components/UserManagement/utils/rolePresets';
import { logAuditAction } from './audit';

const SWAN_COMPANIES = new Set(['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl']);
const MASTER_EMAILS = new Set(['supujacreations@gmail.com', 'admin@newswangroup.com']);
const MODULE_BY_ID = new Map(MODULES_CONFIG.map(module => [module.id, module]));
const PERMISSION_FLAGS = ['view', 'read', 'write', 'edit', 'export', 'delete'];
const GLOBAL_PERMISSION_KEYS = Object.keys(ROLE_PRESETS[0].presetData).filter(key => typeof ROLE_PRESETS[0].presetData[key] === 'boolean' && key !== 'is_master_admin');
const uuid = value => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(value || ''));
const norm = value => String(value || '').trim().toLowerCase();

function workspaceKey(row) {
  const company = norm(row.company);
  if (SWAN_COMPANIES.has(company) || (!company && !row.tenant_id && !row.module_access?._tenantId)) return 'group:swan';
  if (company) return `company:${company}`;
  const tenantId = row.tenant_id || row.module_access?._tenantId;
  return uuid(tenantId) ? `tenant:${tenantId}` : null;
}

function isMasterAdmin(row, email) {
  return MASTER_EMAILS.has(norm(email)) || norm(row.role) === 'masteradmin' || row.module_access?.is_master_admin === true;
}

function isAdmin(row, email) {
  return isMasterAdmin(row, email) || ['admin', 'superadmin'].includes(norm(row.role));
}

function isActive(row) {
  return !['inactive', 'trash', 'resigned', 'terminated', 'hold', 'suspended', 'deleted', 'draft'].includes(norm(row.emp_status || row.module_access?.emp_status || 'active'));
}

function sameWorkspace(actor, target) {
  const actorTenant = actor.tenant_id || actor.module_access?._tenantId;
  const targetTenant = target.tenant_id || target.module_access?._tenantId;
  return workspaceKey(actor) === workspaceKey(target) &&
    (!uuid(actorTenant) || !uuid(targetTenant) || norm(actorTenant) === norm(targetTenant));
}

async function getContext(requireAdmin = false, fallbackUserId = null, fallbackEmail = null, fallbackCompany = null) {
  let user = null;
  try {
    const session = await createClient();
    const { data: authData } = await session.auth.getUser();
    user = authData?.user || null;
  } catch (authErr) {
    console.warn('Session auth lookup fallback in roleTemplates:', authErr?.message);
  }

  const db = getAdminClient();
  let actor = null;
  const targetUserId = user?.id || fallbackUserId;
  const targetEmail = user?.email || fallbackEmail;

  if (targetUserId) {
    const { data } = await db.from('user_roles').select('*').eq('user_id', targetUserId).maybeSingle();
    actor = data;
  }
  if (!actor && targetEmail) {
    const { data } = await db.from('user_roles').select('*').ilike('email', targetEmail).maybeSingle();
    actor = data;
  }

  if (!actor && !user) {
    throw new Error('Please sign in again.');
  }
  if (!actor || !isActive(actor)) {
    throw new Error('User Management access unavailable.');
  }

  const emailToCheck = targetEmail || actor.email || '';
  const admin = isAdmin(actor, emailToCheck);
  if (requireAdmin && !admin) throw new Error('Only administrators can manage roles.');
  if (!requireAdmin && !admin && actor.module_access?.user_management_new?.view !== true && actor.module_access?.team?.view !== true) {
    throw new Error('User Management access unavailable.');
  }

  let scope = workspaceKey(actor);
  if (!scope && fallbackCompany) {
    scope = workspaceKey({ company: fallbackCompany });
  }
  if (!scope) throw new Error('Workspace could not be identified for this account.');
  return { db, actor, scope, admin };
}

function sanitizePermissions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 30000) {
    throw new Error('Choose valid module permissions for this role.');
  }
  const clean = {};
  for (const [key, raw] of Object.entries(input)) {
    // Explicitly reject privileged Master Admin flag
    if (key === 'is_master_admin') {
      throw new Error('Master Admin privileges cannot be assigned via custom role template.');
    }
    // Support global operational powers & privilege overrides
    if (GLOBAL_PERMISSION_KEYS.includes(key) || key === 'can_import_export') {
      if (typeof raw === 'boolean') {
        clean[key] = raw;
      }
      continue;
    }
    const moduleId = key;
    const moduleDef = MODULE_BY_ID.get(moduleId);
    if (!moduleDef || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Unknown role permission.');
    if (moduleDef.roleAssignable === false) throw new Error(`${moduleDef.label || moduleId} cannot be assigned to a staff role.`);
    const allowedFields = new Set([...PERMISSION_FLAGS, 'add', 'sub_items', 'assigned_steps', 'is_manager']);
    if (Object.keys(raw).some(k => !allowedFields.has(k))) throw new Error('Unknown role permission.');
    if (raw.add !== undefined && typeof raw.add !== 'boolean') throw new Error('Invalid permission value.');
    const access = {};
    for (const flag of PERMISSION_FLAGS) {
      if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') throw new Error('Invalid permission value.');
      access[flag] = raw[flag] === true;
    }
    if (raw.is_manager !== undefined) {
      access.is_manager = raw.is_manager === true;
    }
    if (!access.view && PERMISSION_FLAGS.some(flag => flag !== 'view' && access[flag])) {
      throw new Error('Enable View before other permissions.');
    }
    if (!access.view) continue;
    access.add = access.add ?? access.write;

    const allowedSubItems = new Set((moduleDef.subItems || []).map(item => item.id));
    if (raw.sub_items !== undefined) {
      if (!raw.sub_items || typeof raw.sub_items !== 'object' || Array.isArray(raw.sub_items)) throw new Error('Invalid role subpages.');
      const subItems = {};
      const allowedSubFlags = new Set(['view', 'read', 'write', 'add', 'edit', 'delete', 'export']);
      for (const [subId, subAccess] of Object.entries(raw.sub_items)) {
        if (!allowedSubItems.has(subId) || !subAccess || typeof subAccess !== 'object' || Array.isArray(subAccess) ||
          Object.keys(subAccess).some(k => !allowedSubFlags.has(k))) {
          throw new Error('Invalid role subpage permission.');
        }
        subItems[subId] = {
          view: subAccess.view === true,
          add: subAccess.add === true,
          edit: subAccess.edit === true,
          delete: subAccess.delete === true
        };
      }
      access.sub_items = subItems;
      if (allowedSubItems.size > 0 && !Object.values(subItems).some(item => item.view)) {
        throw new Error(`Select at least one subpage for ${moduleDef.label || moduleId}.`);
      }
      if (moduleId === 'leads' || moduleId === 'recruiter') {
        access.assigned_steps = Object.keys(subItems).filter(id => subItems[id].view);
      }
    }
    if (allowedSubItems.size > 0 && !access.sub_items) {
      throw new Error(`Select at least one subpage for ${moduleDef.label || moduleId}.`);
    }
    if (raw.assigned_steps !== undefined) {
      if (!Array.isArray(raw.assigned_steps) || raw.assigned_steps.some(id => !allowedSubItems.has(id))) {
        throw new Error('Invalid assigned steps.');
      }
      if (!access.sub_items) {
        access.assigned_steps = [...new Set(raw.assigned_steps)];
      }
    }
    clean[moduleId] = access;
  }
  const moduleKeys = Object.keys(clean).filter(k => MODULE_BY_ID.has(k));
  if (moduleKeys.length === 0) throw new Error('Select at least one module for this role.');
  return clean;
}

function databaseError(error) {
  if (['42P01', 'PGRST205'].includes(error?.code)) {
    return 'Role setup required: apply migrations/29_user_management_role_templates.sql in Supabase.';
  }
  if (error?.code === '23505') return 'A role with this name already exists in this workspace.';
  return error?.message || 'Role request failed.';
}

export async function getRoleTemplates(fallbackUserId = null, fallbackEmail = null, fallbackCompany = null) {
  let canManageRoles = false;
  try {
    const { db, scope, admin } = await getContext(false, fallbackUserId, fallbackEmail, fallbackCompany);
    canManageRoles = admin;
    const { data, error } = await db.from('crm_role_templates')
      .select('id,name,description,permissions,created_at')
      .eq('workspace_key', scope)
      .order('name', { ascending: true });
    if (error) throw new Error(databaseError(error));
    return { success: true, roles: data || [], canManageRoles: admin };
  } catch (error) {
    return { success: false, roles: [], canManageRoles, error: error.message };
  }
}

export async function createRoleTemplate(input) {
  try {
    const { db, actor, scope } = await getContext(true);
    const name = String(input?.name || '').trim().replace(/\s+/g, ' ');
    const description = String(input?.description || '').trim();
    if (name.length < 2 || name.length > 60 || description.length > 240) {
      throw new Error('Role name must be 2–60 characters and description at most 240 characters.');
    }
    if (norm(name) === 'master admin' || norm(name) === 'masteradmin') {
      throw new Error('Master Admin is a reserved platform role name.');
    }
    const permissions = sanitizePermissions(input?.permissions);
    const { data, error } = await db.from('crm_role_templates')
      .insert({ workspace_key: scope, name, description, permissions, created_by: actor.user_id })
      .select('id,name,description,permissions,created_at')
      .single();
    if (error) throw new Error(databaseError(error));
    try {
      await logAuditAction('Create Role Template', `Created role template "${name}"`);
    } catch (auditError) {
      console.warn('Role audit log unavailable:', auditError);
    }
    return { success: true, role: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function assignRoleTemplate(userId, roleId) {
  try {
    if (!uuid(userId) || !uuid(roleId)) throw new Error('Select a valid employee and role.');
    const { db, scope, actor } = await getContext(true);
    const { data: template, error: roleError } = await db.from('crm_role_templates')
      .select('id,name,permissions').eq('id', roleId).eq('workspace_key', scope).maybeSingle();
    if (roleError) throw new Error(databaseError(roleError));
    if (!template) throw new Error('Role not found in this workspace.');
    const permissions = sanitizePermissions(template.permissions);
    const { data: target, error: targetError } = await db.from('user_roles')
      .select('*')
      .eq('user_id', userId).maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target || !sameWorkspace(actor, target)) throw new Error('Employee not found in this workspace.');
    if (!isActive(target) || norm(target.role) === 'customer' || isMasterAdmin(target, target.email) ||
      norm(target.emp_id) === 'masteradmin' || norm(target.emp_designation) === 'master admin') {
      throw new Error('Only active staff accounts can receive a custom role.');
    }

    const nextAccess = { ...(target.module_access || {}) };
    for (const moduleDef of MODULES_CONFIG) delete nextAccess[moduleDef.id];
    for (const flag of GLOBAL_PERMISSION_KEYS) delete nextAccess[flag];
    delete nextAccess.can_import_export;
    delete nextAccess.role_template_id;
    delete nextAccess.role_template_name;
    Object.assign(nextAccess, permissions, { role_template_id: template.id, role_template_name: template.name });

    const updateTarget = payload => {
      let query = db.from('user_roles').update(payload).eq('user_id', target.user_id);
      if (target.company) query = query.eq('company', target.company);
      return query.select('user_id').maybeSingle();
    };
    const hasBoth = permissions.can_import_data === true && permissions.can_export_data === true;
    let { data: updatedUser, error: updateError } = await updateTarget({
      module_access: nextAccess,
      can_self_reset_password: permissions.can_self_reset_password === true,
      can_import_export: hasBoth
    });
    if (updateError && ['42703', 'PGRST204'].includes(updateError.code)) {
      ({ data: updatedUser, error: updateError } = await updateTarget({ module_access: nextAccess }));
    }
    if (updateError) throw new Error(updateError.message);
    if (!updatedUser) throw new Error('Employee role changed before assignment. Please refresh and try again.');
    try {
      await logAuditAction('Assign Role Template', `Assigned "${template.name}" to ${target.emp_name || target.email || target.user_id} by ${actor.emp_name || actor.email || actor.user_id}`);
    } catch (auditError) {
      console.warn('Role assignment audit log unavailable:', auditError);
    }
    return { success: true, moduleAccess: nextAccess };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
