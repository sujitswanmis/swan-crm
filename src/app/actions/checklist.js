'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  getCurrentPeriodKey,
  calculateChecklistCompletion,
  calculateDelayStatus,
  getPeriodCutoffDateTime,
  isDateSunday,
  isDateHoliday,
  generateDefaultDailySlots,
  DEFAULT_HOLIDAYS_LIST
} from '@/utils/checklistUtils';
import crypto from 'crypto';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// ==========================================
// 1. TEMPLATE MASTER ACTIONS
// ==========================================

export async function getChecklistTemplates(filter = {}, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    let query = adminClient
      .from('checklist_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filter.frequency) {
      query = query.eq('frequency', filter.frequency.toUpperCase());
    }
    if (filter.department) {
      query = query.eq('department', filter.department);
    }
    if (filter.assigned_employee_email) {
      query = query.or(`assigned_employee_email.eq.${filter.assigned_employee_email},assigned_type.eq.ALL`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const normalized = (data || []).map(t => {
      let status = t.status;
      if (!status) {
        status = t.is_active ? 'ACTIVE' : 'INACTIVE';
      }

      const scheduleConfig = t.schedule_config || {};
      const repCount = t.daily_repetition_count || scheduleConfig.daily_repetition_count || 1;
      const dailySlots = t.daily_slots || scheduleConfig.daily_slots || generateDefaultDailySlots(repCount);
      const daysOfWeek = t.days_of_week || scheduleConfig.days_of_week || ['Monday'];
      const dayOfMonth = t.day_of_month || scheduleConfig.day_of_month || 1;
      const includeSundays = t.include_sundays !== undefined ? t.include_sundays : (scheduleConfig.include_sundays !== undefined ? scheduleConfig.include_sundays : true);
      const includeHolidays = t.include_holidays !== undefined ? t.include_holidays : (scheduleConfig.include_holidays !== undefined ? scheduleConfig.include_holidays : false);

      return {
        ...t,
        status: status.toUpperCase(),
        daily_repetition_count: repCount,
        daily_slots: dailySlots,
        days_of_week: daysOfWeek,
        day_of_month: dayOfMonth,
        include_sundays: includeSundays,
        include_holidays: includeHolidays,
        schedule_config: {
          daily_repetition_count: repCount,
          daily_slots: dailySlots,
          days_of_week: daysOfWeek,
          day_of_month: dayOfMonth,
          include_sundays: includeSundays,
          include_holidays: includeHolidays
        }
      };
    });

    return { success: true, data: normalized };
  } catch (err) {
    console.warn('Error fetching checklist templates from Supabase:', err.message);
    return { success: true, data: [] };
  }
}

export async function saveChecklistTemplate(templateData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const id = templateData.id || crypto.randomUUID();
    const resolvedStatus = (templateData.status || (templateData.is_active === false ? 'INACTIVE' : 'ACTIVE')).toUpperCase();
    const isActive = resolvedStatus === 'ACTIVE';

    const repCount = Math.max(1, parseInt(templateData.daily_repetition_count, 10) || 1);
    const dailySlots = Array.isArray(templateData.daily_slots) && templateData.daily_slots.length > 0
      ? templateData.daily_slots
      : generateDefaultDailySlots(repCount);

    const daysOfWeek = Array.isArray(templateData.days_of_week) && templateData.days_of_week.length > 0
      ? templateData.days_of_week
      : ['Monday'];

    const dayOfMonth = parseInt(templateData.day_of_month, 10) || 1;
    const includeSundays = templateData.include_sundays !== undefined ? Boolean(templateData.include_sundays) : true;
    const includeHolidays = templateData.include_holidays !== undefined ? Boolean(templateData.include_holidays) : false;

    const scheduleConfig = {
      daily_repetition_count: repCount,
      daily_slots: dailySlots,
      days_of_week: daysOfWeek,
      day_of_month: dayOfMonth,
      include_sundays: includeSundays,
      include_holidays: includeHolidays
    };

    const payload = {
      id,
      tenant_id: tenantId,
      title: (templateData.title || '').trim(),
      description: templateData.description || '',
      frequency: (templateData.frequency || 'DAILY').toUpperCase(),
      department: templateData.department || 'General',
      category: templateData.category || 'OPERATIONS',
      assigned_type: templateData.assigned_type || 'EMPLOYEE',
      assigned_employee_id: templateData.assigned_employee_id || null,
      assigned_employee_name: templateData.assigned_employee_name || 'All Staff',
      assigned_employee_email: (templateData.assigned_employee_email || '').trim().toLowerCase(),
      due_time: templateData.due_time || (dailySlots[0]?.due_time || '18:00'),
      days_of_week: daysOfWeek,
      day_of_month: dayOfMonth,
      items: Array.isArray(templateData.items) ? templateData.items : [],
      is_active: isActive,
      status: resolvedStatus,
      daily_repetition_count: repCount,
      daily_slots: dailySlots,
      include_sundays: includeSundays,
      include_holidays: includeHolidays,
      schedule_config: scheduleConfig,
      created_by: templateData.created_by || 'Admin',
      updated_at: new Date().toISOString()
    };

    let { data, error } = await adminClient
      .from('checklist_templates')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      // Graceful fallback if certain columns are not present in Supabase table
      const safePayload = {
        id,
        tenant_id: tenantId,
        title: (templateData.title || '').trim(),
        description: templateData.description || '',
        frequency: (templateData.frequency || 'DAILY').toUpperCase(),
        department: templateData.department || 'General',
        category: templateData.category || 'OPERATIONS',
        assigned_type: templateData.assigned_type || 'EMPLOYEE',
        assigned_employee_id: templateData.assigned_employee_id || null,
        assigned_employee_name: templateData.assigned_employee_name || 'All Staff',
        assigned_employee_email: (templateData.assigned_employee_email || '').trim().toLowerCase(),
        due_time: templateData.due_time || (dailySlots[0]?.due_time || '18:00'),
        days_of_week: daysOfWeek,
        day_of_month: dayOfMonth,
        items: Array.isArray(templateData.items) ? templateData.items : [],
        is_active: isActive,
        created_by: templateData.created_by || 'Admin',
        updated_at: new Date().toISOString()
      };

      const res = await adminClient
        .from('checklist_templates')
        .upsert(safePayload)
        .select()
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) throw error;
    return {
      success: true,
      data: {
        ...data,
        status: resolvedStatus,
        daily_repetition_count: repCount,
        daily_slots: dailySlots,
        days_of_week: daysOfWeek,
        day_of_month: dayOfMonth,
        include_sundays: includeSundays,
        include_holidays: includeHolidays,
        schedule_config: scheduleConfig
      }
    };
  } catch (err) {
    console.error('Error saving checklist template:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteChecklistTemplate(templateId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const { error } = await adminClient
      .from('checklist_templates')
      .delete()
      .eq('id', templateId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Error deleting checklist template:', err.message);
    return { success: false, error: err.message };
  }
}

export async function setChecklistTemplateStatus(templateId, newStatus, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const statusClean = ['ACTIVE', 'INACTIVE', 'DRAFT'].includes(String(newStatus).toUpperCase())
      ? String(newStatus).toUpperCase()
      : (newStatus ? 'ACTIVE' : 'INACTIVE');

    const isActive = statusClean === 'ACTIVE';

    let updatePayload = {
      is_active: isActive,
      status: statusClean,
      updated_at: new Date().toISOString()
    };

    let { error } = await adminClient
      .from('checklist_templates')
      .update(updatePayload)
      .eq('id', templateId)
      .eq('tenant_id', tenantId);

    if (error) {
      const { error: fallbackErr } = await adminClient
        .from('checklist_templates')
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .eq('tenant_id', tenantId);
      if (fallbackErr) throw fallbackErr;
    }

    return { success: true, status: statusClean, is_active: isActive };
  } catch (err) {
    console.error('Error setting template status:', err.message);
    return { success: false, error: err.message };
  }
}

// ==========================================
// 2. EMPLOYEE DASHBOARD & EXECUTION ACTIONS
// ==========================================

export async function getEmployeeChecklistDashboard({
  employeeEmail = '',
  frequency = 'DAILY',
  targetDate = new Date(),
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  const emailClean = (employeeEmail || '').trim().toLowerCase();
  const targetObj = new Date(targetDate);
  const isSunday = isDateSunday(targetObj);
  const holidayInfo = isDateHoliday(targetObj);
  const todayDayName = targetObj.toLocaleDateString('en-US', { weekday: 'long' });

  try {
    // 1. Fetch active templates applicable to this employee or ALL
    let templatesQuery = adminClient
      .from('checklist_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (frequency && frequency !== 'ALL') {
      templatesQuery = templatesQuery.eq('frequency', frequency.toUpperCase());
    }

    const { data: templates, error: tmplErr } = await templatesQuery;
    if (tmplErr) throw tmplErr;

    // Filter by assigned employee, Sunday rule, and Holiday rule
    const filteredTemplates = (templates || []).filter(tmpl => {
      // 1. Assignment check
      if (tmpl.assigned_type !== 'ALL' && emailClean) {
        const assignedEmails = (tmpl.assigned_employee_email || '')
          .toLowerCase()
          .split(',')
          .map(e => e.trim())
          .filter(Boolean);
        if (!assignedEmails.includes(emailClean)) return false;
      }

      const scheduleConfig = tmpl.schedule_config || {};
      const includeSundays = tmpl.include_sundays !== undefined ? tmpl.include_sundays : (scheduleConfig.include_sundays !== undefined ? scheduleConfig.include_sundays : true);
      const includeHolidays = tmpl.include_holidays !== undefined ? tmpl.include_holidays : (scheduleConfig.include_holidays !== undefined ? scheduleConfig.include_holidays : false);

      // 2. Sunday exclusion check
      if (isSunday && includeSundays === false) {
        return false;
      }

      // 3. Holiday exclusion check
      if (holidayInfo && includeHolidays === false) {
        return false;
      }

      return true;
    });

    if (filteredTemplates.length === 0) {
      return {
        success: true,
        data: [],
        periodKey: getCurrentPeriodKey(frequency, targetObj),
        isSunday,
        holidayInfo
      };
    }

    // 2. Fetch existing submissions for this employee
    const templateIds = filteredTemplates.map(t => t.id);
    let subQuery = adminClient
      .from('checklist_submissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('template_id', templateIds);

    if (emailClean) {
      subQuery = subQuery.eq('employee_email', emailClean);
    }

    const { data: submissions, error: subErr } = await subQuery;
    if (subErr) throw subErr;

    const submissionMap = new Map();
    (submissions || []).forEach(sub => {
      const key = `${sub.template_id}_${sub.period_key}`;
      submissionMap.set(key, sub);
    });

    // 3. Expand templates (e.g. Daily Multi-Slots) and merge with submission state
    const result = [];

    filteredTemplates.forEach(tmpl => {
      const items = Array.isArray(tmpl.items) ? tmpl.items : [];
      const scheduleConfig = tmpl.schedule_config || {};
      const freq = (tmpl.frequency || 'DAILY').toUpperCase();

      if (freq === 'DAILY') {
        const repCount = tmpl.daily_repetition_count || scheduleConfig.daily_repetition_count || 1;
        const dailySlots = (Array.isArray(tmpl.daily_slots) && tmpl.daily_slots.length > 0)
          ? tmpl.daily_slots
          : (Array.isArray(scheduleConfig.daily_slots) && scheduleConfig.daily_slots.length > 0
            ? scheduleConfig.daily_slots
            : generateDefaultDailySlots(repCount));

        if (repCount > 1 || dailySlots.length > 1) {
          // Multiple Daily Repetitions (e.g. 8 slots)
          dailySlots.forEach((slot, sIdx) => {
            const slotPeriodKey = getCurrentPeriodKey('DAILY', targetObj, slot.slot_id);
            const subKey = `${tmpl.id}_${slotPeriodKey}`;
            const sub = submissionMap.get(subKey) || null;

            const responses = sub?.responses || {};
            const stats = calculateChecklistCompletion(items, responses);
            const isDone = sub && sub.status === 'COMPLETED';
            const status = isDone ? 'COMPLETED' : stats.completedCount > 0 ? 'PARTIAL' : 'PENDING';
            const slotDueTime = slot.due_time || tmpl.due_time || '18:00';

            const delayInfo = calculateDelayStatus({
              frequency: 'DAILY',
              periodKey: slotPeriodKey,
              dueTime: slotDueTime,
              dayOfMonth: tmpl.day_of_month || 1,
              submittedAt: sub?.submitted_at || null,
              isCompleted: isDone,
              now: targetObj
            });

            result.push({
              template: {
                ...tmpl,
                title: `${tmpl.title} (${slot.label || `Slot ${sIdx + 1}`} - ${slotDueTime})`,
                base_title: tmpl.title,
                slot_label: slot.label || `Slot ${sIdx + 1}`,
                slot_id: slot.slot_id,
                due_time: slotDueTime
              },
              slotInfo: slot,
              slotIndex: sIdx + 1,
              totalSlots: dailySlots.length,
              currentPeriodKey: slotPeriodKey,
              submission: sub,
              items,
              responses,
              stats,
              status,
              delayInfo
            });
          });
          return;
        }
      }

      // Single slot (DAILY 1 time, WEEKLY, FORTNIGHTLY, MONTHLY, etc.)
      const currentKey = getCurrentPeriodKey(tmpl.frequency, targetObj);
      const subKey = `${tmpl.id}_${currentKey}`;
      const sub = submissionMap.get(subKey) || null;

      const responses = sub?.responses || {};
      const stats = calculateChecklistCompletion(items, responses);
      const isDone = sub && sub.status === 'COMPLETED';
      const status = isDone ? 'COMPLETED' : stats.completedCount > 0 ? 'PARTIAL' : 'PENDING';

      const delayInfo = calculateDelayStatus({
        frequency: tmpl.frequency,
        periodKey: currentKey,
        dueTime: tmpl.due_time || '18:00',
        dayOfMonth: tmpl.day_of_month || 1,
        submittedAt: sub?.submitted_at || null,
        isCompleted: isDone,
        now: targetObj
      });

      result.push({
        template: tmpl,
        currentPeriodKey: currentKey,
        submission: sub,
        items,
        responses,
        stats,
        status,
        delayInfo
      });
    });

    return {
      success: true,
      data: result,
      periodKey: getCurrentPeriodKey(frequency, targetObj),
      isSunday,
      holidayInfo
    };
  } catch (err) {
    console.warn('Error fetching checklist dashboard:', err.message);
    return { success: true, data: [], periodKey: getCurrentPeriodKey(frequency, targetObj) };
  }
}

export async function submitChecklistResponse(submissionData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const {
      template_id,
      template_title,
      frequency,
      period_key,
      employee_id,
      employee_name,
      employee_email,
      department,
      responses = {},
      submission_notes = '',
      items = []
    } = submissionData;

    const emailClean = (employee_email || '').trim().toLowerCase();
    const stats = calculateChecklistCompletion(items, responses);
    const status = stats.isAllDone ? 'COMPLETED' : 'PARTIAL';

    const payload = {
      id: submissionData.id || crypto.randomUUID(),
      tenant_id: tenantId,
      template_id,
      template_title: template_title || 'Checklist',
      frequency: (frequency || 'DAILY').toUpperCase(),
      period_key: period_key || getCurrentPeriodKey(frequency),
      employee_id: employee_id || null,
      employee_name: employee_name || 'Employee',
      employee_email: emailClean,
      department: department || 'General',
      status,
      items_completed_count: stats.completedCount,
      items_total_count: stats.totalCount,
      responses,
      submitted_at: new Date().toISOString(),
      submission_notes,
      verification_status: 'PENDING',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await adminClient
      .from('checklist_submissions')
      .upsert(payload, { onConflict: 'template_id,employee_email,period_key' })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Error submitting checklist response:', err.message);
    return { success: false, error: err.message };
  }
}

export async function verifyChecklistSubmission({
  submissionId,
  verificationStatus = 'APPROVED',
  verifiedBy = 'Manager',
  verificationRemarks = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  try {
    const payload = {
      verification_status: verificationStatus,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verification_remarks: verificationRemarks,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await adminClient
      .from('checklist_submissions')
      .update(payload)
      .eq('id', submissionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Error verifying checklist submission:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getChecklistComplianceReport({
  frequency,
  periodKey,
  department,
  tenantId = DEFAULT_TENANT_ID
} = {}) {
  const adminClient = getAdminClient();
  try {
    let subQuery = adminClient
      .from('checklist_submissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false });

    if (frequency && frequency !== 'ALL') {
      subQuery = subQuery.eq('frequency', frequency.toUpperCase());
    }
    if (periodKey) {
      subQuery = subQuery.eq('period_key', periodKey);
    }
    if (department && department !== 'ALL') {
      subQuery = subQuery.eq('department', department);
    }

    const { data, error } = await subQuery;
    if (error) throw error;

    // Enrich with templates for cutoff check
    const { data: templates } = await adminClient
      .from('checklist_templates')
      .select('id, due_time, day_of_month, frequency')
      .eq('tenant_id', tenantId);

    const tmplMap = new Map((templates || []).map(t => [t.id, t]));

    const enriched = (data || []).map(sub => {
      const tmpl = tmplMap.get(sub.template_id);
      const delayInfo = calculateDelayStatus({
        frequency: sub.frequency || tmpl?.frequency || 'DAILY',
        periodKey: sub.period_key,
        dueTime: tmpl?.due_time || '18:00',
        dayOfMonth: tmpl?.day_of_month || 1,
        submittedAt: sub.submitted_at,
        isCompleted: sub.status === 'COMPLETED'
      });

      return {
        ...sub,
        delayInfo
      };
    });

    return { success: true, data: enriched };
  } catch (err) {
    console.warn('Error fetching compliance report:', err.message);
    return { success: true, data: [] };
  }
}
