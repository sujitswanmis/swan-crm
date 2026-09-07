'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getEmployeeChecklistDashboard } from './checklist';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * Lightweight, non-blocking fetcher for active user alerts:
 * 1. Active delegation tasks assigned to current user
 * 2. Today's unsubmitted / due checklist slots for current user
 */
export async function getUserPendingAlerts({
  userEmail = '',
  tenantId = DEFAULT_TENANT_ID
} = {}) {
  const emailClean = (userEmail || '').trim().toLowerCase();
  if (!emailClean) {
    return {
      success: true,
      delegationTasks: [],
      checklistSlots: [],
      checkedAt: new Date().toISOString()
    };
  }

  const adminClient = getAdminClient();
  let delegationTasks = [];
  let checklistSlots = [];

  // 1. Fetch active delegation tasks
  try {
    const { data: tasks, error: taskErr } = await adminClient
      .from('delegation_tasks')
      .select('id, task_code, title, description, priority, category, delegated_by_name, delegated_by_email, deadline, status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .ilike('assigned_to_email', emailClean)
      .in('status', ['PENDING', 'IN_PROGRESS', 'REOPENED'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (!taskErr && Array.isArray(tasks)) {
      const now = new Date();
      delegationTasks = tasks.map(t => {
        const isPastDeadline = t.deadline ? new Date(t.deadline) < now : false;
        return {
          id: t.id,
          task_code: t.task_code,
          title: t.title,
          description: t.description,
          priority: t.priority || 'MEDIUM',
          category: t.category || 'OPERATIONS',
          delegated_by_name: t.delegated_by_name || 'Delegator',
          delegated_by_email: t.delegated_by_email || '',
          deadline: t.deadline,
          status: t.status,
          created_at: t.created_at,
          updated_at: t.updated_at,
          is_overdue: isPastDeadline
        };
      });
    }
  } catch (err) {
    console.warn('Error fetching user delegation alerts:', err.message);
  }

  // 2. Fetch today's pending/due checklist slots
  try {
    const checkRes = await getEmployeeChecklistDashboard({
      employeeEmail: emailClean,
      frequency: 'DAILY',
      targetDate: new Date(),
      tenantId
    });

    if (checkRes.success && Array.isArray(checkRes.data)) {
      checklistSlots = checkRes.data
        .filter(item => item.status !== 'COMPLETED')
        .map(item => ({
          templateId: item.template?.id,
          templateTitle: item.template?.title || 'Checklist',
          baseTitle: item.template?.base_title || item.template?.title,
          slotLabel: item.template?.slot_label || item.slotInfo?.label || 'Slot',
          slotId: item.template?.slot_id || item.slotInfo?.slot_id || 'S1',
          dueTime: item.template?.due_time || '18:00',
          bufferMinutes: item.template?.buffer_minutes || 20,
          periodKey: item.currentPeriodKey,
          status: item.status,
          isDelayed: item.delayInfo?.isDelayed || false,
          delayMinutes: item.delayInfo?.delayMinutes || 0,
          canSubmit: item.delayInfo?.canSubmit !== false
        }));
    }
  } catch (err) {
    console.warn('Error fetching user checklist alerts:', err.message);
  }

  return {
    success: true,
    delegationTasks,
    checklistSlots,
    checkedAt: new Date().toISOString()
  };
}
