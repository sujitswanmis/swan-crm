'use server';

import { createClient } from '@/utils/supabase/server';

export async function getDashboardMetrics(leadIds, dateFilter = 'Today') {
  if (!leadIds || leadIds.length === 0) {
    return { success: true, data: { employeeActivity: [], whatsappStats: { period: 0, total: 0 } } };
  }

  try {
    const supabase = await createClient();
    
    let startDate = null;
    const now = new Date();
    if (dateFilter === 'Today') {
      startDate = new Date(now.setHours(0,0,0,0)).toISOString();
    } else if (dateFilter === 'Last 7 Days') {
      startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
    } else if (dateFilter === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } // 'All Time' leaves startDate as null

    // We no longer query lead_notes here because it's too large for a single GET request
    // and the client already has lead_notes embedded in the `leads` object.

    // Fetch WhatsApp stats using Chunking to prevent 414 URI Too Long
    let totalWaCount = 0;
    let periodWaCount = 0;
    const chunkSize = 200; // Small chunk to be super safe with URL length

    for (let i = 0; i < leadIds.length; i += chunkSize) {
      const chunk = leadIds.slice(i, i + chunkSize);

      // Total
      const { count: tCount, error: err1 } = await supabase
        .from('whatsapp_message_logs')
        .select('*', { count: 'exact', head: true })
        .in('lead_id', chunk)
        .not('status', 'ilike', 'failed%');
      
      if (!err1) totalWaCount += (tCount || 0);

      // Period
      if (startDate) {
        const { count: pCount, error: err2 } = await supabase
          .from('whatsapp_message_logs')
          .select('*', { count: 'exact', head: true })
          .in('lead_id', chunk)
          .gte('created_at', startDate)
          .not('status', 'ilike', 'failed%');
        if (!err2) periodWaCount += (pCount || 0);
      } else {
        periodWaCount += (tCount || 0);
      }
    }

    return { 
      success: true, 
      data: { 
        employeeActivity: [], // Handled on client now
        whatsappStats: { period: periodWaCount, total: totalWaCount } 
      } 
    };

  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { success: false, error: error.message };
  }
}

export async function getUserAssignedWorkSummary({
  userEmail = '',
  targetEmail = '',
  isAllSelected = false,
  targetDate = new Date()
} = {}) {
  try {
    const { getDelegatedTasks, getDelegationAnalytics } = await import('@/app/actions/delegationTask');
    const { getEmployeeChecklistDashboard } = await import('@/app/actions/checklist');

    const effectiveEmail = (targetEmail || userEmail || '').trim().toLowerCase();

    // 1. Fetch Delegation Tasks
    let delegationRes = { success: true, data: [] };
    try {
      delegationRes = await getDelegatedTasks({
        userEmail: effectiveEmail,
        viewType: isAllSelected && !targetEmail ? 'all' : 'to_me'
      });
    } catch (e) {
      console.warn('Error fetching delegated tasks for analytics:', e.message);
    }

    const tasks = delegationRes.data || [];
    const now = new Date();

    const delegation = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'PENDING').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      submitted: tasks.filter(t => t.status === 'SUBMITTED').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      overdue: tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status) && (t.is_overdue || (t.deadline && new Date(t.deadline) < now))).length,
      recentTasks: tasks.slice(0, 15).map(t => ({
        id: t.id,
        task_code: t.task_code,
        title: t.title,
        priority: t.priority || 'MEDIUM',
        category: t.category || 'GENERAL',
        deadline: t.deadline,
        status: t.status,
        is_overdue: !['COMPLETED', 'CANCELLED'].includes(t.status) && (t.is_overdue || (t.deadline && new Date(t.deadline) < now)),
        delegated_by_name: t.delegated_by_name || 'Delegator',
        delegated_by_email: t.delegated_by_email,
        assigned_to_name: t.assigned_to_name,
        assigned_to_email: t.assigned_to_email
      }))
    };

    // 2. Fetch Checklists Dashboard for today
    let checklistRes = { success: true, data: [] };
    if (effectiveEmail) {
      try {
        checklistRes = await getEmployeeChecklistDashboard({
          employeeEmail: effectiveEmail,
          targetDate: targetDate || new Date()
        });
      } catch (e) {
        console.warn('Error fetching employee checklists for analytics:', e.message);
      }
    }

    const checkItems = checklistRes.data || [];
    const completedChecklists = checkItems.filter(c => c.status === 'COMPLETED').length;
    const completedLate = checkItems.filter(c => c.status === 'COMPLETED' && c.delayInfo?.isDelayed).length;
    const pendingChecklists = checkItems.filter(c => c.status !== 'COMPLETED').length;
    const totalSlots = checkItems.length;
    const complianceRate = totalSlots > 0 ? Math.round((completedChecklists / totalSlots) * 100) : 0;

    const checklists = {
      totalSlots,
      completed: completedChecklists,
      completedLate,
      pending: pendingChecklists,
      complianceRate,
      isSunday: checklistRes.isSunday || false,
      holidayInfo: checklistRes.holidayInfo || null,
      items: checkItems.slice(0, 15).map(c => ({
        id: c.id,
        slot_id: c.slot_id,
        title: c.title,
        frequency: c.frequency || 'DAILY',
        due_time: c.due_time || '18:00',
        status: c.status,
        isDelayed: c.delayInfo?.isDelayed || false,
        department: c.department || 'General'
      }))
    };

    return {
      success: true,
      data: {
        delegation,
        checklists,
        effectiveEmail
      }
    };
  } catch (error) {
    console.error('Error fetching user assigned work summary:', error);
    return {
      success: false,
      error: error.message,
      data: {
        delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] },
        checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, items: [] },
        effectiveEmail: ''
      }
    };
  }
}
