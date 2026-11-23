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
 * 3. Today's recruiter interviews & joining due candidates
 * 4. Active complaints tickets (SLA breached / assigned)
 * 5. Recent active broadcast notices
 */
export async function getUserPendingAlerts({
  userEmail = '',
  tenantId = DEFAULT_TENANT_ID,
  userRole = '',
  userDepartment = ''
} = {}) {
  const emailClean = (userEmail || '').trim().toLowerCase();
  if (!emailClean) {
    return {
      success: true,
      delegationTasks: [],
      checklistSlots: [],
      recruiterAlerts: [],
      complaintAlerts: [],
      broadcastAlerts: [],
      checkedAt: new Date().toISOString()
    };
  }

  const adminClient = getAdminClient();
  let delegationTasks = [];
  let checklistSlots = [];
  let recruiterAlerts = [];
  let complaintAlerts = [];
  let broadcastAlerts = [];

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
        .filter(item => {
          if (item.status === 'COMPLETED' || item.submission?.status === 'COMPLETED') return false;
          if (item.delayInfo?.isBeforeStart) return false;
          if (item.delayInfo?.isExpired) return false;
          if (item.delayInfo?.canExecute === false) return false;
          return true;
        })
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
          isExpired: item.delayInfo?.isExpired || false,
          isBeforeStart: item.delayInfo?.isBeforeStart || false,
          canExecute: item.delayInfo?.canExecute !== false,
          canSubmit: item.delayInfo?.canSubmit !== false
        }));
    }
  } catch (err) {
    console.warn('Error fetching user checklist alerts:', err.message);
  }

  // 3. Fetch recruiter alerts (Scheduled interviews & Joining due today in IST)
  try {
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const { data: candidates, error: candErr } = await adminClient
      .from('recruitment_candidates')
      .select('id, candidate_code, name, phone, email, current_stage, candidate_status, interviewer_name, joining_date, joining_details, position_id, recruitment_positions(title)')
      .limit(30);

    if (!candErr && Array.isArray(candidates)) {
      recruiterAlerts = candidates
        .filter(c => {
          let interviewDateStr = '';
          if (c.joining_details) {
            try {
              const jd = typeof c.joining_details === 'string' ? JSON.parse(c.joining_details) : c.joining_details;
              interviewDateStr = jd?.interview_date ? String(jd.interview_date).substring(0, 10) : '';
            } catch {}
          }
          const joiningDateStr = c.joining_date ? String(c.joining_date).substring(0, 10) : '';
          const isInterviewToday = Boolean(interviewDateStr && interviewDateStr === todayIST);
          const isJoiningTodayOrDue = Boolean(joiningDateStr && joiningDateStr <= todayIST && c.current_stage !== 'S09');
          return isInterviewToday || isJoiningTodayOrDue;
        })
        .map(c => {
          let interviewDateStr = '';
          if (c.joining_details) {
            try {
              const jd = typeof c.joining_details === 'string' ? JSON.parse(c.joining_details) : c.joining_details;
              interviewDateStr = jd?.interview_date ? String(jd.interview_date).substring(0, 10) : '';
            } catch {}
          }
          const joiningDateStr = c.joining_date ? String(c.joining_date).substring(0, 10) : '';
          const isJoining = Boolean(joiningDateStr && joiningDateStr <= todayIST && c.current_stage !== 'S09');
          return {
            id: c.id,
            candidate_code: c.candidate_code || 'CAND',
            name: c.name || 'Candidate',
            phone: c.phone || '',
            position_title: c.recruitment_positions?.title || 'Open Position',
            type: isJoining ? 'joining' : 'interview',
            title: isJoining ? `🎉 Joining Due: ${c.name}` : `👥 Interview Due: ${c.name}`,
            subtitle: `${c.recruitment_positions?.title || 'Candidate'} (${c.candidate_status || c.current_stage || 'Stage'})`,
            scheduled_date: isJoining ? c.joining_date : (interviewDateStr || c.joining_date),
            interviewer_name: c.interviewer_name || 'Assigned Interviewer',
            current_stage: c.current_stage
          };
        });
    }
  } catch (err) {
    console.warn('Error fetching recruiter alerts:', err.message);
  }

  // 4. Fetch complaint alerts (SLA breached / open assigned tickets)
  try {
    const now = Date.now();
    const { data: tickets, error: ticketErr } = await adminClient
      .from('party_complaints')
      .select('id, ticket_number, category, ticket_status, stage_id, sla_deadline, sla_breached, assigned_department, assigned_employee_name, party:party_master(firm_name, primary_mobile)')
      .neq('ticket_status', 'RESOLVED_CLOSED')
      .neq('ticket_status', 'REJECTED')
      .neq('stage_id', 'C06')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!ticketErr && Array.isArray(tickets)) {
      complaintAlerts = tickets
        .filter(t => {
          const deadlineMs = t.sla_deadline ? new Date(t.sla_deadline).getTime() : null;
          const isBreached = Boolean(t.sla_breached || (deadlineMs && deadlineMs < now));
          return isBreached || t.stage_id === 'C01' || t.stage_id === 'C02';
        })
        .map(t => {
          const deadlineMs = t.sla_deadline ? new Date(t.sla_deadline).getTime() : null;
          const isBreached = Boolean(t.sla_breached || (deadlineMs && deadlineMs < now));
          return {
            id: t.id,
            ticket_number: t.ticket_number || 'TICKET',
            category: t.category || 'General',
            party_name: t.party?.firm_name || 'Customer',
            party_mobile: t.party?.primary_mobile || '',
            stage_id: t.stage_id || 'C01',
            is_breached: isBreached,
            sla_deadline: t.sla_deadline,
            title: isBreached ? `🚨 SLA Breached: #${t.ticket_number}` : `🛠️ Action Required: #${t.ticket_number}`,
            subtitle: `${t.party?.firm_name || 'Party'} - ${t.category || 'Complaint'}`
          };
        });
    }
  } catch (err) {
    console.warn('Error fetching complaint alerts:', err.message);
  }

  // 5. Fetch recent active broadcast notices
  try {
    const { data: broadcasts, error: broadErr } = await adminClient
      .from('crm_broadcasts')
      .select('id, title, message, notification_type, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!broadErr && Array.isArray(broadcasts)) {
      broadcastAlerts = broadcasts.map(b => ({
        id: b.id,
        title: b.title,
        message: b.message,
        priority: 'medium',
        type: b.notification_type || 'broadcast',
        created_at: b.created_at
      }));
    }
  } catch (err) {
    console.warn('Error fetching broadcast notices:', err.message);
  }

  return {
    success: true,
    delegationTasks,
    checklistSlots,
    recruiterAlerts,
    complaintAlerts,
    broadcastAlerts,
    checkedAt: new Date().toISOString()
  };
}
