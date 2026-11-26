'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logAuditAction } from './audit';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const TENANT_UUID_MAP = {
  'TNT00001': '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
  'TNT00002': '00000000-0000-0000-0000-000000000001',
  'TNT00003': '922d3e72-6588-457f-a562-4f1bdbf10d98'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => Boolean(val && UUID_REGEX.test(String(val).trim()));

export async function resolveDbTenantUuid(tenantId) {
  if (!tenantId) return DEFAULT_TENANT_ID;
  const str = String(tenantId).trim();
  const upper = str.toUpperCase();
  if (TENANT_UUID_MAP[upper]) return TENANT_UUID_MAP[upper];
  const lower = str.toLowerCase();
  if (lower.includes('supuja')) return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
  if (lower.includes('testing')) return '922d3e72-6588-457f-a562-4f1bdbf10d98';
  if (lower.includes('swan') || lower.includes('nsmlr') || lower.includes('nstl')) return DEFAULT_TENANT_ID;
  if (isUuid(str)) return str;
  return DEFAULT_TENANT_ID;
}

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const UUID_TO_TENANT_CODE = {
  '0a37b8e8-1c28-4e19-8891-951fc3f8f8af': 'TNT00001',
  '00000000-0000-0000-0000-000000000001': 'TNT00002',
  '922d3e72-6588-457f-a562-4f1bdbf10d98': 'TNT00003'
};

/**
 * Returns current IST date as YYYY-MM-DD string
 */
export async function getTodayISTDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Resolves standardized tenant_code from tenant_id or DB
 */
async function resolveTenantCode(dbTenantId, fallbackCode = null) {
  if (fallbackCode && fallbackCode.startsWith('TNT')) return fallbackCode;
  if (UUID_TO_TENANT_CODE[dbTenantId]) return UUID_TO_TENANT_CODE[dbTenantId];

  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('tenants')
      .select('tenant_code')
      .eq('id', dbTenantId)
      .maybeSingle();
    if (data?.tenant_code) return data.tenant_code;
  } catch (e) {
    console.warn('Could not query tenants table for tenant_code:', e?.message);
  }

  return 'TNT00002';
}

// ==========================================
// 1. TASK PLANNER CRUD ACTIONS
// ==========================================

export async function createTaskPlannerItem(itemData, tenantId) {
  const dbTenantId = await resolveDbTenantUuid(itemData.tenant_code || tenantId);
  if (!dbTenantId) {
    return { success: false, error: 'Tenant identification is required' };
  }

  const adminClient = getAdminClient();
  try {
    const id = itemData.id || crypto.randomUUID();
    const tenantCode = await resolveTenantCode(dbTenantId, itemData.tenant_code);
    const todayIST = await getTodayISTDate();

    const payload = {
      id,
      tenant_id: dbTenantId,
      tenant_code: tenantCode,
      branch_code: itemData.branch_code || 'All',
      employee_id: itemData.employee_id || null,
      employee_name: (itemData.employee_name || 'Employee').trim(),
      employee_email: (itemData.employee_email || '').trim().toLowerCase(),
      department: itemData.department || 'General',
      title: (itemData.title || '').trim(),
      description: itemData.description || '',
      source_type: itemData.source_type || 'STANDALONE',
      source_ref_id: itemData.source_ref_id || null,
      planned_date: itemData.planned_date || todayIST,
      time_slot_start: itemData.time_slot_start || null,
      time_slot_end: itemData.time_slot_end || null,
      estimated_minutes: parseInt(itemData.estimated_minutes, 10) || 30,
      actual_minutes: parseInt(itemData.actual_minutes, 10) || 0,
      priority: itemData.priority || 'IMPORTANT_NOT_URGENT',
      status: itemData.status || 'PLANNED',
      carry_forward_count: parseInt(itemData.carry_forward_count, 10) || 0,
      requested_by_name: (itemData.requested_by_name || '').trim() || null,
      requested_by_channel: itemData.requested_by_channel || 'VERBAL',
      notes: itemData.notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (payload.status === 'COMPLETED') {
      payload.completed_at = new Date().toISOString();
    }

    let { data, error } = await adminClient
      .from('task_planner_items')
      .insert([payload])
      .select()
      .single();

    // Defensive fallback if columns not yet migrated
    if (error && (error.message?.includes('requested_by') || error.code === '42703')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.requested_by_name;
      delete fallbackPayload.requested_by_channel;
      const retry = await adminClient
        .from('task_planner_items')
        .insert([fallbackPayload])
        .select()
        .single();
      if (retry.error) throw retry.error;
      data = retry.data;
      error = null;
    }

    if (error) throw error;
    try {
      await logAuditAction({
        action: 'Create Task Planner Item',
        target: `Planned "${payload.title}" for ${payload.planned_date} (${payload.employee_name})`,
        userEmail: payload.employee_email || undefined,
        userName: payload.employee_name || undefined
      });
    } catch (_) {}
    return { success: true, data };
  } catch (err) {
    console.error('Error creating task planner item:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getActiveTenantsList() {
  const adminClient = getAdminClient();
  try {
    const { data, error } = await adminClient
      .from('tenants')
      .select('id, tenant_code, name, status')
      .order('tenant_code', { ascending: true });
    if (error) throw error;
    return { success: true, tenants: data || [] };
  } catch (err) {
    console.warn('Error fetching tenants list from DB, using standard list:', err.message);
    return {
      success: true,
      tenants: [
        { id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', tenant_code: 'TNT00001', name: 'SuPuja Creations' },
        { id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', name: 'New Swan Group' },
        { id: '922d3e72-6588-457f-a562-4f1bdbf10d98', tenant_code: 'TNT00003', name: 'Testing New Swan Group' }
      ]
    };
  }
}

export async function getTaskPlannerItems({
  tenantId,
  tenantCode,
  employeeEmail,
  startDate,
  endDate,
  date,
  status,
  priority,
  branchCode,
  requesterFilter
} = {}) {
  const adminClient = getAdminClient();
  try {
    let query = adminClient
      .from('task_planner_items')
      .select('*');

    if (tenantId && tenantId !== 'ALL' && tenantId !== 'All') {
      const dbTenantId = await resolveDbTenantUuid(tenantId);
      if (dbTenantId) query = query.eq('tenant_id', dbTenantId);
    } else if (tenantCode && tenantCode !== 'ALL' && tenantCode !== 'All') {
      query = query.eq('tenant_code', tenantCode);
    }

    if (employeeEmail) {
      query = query.eq('employee_email', employeeEmail.trim().toLowerCase());
    }

    if (date) {
      query = query.eq('planned_date', date);
    } else if (startDate && endDate) {
      query = query.gte('planned_date', startDate).lte('planned_date', endDate);
    } else if (startDate) {
      query = query.gte('planned_date', startDate);
    }

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    } else {
      query = query.neq('status', 'CANCELLED');
    }

    if (priority && priority !== 'ALL') {
      query = query.eq('priority', priority);
    }

    if (branchCode && branchCode !== 'All' && branchCode !== 'ALL') {
      query = query.or(`branch_code.eq.${branchCode},branch_code.eq.All`);
    }

    if (requesterFilter === 'SELF') {
      query = query.is('requested_by_name', null);
    } else if (requesterFilter === 'OTHERS') {
      query = query.not('requested_by_name', 'is', null);
    } else if (requesterFilter && requesterFilter !== 'ALL') {
      query = query.ilike('requested_by_name', `%${requesterFilter}%`);
    }

    query = query
      .order('planned_date', { ascending: true })
      .order('time_slot_start', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    let { data, error } = await query;
    if (error && (error.message?.includes('requested_by') || error.code === '42703')) {
      // Graceful fallback without requested_by filter if column not yet added
      const retryQuery = adminClient
        .from('task_planner_items')
        .select('*')
        .order('planned_date', { ascending: true })
        .order('time_slot_start', { ascending: true, nullsFirst: false });
      const retry = await retryQuery;
      if (!retry.error) return { success: true, data: retry.data || [] };
    }
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('Error fetching task planner items:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

export async function updateTaskPlannerItem(id, updates, tenantId) {
  if (!id) {
    return { success: false, error: 'Item ID is required' };
  }

  const adminClient = getAdminClient();
  try {
    const payload = { ...updates, updated_at: new Date().toISOString() };
    if (updates?.tenant_code) {
      payload.tenant_id = await resolveDbTenantUuid(updates.tenant_code);
    }
    if (payload.status === 'COMPLETED' && !payload.completed_at) {
      payload.completed_at = new Date().toISOString();
    } else if (payload.status && payload.status !== 'COMPLETED') {
      payload.completed_at = null;
    }

    let { data, error } = await adminClient
      .from('task_planner_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error && (error.message?.includes('requested_by') || error.code === '42703')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.requested_by_name;
      delete fallbackPayload.requested_by_channel;
      const retry = await adminClient
        .from('task_planner_items')
        .update(fallbackPayload)
        .eq('id', id)
        .select()
        .single();
      if (retry.error) throw retry.error;
      data = retry.data;
      error = null;
    }

    if (error) throw error;
    try {
      await logAuditAction(
        'Update Task Planner Item',
        `Updated task planner "${data?.title || id}" (Status: ${data?.status || updates?.status || 'updated'})`
      );
    } catch (_) {}
    return { success: true, data };
  } catch (err) {
    console.error('Error updating task planner item:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateTaskPlannerStatus(id, newStatus, notes = '', actualMinutes = null, tenantId) {
  const updates = { status: newStatus };
  if (notes) updates.notes = notes;
  if (actualMinutes !== null) updates.actual_minutes = parseInt(actualMinutes, 10);
  return updateTaskPlannerItem(id, updates, tenantId);
}

export async function carryForwardTask(id, targetDate, tenantId) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId || !id) {
    return { success: false, error: 'Item ID and Tenant ID are required' };
  }

  const adminClient = getAdminClient();
  try {
    // Fetch current item
    const { data: current, error: fetchErr } = await adminClient
      .from('task_planner_items')
      .select('carry_forward_count')
      .eq('id', id)
      .eq('tenant_id', dbTenantId)
      .single();

    if (fetchErr || !current) throw fetchErr || new Error('Task not found');

    const nextCount = (current.carry_forward_count || 0) + 1;
    const { data, error } = await adminClient
      .from('task_planner_items')
      .update({
        planned_date: targetDate,
        status: 'CARRIED_FORWARD',
        carry_forward_count: nextCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', dbTenantId)
      .select()
      .single();

    if (error) throw error;
    try {
      await logAuditAction('Carry Forward Task Planner', `Carried forward task "${data?.title || id}" to ${targetDate} (Count: ${nextCount})`);
    } catch (_) {}
    return { success: true, data };
  } catch (err) {
    console.error('Error carrying forward task:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteTaskPlannerItem(id, tenantId) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId || !id) {
    return { success: false, error: 'Item ID and Tenant ID are required' };
  }

  const adminClient = getAdminClient();
  try {
    // Soft delete: update status to 'CANCELLED'
    const { data, error } = await adminClient
      .from('task_planner_items')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', dbTenantId)
      .select()
      .single();

    if (error) throw error;
    try {
      await logAuditAction('Delete Task Planner Item', `Moved task planner "${data?.title || id}" to Deleted Tasks`);
    } catch (_) {}
    return { success: true, data };
  } catch (err) {
    console.error('Error soft-deleting task planner item:', err.message);
    return { success: false, error: err.message };
  }
}

export async function restoreTaskPlannerItem(id, tenantId) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId || !id) {
    return { success: false, error: 'Item ID and Tenant ID are required' };
  }

  const adminClient = getAdminClient();
  try {
    // Restore task: set status back to 'PLANNED'
    const { data, error } = await adminClient
      .from('task_planner_items')
      .update({
        status: 'PLANNED',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', dbTenantId)
      .select()
      .single();

    if (error) throw error;
    try {
      await logAuditAction('Restore Task Planner Item', `Restored task planner "${data?.title || id}" back to PLANNED`);
    } catch (_) {}
    return { success: true, data };
  } catch (err) {
    console.error('Error restoring task planner item:', err.message);
    return { success: false, error: err.message };
  }
}

export async function permanentDeleteTaskPlannerItem(id, tenantId) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId || !id) {
    return { success: false, error: 'Item ID and Tenant ID are required' };
  }

  const adminClient = getAdminClient();
  try {
    const { error } = await adminClient
      .from('task_planner_items')
      .delete()
      .eq('id', id)
      .eq('tenant_id', dbTenantId);

    if (error) throw error;
    try {
      await logAuditAction('Permanent Delete Task Planner', `Permanently deleted task planner item ID: ${id}`);
    } catch (_) {}
    return { success: true };
  } catch (err) {
    console.error('Error permanently deleting task planner item:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDeletedTaskPlannerItems({
  tenantId,
  tenantCode,
  employeeEmail,
  branchCode
} = {}) {
  const adminClient = getAdminClient();
  try {
    let query = adminClient
      .from('task_planner_items')
      .select('*')
      .eq('status', 'CANCELLED');

    if (tenantId && tenantId !== 'ALL' && tenantId !== 'All') {
      const dbTenantId = await resolveDbTenantUuid(tenantId);
      if (dbTenantId) query = query.eq('tenant_id', dbTenantId);
    } else if (tenantCode && tenantCode !== 'ALL' && tenantCode !== 'All') {
      query = query.eq('tenant_code', tenantCode);
    }

    if (employeeEmail) {
      query = query.eq('employee_email', employeeEmail.trim().toLowerCase());
    }

    if (branchCode && branchCode !== 'All' && branchCode !== 'ALL') {
      query = query.or(`branch_code.eq.${branchCode},branch_code.eq.All`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('Error fetching deleted task planner items:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

// ==========================================
// 2. AGGREGATED PENDING TASKS FROM SOURCES
// ==========================================

export async function getAggregatedPendingSources({ tenantId, employeeEmail, date } = {}) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId || !employeeEmail) {
    return { success: false, delegations: [], checklists: [] };
  }

  const adminClient = getAdminClient();
  const cleanEmail = employeeEmail.trim().toLowerCase();

  try {
    // 1. Fetch pending delegation tasks assigned to this employee
    const { data: delegations, error: delErr } = await adminClient
      .from('delegation_tasks')
      .select('id, task_code, title, description, priority, category, delegated_by_name, deadline, status')
      .eq('tenant_id', dbTenantId)
      .eq('assigned_to_email', cleanEmail)
      .in('status', ['PENDING', 'IN_PROGRESS', 'REOPENED'])
      .order('deadline', { ascending: true })
      .limit(30);

    if (delErr) {
      console.warn('Error fetching delegations for planner backlog:', delErr.message);
    }

    // 2. Fetch active checklist templates assigned to employee or department
    const { data: templates, error: chkErr } = await adminClient
      .from('checklist_templates')
      .select('id, title, frequency, due_time, assigned_type, assigned_employee_email')
      .eq('tenant_id', dbTenantId)
      .eq('is_active', true)
      .limit(30);

    let checklists = [];
    if (!chkErr && Array.isArray(templates)) {
      // Filter for this employee
      checklists = templates.filter(t => {
        if (t.assigned_type === 'ALL') return true;
        if (t.assigned_employee_email && t.assigned_employee_email.toLowerCase() === cleanEmail) return true;
        return false;
      });
    }

    return {
      success: true,
      delegations: delegations || [],
      checklists: checklists || []
    };
  } catch (err) {
    console.error('Error fetching aggregated pending sources:', err.message);
    return { success: false, delegations: [], checklists: [], error: err.message };
  }
}

// ==========================================
// 3. TEAM CAPACITY & SUPERVISOR RADAR
// ==========================================

export async function getTeamCapacityPlanner({ tenantId, branchCode, date, teamEmails = [] } = {}) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId) {
    return { success: false, teamCapacity: [] };
  }

  const adminClient = getAdminClient();
  const targetDate = date || (await getTodayISTDate());

  try {
    let query = adminClient
      .from('task_planner_items')
      .select('*')
      .eq('tenant_id', dbTenantId)
      .eq('planned_date', targetDate);

    if (Array.isArray(teamEmails) && teamEmails.length > 0) {
      const cleanEmails = teamEmails.map(e => String(e).trim().toLowerCase()).filter(Boolean);
      query = query.in('employee_email', cleanEmails);
    }

    if (branchCode && branchCode !== 'All') {
      query = query.or(`branch_code.eq.${branchCode},branch_code.eq.All`);
    }

    const { data: tasks, error } = await query;
    if (error) throw error;

    // Group by employee_email
    const capacityMap = {};

    (tasks || []).forEach(t => {
      const email = t.employee_email;
      if (!capacityMap[email]) {
        capacityMap[email] = {
          employee_id: t.employee_id,
          employee_name: t.employee_name,
          employee_email: email,
          department: t.department,
          total_tasks: 0,
          completed_tasks: 0,
          in_progress_tasks: 0,
          planned_tasks: 0,
          carried_forward_tasks: 0,
          total_estimated_minutes: 0,
          total_actual_minutes: 0,
          tasks: []
        };
      }

      capacityMap[email].total_tasks += 1;
      capacityMap[email].total_estimated_minutes += (t.estimated_minutes || 0);
      capacityMap[email].total_actual_minutes += (t.actual_minutes || 0);
      capacityMap[email].tasks.push(t);

      if (t.status === 'COMPLETED') capacityMap[email].completed_tasks += 1;
      else if (t.status === 'IN_PROGRESS') capacityMap[email].in_progress_tasks += 1;
      else if (t.status === 'CARRIED_FORWARD') capacityMap[email].carried_forward_tasks += 1;
      else capacityMap[email].planned_tasks += 1;
    });

    const teamCapacity = Object.values(capacityMap).map(member => {
      const estHours = (member.total_estimated_minutes / 60).toFixed(1);
      let workload_status = 'BALANCED';
      if (member.total_estimated_minutes > 480) { // > 8 hours
        workload_status = 'OVERLOADED';
      } else if (member.total_estimated_minutes < 240) { // < 4 hours
        workload_status = 'LIGHT';
      }

      const completion_rate = member.total_tasks > 0 
        ? Math.round((member.completed_tasks / member.total_tasks) * 100) 
        : 0;

      return {
        ...member,
        estimated_hours: parseFloat(estHours),
        workload_status,
        completion_rate
      };
    });

    return { success: true, date: targetDate, teamCapacity };
  } catch (err) {
    console.error('Error fetching team capacity planner:', err.message);
    return { success: false, error: err.message, teamCapacity: [] };
  }
}

// ==========================================
// 4. ANALYTICS & MIS SUMMARY
// ==========================================

export async function getTaskPlannerAnalytics({ tenantId, employeeEmail, startDate, endDate } = {}) {
  const dbTenantId = await resolveDbTenantUuid(tenantId);
  if (!dbTenantId) {
    return { success: false, analytics: null };
  }

  const adminClient = getAdminClient();
  try {
    let query = adminClient
      .from('task_planner_items')
      .select('id, title, status, priority, category, estimated_minutes, actual_minutes, planned_date, requested_by_name, requested_by_channel, created_at, completed_at, carry_forward_count')
      .eq('tenant_id', dbTenantId)
      .neq('status', 'CANCELLED');

    if (employeeEmail) {
      query = query.eq('employee_email', employeeEmail.trim().toLowerCase());
    }

    if (startDate && endDate) {
      query = query.gte('planned_date', startDate).lte('planned_date', endDate);
    } else if (startDate) {
      query = query.gte('planned_date', startDate);
    }

    let { data: rows, error } = await query;
    if (error && (error.message?.includes('requested_by') || error.code === '42703')) {
      const fallbackQuery = adminClient
        .from('task_planner_items')
        .select('id, title, status, priority, estimated_minutes, actual_minutes, planned_date')
        .eq('tenant_id', dbTenantId)
        .neq('status', 'CANCELLED');
      const retry = await fallbackQuery;
      if (!retry.error) {
        rows = retry.data || [];
        error = null;
      }
    }
    if (error) throw error;

    const list = rows || [];
    const total = list.length;
    const completed = list.filter(r => r.status === 'COMPLETED').length;
    const inProgress = list.filter(r => r.status === 'IN_PROGRESS').length;
    const carriedForward = list.filter(r => r.status === 'CARRIED_FORWARD').length;
    const planned = list.filter(r => r.status === 'PLANNED').length;

    const totalEstMinutes = list.reduce((acc, r) => acc + (r.estimated_minutes || 0), 0);
    const totalActMinutes = list.reduce((acc, r) => acc + (r.actual_minutes || 0), 0);

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Work Source: Self vs Inward
    const inwardTasks = list.filter(r => r.requested_by_name && r.requested_by_name.trim() !== '').length;
    const selfTasks = total - inwardTasks;

    // Channel Breakdown for Inward Requests
    const channels = {
      VERBAL: list.filter(r => r.requested_by_channel === 'VERBAL').length,
      WHATSAPP: list.filter(r => r.requested_by_channel === 'WHATSAPP').length,
      MEETING: list.filter(r => r.requested_by_channel === 'MEETING').length,
      PHONE: list.filter(r => r.requested_by_channel === 'PHONE').length,
      EMAIL: list.filter(r => r.requested_by_channel === 'EMAIL').length,
      OTHER: list.filter(r => !['VERBAL', 'WHATSAPP', 'MEETING', 'PHONE', 'EMAIL'].includes(r.requested_by_channel) && r.requested_by_name).length
    };

    // Priority Breakdown
    const priorities = {
      URGENT_IMPORTANT: list.filter(r => r.priority === 'URGENT_IMPORTANT').length,
      IMPORTANT_NOT_URGENT: list.filter(r => r.priority === 'IMPORTANT_NOT_URGENT').length,
      URGENT_NOT_IMPORTANT: list.filter(r => r.priority === 'URGENT_NOT_IMPORTANT').length,
      NOT_URGENT_NOT_IMPORTANT: list.filter(r => r.priority === 'NOT_URGENT_NOT_IMPORTANT').length
    };

    return {
      success: true,
      analytics: {
        total,
        completed,
        inProgress,
        carriedForward,
        planned,
        totalEstMinutes,
        totalActMinutes,
        completionRate,
        selfTasks,
        inwardTasks,
        channels,
        priorities
      }
    };
  } catch (err) {
    console.error('Error fetching task planner analytics:', err.message);
    return { success: false, error: err.message, analytics: null };
  }
}

// ==========================================
// 5. DELTA SYNCHRONIZATION ENGINE
// ==========================================

export async function syncTaskPlannerDelta({
  tenantId,
  tenantCode,
  employeeEmail,
  lastSyncedAt = null,
  branchCode = null
} = {}) {
  const adminClient = getAdminClient();
  const serverTimestamp = new Date().toISOString();

  try {
    let query = adminClient
      .from('task_planner_items')
      .select('*');

    if (tenantId && tenantId !== 'ALL' && tenantId !== 'All') {
      const dbTenantId = await resolveDbTenantUuid(tenantId);
      if (dbTenantId) query = query.eq('tenant_id', dbTenantId);
    } else if (tenantCode && tenantCode !== 'ALL' && tenantCode !== 'All') {
      query = query.eq('tenant_code', tenantCode);
    }

    if (employeeEmail) {
      query = query.eq('employee_email', employeeEmail.trim().toLowerCase());
    }

    if (branchCode && branchCode !== 'All' && branchCode !== 'ALL') {
      query = query.or(`branch_code.eq.${branchCode},branch_code.eq.All`);
    }

    const isDelta = Boolean(lastSyncedAt);
    if (isDelta) {
      // Incremental delta: only records modified after lastSyncedAt
      query = query.gt('updated_at', lastSyncedAt);
    }

    query = query
      .order('updated_at', { ascending: true })
      .limit(500);

    const { data: changes, error } = await query;
    if (error) throw error;

    return {
      success: true,
      changes: changes || [],
      serverTimestamp,
      isDelta,
      count: (changes || []).length
    };
  } catch (err) {
    console.error('Error in syncTaskPlannerDelta:', err.message);
    return {
      success: false,
      error: err.message,
      changes: [],
      serverTimestamp,
      isDelta: false
    };
  }
}
