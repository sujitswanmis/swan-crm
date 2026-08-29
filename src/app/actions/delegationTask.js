'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// ==========================================
// 1. TASK CRUD & WORKFLOW ACTIONS
// ==========================================

export async function createDelegationTask(taskData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const id = taskData.id || crypto.randomUUID();
    const taskCode = taskData.task_code || `TSK-${Math.floor(10000 + Math.random() * 90000)}`;

    const payload = {
      id,
      tenant_id: tenantId,
      task_code: taskCode,
      title: (taskData.title || '').trim(),
      description: taskData.description || '',
      priority: (taskData.priority || 'MEDIUM').toUpperCase(),
      category: taskData.category || 'OPERATIONS',
      delegated_by_id: taskData.delegated_by_id || null,
      delegated_by_name: taskData.delegated_by_name || 'Delegator',
      delegated_by_email: (taskData.delegated_by_email || '').trim().toLowerCase(),
      assigned_to_id: taskData.assigned_to_id || null,
      assigned_to_name: taskData.assigned_to_name || 'Assignee',
      assigned_to_email: (taskData.assigned_to_email || '').trim().toLowerCase(),
      assigned_to_department: taskData.assigned_to_department || 'General',
      start_date: taskData.start_date || new Date().toISOString(),
      deadline: taskData.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'PENDING',
      subtasks: Array.isArray(taskData.subtasks) ? taskData.subtasks : [],
      attachments: Array.isArray(taskData.attachments) ? taskData.attachments : [],
      is_overdue: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await adminClient
      .from('delegation_tasks')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Log creation activity
    await logTaskActivity({
      taskId: id,
      actorName: taskData.delegated_by_name || 'Delegator',
      actorEmail: taskData.delegated_by_email || '',
      activityType: 'CREATED',
      message: `Task delegated to ${taskData.assigned_to_name} with deadline ${new Date(payload.deadline).toLocaleString('en-IN')}`,
      metadata: { priority: payload.priority, deadline: payload.deadline }
    });

    return { success: true, data };
  } catch (err) {
    console.error('Error creating delegation task:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDelegatedTasks({
  userEmail = '',
  viewType = 'to_me', // 'to_me' | 'by_me' | 'all'
  status = 'ALL',
  priority = 'ALL',
  search = '',
  tenantId = DEFAULT_TENANT_ID
} = {}) {
  const adminClient = getAdminClient();
  const emailClean = (userEmail || '').trim().toLowerCase();

  try {
    let query = adminClient
      .from('delegation_tasks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('deadline', { ascending: true });

    if (viewType === 'to_me' && emailClean) {
      query = query.eq('assigned_to_email', emailClean);
    } else if (viewType === 'by_me' && emailClean) {
      query = query.eq('delegated_by_email', emailClean);
    }

    if (status && status !== 'ALL') {
      query = query.eq('status', status.toUpperCase());
    }

    if (priority && priority !== 'ALL') {
      query = query.eq('priority', priority.toUpperCase());
    }

    const { data, error } = await query;
    if (error) throw error;

    let tasks = data || [];

    // Calculate overdue status dynamically
    const now = new Date();
    tasks = tasks.map(t => {
      const isPastDeadline = new Date(t.deadline) < now;
      const isClosed = ['COMPLETED', 'CANCELLED'].includes(t.status);
      const isOverdue = !isClosed && isPastDeadline;
      return {
        ...t,
        is_overdue: isOverdue
      };
    });

    // Client-side text search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      tasks = tasks.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.task_code && t.task_code.toLowerCase().includes(q)) ||
        (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(q)) ||
        (t.delegated_by_name && t.delegated_by_name.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q))
      );
    }

    return { success: true, data: tasks };
  } catch (err) {
    console.warn('Error fetching delegation tasks from Supabase:', err.message);
    return { success: true, data: [] };
  }
}

export async function updateTaskStatus({
  taskId,
  status,
  completionNotes = '',
  completionProof = '',
  subtasks = null,
  user = {},
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const updatePayload = {
      status: status.toUpperCase(),
      updated_at: new Date().toISOString()
    };

    if (subtasks) {
      updatePayload.subtasks = subtasks;
    }

    if (status.toUpperCase() === 'SUBMITTED') {
      updatePayload.completion_notes = completionNotes;
      updatePayload.completion_proof = completionProof;
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data, error } = await adminClient
      .from('delegation_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    await logTaskActivity({
      taskId,
      actorName: user.name || 'User',
      actorEmail: user.email || '',
      activityType: status === 'SUBMITTED' ? 'SUBMISSION' : 'STATUS_CHANGE',
      message: status === 'SUBMITTED' 
        ? `Task submitted for review with note: "${completionNotes || 'Completed'}"`
        : `Status changed to ${status}`,
      metadata: { status, completionProof }
    });

    return { success: true, data };
  } catch (err) {
    console.error('Error updating task status:', err.message);
    return { success: false, error: err.message };
  }
}

export async function verifyAndCompleteTask({
  taskId,
  rating = 5,
  feedbackRemarks = '',
  user = {},
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const updatePayload = {
      status: 'COMPLETED',
      rating: parseInt(rating, 10) || 5,
      feedback_remarks: feedbackRemarks,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await adminClient
      .from('delegation_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    await logTaskActivity({
      taskId,
      actorName: user.name || 'Delegator',
      actorEmail: user.email || '',
      activityType: 'VERIFIED',
      message: `Task approved and closed with ${rating}★ rating. Feedback: "${feedbackRemarks || 'Excellent work'}"`,
      metadata: { rating, feedbackRemarks }
    });

    return { success: true, data };
  } catch (err) {
    console.error('Error verifying task:', err.message);
    return { success: false, error: err.message };
  }
}

export async function reopenTask({
  taskId,
  remarks = '',
  newDeadline = null,
  user = {},
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const updatePayload = {
      status: 'REOPENED',
      feedback_remarks: remarks,
      updated_at: new Date().toISOString()
    };

    if (newDeadline) {
      updatePayload.deadline = newDeadline;
    }

    const { data, error } = await adminClient
      .from('delegation_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    await logTaskActivity({
      taskId,
      actorName: user.name || 'Delegator',
      actorEmail: user.email || '',
      activityType: 'REOPENED',
      message: `Task reopened by delegator. Reason: "${remarks}". ${newDeadline ? `New Deadline: ${new Date(newDeadline).toLocaleString('en-IN')}` : ''}`,
      metadata: { remarks, newDeadline }
    });

    return { success: true, data };
  } catch (err) {
    console.error('Error reopening task:', err.message);
    return { success: false, error: err.message };
  }
}

export async function addTaskComment({
  taskId,
  comment,
  user = {},
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const result = await logTaskActivity({
      taskId,
      actorName: user.name || 'User',
      actorEmail: user.email || '',
      activityType: 'COMMENT',
      message: comment,
      tenantId
    });

    return { success: true, data: result };
  } catch (err) {
    console.error('Error adding task comment:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getTaskActivities(taskId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const { data, error } = await adminClient
      .from('delegation_task_activities')
      .select('*')
      .eq('task_id', taskId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.warn('Error fetching task activities:', err.message);
    return { success: true, data: [] };
  }
}

async function logTaskActivity({
  taskId,
  actorName = 'User',
  actorEmail = '',
  activityType = 'COMMENT',
  message = '',
  metadata = {},
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      task_id: taskId,
      actor_name: actorName,
      actor_email: (actorEmail || '').trim().toLowerCase(),
      activity_type: activityType,
      message,
      metadata,
      created_at: new Date().toISOString()
    };

    const { data, error } = await adminClient
      .from('delegation_task_activities')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Failed to log delegation task activity:', err.message);
    return null;
  }
}

export async function getDelegationAnalytics(userEmail = '', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const emailClean = (userEmail || '').trim().toLowerCase();

  try {
    const { data: allTasks, error } = await adminClient
      .from('delegation_tasks')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;
    const tasks = allTasks || [];

    const myAssigned = emailClean ? tasks.filter(t => (t.assigned_to_email || '').toLowerCase() === emailClean) : tasks;
    const myDelegated = emailClean ? tasks.filter(t => (t.delegated_by_email || '').toLowerCase() === emailClean) : tasks;

    const now = new Date();

    const stats = {
      assignedTotal: myAssigned.length,
      assignedPending: myAssigned.filter(t => t.status === 'PENDING').length,
      assignedInProgress: myAssigned.filter(t => t.status === 'IN_PROGRESS').length,
      assignedSubmitted: myAssigned.filter(t => t.status === 'SUBMITTED').length,
      assignedCompleted: myAssigned.filter(t => t.status === 'COMPLETED').length,
      assignedOverdue: myAssigned.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now).length,

      delegatedTotal: myDelegated.length,
      delegatedPendingReview: myDelegated.filter(t => t.status === 'SUBMITTED').length,
      delegatedCompleted: myDelegated.filter(t => t.status === 'COMPLETED').length,
      delegatedOverdue: myDelegated.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now).length,
    };

    return { success: true, stats };
  } catch (err) {
    console.warn('Error calculating delegation analytics:', err.message);
    return {
      success: true,
      stats: {
        assignedTotal: 0, assignedPending: 0, assignedInProgress: 0, assignedSubmitted: 0, assignedCompleted: 0, assignedOverdue: 0,
        delegatedTotal: 0, delegatedPendingReview: 0, delegatedCompleted: 0, delegatedOverdue: 0
      }
    };
  }
}
