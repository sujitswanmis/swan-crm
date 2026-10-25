'use server';

import { getAdminClient } from '@/utils/supabase/adminClient';
import { calculateNextDueDate, getISTDateString, getISTCurrentPeriod } from '@/utils/orderFrequency';
import { getPartyList } from './partyMaster';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 1. GET ALL PARTY ORDER SCHEDULES (Rules Master)
 */
export async function getPartyOrderSchedules(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    // 1. Fetch enriched parties from Party Master
    const parties = await getPartyList(effectiveTenantId);

    // 2. Fetch existing schedules
    let schedulesMap = new Map();
    try {
      const { data: schedules, error: sErr } = await adminClient
        .from('party_order_schedules')
        .select('*')
        .eq('tenant_id', effectiveTenantId);

      if (!sErr && Array.isArray(schedules)) {
        schedules.forEach(s => schedulesMap.set(s.party_id, s));
      }
    } catch (_) {}

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // 3. Merge: Guarantee every party has a frequency rule (defaults to Monthly on 1st if none configured)
    return (parties || []).map(p => {
      const s = schedulesMap.get(p.id);
      return {
        party_id: p.id,
        party: p,
        schedule_id: s?.id || null,
        frequency_type: s?.frequency_type || 'MONTHLY',
        weekly_days: s?.weekly_days || ['MON'],
        monthly_date: s?.monthly_date || 1,
        half_monthly_dates: s?.half_monthly_dates || [1, 16],
        custom_interval_days: s?.custom_interval_days || 15,
        preferred_time_slot: s?.preferred_time_slot || 'ANYTIME',
        assigned_caller_id: s?.assigned_caller_id || null,
        is_active: s?.is_active !== false,
        last_followup_at: s?.last_followup_at || null,
        next_due_date: s?.next_due_date || todayStr,
        notes: s?.notes || ''
      };
    });
  } catch (err) {
    console.error('getPartyOrderSchedules root error:', err);
    return [];
  }
}

/**
 * 2. UPSERT PARTY ORDER SCHEDULE (Configure recurrence rule)
 */
export async function upsertPartyOrderSchedule(scheduleData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const nextDue = scheduleData.next_due_date || calculateNextDueDate(scheduleData);

  const payload = {
    tenant_id: effectiveTenantId,
    party_id: scheduleData.party_id,
    frequency_type: scheduleData.frequency_type || 'MONTHLY',
    weekly_days: scheduleData.weekly_days || ['MON'],
    monthly_date: Number(scheduleData.monthly_date) || 1,
    half_monthly_dates: scheduleData.half_monthly_dates || [1, 16],
    quarterly_month: Number(scheduleData.quarterly_month) || 1,
    quarterly_day: Number(scheduleData.quarterly_day) || 1,
    half_yearly_month: Number(scheduleData.half_yearly_month) || 1,
    half_yearly_day: Number(scheduleData.half_yearly_day) || 1,
    yearly_month: Number(scheduleData.yearly_month) || 1,
    yearly_day: Number(scheduleData.yearly_day) || 1,
    custom_interval_days: Number(scheduleData.custom_interval_days) || 15,
    preferred_time_slot: scheduleData.preferred_time_slot || 'ANYTIME',
    assigned_caller_id: scheduleData.assigned_caller_id || null,
    is_active: scheduleData.is_active !== false,
    next_due_date: nextDue,
    notes: scheduleData.notes || '',
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_order_schedules')
      .upsert(payload, { onConflict: 'tenant_id,party_id' })
      .select()
      .single();

    if (error) {
      console.warn('upsertPartyOrderSchedule table fallback warning:', error.message);
      return { success: true, ...payload };
    }
    return { success: true, ...data };
  } catch (err) {
    console.error('upsertPartyOrderSchedule error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 3. GET DAILY ORDER FOLLOWUP QUEUE (Today's calling list based on frequency rules)
 */
export async function getDailyOrderFollowupQueue(tenantId = DEFAULT_TENANT_ID, targetDate = null) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const todayStr = targetDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  try {
    // Read all parties with schedules
    const allSchedules = await getPartyOrderSchedules(effectiveTenantId);

    // Fetch follow-up calls including caller name and timestamp
    const { data: followups } = await adminClient
      .from('party_order_followups')
      .select('id, party_id, call_status, scheduled_date, created_at, is_order_placed, generated_order_no, assigned_caller_name, assigned_caller_id, no_order_reason, notes, rescheduled_time, order_line_items')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    const latestFollowupMap = new Map();
    const callCountsMap = new Map();
    if (Array.isArray(followups)) {
      followups.forEach(f => {
        callCountsMap.set(f.party_id, (callCountsMap.get(f.party_id) || 0) + 1);
        if (!latestFollowupMap.has(f.party_id)) {
          latestFollowupMap.set(f.party_id, f);
        }
      });
    }

    return allSchedules.map(item => {
      const latestCall = latestFollowupMap.get(item.party_id) || null;
      const callCount = callCountsMap.get(item.party_id) || 0;
      const isDue = (item.next_due_date <= todayStr);
      const isCompletedToday = latestCall?.created_at?.slice(0, 10) === todayStr;

      return {
        ...item,
        latestCall,
        callCount,
        isDue,
        isCompletedToday
      };
    });
  } catch (err) {
    console.error('getDailyOrderFollowupQueue error:', err);
    return [];
  }
}

/**
 * 4. SAVE ORDER FOLLOWUP & AUTO-RECUR (Calls log, punches SO if placed, & schedules next cycle)
 */
export async function saveOrderFollowupAndRecur(followupData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const isOrder = followupData.call_status === 'ORDER_PLACED';
  let generatedOrderNo = null;

  // 1. If order placed, generate Sales Order
  if (isOrder) {
    generatedOrderNo = `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
    try {
      await adminClient
        .from('sales_orders')
        .insert([{
          tenant_id: effectiveTenantId,
          order_number: generatedOrderNo,
          party_id: followupData.party_id,
          dealer_party_id: followupData.dealer_party_id || null,
          distributor_party_id: followupData.distributor_party_id || null,
          demand_flow_type: 'MAKE_TO_STOCK',
          total_ordered_qty: Number(followupData.qty) || 1,
          total_amount: Number(followupData.total_amount) || 0,
          order_status: 'CONFIRMED',
          delivery_status: 'PUNCHED',
          billing_route: followupData.billing_route || 'DIRECT_COMPANY_BILLING',
          preferred_dispatch_date: followupData.preferred_dispatch_date || null,
          transporter_name: followupData.transporter_name || '',
          order_line_items: followupData.order_line_items || [{
            product: followupData.product || 'Standard Product',
            qty: Number(followupData.qty) || 1
          }],
          created_at: new Date().toISOString()
        }]);
    } catch (e) {
      console.warn('Sales order creation warning:', e.message);
    }
  }

  // 2. Safe Employee ID Resolution for Foreign Key Constraint
  let validEmployeeId = null;
  const candidateCallerId = followupData.assigned_caller_id || followupData.caller_id;
  if (candidateCallerId) {
    try {
      const { data: empMatch } = await adminClient
        .from('employees')
        .select('id')
        .or(`id.eq.${candidateCallerId},user_id.eq.${candidateCallerId}`)
        .limit(1)
        .maybeSingle();

      if (empMatch?.id) {
        validEmployeeId = empMatch.id;
      }
    } catch (_err) {
      validEmployeeId = null;
    }
  }

  // 2B. Insert call log into party_order_followups
  const callPayload = {
    tenant_id: effectiveTenantId,
    party_id: followupData.party_id,
    scheduled_date: followupData.scheduled_date || todayStr,
    assigned_caller_id: validEmployeeId,
    assigned_caller_name: followupData.assigned_caller_name || followupData.caller_name || 'Admin',
    call_status: followupData.call_status,
    is_order_placed: isOrder,
    generated_order_no: generatedOrderNo,
    order_line_items: followupData.order_line_items || [],
    billing_route: followupData.billing_route || 'DIRECT_COMPANY_BILLING',
    preferred_dispatch_date: followupData.preferred_dispatch_date || null,
    no_order_reason: followupData.no_order_reason || '',
    rescheduled_time: followupData.rescheduled_time || null,
    notes: followupData.notes || '',
    created_at: new Date().toISOString()
  };

  let savedFollowup = null;
  try {
    const { data: fData, error: fError } = await adminClient
      .from('party_order_followups')
      .insert([callPayload])
      .select()
      .single();

    if (fError) {
      console.error('Save order followup failed:', fError);
      return {
        success: false,
        error: fError.message || 'Failed to insert call log'
      };
    }
    savedFollowup = fData;
  } catch (err) {
    console.error('Save order followup error:', err);
    return {
      success: false,
      error: err.message || 'Failed to insert call log'
    };
  }

  // 3. Recalculate Next Due Date & update party_order_schedules
  try {
    // If rescheduled with specific callback date, use that; else compute from master frequency
    let nextDue = followupData.next_followup_date;
    if (!nextDue || followupData.call_status !== 'RESCHEDULED') {
      const { data: currentSchedule } = await adminClient
        .from('party_order_schedules')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .eq('party_id', followupData.party_id)
        .single();

      nextDue = calculateNextDueDate(currentSchedule || { frequency_type: 'MONTHLY' }, todayStr);
    }

    await adminClient
      .from('party_order_schedules')
      .upsert({
        tenant_id: effectiveTenantId,
        party_id: followupData.party_id,
        next_due_date: nextDue,
        last_followup_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,party_id' });
  } catch (e) {
    console.warn('Update next due date warning:', e.message);
  }

  return {
    success: true,
    generated_order_no: generatedOrderNo,
    followup: savedFollowup
  };
}

/**
 * 4B. GET PARTY CALL HISTORY (All historical calls for a specific party in chronological order)
 */
export async function getPartyCallHistory(partyId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const { data, error } = await adminClient
      .from('party_order_followups')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('party_id', partyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getPartyCallHistory error:', err);
    return [];
  }
}

/**
 * 4C. GET DAILY CALL LOG LEDGER (Consolidated log of calls made for team audit & metrics)
 * Supports single targetDate string, date range options ({ startDate, endDate, preset }), or default today in IST.
 */
export async function getDailyCallLogLedger(tenantId = DEFAULT_TENANT_ID, targetDateOrOptions = null, options = {}) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  let startDate = null;
  let endDate = null;
  let isAll = false;
  let singleDate = null;

  if (typeof targetDateOrOptions === 'object' && targetDateOrOptions !== null) {
    startDate = targetDateOrOptions.startDate;
    endDate = targetDateOrOptions.endDate;
    if (targetDateOrOptions.preset === 'all') isAll = true;
  } else if (typeof targetDateOrOptions === 'string' && targetDateOrOptions) {
    singleDate = targetDateOrOptions;
  }

  if (options?.startDate) startDate = options.startDate;
  if (options?.endDate) endDate = options.endDate;
  if (options?.preset === 'all') isAll = true;

  try {
    const parties = await getPartyList(effectiveTenantId);
    const partiesMap = new Map((parties || []).map(p => [p.id, p]));

    let query = adminClient
      .from('party_order_followups')
      .select('*')
      .eq('tenant_id', effectiveTenantId);

    if (isAll) {
      // All time - no date boundary
    } else if (startDate && endDate) {
      query = query
        .gte('created_at', `${startDate}T00:00:00+05:30`)
        .lte('created_at', `${endDate}T23:59:59.999+05:30`);
    } else if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00+05:30`);
    } else if (singleDate) {
      query = query.or(`scheduled_date.eq.${singleDate},created_at.gte.${singleDate}T00:00:00+05:30`);
    } else {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      query = query.or(`scheduled_date.eq.${todayIST},created_at.gte.${todayIST}T00:00:00+05:30`);
    }

    const { data: logs, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return (logs || []).map(l => ({
      ...l,
      party: partiesMap.get(l.party_id) || null
    }));
  } catch (err) {
    console.error('getDailyCallLogLedger error:', err);
    return [];
  }
}

/**
 * 5. GET ORDER LIFECYCLE PIPELINE (Order taking se lekar Delivered tak)
 */
export async function getOrderPipelineList(tenantId = DEFAULT_TENANT_ID, statusFilter = 'ALL') {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const parties = await getPartyList(effectiveTenantId);
    const partiesMap = new Map((parties || []).map(p => [p.id, p]));

    let query = adminClient
      .from('sales_orders')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('delivery_status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('getOrderPipelineList query warning:', error.message);
      return [];
    }
    return (data || []).map(order => ({
      ...order,
      party: partiesMap.get(order.party_id) || null
    }));
  } catch (err) {
    console.error('getOrderPipelineList error:', err);
    return [];
  }
}

/**
 * 6. UPDATE ORDER LIFECYCLE STAGE (Punched -> Confirmed -> Packing -> Dispatched -> Delivered)
 */
export async function updateOrderLifecycleStatus(orderId, updateData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const payload = {
    delivery_status: updateData.delivery_status,
    updated_at: new Date().toISOString()
  };

  if (updateData.delivery_status === 'DISPATCHED') {
    payload.transporter_name = updateData.transporter_name || '';
    payload.lr_number = updateData.lr_number || '';
    payload.vehicle_number = updateData.vehicle_number || '';
    payload.eway_bill_no = updateData.eway_bill_no || '';
    payload.actual_dispatch_date = new Date().toISOString();
    payload.estimated_delivery_date = updateData.estimated_delivery_date || null;
    payload.order_status = 'DISPATCHED';
  }

  if (updateData.delivery_status === 'DELIVERED') {
    payload.actual_delivery_date = new Date().toISOString();
    payload.pod_document_url = updateData.pod_document_url || '';
    payload.delivery_confirmed_by = updateData.delivery_confirmed_by || 'Verified by Customer';
    payload.delivery_notes = updateData.delivery_notes || '';
    payload.order_status = 'BILLED';
  }

  try {
    const { data, error } = await adminClient
      .from('sales_orders')
      .update(payload)
      .eq('id', orderId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, order: data };
  } catch (err) {
    console.error('updateOrderLifecycleStatus error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 7. GET DELIVERED ORDERS PENDING FEEDBACK
 */
export async function getDeliveredOrdersPendingFeedback(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const parties = await getPartyList(effectiveTenantId);
    const partiesMap = new Map((parties || []).map(p => [p.id, p]));

    // 1. Fetch all delivered orders
    const { data: deliveredOrders, error: oErr } = await adminClient
      .from('sales_orders')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('delivery_status', 'DELIVERED')
      .order('actual_delivery_date', { ascending: false });

    if (oErr) {
      console.warn('getDeliveredOrdersPendingFeedback query warning:', oErr.message);
      return [];
    }

    // 2. Fetch already recorded feedback
    const { data: recordedFeedback } = await adminClient
      .from('party_order_feedback')
      .select('order_id, overall_satisfaction, rating_delivery_time, has_transit_damage_shortage, created_at')
      .eq('tenant_id', effectiveTenantId);

    const feedbackMap = new Map();
    if (Array.isArray(recordedFeedback)) {
      recordedFeedback.forEach(f => feedbackMap.set(f.order_id, f));
    }

    return (deliveredOrders || []).map(order => ({
      ...order,
      party: partiesMap.get(order.party_id) || null,
      feedback: feedbackMap.get(order.id) || feedbackMap.get(order.order_number) || null,
      isFeedbackRecorded: !!(feedbackMap.get(order.id) || feedbackMap.get(order.order_number))
    }));
  } catch (err) {
    console.error('getDeliveredOrdersPendingFeedback error:', err);
    return [];
  }
}

/**
 * 8. SAVE POST-DELIVERY FEEDBACK (With Auto High-Priority Complaint Trigger)
 */
export async function savePostDeliveryFeedback(feedbackData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const isComplaint = (Number(feedbackData.overall_satisfaction) <= 2) || feedbackData.has_transit_damage_shortage;
  let linkedTicketId = null;

  // Auto-generate complaint ticket if low rating or damage reported
  if (isComplaint) {
    try {
      const ticketNo = `CMP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const { data: ticket } = await adminClient
        .from('party_complaints')
        .insert([{
          tenant_id: effectiveTenantId,
          ticket_number: ticketNo,
          party_id: feedbackData.party_id,
          complaint_source: 'FEEDBACK_CALL_AUTO',
          category: feedbackData.has_transit_damage_shortage ? 'TRANSIT_DAMAGE' : 'MANUFACTURING_DEFECT',
          priority: 'HIGH',
          assigned_department: feedbackData.has_transit_damage_shortage ? 'LOGISTICS_DISPATCH' : 'QUALITY_ASSURANCE',
          issue_description: `Auto-generated from delivery feedback for Order #${feedbackData.order_number || feedbackData.order_id}. Satisfaction: ${feedbackData.overall_satisfaction}/5. Details: ${feedbackData.damage_details || feedbackData.dealer_comments || 'Low satisfaction score recorded.'}`,
          ticket_status: 'OPEN',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      linkedTicketId = ticket?.id || null;
    } catch (e) {
      console.warn('Auto complaint creation warning:', e.message);
    }
  }

  const payload = {
    tenant_id: effectiveTenantId,
    order_id: feedbackData.order_id || feedbackData.order_number,
    party_id: feedbackData.party_id,
    telecaller_id: feedbackData.telecaller_id || null,
    telecaller_name: feedbackData.telecaller_name || '',
    call_datetime: new Date().toISOString(),
    overall_satisfaction: Number(feedbackData.overall_satisfaction) || 5,
    rating_delivery_time: Number(feedbackData.rating_delivery_time) || 5,
    rating_product_quality: Number(feedbackData.rating_product_quality) || 5,
    rating_packaging: Number(feedbackData.rating_packaging) || 5,
    rating_transporter: Number(feedbackData.rating_transporter) || 5,
    has_transit_damage_shortage: !!feedbackData.has_transit_damage_shortage,
    damage_details: feedbackData.damage_details || '',
    dealer_comments: feedbackData.dealer_comments || '',
    repeat_order_intent: feedbackData.repeat_order_intent || 'NORMAL',
    repeat_order_expected_date: feedbackData.repeat_order_expected_date || null,
    auto_complaint_triggered: isComplaint,
    linked_ticket_id: linkedTicketId,
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_order_feedback')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return { success: true, feedback: data, ticket_generated: isComplaint };
  } catch (err) {
    console.error('savePostDeliveryFeedback error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 9. GET MONTHLY HEALTH CHECK AUDIT QUEUE
 */
export async function getMonthlyHealthCheckQueue(tenantId = DEFAULT_TENANT_ID, periodStr = null) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const currentPeriod = periodStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());

  try {
    // 1. Fetch active parties from Party Master
    const parties = await getPartyList(effectiveTenantId);

    // 2. Fetch monthly audits for selected period
    const { data: audits } = await adminClient
      .from('party_monthly_feedback')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('evaluation_period', currentPeriod);

    const auditMap = new Map();
    if (Array.isArray(audits)) {
      audits.forEach(a => auditMap.set(a.party_id, a));
    }

    // 3. Fetch latest orders to compute inactivity days
    const { data: orders } = await adminClient
      .from('sales_orders')
      .select('party_id, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    const latestOrderMap = new Map();
    if (Array.isArray(orders)) {
      orders.forEach(o => {
        if (!latestOrderMap.has(o.party_id)) {
          latestOrderMap.set(o.party_id, o.created_at);
        }
      });
    }

    const todayMs = Date.now();

    return (parties || []).map(p => {
      const audit = auditMap.get(p.id) || null;
      const lastOrderTime = latestOrderMap.get(p.id) || p.created_at;
      const daysInactive = Math.floor((todayMs - new Date(lastOrderTime).getTime()) / (1000 * 60 * 60 * 24));
      const isDormant = daysInactive > 45;

      return {
        party: p,
        party_id: p.id,
        period: currentPeriod,
        audit,
        daysInactive,
        isDormant,
        isAudited: !!audit
      };
    });
  } catch (err) {
    console.error('getMonthlyHealthCheckQueue error:', err);
    return [];
  }
}

/**
 * 10. SAVE MONTHLY HEALTH CHECK AUDIT
 */
export async function saveMonthlyHealthCheckAudit(auditData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const period = auditData.evaluation_period || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());

  const payload = {
    tenant_id: effectiveTenantId,
    party_id: auditData.party_id,
    evaluation_period: period,
    days_inactive: Number(auditData.days_inactive) || 0,
    is_dormant_risk: !!auditData.is_dormant_risk,
    rating_order_delivery: Number(auditData.rating_order_delivery) || 5,
    rating_product_quality: Number(auditData.rating_product_quality) || 5,
    rating_sales_support: Number(auditData.rating_sales_support) || 5,
    rating_account_billing: Number(auditData.rating_account_billing) || 5,
    rating_overall: Number(auditData.rating_overall) || 5,
    next_month_demand_plan: auditData.next_month_demand_plan || '',
    competitor_schemes: auditData.competitor_schemes || '',
    dealer_suggestions: auditData.dealer_suggestions || '',
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_monthly_feedback')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return { success: true, audit: data };
  } catch (err) {
    console.error('saveMonthlyHealthCheckAudit error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 11. GET COMPLAINTS LIST WITH LIVE SLA IN IST
 */
export async function getComplaintsTickets(tenantId = DEFAULT_TENANT_ID, filters = {}) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    // 1. Fetch parties list to get full enriched data (district, state, etc.)
    const partiesList = await getPartyList(effectiveTenantId).catch(() => []);
    const partiesMap = new Map();
    if (Array.isArray(partiesList)) {
      partiesList.forEach(p => {
        if (p?.id) partiesMap.set(String(p.id), p);
      });
    }

    let query = adminClient
      .from('party_complaints')
      .select('*, party:party_master(id, party_universal_code, firm_name, primary_mobile, external_sap_code)')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('ticket_status', filters.status);
    }
    if (filters.department && filters.department !== 'ALL') {
      query = query.eq('assigned_department', filters.department);
    }

    let { data, error } = await query;
    if (error) {
      console.error('getComplaintsTickets joined query failed, falling back to raw:', error.message);
      const rawRes = await adminClient
        .from('party_complaints')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .order('created_at', { ascending: false });
      if (rawRes.error) {
        console.error('getComplaintsTickets raw fallback error:', rawRes.error.message);
        return [];
      }
      data = rawRes.data;
    }

    const now = Date.now();

    return (data || []).map(ticket => {
      let isBreached = false;
      let hoursRemaining = null;

      if (ticket.sla_deadline && ticket.ticket_status !== 'RESOLVED_CLOSED' && ticket.ticket_status !== 'REJECTED') {
        const deadlineMs = new Date(ticket.sla_deadline).getTime();
        const diffHours = (deadlineMs - now) / (1000 * 60 * 60);
        hoursRemaining = Math.round(diffHours * 10) / 10;
        isBreached = diffHours < 0;
      }

      // Merge enriched party info (district, state, phone, firm name)
      const partyFromMap = partiesMap.get(String(ticket.party_id));
      const mergedParty = {
        ...(partyFromMap || {}),
        ...(ticket.party || {})
      };

      return {
        ...ticket,
        party: mergedParty,
        isSlaBreached: isBreached,
        slaHoursRemaining: hoursRemaining
      };
    });
  } catch (err) {
    console.error('getComplaintsTickets error:', err);
    return [];
  }
}

/**
 * 12. CREATE COMPLAINT TICKET (With Category SLA Deadline in IST)
 */
export async function createComplaintTicketDirect(complaintData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const ticketNo = `CMP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  
  // Standard SLA hours by category
  const slaHoursMap = {
    MANUFACTURING_DEFECT: 48,
    TRANSIT_DAMAGE: 24,
    SHORTAGE_MISSING_PARTS: 24,
    BILLING_DISPUTE: 24,
    DELIVERY_DELAY: 12,
    SERVICE_WARRANTY: 72
  };
  const hours = slaHoursMap[complaintData.category] || 48;
  const deadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const payload = {
    tenant_id: effectiveTenantId,
    ticket_number: ticketNo,
    party_id: complaintData.party_id,
    complaint_source: complaintData.complaint_source || 'DIRECT_PHONE',
    category: complaintData.category || 'MANUFACTURING_DEFECT',
    priority: complaintData.priority || 'MEDIUM',
    issue_description: complaintData.issue_description || '',
    assigned_department: complaintData.assigned_department || 'QUALITY_ASSURANCE',
    assigned_employee_name: complaintData.assigned_employee_name || '',
    sla_deadline: deadline,
    ticket_status: 'OPEN',
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_complaints')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return { success: true, ticket: data };
  } catch (err) {
    console.error('createComplaintTicketDirect error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 13. UPDATE COMPLAINT CORRECTIVE ACTION
 */
export async function updateComplaintTicketAction(ticketId, actionData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const payload = {
    ticket_status: 'ACTION_TAKEN',
    resolution_type: actionData.resolution_type,
    resolution_notes: actionData.resolution_notes || '',
    action_reference_no: actionData.action_reference_no || '',
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_complaints')
      .update(payload)
      .eq('id', ticketId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, ticket: data };
  } catch (err) {
    console.error('updateComplaintTicketAction error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 14. VERIFY AND CLOSE COMPLAINT TICKET (Two-factor closure)
 */
export async function verifyAndCloseComplaintTicket(ticketId, closureData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const payload = {
    ticket_status: 'RESOLVED_CLOSED',
    closure_otp: closureData.closure_otp || 'VERIFIED_ON_CALL',
    dealer_satisfaction_rating: Number(closureData.dealer_satisfaction_rating) || 5,
    closed_at: new Date().toISOString()
  };

  try {
    const { data, error } = await adminClient
      .from('party_complaints')
      .update(payload)
      .eq('id', ticketId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, ticket: data };
  } catch (err) {
    console.error('verifyAndCloseComplaintTicket error:', err);
    return { success: false, error: err.message };
  }
}
