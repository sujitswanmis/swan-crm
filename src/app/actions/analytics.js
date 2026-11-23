'use server';

import { createClient } from '@/utils/supabase/server';

export async function getDashboardMetrics(input, dateFilter = 'Today') {
  let leadIds = [];
  let filter = dateFilter;
  let isGlobal = false;

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    leadIds = Array.isArray(input.leadIds) ? input.leadIds : [];
    filter = input.dateFilter || dateFilter;
    isGlobal = !!input.isGlobal;
  } else if (Array.isArray(input)) {
    leadIds = input;
    filter = dateFilter;
  }

  if (!isGlobal && (!leadIds || leadIds.length === 0)) {
    return { success: true, data: { employeeActivity: [], whatsappStats: { period: 0, total: 0 } } };
  }

  try {
    const supabase = await createClient();
    
    let startDate = null;
    const now = new Date();
    if (filter === 'Today') {
      startDate = new Date(now.setHours(0,0,0,0)).toISOString();
    } else if (filter === 'Last 7 Days') {
      startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
    } else if (filter === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } // 'All Time' leaves startDate as null

    // We no longer query lead_notes here because it's too large for a single GET request
    // and the client already has lead_notes embedded in the `leads` object.

    // Fetch WhatsApp stats using Chunking to prevent 414 URI Too Long
    let totalWaCount = 0;
    let periodWaCount = 0;
    const chunkSize = 200; // Small chunk to be super safe with URL length

    // Optimization: If isGlobal is set or querying across practically all leads (>1000), execute single direct queries instead of 60+ chunked loops
    if (isGlobal || leadIds.length > 1000) {
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
  targetDate = new Date(),
  tenantId = null,
  userCompany = null,
  adminCompanyFilter = null
} = {}) {
  try {
    const { getDelegatedTasks, getDelegationAnalytics } = await import('@/app/actions/delegationTask');
    const { getEmployeeChecklistDashboard } = await import('@/app/actions/checklist');

    const effectiveEmail = (targetEmail || userEmail || '').trim().toLowerCase();

    // Determine target tenant
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
      const compLower = String(userCompany || '').toLowerCase().trim();
      if (compLower.includes('supuja')) {
        effectiveTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
      } else if (compLower.includes('testing')) {
        effectiveTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
      } else {
        effectiveTenantId = '00000000-0000-0000-0000-000000000001';
      }
    }

    // If specific company / branch filter selected in navbar
    if (adminCompanyFilter && adminCompanyFilter !== 'All') {
      const filtLower = String(adminCompanyFilter).toLowerCase().trim();
      if (filtLower.includes('supuja') || filtLower === 'tnt00001') {
        effectiveTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
      } else if (filtLower.includes('testing') || filtLower === 'tnt00003') {
        effectiveTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
      } else if (filtLower.includes('nsmlr') || filtLower.includes('swan') || filtLower.includes('nstl') || filtLower === 'tnt00002') {
        effectiveTenantId = '00000000-0000-0000-0000-000000000001';
      }
    }

    // 1. Fetch Delegation Tasks
    let delegationRes = { success: true, data: [] };
    try {
      delegationRes = await getDelegatedTasks({
        userEmail: effectiveEmail,
        viewType: isAllSelected && !targetEmail ? 'all' : 'to_me',
        tenantId: effectiveTenantId
      });
    } catch (e) {
      console.warn('Error fetching delegated tasks for analytics:', e.message);
    }

    const tasks = delegationRes.data || [];
    const now = new Date();

    const delegation = {
      total: tasks.length,
      active: tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status)).length,
      pending: tasks.filter(t => t.status === 'PENDING').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      submitted: tasks.filter(t => t.status === 'SUBMITTED').length,
      reopened: tasks.filter(t => t.status === 'REOPENED').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      cancelled: tasks.filter(t => t.status === 'CANCELLED').length,
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
        tenant_code: t.tenant_code || (t.tenant_id === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' ? 'TNT00001' : 'TNT00002'),
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
        targetDate: targetDate || new Date(),
        tenantId: effectiveTenantId
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
export async function getDashboardSummaries({ targetDate = null, startDate = null, endDate = null, tenantId = null, userCompany = null, branchCode = null, adminCompanyFilter = null } = {}) {
  try {
    const { getTeamAttendanceMaster } = await import('@/app/actions/attendance');
    const { getEmployeeChecklistDashboard } = await import('@/app/actions/checklist');
    const { createClient: createAdminClient } = await import('@/utils/supabase/server');

    const parsePositionWorkspace = (pos) => {
      const text = pos.jd_text || '';
      const match = text.match(/<!--WORKSPACE:(\{.*?\})-->/);
      let meta = {};
      if (match) {
        try { meta = JSON.parse(match[1]); } catch (_) {}
      }
      const tenant_id = pos.tenant_id || meta.tenant_id || '00000000-0000-0000-0000-000000000001';
      const tenant_code = pos.tenant_code || meta.tenant_code || (tenant_id === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' ? 'TNT00001' : (tenant_id === '922d3e72-6588-457f-a562-4f1bdbf10d98' ? 'TNT00003' : 'TNT00002'));
      const company = pos.company || meta.company || (tenant_code === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
      const branch_code = pos.branch_code || meta.branch_code || (company === 'NSMLR' ? 'TNT00002-B0002' : `${tenant_code}-B0001`);
      const cleanJd = match ? text.replace(match[0], '').trim() : text;
      return { tenant_id, tenant_code, branch_code, company, cleanJd };
    };

    // IST today date
    const istNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const todayIST = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`;
    const useDate = targetDate || todayIST;

    // 1. Attendance summary (today or period)
    let attendanceSummary = { totalEmployees: 0, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalHalfDay: 0, totalRegularized: 0, presentPercent: 0, records: [] };
    try {
      const attRes = await getTeamAttendanceMaster({ 
        date: useDate,
        startDate: startDate || useDate,
        endDate: endDate || useDate
      });
      if (attRes?.success && attRes.summary) {
        const s = attRes.summary;
        attendanceSummary = {
          ...s,
          records: Array.isArray(attRes.records) ? attRes.records : [],
          presentPercent: s.totalEmployees > 0 ? Math.round(((s.totalPresent + s.totalHalfDay + (s.totalRegularized || 0)) / s.totalEmployees) * 100) : 0
        };
      }
    } catch (e) {
      console.warn('Attendance summary error:', e.message);
    }

    const supabase = await createAdminClient();

    // 2. Real Checklist compliance for useDate
    let checklistSummary = { totalSlots: 0, completed: 0, pending: 0, complianceRate: 0, submissionsByEmail: {}, items: [] };
    try {
      let checklistTenantId = tenantId;
      if (!checklistTenantId) {
        const compLower = String(userCompany || '').toLowerCase().trim();
        if (compLower.includes('supuja')) {
          checklistTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
        } else if (compLower.includes('testing')) {
          checklistTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
        } else {
          checklistTenantId = '00000000-0000-0000-0000-000000000001';
        }
      }
      if (adminCompanyFilter && adminCompanyFilter !== 'All') {
        const filtLower = String(adminCompanyFilter).toLowerCase().trim();
        if (filtLower.includes('supuja') || filtLower === 'tnt00001') {
          checklistTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
        } else if (filtLower.includes('testing') || filtLower === 'tnt00003') {
          checklistTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
        } else if (filtLower.includes('nsmlr') || filtLower.includes('swan') || filtLower.includes('nstl') || filtLower === 'tnt00002') {
          checklistTenantId = '00000000-0000-0000-0000-000000000001';
        }
      }

      let tmplsQuery = supabase.from('checklist_templates').select('id, tenant_id, title, department, frequency, assigned_type, assigned_employee_email, due_time, description').eq('is_active', true);
      if (checklistTenantId) {
        tmplsQuery = tmplsQuery.eq('tenant_id', checklistTenantId);
      }

      // Calculate working days in period (excluding Sundays)
      let workingDays = 1;
      if (startDate && endDate && startDate !== endDate) {
        workingDays = 0;
        const cur = new Date(`${startDate}T12:00:00+05:30`);
        const end = new Date(`${endDate}T12:00:00+05:30`);
        while (cur <= end) {
          if (cur.getDay() !== 0) workingDays++; // Mon-Sat
          cur.setDate(cur.getDate() + 1);
        }
        workingDays = Math.max(1, workingDays);
      }

      let subsQuery = supabase.from('checklist_submissions')
        .select('id, template_id, period_key, status, employee_email, submitted_at');

      if (checklistTenantId) {
        subsQuery = subsQuery.eq('tenant_id', checklistTenantId);
      }

      if (startDate && endDate && startDate !== endDate) {
        subsQuery = subsQuery
          .gte('period_key', startDate)
          .lte('period_key', `${endDate}_zz`);
      } else {
        subsQuery = subsQuery.like('period_key', `${useDate}%`);
      }

      const [tmplsRes, subsRes] = await Promise.all([
        tmplsQuery,
        subsQuery
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
      
      // Calculate realistic total expected slots based on template assignment scopes
      let expectedTotalSubs = 0;
      templateSlots.forEach(slot => {
        if (slot.assigned_type === 'SPECIFIC' && slot.assigned_employee_email) {
          const count = slot.assigned_employee_email.split(',').filter(Boolean).length;
          expectedTotalSubs += Math.max(1, count);
        } else {
          // Templates assigned to ALL or department across approved employees
          expectedTotalSubs += Math.max(1, attendanceSummary.totalEmployees || 1);
        }
      });
      if (expectedTotalSubs === 0) expectedTotalSubs = totalSlots;
      expectedTotalSubs = expectedTotalSubs * workingDays;

      const complianceRate = expectedTotalSubs > 0 ? Math.min(100, Math.round((totalCompletedSubs / expectedTotalSubs) * 100)) : 0;

      checklistSummary = {
        totalSlots,
        expectedSlots: expectedTotalSubs,
        completed: totalCompletedSubs,
        pending: Math.max(0, expectedTotalSubs - totalCompletedSubs),
        complianceRate,
        workingDays,
        submissionsByEmail,
        items: templateSlots
      };
    } catch (e) {
      console.warn('Checklist summary error:', e.message);
    }

    // 3. Recruitment summary — positions, candidates pipeline, recent activity
    let recruitmentSummary = {
      openPositions: 0,
      totalPositions: 0,
      totalApplications: 0,
      totalCandidates: 0,
      newToday: 0,
      inInterview: 0,
      shortlisted: 0,
      hired: 0,
      rejected: 0,
      positions: [],
      candidates: []
    };
    try {
      const [posRes, canRes] = await Promise.all([
        supabase
          .from('recruitment_positions')
          .select('id, title, department, openings, status, recruiter_assigned, interviewer_name, salary_min, salary_max, deadline_date, created_at, jd_text')
          .order('created_at', { ascending: false }),
        supabase
          .from('recruitment_candidates')
          .select('id, name, email, phone, candidate_code, current_stage, candidate_status, position_id, resume_url, created_by, created_at, actual_joining_date, expected_salary_min, expected_salary_max, recruitment_positions(title, department, jd_text)')
          .order('created_at', { ascending: false })
      ]);

      const rawPositions = posRes.data || [];
      const rawCandidates = canRes.data || [];

      // Parse workspace metadata on positions
      const parsedPositions = rawPositions.map(pos => {
        const meta = parsePositionWorkspace(pos);
        return {
          ...pos,
          cleanJd: meta.cleanJd,
          workspace_tenant_id: meta.tenant_id,
          workspace_tenant_code: meta.tenant_code,
          workspace_company: meta.company,
          workspace_branch_code: meta.branch_code
        };
      });

      // Resolve user's active tenant and tenant code for strict multi-tenant isolation
      let targetTenantCode = 'TNT00002';
      let targetTenantId = tenantId;
      if (!targetTenantId) {
        const compLower = String(userCompany || '').toLowerCase().trim();
        if (compLower.includes('supuja')) {
          targetTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
          targetTenantCode = 'TNT00001';
        } else if (compLower.includes('testing')) {
          targetTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
          targetTenantCode = 'TNT00003';
        } else {
          targetTenantId = '00000000-0000-0000-0000-000000000001';
          targetTenantCode = 'TNT00002';
        }
      } else {
        targetTenantCode = targetTenantId === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' ? 'TNT00001' : (targetTenantId === '922d3e72-6588-457f-a562-4f1bdbf10d98' ? 'TNT00003' : 'TNT00002');
      }

      if (adminCompanyFilter && adminCompanyFilter !== 'All') {
        const filtLower = String(adminCompanyFilter).toLowerCase().trim();
        if (filtLower.includes('supuja') || filtLower === 'tnt00001') {
          targetTenantId = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
          targetTenantCode = 'TNT00001';
        } else if (filtLower.includes('testing') || filtLower === 'tnt00003') {
          targetTenantId = '922d3e72-6588-457f-a562-4f1bdbf10d98';
          targetTenantCode = 'TNT00003';
        } else if (filtLower.includes('nsmlr') || filtLower.includes('swan') || filtLower.includes('nstl') || filtLower === 'tnt00002') {
          targetTenantId = '00000000-0000-0000-0000-000000000001';
          targetTenantCode = 'TNT00002';
        }
      }

      // Filter positions based on active company / branch / tenant scope (Strict Tenant Isolation)
      const effectiveFilter = String(adminCompanyFilter || '').trim();
      const isAllCompanies = !effectiveFilter || effectiveFilter.toLowerCase() === 'all';

      const filteredPositions = parsedPositions.filter(p => {
        // Enforce strict workspace tenant boundary: prevent SuPuja (TNT00001) leaking into New Swan (TNT00002) or vice-versa
        const posTenantCode = p.workspace_tenant_code || (p.workspace_tenant_id === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' ? 'TNT00001' : 'TNT00002');
        if (posTenantCode !== targetTenantCode && p.workspace_tenant_id !== targetTenantId) {
          return false;
        }

        // If specific company or branch filter is selected in navbar
        if (!isAllCompanies) {
          const filtLower = effectiveFilter.toLowerCase();
          const matchCompany = String(p.workspace_company || '').toLowerCase() === filtLower;
          const matchBranch = String(p.workspace_branch_code || '').toLowerCase() === filtLower;
          const matchTenant = String(p.workspace_tenant_code || '').toLowerCase() === filtLower;
          return matchCompany || matchBranch || matchTenant;
        }

        return true;
      });

      const allowedPosIds = new Set(filteredPositions.map(p => p.id));
      const candidates = rawCandidates
        .filter(c => allowedPosIds.has(c.position_id))
        .map(c => {
          const parentPos = parsedPositions.find(p => p.id === c.position_id);
          return {
            ...c,
            workspace_tenant_id: parentPos?.workspace_tenant_id,
            workspace_tenant_code: parentPos?.workspace_tenant_code || targetTenantCode,
            workspace_company: parentPos?.workspace_company || (targetTenantCode === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR'),
            workspace_branch_code: parentPos?.workspace_branch_code || (targetTenantCode === 'TNT00001' ? 'TNT00001-B0001' : 'TNT00002-B0002')
          };
        });

      const positions = filteredPositions;

      const openPositions = positions.filter(p => p.status !== 'CLOSED');
      const inInterview = candidates.filter(c => c.current_stage === 'S03' || (c.candidate_status || '').toLowerCase().includes('interview'));
      const shortlisted = candidates.filter(c => c.current_stage === 'S07' || (c.candidate_status || '').toLowerCase().includes('shortlist'));
      const hired = candidates.filter(c =>
        c.current_stage === 'S09' ||
        (c.candidate_status || '').toLowerCase().includes('joined') ||
        c.current_stage === 'S08' ||
        (c.candidate_status || '').toLowerCase().includes('loi')
      );
      const rejected = candidates.filter(c =>
        (c.candidate_status || '').toLowerCase().includes('reject') ||
        (c.candidate_status || '').toLowerCase().includes('dropped') ||
        (c.candidate_status || '').toLowerCase().includes('no show')
      );

      // Candidate creation within selected date range
      const isDateInRange = (dateStr) => {
        if (!dateStr) return false;
        const d = dateStr.slice(0, 10);
        if (startDate && endDate && startDate !== endDate) {
          return d >= startDate && d <= endDate;
        }
        return d === useDate;
      };
      const newInPeriod = candidates.filter(c => isDateInRange(c.created_at));

      recruitmentSummary = {
        openPositions: openPositions.length,
        totalPositions: positions.length,
        totalApplications: candidates.length,
        totalCandidates: candidates.length,
        newToday: newInPeriod.length,
        newInPeriod: newInPeriod.length,
        inInterview: inInterview.length,
        shortlisted: shortlisted.length,
        hired: hired.length,
        rejected: rejected.length,
        positions: positions.slice(0, 30),
        candidates: candidates.slice(0, 50)
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

