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

    // Optimization: If querying across practically all leads (>3000), execute single direct queries instead of 60+ chunked loops
    if (leadIds.length > 3000) {
      try {
        const { count: tCount, error: err1 } = await supabase
          .from('whatsapp_message_logs')
          .select('*', { count: 'exact', head: true })
          .not('status', 'ilike', 'failed%');
        if (!err1) totalWaCount = tCount || 0;

        if (startDate) {
          let { count: pCount, error: err2 } = await supabase
            .from('whatsapp_message_logs')
            .select('*', { count: 'exact', head: true })
            .gte('sent_at', startDate)
            .not('status', 'ilike', 'failed%');

          if (err2 && err2.code === '42703') {
            const res = await supabase
              .from('whatsapp_message_logs')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', startDate)
              .not('status', 'ilike', 'failed%');
            periodWaCount = res.count || 0;
          } else if (!err2) {
            periodWaCount = pCount || 0;
          }
        } else {
          periodWaCount = totalWaCount;
        }
      } catch (err) {
        console.warn('Global WhatsApp stats query warning:', err);
      }
    } else {
      for (let i = 0; i < leadIds.length; i += chunkSize) {
        const chunk = leadIds.slice(i, i + chunkSize);

        // Total
        const { count: tCount, error: err1 } = await supabase
          .from('whatsapp_message_logs')
          .select('*', { count: 'exact', head: true })
          .in('lead_id', chunk)
          .not('status', 'ilike', 'failed%');
        
        if (!err1) totalWaCount += (tCount || 0);

        // Period (using sent_at with created_at fallback)
        if (startDate) {
          let { count: pCount, error: err2 } = await supabase
            .from('whatsapp_message_logs')
            .select('*', { count: 'exact', head: true })
            .in('lead_id', chunk)
            .gte('sent_at', startDate)
            .not('status', 'ilike', 'failed%');

          if (err2 && err2.code === '42703') {
            const res = await supabase
              .from('whatsapp_message_logs')
              .select('*', { count: 'exact', head: true })
              .in('lead_id', chunk)
              .gte('created_at', startDate)
              .not('status', 'ilike', 'failed%');
            if (!res.error) periodWaCount += (res.count || 0);
          } else if (!err2) {
            periodWaCount += (pCount || 0);
          }
        } else {
          periodWaCount += (tCount || 0);
        }
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
      priorityBreakdown: {
        high: tasks.filter(t => t.priority === 'HIGH' || t.priority === 'URGENT').length,
        medium: tasks.filter(t => t.priority === 'MEDIUM' || !t.priority).length,
        low: tasks.filter(t => t.priority === 'LOW').length
      },
      recentTasks: tasks.slice(0, 60).map(t => ({
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
    try {
      checklistRes = await getEmployeeChecklistDashboard({
        employeeEmail: isAllSelected && !targetEmail ? '' : effectiveEmail,
        targetDate: targetDate || new Date()
      });
    } catch (e) {
      console.warn('Error fetching employee checklists for analytics:', e.message);
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
      items: checkItems.map(c => ({
        id: c.template?.id || c.id || Math.random().toString(),
        slot_id: c.template?.slot_id || c.slotInfo?.slot_id || (c.slotIndex ? `Slot ${c.slotIndex}` : 'Daily Slot'),
        title: c.template?.title || c.template?.base_title || 'Daily Checklist',
        base_title: c.template?.base_title || c.template?.title || 'Daily Checklist',
        frequency: c.template?.frequency || 'DAILY',
        due_time: c.template?.due_time || c.slotInfo?.due_time || '18:00',
        status: c.status || 'PENDING',
        isDelayed: c.delayInfo?.isDelayed || false,
        department: c.template?.department || 'General',
        assigned_type: c.template?.assigned_type || 'ALL',
        assigned_employee_email: c.template?.assigned_employee_email || '',
        submitted_at: c.submission?.submitted_at || null,
        submitted_by: c.submission?.submitted_by_name || c.submission?.employee_email || null
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
        delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, priorityBreakdown: { high: 0, medium: 0, low: 0 }, recentTasks: [] },
        checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, items: [] },
        effectiveEmail: ''
      }
    };
  }
}

/**
 * Fetch Attendance + Checklist Compliance + Recruitment summaries for Dashboard
 */
export async function getDashboardSummaries({ targetDate = null } = {}) {
  try {
    const { getTeamAttendanceMaster } = await import('@/app/actions/attendance');
    const { getEmployeeChecklistDashboard } = await import('@/app/actions/checklist');
    const { createClient: createAdminClient } = await import('@/utils/supabase/server');

    // IST today date
    const istNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const todayIST = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`;
    const useDate = targetDate || todayIST;

    // 1. Attendance summary (today)
    let attendanceSummary = { totalEmployees: 0, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalHalfDay: 0, totalRegularized: 0, presentPercent: 0, records: [] };
    try {
      const attRes = await getTeamAttendanceMaster({ date: useDate });
      if (attRes?.success && attRes.summary) {
        const s = attRes.summary;
        attendanceSummary = {
          ...s,
          records: Array.isArray(attRes.records) ? attRes.records : [],
          presentPercent: s.totalEmployees > 0 ? Math.round(((s.totalPresent + s.totalHalfDay) / s.totalEmployees) * 100) : 0
        };
      }
    } catch (e) {
      console.warn('Attendance summary error:', e.message);
    }

    // 2. Real Checklist compliance for useDate
    let checklistSummary = { totalSlots: 0, completed: 0, pending: 0, complianceRate: 0, submissionsByEmail: {}, items: [] };
    try {
      const [tmplsRes, subsRes] = await Promise.all([
        supabase.from('checklist_templates').select('id, title, department, frequency, assigned_type, assigned_employee_email, due_time, description').eq('is_active', true),
        supabase.from('checklist_submissions').select('id, template_id, period_key, status, employee_email, submitted_at').like('period_key', `${useDate}%`)
      ]);

      const tmpls = tmplsRes.data || [];
      const subs = subsRes.data || [];

      const submissionsByEmail = {};
      subs.forEach(s => {
        const em = (s.employee_email || '').toLowerCase().trim();
        if (em) submissionsByEmail[em] = (submissionsByEmail[em] || 0) + 1;
      });

      // Expand slot definitions
      const templateSlots = [];
      tmpls.forEach(t => {
        let dailySlots = [];
        if (t.description) {
          const m = t.description.match(/<!--__SWAN_SCHEDULE_META__(.*?)__END_META__-->/s);
          if (m && m[1]) {
            try {
              const meta = JSON.parse(m[1]);
              if (Array.isArray(meta.daily_slots) && meta.daily_slots.length > 0) dailySlots = meta.daily_slots;
            } catch {}
          }
        }
        if (dailySlots.length === 0) {
          dailySlots = [{ slot_id: 'S1', label: 'Daily Cutoff', due_time: t.due_time || '18:00' }];
        }

        dailySlots.forEach((s, idx) => {
          const slotLabel = s.label || `Slot ${idx + 1}`;
          const dueTime = s.due_time || t.due_time || '18:00';
          templateSlots.push({
            id: `${t.id}_${s.slot_id || idx}`,
            template_id: t.id,
            slot_id: `${slotLabel} (${dueTime})`,
            title: t.title,
            base_title: t.title,
            frequency: t.frequency || 'DAILY',
            department: t.department || 'General',
            assigned_type: t.assigned_type || 'ALL',
            assigned_employee_email: t.assigned_employee_email || '',
            due_time: dueTime,
            status: subs.some(sub => sub.template_id === t.id) ? 'COMPLETED' : 'PENDING'
          });
        });
      });

      const totalCompletedSubs = subs.filter(s => s.status === 'COMPLETED').length;
      const totalSlots = templateSlots.length;
      const expectedTotalSubs = totalSlots * 6; // approximate daily expectation across team
      const complianceRate = totalSlots > 0 ? Math.min(100, Math.round((totalCompletedSubs / (expectedTotalSubs || 1)) * 100)) : 0;

      checklistSummary = {
        totalSlots,
        completed: totalCompletedSubs,
        pending: Math.max(0, expectedTotalSubs - totalCompletedSubs),
        complianceRate,
        submissionsByEmail,
        items: templateSlots
      };
    } catch (e) {
      console.warn('Checklist summary error:', e.message);
    }

    // 3. Recruitment summary — open positions, total applications, recent
    let recruitmentSummary = { openPositions: 0, totalApplications: 0, newToday: 0, shortlisted: 0, rejected: 0 };
    try {
      const supabase = await createAdminClient();
      const [posRes, appRes, todayAppRes] = await Promise.all([
        supabase.from('job_positions').select('id', { count: 'exact', head: true }).eq('status', 'OPEN'),
        supabase.from('job_applications').select('id, status', { count: 'exact' }),
        supabase.from('job_applications').select('id', { count: 'exact', head: true }).gte('created_at', `${useDate}T00:00:00+05:30`)
      ]);
      const apps = appRes.data || [];
      recruitmentSummary = {
        openPositions: posRes.count || 0,
        totalApplications: apps.length,
        newToday: todayAppRes.count || 0,
        shortlisted: apps.filter(a => a.status === 'SHORTLISTED' || a.status === 'INTERVIEW').length,
        rejected: apps.filter(a => a.status === 'REJECTED').length
      };
    } catch (e) {
      console.warn('Recruitment summary error:', e.message);
    }

    return {
      success: true,
      data: { attendanceSummary, checklistSummary, recruitmentSummary, date: useDate }
    };
  } catch (error) {
    console.error('getDashboardSummaries error:', error);
    return { success: false, error: error.message, data: { attendanceSummary: { records: [] }, checklistSummary: { items: [] }, recruitmentSummary: {} } };
  }
}

