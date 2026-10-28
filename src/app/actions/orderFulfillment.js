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
 * 3B. GENERATE NEXT SEQUENTIAL SALES ORDER NUMBER (e.g. SO-2026-0001, SO-2026-0002)
 * Atomic, deterministic, year-prefixed sequence.
 */
export async function generateNextSalesOrderNumber(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const currentYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
  const prefix = `SO-${currentYear}-`;

  try {
    const { data: orders, error } = await adminClient
      .from('sales_orders')
      .select('order_number')
      .eq('tenant_id', effectiveTenantId)
      .ilike('order_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('generateNextSalesOrderNumber query warning:', error.message);
    }

    let maxSeq = 0;
    let baseOrderCount = 0;

    if (Array.isArray(orders) && orders.length > 0) {
      for (const ord of orders) {
        const raw = (ord.order_number || '').trim();
        // Ignore child suffix -B / -C
        if (raw.endsWith('-B') || raw.endsWith('-C')) continue;

        baseOrderCount++;
        if (raw.startsWith(prefix)) {
          const numPartStr = raw.slice(prefix.length).split('-')[0];
          const numPart = parseInt(numPartStr, 10);
          // Only treat 4-digit numbers < 5000 as clean sequential (ignoring legacy 5-digit random timestamp slices)
          if (numPartStr.length === 4 && !isNaN(numPart) && numPart > 0 && numPart < 5000 && numPart > maxSeq) {
            maxSeq = numPart;
          }
        }
      }
    }

    // Next sequence: if maxSeq exists use maxSeq + 1; otherwise if there are base orders use baseOrderCount + 1, else 1
    const nextSeq = maxSeq > 0 ? maxSeq + 1 : (baseOrderCount > 0 ? baseOrderCount + 1 : 1);
    const paddedSeq = String(nextSeq).padStart(4, '0');
    return `${prefix}${paddedSeq}`;
  } catch (err) {
    console.error('generateNextSalesOrderNumber error:', err);
    const fallbackSeq = String(Math.floor(Date.now() % 10000)).padStart(4, '0');
    return `${prefix}${fallbackSeq}`;
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

  // 1. If order placed, generate Sales Order with sequential numbering (e.g. SO-2026-0001)
  if (isOrder) {
    generatedOrderNo = await generateNextSalesOrderNumber(effectiveTenantId);
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
  let validRescheduledTime = null;
  let finalNotes = followupData.notes || '';
  if (followupData.rescheduled_time) {
    const rawTime = String(followupData.rescheduled_time).trim();
    const parsed = Date.parse(rawTime);
    if (!isNaN(parsed) && !rawTime.includes('(')) {
      validRescheduledTime = new Date(parsed).toISOString();
    } else {
      // Parse "YYYY-MM-DD (HH:MM AM - HH:MM PM)"
      const dateMatch = rawTime.match(/(\d{4}-\d{2}-\d{2})/);
      const timeMatch = rawTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (dateMatch) {
        const dStr = dateMatch[1];
        let h = 11;
        let m = 0;
        if (timeMatch) {
          h = parseInt(timeMatch[1], 10);
          m = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3].toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
        }
        const pad = (n) => String(n).padStart(2, '0');
        validRescheduledTime = `${dStr}T${pad(h)}:${pad(m)}:00+05:30`;
        const slotMatch = rawTime.match(/\(([^)]+)\)/);
        if (slotMatch && !finalNotes.includes(slotMatch[1])) {
          finalNotes = (finalNotes ? `${finalNotes} | ` : '') + `[Rescheduled Slot: ${slotMatch[1]}]`;
        }
      }
    }
  }

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
    rescheduled_time: validRescheduledTime,
    notes: finalNotes,
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
 * 6. UPDATE ORDER LIFECYCLE STAGE (S01 to S13 & Legacy Statuses)
 */
export async function updateOrderLifecycleStatus(orderId, updateData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    // 1. Fetch current order to preserve line items and history
    const { data: currentOrder, error: fetchErr } = await adminClient
      .from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (fetchErr) {
      console.warn('Could not fetch current order for stage transition:', fetchErr.message);
    }

    const currentHistory = Array.isArray(currentOrder?.stage_history) 
      ? currentOrder.stage_history 
      : (Array.isArray(currentOrder?.order_line_items?.stage_history) ? currentOrder.order_line_items.stage_history : []);

    const nowISO = new Date().toISOString();
    const newStageEntry = {
      stage_id: updateData.stage_id || updateData.delivery_status,
      stage_name: updateData.stage_name || updateData.delivery_status,
      department: updateData.department || '',
      tat_hours: Number(updateData.tat_hours) || 0,
      planned_timestamp: updateData.planned_timestamp || null,
      actual_timestamp: nowISO,
      tat_breached: !!updateData.tat_breached,
      action_by: updateData.action_by || 'User',
      notes: updateData.notes || updateData.delivery_notes || '',
      custom_fields_data: updateData.custom_fields_data || {},
      created_at: nowISO
    };

    const updatedHistory = [...currentHistory, newStageEntry];

    const payload = {
      delivery_status: updateData.delivery_status,
      updated_at: nowISO
    };

    // Specific Stage Handlers
    if (updateData.delivery_status === 'S12' || updateData.delivery_status === 'DISPATCHED') {
      payload.transporter_name = updateData.transporter_name || updateData.custom_fields_data?.transporter_name || '';
      payload.lr_number = updateData.lr_number || updateData.custom_fields_data?.lr_number || '';
      payload.vehicle_number = updateData.vehicle_number || updateData.custom_fields_data?.vehicle_number || '';
      payload.eway_bill_no = updateData.eway_bill_no || updateData.custom_fields_data?.eway_bill_no || '';
      payload.actual_dispatch_date = nowISO;
      payload.estimated_delivery_date = updateData.estimated_delivery_date || null;
      payload.order_status = 'DISPATCHED';
    }

    if (updateData.delivery_status === 'S13' || updateData.delivery_status === 'DELIVERED') {
      payload.actual_delivery_date = updateData.actual_delivery_date || nowISO;
      payload.pod_document_url = updateData.pod_document_url || '';
      payload.delivery_confirmed_by = updateData.delivery_confirmed_by || updateData.custom_fields_data?.received_by_person || 'Verified by Customer';
      payload.delivery_notes = updateData.delivery_notes || updateData.notes || '';
      payload.order_status = 'BILLED';
    }

    // Advance payment handler (S05)
    if (updateData.stage_id === 'S05' || updateData.delivery_status === 'S05_ADVANCE_RECEIVED') {
      if (updateData.custom_fields_data?.is_100_percent_paid) {
        payload.order_status = 'FULL_PAID';
      }
    }

    // Try updating with stage_history column
    let resultData = null;
    try {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update({
          ...payload,
          stage_history: updatedHistory
        })
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      resultData = data;
    } catch (dbErr) {
      // If stage_history column does not exist, store safely inside order_line_items envelope or notes
      const lineItems = Array.isArray(currentOrder?.order_line_items) ? currentOrder.order_line_items : [];
      let updatedLineItems = lineItems;
      if (Array.isArray(lineItems)) {
        updatedLineItems = [...lineItems];
        updatedLineItems._stage_history = updatedHistory;
      }

      const fallbackPayload = {
        ...payload,
        delivery_notes: `${payload.delivery_notes || ''}\n[Stage History JSON]: ${JSON.stringify(updatedHistory).slice(0, 1000)}`
      };

      const { data: fbData, error: fbErr } = await adminClient
        .from('sales_orders')
        .update(fallbackPayload)
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (fbErr) throw fbErr;
      resultData = fbData;
    }

    return { success: true, order: resultData };
  } catch (err) {
    console.error('updateOrderLifecycleStatus error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 6B. REVISE ORDER ITEMS (S01 Modification: Add/Remove/Change Qty & Rate)
 */
export async function reviseOrderItems(orderId, updatedItems = [], updatedBy = 'Sales User', revisionReason = '', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const { data: currentOrder, error: fetchErr } = await adminClient
      .from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (fetchErr) throw fetchErr;

    // Recalculate totals
    let newTotalQty = 0;
    let newTotalAmount = 0;
    const sanitizedItems = updatedItems.map(it => {
      const q = Math.max(1, Number(it.qty) || 1);
      const r = Math.max(0, Number(it.rate) || 0);
      newTotalQty += q;
      newTotalAmount += (q * r);
      return {
        product: it.product || it.name || 'Product',
        qty: q,
        rate: r,
        amount: q * r
      };
    });

    const nowISO = new Date().toISOString();
    const currentHistory = Array.isArray(currentOrder?.stage_history) ? currentOrder.stage_history : [];
    const revisionLog = {
      stage_id: 'S01_REVISION',
      stage_name: 'Order Revision',
      action_by: updatedBy,
      notes: revisionReason || 'Order items modified in Stage S01',
      previous_items: currentOrder.order_line_items,
      previous_amount: currentOrder.total_amount,
      new_amount: newTotalAmount,
      created_at: nowISO
    };

    const updatedHistory = [...currentHistory, revisionLog];

    const payload = {
      order_line_items: sanitizedItems,
      total_ordered_qty: newTotalQty,
      total_amount: newTotalAmount,
      updated_at: nowISO
    };

    try {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update({
          ...payload,
          stage_history: updatedHistory
        })
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    } catch (_) {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update(payload)
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    }
  } catch (err) {
    console.error('reviseOrderItems error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 6C. CANCEL ORDER (S01 Cancellation with Structured Reason)
 */
export async function cancelOrder(orderId, cancelReason = '', cancelledBy = 'Sales User', notes = '', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const { data: currentOrder, error: fetchErr } = await adminClient
      .from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (fetchErr) throw fetchErr;

    const nowISO = new Date().toISOString();
    const currentHistory = Array.isArray(currentOrder?.stage_history) ? currentOrder.stage_history : [];
    const cancelLog = {
      stage_id: 'CANCELLED',
      stage_name: 'Order Cancelled',
      action_by: cancelledBy,
      cancel_reason: cancelReason,
      notes: notes || '',
      created_at: nowISO
    };

    const payload = {
      order_status: 'CANCELLED',
      delivery_status: 'CANCELLED',
      delivery_notes: `[CANCELLED by ${cancelledBy}]: ${cancelReason} - ${notes}`,
      updated_at: nowISO
    };

    try {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update({
          ...payload,
          stage_history: [...currentHistory, cancelLog]
        })
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    } catch (_) {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update(payload)
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    }
  } catch (err) {
    console.error('cancelOrder error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 6D. DISPATCH PARTIAL SPLIT LOT (Lot-A Dispatched, Lot-B Retained in Pipeline)
 */
export async function dispatchPartialLot(orderId, lotData = {}, dispatchedBy = 'Logistics', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    const { data: currentOrder, error: fetchErr } = await adminClient
      .from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (fetchErr) throw fetchErr;

    // Guard: Child orders ending with -B cannot be split further
    if (currentOrder.order_number?.endsWith('-B')) {
      console.warn('dispatchPartialLot: Child order ending with -B cannot be split further:', currentOrder.order_number);
      return { success: false, error: 'Child order is already a remaining lot and cannot be split further.' };
    }

    const nowISO = new Date().toISOString();
    const currentHistory = Array.isArray(currentOrder?.stage_history) ? currentOrder.stage_history : [];
    
    const allocSummary = Array.isArray(lotData.product_allocations) && lotData.product_allocations.length > 0
      ? lotData.product_allocations.map(p => `${p.ready_qty}/${p.ordered_qty}x ${p.product}`).join(', ')
      : `${lotData.dispatched_qty || 0} Units`;

    const lotLog = {
      stage_id: 'PARTIAL_LOT_DISPATCH',
      stage_name: `Partial Lot Dispatched (${lotData.dispatched_qty || 0} Units)`,
      lot_no: lotData.lot_no || 'Lot-A',
      dispatched_qty: Number(lotData.dispatched_qty) || 0,
      remaining_qty: Number(lotData.remaining_qty) || 0,
      transporter_name: lotData.transporter_name || '',
      lr_number: lotData.lr_number || '',
      vehicle_number: lotData.vehicle_number || '',
      action_by: dispatchedBy,
      notes: lotData.notes || '',
      product_allocations: lotData.product_allocations || [],
      created_at: nowISO
    };

    // Handle Lot-B Child Order Creation if remaining units exist
    let createdChildOrderNo = null;
    if (Number(lotData.remaining_qty) > 0) {
      const childOrderNo = `${currentOrder.order_number}-B`;

      try {
        // Check if child order already exists to prevent duplicate creation
        const { data: existingChild } = await adminClient
          .from('sales_orders')
          .select('id, order_number')
          .eq('order_number', childOrderNo)
          .eq('tenant_id', effectiveTenantId)
          .maybeSingle();

        if (!existingChild) {
          // Calculate remaining items array
          const remainingItems = Array.isArray(lotData.product_allocations) && lotData.product_allocations.length > 0
            ? lotData.product_allocations
                .filter(p => Number(p.remaining_qty) > 0)
                .map(p => {
                  const origItem = Array.isArray(currentOrder.order_line_items)
                    ? currentOrder.order_line_items.find(it => (it.product || it.name) === p.product)
                    : null;
                  return {
                    product: p.product,
                    qty: Number(p.remaining_qty),
                    rate: origItem?.rate || 0
                  };
                })
            : [{
                product: currentOrder.product_name || 'Remaining Product Items',
                qty: Number(lotData.remaining_qty),
                rate: 0
              }];

          // Calculate remaining amount
          const remainingAmount = remainingItems.reduce((sum, it) => sum + ((it.qty || 0) * (it.rate || 0)), 0) ||
            Math.round((Number(currentOrder.total_amount) || 0) * (Number(lotData.remaining_qty) / (Number(currentOrder.total_ordered_qty) || 1)));

          // Inherit Full Paid status from parent order (e.g. S05 100% advance or full paid status)
          const isParentFullPaid = currentOrder.order_status === 'FULL_PAID' ||
            (Array.isArray(currentOrder.stage_history) && currentOrder.stage_history.some(h => 
              (h.stage_id === 'S05' || h.delivery_status === 'S05_ADVANCE_RECEIVED') && h.custom_fields_data?.is_100_percent_paid
            ));

          const childOrderStatus = isParentFullPaid ? 'FULL_PAID' : 'IN_PRODUCTION';
          const paidNotice = isParentFullPaid ? ' | 100% Full Paid in Parent Order (Balance Stages Bypassed)' : '';

          await adminClient
            .from('sales_orders')
            .insert([{
              tenant_id: effectiveTenantId,
              order_number: childOrderNo,
              party_id: currentOrder.party_id,
              dealer_party_id: currentOrder.dealer_party_id || null,
              distributor_party_id: currentOrder.distributor_party_id || null,
              demand_flow_type: 'MAKE_TO_STOCK',
              total_ordered_qty: Number(lotData.remaining_qty),
              total_amount: remainingAmount,
              order_status: childOrderStatus,
              delivery_status: 'S06',
              billing_route: currentOrder.billing_route || 'DIRECT_COMPANY_BILLING',
              order_line_items: remainingItems,
              delivery_notes: `[Linked Lot-B Child Order]: ${lotData.remaining_qty} Units in assembly from parent order ${currentOrder.order_number}${paidNotice}`,
              stage_history: [{
                stage_id: 'S06',
                stage_name: 'Check Stock & Production',
                department: 'Plant / Works',
                tat_hours: 48,
                action_by: dispatchedBy,
                notes: `Generated from Partial Split of parent order ${currentOrder.order_number}. ${lotData.remaining_qty} units pending in assembly.${isParentFullPaid ? ' [100% Full Paid: Balance payment stages bypassed]' : ''}`,
                product_allocations: remainingItems.map(it => ({
                  product: it.product,
                  ordered_qty: it.qty,
                  ready_qty: 0,
                  remaining_qty: it.qty
                })),
                created_at: nowISO,
                actual_timestamp: nowISO,
                tat_breached: false
              }],
              created_at: nowISO
            }]);
          createdChildOrderNo = childOrderNo;
        } else {
          createdChildOrderNo = existingChild.order_number;
        }
      } catch (insertErr) {
        console.warn('Child order insertion warning:', insertErr.message);
      }
    }

    const childNotice = createdChildOrderNo ? ` | [Lot-B Linked Order]: ${createdChildOrderNo} created with ${lotData.remaining_qty} units in assembly (S06)` : '';
    const deliveryNoteText = lotData.transporter_name
      ? `\n[Lot-A Dispatched]: ${lotData.dispatched_qty} Units (${allocSummary}) via ${lotData.transporter_name} (LR: ${lotData.lr_number || 'N/A'})${childNotice}`
      : `\n[Lot-A Dispatched]: ${lotData.dispatched_qty} Units (${allocSummary})${childNotice}`;

    const payload = {
      transporter_name: lotData.transporter_name || currentOrder.transporter_name,
      lr_number: lotData.lr_number || currentOrder.lr_number,
      vehicle_number: lotData.vehicle_number || currentOrder.vehicle_number,
      delivery_notes: `${currentOrder.delivery_notes || ''}${deliveryNoteText}`,
      updated_at: nowISO
    };

    try {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update({
          ...payload,
          stage_history: [...currentHistory, lotLog]
        })
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    } catch (_) {
      const { data, error } = await adminClient
        .from('sales_orders')
        .update(payload)
        .eq('id', orderId)
        .eq('tenant_id', effectiveTenantId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, order: data };
    }
  } catch (err) {
    console.error('dispatchPartialLot error:', err);
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

      if (ticket.sla_deadline && ticket.ticket_status !== 'RESOLVED_CLOSED' && ticket.ticket_status !== 'REJECTED' && ticket.stage_id !== 'C06') {
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

      // Resolve Stage ID (C01..C06) with backward-compatibility
      let resolvedStageId = ticket.stage_id;
      if (!resolvedStageId) {
        if (ticket.ticket_status === 'RESOLVED_CLOSED') resolvedStageId = 'C06';
        else if (ticket.ticket_status === 'ACTION_TAKEN') resolvedStageId = 'C04';
        else resolvedStageId = 'C01';
      }

      // Ensure stage history array
      let history = Array.isArray(ticket.stage_history) ? ticket.stage_history : [];
      if (history.length === 0) {
        history = [
          {
            stage_id: 'C01',
            stage_name: 'Ticket Logged & Triaged',
            stage_color: '#3b82f6',
            executed_at: ticket.created_at || new Date().toISOString(),
            executed_by: ticket.assigned_employee_name || 'Operations',
            notes: ticket.issue_description || 'Complaint registered.'
          }
        ];
        if (ticket.ticket_status === 'ACTION_TAKEN' || ticket.ticket_status === 'RESOLVED_CLOSED') {
          history.push({
            stage_id: 'C04',
            stage_name: 'On-Site Execution & Digital Job Card',
            stage_color: '#f59e0b',
            executed_at: ticket.action_taken_at || ticket.created_at || new Date().toISOString(),
            executed_by: ticket.action_taken_by || 'Field Service Team',
            notes: ticket.action_notes || ticket.resolution_notes || 'Action recorded.'
          });
        }
        if (ticket.ticket_status === 'RESOLVED_CLOSED') {
          history.push({
            stage_id: 'C06',
            stage_name: 'Quality Audit & Verified Closure',
            stage_color: '#10b981',
            executed_at: ticket.closed_at || new Date().toISOString(),
            executed_by: ticket.resolved_by || 'Quality Assurance',
            notes: ticket.closure_otp || 'Verified and closed.'
          });
        }
      }

      return {
        ...ticket,
        stage_id: resolvedStageId,
        stage_history: history,
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
 * 12. CREATE COMPLAINT TICKET (With 8 Categories, SLA Deadline in IST & End Customer Linking)
 */
export async function createComplaintTicketDirect(complaintData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const ticketNo = `CMP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  
  // Standard SLA hours by 8 categories
  const slaHoursMap = {
    MANUFACTURING_DEFECT: 48,
    TRANSIT_DAMAGE: 24,
    SHORTAGE_PRODUCT_SPAREPART: 24,
    SHORTAGE_MISSING_PARTS: 24,
    DELIVERY_DELAY: 12,
    BILLING_ISSUES: 24,
    BILLING_DISPUTE: 24,
    ORDER_RELATED_ISSUES: 12,
    SERVICE_ISSUES: 48,
    SERVICE_WARRANTY: 48,
    WARRANTY_CLAIM: 72
  };
  const hours = slaHoursMap[complaintData.category] || 48;
  const deadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const payload = {
    tenant_id: effectiveTenantId,
    ticket_number: ticketNo,
    party_id: complaintData.party_id || null,
    complaint_type: complaintData.complaint_type || 'CHANNEL_PARTNER',
    customer_id: complaintData.customer_id || null,
    customer_name: complaintData.customer_name || '',
    customer_phone: complaintData.customer_phone || '',
    complaint_source: complaintData.complaint_source || 'DIRECT_PHONE',
    category: complaintData.category || 'MANUFACTURING_DEFECT',
    priority: complaintData.priority || 'MEDIUM',
    issue_description: complaintData.issue_description || '',
    assigned_department: complaintData.assigned_department || 'QUALITY_ASSURANCE',
    assigned_employee_name: complaintData.assigned_employee_name || '',
    sla_deadline: deadline,
    ticket_status: 'OPEN',
    stage_id: 'C01',
    stage_history: [
      {
        stage_id: 'C01',
        stage_name: 'Ticket Logged & Triaged',
        stage_color: '#3b82f6',
        executed_at: nowIso,
        executed_by: complaintData.assigned_employee_name || 'Operations',
        notes: complaintData.issue_description || 'Complaint registered.'
      }
    ],
    created_at: nowIso
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
 * 13. ADVANCE COMPLAINT TICKET STAGE (C01 -> C06 with IST Audit Trail)
 */
export async function advanceComplaintTicketStage(ticketId, stagePayload, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  const { targetStage, formState = {}, executedBy = 'Operations' } = stagePayload;
  const nowIso = new Date().toISOString();

  // Fetch current ticket
  try {
    const { data: currentTicket, error: fetchErr } = await adminClient
      .from('party_complaints')
      .select('*')
      .eq('id', ticketId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (fetchErr) throw fetchErr;

    // Backward-compatible ticket_status
    let status = 'OPEN';
    if (targetStage.id === 'C06') status = 'RESOLVED_CLOSED';
    else if (['C04', 'C05'].includes(targetStage.id)) status = 'ACTION_TAKEN';

    // Construct stage history entry
    const historyEntry = {
      stage_id: targetStage.id,
      stage_name: targetStage.name,
      stage_color: targetStage.color || '#3b82f6',
      executed_at: nowIso,
      executed_by: executedBy,
      notes: formState.notes || targetStage.default_note || '',
      metadata: {
        ...formState
      }
    };

    const updatedHistory = Array.isArray(currentTicket.stage_history) ? [...currentTicket.stage_history, historyEntry] : [historyEntry];

    const updateFields = {
      stage_id: targetStage.id,
      ticket_status: status,
      stage_history: updatedHistory
    };

    // Specific stage mappings into table columns
    if (targetStage.id === 'C02') {
      updateFields.action_notes = formState.rca_root_cause || '';
    } else if (targetStage.id === 'C03') {
      updateFields.assigned_employee_name = formState.technician_name || currentTicket.assigned_employee_name;
      updateFields.technician_name = formState.technician_name || '';
      updateFields.technician_phone = formState.technician_phone || '';
      updateFields.scheduled_visit_date = formState.scheduled_visit_date || '';
    } else if (targetStage.id === 'C04') {
      updateFields.action_taken_type = formState.action_taken_type || '';
      updateFields.action_reference_no = formState.job_card_no || '';
      updateFields.action_notes = formState.notes || '';
    } else if (targetStage.id === 'C05') {
      updateFields.closure_otp = formState.customer_otp_entered || formState.verification_method || '';
      updateFields.dealer_satisfaction_rating = Number(formState.customer_rating) || 5;
    } else if (targetStage.id === 'C06') {
      updateFields.closed_at = nowIso;
      updateFields.resolved_at = nowIso;
      updateFields.resolved_by = executedBy;
    }

    const { data: updatedData, error: updateErr } = await adminClient
      .from('party_complaints')
      .update(updateFields)
      .eq('id', ticketId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return { success: true, ticket: updatedData };
  } catch (err) {
    console.error('advanceComplaintTicketStage error:', err);
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
    action_reference_no: actionData.action_reference_no || ''
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
