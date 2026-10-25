'use server';

import { getPartyList, getOrderFollowups, getOrderFeedbackList, getMonthlyFeedbackList, getComplaintsList } from './partyMaster';
import { getEmployeesMaster } from './employee';
import { getStatesCentral, getDistrictsCentral } from './centralLocationMaster';
import { getTransferredLeads } from './partyHandoff';
import { getOrderPipelineList, getDeliveredOrdersPendingFeedback } from './orderFulfillment';
import { getAdminClient } from '@/utils/supabase/adminClient';

function rows(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

// Preserve the frequency defaults/party shape used by the existing order actions.
async function readSchedules(tenantId) {
  const client = getAdminClient();
  const [parties, scheduleResult] = await Promise.all([
    getPartyList(tenantId, { throwOnError: true }),
    client.from('party_order_schedules').select('*').eq('tenant_id', tenantId)
  ]);
  // The schedules table is optional on workspaces that have not migrated yet.
  if (scheduleResult.error && !['42P01', 'PGRST205'].includes(scheduleResult.error.code)) throw scheduleResult.error;
  const schedules = new Map((scheduleResult.data || []).map(s => [s.party_id, s]));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return parties.map(p => {
    const s = schedules.get(p.id);
    return {
      party_id: p.id, party: p, schedule_id: s?.id || null,
      frequency_type: s?.frequency_type || 'MONTHLY', weekly_days: s?.weekly_days || ['MON'],
      monthly_date: s?.monthly_date || 1, half_monthly_dates: s?.half_monthly_dates || [1, 16],
      custom_interval_days: s?.custom_interval_days || 15, preferred_time_slot: s?.preferred_time_slot || 'ANYTIME',
      assigned_caller_id: s?.assigned_caller_id || null, is_active: s?.is_active !== false,
      last_followup_at: s?.last_followup_at || null, next_due_date: s?.next_due_date || today, notes: s?.notes || ''
    };
  });
}

async function readDailyQueue(tenantId) {
  const client = getAdminClient();
  const [schedules, followupResult] = await Promise.all([
    readSchedules(tenantId),
    client.from('party_order_followups')
      .select('id, party_id, call_status, scheduled_date, created_at, is_order_placed, generated_order_no, assigned_caller_name, assigned_caller_id, no_order_reason, notes, rescheduled_time, order_line_items')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false })
  ]);
  const latest = new Map();
  const counts = new Map();
  for (const call of rows(followupResult)) {
    counts.set(call.party_id, (counts.get(call.party_id) || 0) + 1);
    if (!latest.has(call.party_id)) latest.set(call.party_id, call);
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  return schedules.map(item => {
    const latestCall = latest.get(item.party_id) || null;
    const callDate = latestCall?.created_at ? new Date(latestCall.created_at) : null;
    return {
      ...item, latestCall, callCount: counts.get(item.party_id) || 0,
      isDue: item.next_due_date <= today,
      isCompletedToday: !!callDate && !Number.isNaN(callDate.getTime()) && formatter.format(callDate) === today
    };
  });
}

// A single client dispatch; independent reads run concurrently on the server.
export async function getPartyWorkspaceData(tenantId, section = 'parties', company = null) {
  try {
    if (!tenantId || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(tenantId)) throw new Error('Invalid workspace');
    let data;
    if (section === 'parties') data = await getPartyList(tenantId, { throwOnError: true });
    else if (section === 'transfers') data = await getTransferredLeads(tenantId);
    else if (section === 'reference') {
      const [employees, states] = await Promise.all([getEmployeesMaster(tenantId, company), getStatesCentral()]);
      const punjab = states.find(s => (s.state_name || s.name || '').toLowerCase() === 'punjab');
      const districts = await getDistrictsCentral(punjab?.id || null, 'Punjab').catch(() => []);
      data = { employees, states, districts };
    } else if (section === 'dashboard') {
      const results = await Promise.allSettled([
        getOrderFollowups(tenantId), getOrderFeedbackList(tenantId), getMonthlyFeedbackList(tenantId), getComplaintsList(tenantId)
      ]);
      data = {};
      ['orderFollowups', 'orderFeedbacks', 'monthlyFeedbacks', 'complaints'].forEach((name, index) => {
        if (results[index].status === 'fulfilled') data[name] = results[index].value;
      });
    } else throw new Error('Unknown section');
    return { success: true, data };
  } catch (err) {
    console.warn(`Party workspace ${section} load failed:`, err.message);
    return { success: false, error: 'Data could not be refreshed. Please try again.' };
  }
}

export async function getChannelWorkspaceData(tenantId, tab) {
  try {
    if (!tenantId || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(tenantId)) throw new Error('Invalid workspace');
    let data;
    if (tab === 'order_followup') data = await readDailyQueue(tenantId);
    else if (tab === 'frequency_rules') data = await readSchedules(tenantId);
    else if (tab === 'order_pipeline') data = await getOrderPipelineList(tenantId);
    else if (tab === 'order_feedback') data = await getDeliveredOrdersPendingFeedback(tenantId);
    else if (tab === 'complaints') data = await getPartyList(tenantId, { throwOnError: true });
    else if (tab === 'monthly_feedback') data = [];
    else throw new Error('Unknown operations tab');
    return { success: true, data };
  } catch (err) {
    console.warn(`Channel workspace ${tab} load failed:`, err.message);
    return { success: false, error: 'Data could not be refreshed. Please try again.' };
  }
}
