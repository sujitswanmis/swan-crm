'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { logAuditAction } from '@/app/actions/audit';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Calculates straight-line distance in meters between two lat/long points using Haversine formula
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

/**
 * Create a new Field Visit Task (from Lead Table, Party Master, or Telecaller Desk)
 */
export async function createFieldTask(taskPayload) {
  const supabase = getAdminClient();
  try {
    const {
      company = 'TNT00001',
      branch_code = null,
      tenant_id = null,
      form_id = null,
      task_type = 'Lead Data Pipeline',
      customer_id = null,
      lead_id = null,
      party_name,
      party_phone = '',
      party_address = '',
      party_lat = null,
      party_lng = null,
      assigned_by_user_id = null,
      assigned_to_user_id,
      priority = 'MEDIUM',
      scheduled_start_time,
      scheduled_end_time = null,
      form_details = {},
      additional_fields = []
    } = taskPayload;

    if (!party_name || !assigned_to_user_id) {
      return { success: false, error: 'Party Name and Assigned Field Person are required.' };
    }

    const { data, error } = await supabase
      .from('field_tasks')
      .insert({
        company,
        branch_code,
        tenant_id,
        form_id,
        task_type,
        customer_id,
        lead_id,
        party_name,
        party_phone,
        party_address,
        party_lat,
        party_lng,
        assigned_by_user_id,
        assigned_to_user_id,
        priority,
        scheduled_start_time: scheduled_start_time || new Date().toISOString(),
        scheduled_end_time,
        status: 'SCHEDULED',
        form_details,
        additional_fields
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating field task:', error);
      return { success: false, error: error.message };
    }

    await logAuditAction('Field Task Created', `Task ${data.task_code} assigned to user ${assigned_to_user_id} for party "${party_name}"`);

    return { success: true, task: data };
  } catch (err) {
    console.error('Field task creation exception:', err);
    return { success: false, error: err.message || 'Server error' };
  }
}

/**
 * Fetch field tasks for a field person (e.g. today's scheduled tasks)
 */
export async function getFieldTasksForUser(userId, options = {}) {
  const supabase = getAdminClient();
  try {
    let query = supabase
      .from('field_tasks')
      .select(`
        *,
        form:tenant_custom_forms(title, form_code, fields)
      `)
      .eq('assigned_to_user_id', userId)
      .order('scheduled_start_time', { ascending: true });

    if (options.status) {
      query = query.eq('status', options.status);
    } else {
      // By default, fetch all active non-completed tasks
      query = query.in('status', ['PENDING', 'SCHEDULED', 'IN_PROGRESS']);
    }
    if (options.date) {
      const startOfDay = `${options.date}T00:00:00.000+05:30`;
      const endOfDay = `${options.date}T23:59:59.999+05:30`;
      query = query.gte('scheduled_start_time', startOfDay).lte('scheduled_start_time', endOfDay);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching field tasks for user:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error in getFieldTasksForUser:', err);
    return [];
  }
}

/**
 * Fetch field tasks and submissions for a specific Lead
 */
export async function getFieldHistoryForLead(leadId) {
  if (!leadId) return [];
  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from('field_form_submissions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lead field history:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error in getFieldHistoryForLead:', err);
    return [];
  }
}

/**
 * Check if the user has punched in for today in Indian Standard Time (Asia/Kolkata)
 */
export async function getTodayUserAttendanceStatus(userId, userEmail = '') {
  if (!userId && !userEmail) return { isPunchedIn: false, isPunchedOut: false };
  const supabase = getAdminClient();
  try {
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    let query = supabase
      .from('attendance_records')
      .select('id, in_time, out_time, status')
      .eq('attendance_date', todayIST);

    if (userId && userEmail) {
      query = query.or(`user_id.eq.${userId},email.ilike.${userEmail.trim().toLowerCase()}`);
    } else if (userId) {
      query = query.eq('user_id', userId);
    } else if (userEmail) {
      query = query.ilike('email', userEmail.trim().toLowerCase());
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return { isPunchedIn: false, isPunchedOut: false, record: null, todayIST };
    }

    return {
      isPunchedIn: Boolean(data.in_time),
      isPunchedOut: Boolean(data.out_time),
      inTime: data.in_time,
      outTime: data.out_time,
      status: data.status,
      todayIST
    };
  } catch (err) {
    console.error('Error in getTodayUserAttendanceStatus:', err);
    return { isPunchedIn: false, isPunchedOut: false, error: err.message };
  }
}

/**
 * Check-In: Triggered when field person arrives at party or initiates interaction
 */
export async function performCheckIn(payload) {
  const supabase = getAdminClient();
  try {
    const {
      taskId = null,
      company = 'TNT00001',
      branch_code = null,
      field_user_id,
      user_email = null,
      customer_id = null,
      lead_id = null,
      party_name,
      party_lat = null,
      party_lng = null,
      check_in_lat = null,
      check_in_lng = null,
      connectivity_mode = 'PHYSICAL_VISIT', // 'PHYSICAL_VISIT', 'TELEPHONIC_CALL', 'WHATSAPP_CHAT', 'EMAIL_QUOTE'
      pipeline_type = 'LEAD_DATA',
      form_data = {}
    } = payload;

    // 0. Strict Attendance Punch-In Enforcement (IST Asia/Kolkata)
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    if (field_user_id) {
      let attQuery = supabase
        .from('attendance_records')
        .select('id, in_time, out_time, status')
        .eq('attendance_date', todayIST);

      if (user_email) {
        attQuery = attQuery.or(`user_id.eq.${field_user_id},email.ilike.${user_email.trim().toLowerCase()}`);
      } else {
        attQuery = attQuery.eq('user_id', field_user_id);
      }

      const { data: attRecord } = await attQuery.maybeSingle();

      if (!attRecord || !attRecord.in_time) {
        return {
          success: false,
          error: 'Attendance Not Punched! Aapne aaj ki attendance punch-in nahi ki hai. Field visit check-in karne se pehle Smart Attendance me punch-in karein.',
          requires_attendance: true
        };
      }

      if (attRecord.out_time) {
        return {
          success: false,
          error: 'Shift Ended! Aap aaj ka punch-out kar chuke hain. Shift khatam hone ke baad field visit check-in allowed nahi hai.',
          already_punched_out: true
        };
      }
    }

    // Evaluate Geofence Distance (Audit)
    let distanceFromPartyMeters = null;
    let isGeofenceVerified = false;
    let isGeofenceFlagged = false;
    let geofenceFlagReason = null;

    if (connectivity_mode === 'PHYSICAL_VISIT') {
      if (party_lat && party_lng && check_in_lat && check_in_lng) {
        distanceFromPartyMeters = calculateDistanceMeters(party_lat, party_lng, check_in_lat, check_in_lng);
        if (distanceFromPartyMeters !== null) {
          if (distanceFromPartyMeters <= 200) {
            isGeofenceVerified = true;
          } else {
            isGeofenceFlagged = true;
            geofenceFlagReason = `Checked-in ${Math.round(distanceFromPartyMeters)}m away from client location (>200m limit)`;
          }
        }
      }
    } else {
      // Telephonic / WhatsApp does not require physical geofence
      isGeofenceVerified = true;
    }

    const checkInTime = new Date().toISOString();
    let effectiveTaskId = taskId;

    // If taskId is provided, update existing task status
    if (taskId) {
      await supabase
        .from('field_tasks')
        .update({
          status: 'IN_PROGRESS',
          actual_start_time: checkInTime,
          updated_at: checkInTime
        })
        .eq('id', taskId);
    } else {
      // Ad-hoc visit: create in-progress task in field_tasks so it can be recovered across page reloads
      const { data: newTask } = await supabase
        .from('field_tasks')
        .insert({
          company,
          branch_code,
          task_type: pipeline_type || 'Ad-Hoc Visit',
          party_name,
          party_lat,
          party_lng,
          customer_id,
          lead_id,
          assigned_to_user_id: field_user_id,
          status: 'IN_PROGRESS',
          scheduled_start_time: checkInTime,
          actual_start_time: checkInTime
        })
        .select()
        .single();

      if (newTask) {
        effectiveTaskId = newTask.id;
      }
    }

    return {
      success: true,
      task_id: effectiveTaskId,
      check_in_time: checkInTime,
      is_geofence_verified: isGeofenceVerified,
      is_geofence_flagged: isGeofenceFlagged,
      distance_from_party_meters: distanceFromPartyMeters,
      geofence_flag_reason: geofenceFlagReason
    };
  } catch (err) {
    console.error('Error during check-in:', err);
    return { success: false, error: err.message || 'Check-in failed' };
  }
}

/**
 * Retrieve any active IN_PROGRESS visit for a field executive to ensure 100% session persistence
 */
export async function getActiveFieldVisit(userId, company = 'TNT00001') {
  const supabase = getAdminClient();
  try {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('field_tasks')
      .select('*')
      .eq('assigned_to_user_id', userId)
      .eq('status', 'IN_PROGRESS')
      .order('actual_start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch (err) {
    console.error('getActiveFieldVisit error:', err);
    return null;
  }
}

/**
 * Check-Out: Submits final visit output, updates CRM pipeline stages, and stores photos/signatures
 */
export async function performCheckOutWithOutput(payload) {
  const supabase = getAdminClient();
  try {
    const {
      taskId = null,
      company = 'TNT00001',
      branch_code = null,
      tenant_id = null,
      field_user_id,
      customer_id = null,
      lead_id = null,
      party_name,
      connectivity_mode = 'PHYSICAL_VISIT',
      is_geofence_verified = false,
      distance_from_party_meters = null,
      is_geofence_flagged = false,
      geofence_flag_reason = null,
      check_in_time,
      check_in_lat = null,
      check_in_lng = null,
      check_out_lat = null,
      check_out_lng = null,
      pipeline_type = 'LEAD_DATA',
      lead_stage_updated = null,
      order_pipeline_stage = null,
      complaint_ticket_stage = null,
      outcome_status = 'COMPLETED',
      work_outcome = 'WORK_DONE',
      order_value = 0,
      payment_collected = 0,
      payment_mode = null,
      cheque_utr_no = null,
      form_data = {},
      photo_watermark_urls = [],
      customer_signature_url = null,
      discussion_notes = '',
      next_followup_at = null
    } = payload;

    const checkOutTime = new Date().toISOString();
    let durationMinutes = 0;
    if (check_in_time) {
      const diffMs = new Date(checkOutTime) - new Date(check_in_time);
      durationMinutes = Math.max(1, Math.round(diffMs / 60000));
    }

    // 1. Insert into field_form_submissions
    const { data: submission, error: subError } = await supabase
      .from('field_form_submissions')
      .insert({
        task_id: taskId,
        company,
        branch_code,
        tenant_id,
        field_user_id,
        customer_id,
        lead_id,
        party_name,
        connectivity_mode,
        is_geofence_verified,
        distance_from_party_meters,
        is_geofence_flagged,
        geofence_flag_reason,
        check_in_time: check_in_time || checkOutTime,
        check_in_lat,
        check_in_lng,
        check_out_time: checkOutTime,
        check_out_lat,
        check_out_lng,
        duration_minutes: durationMinutes,
        pipeline_type,
        lead_stage_updated,
        order_pipeline_stage,
        complaint_ticket_stage,
        outcome_status,
        order_value: Number(order_value || 0),
        payment_collected: Number(payment_collected || 0),
        payment_mode,
        cheque_utr_no,
        form_data,
        photo_watermark_urls: Array.isArray(photo_watermark_urls) ? photo_watermark_urls : [],
        customer_signature_url,
        discussion_notes,
        next_followup_at
      })
      .select()
      .single();

    if (subError) {
      console.error('Error inserting field form submission:', subError);
      return { success: false, error: subError.message };
    }

    // 2. Update field_task status (Completed or Rescheduled for incomplete work)
    let complaintTicketId = null;
    if (taskId) {
      const { data: existingTask } = await supabase
        .from('field_tasks')
        .select('id, form_details')
        .eq('id', taskId)
        .maybeSingle();

      if (existingTask?.form_details?.ticket_id) {
        complaintTicketId = existingTask.form_details.ticket_id;
      }

      if (work_outcome === 'WORK_INCOMPLETE') {
        // Task remains active for the next scheduled visit
        await supabase
          .from('field_tasks')
          .update({
            status: 'SCHEDULED',
            scheduled_start_time: next_followup_at || checkOutTime,
            updated_at: checkOutTime,
            notes: `Previous visit completed on ${checkOutTime}. Follow-up scheduled: ${discussion_notes || ''}`
          })
          .eq('id', taskId);
      } else {
        await supabase
          .from('field_tasks')
          .update({
            status: 'COMPLETED',
            actual_end_time: checkOutTime,
            updated_at: checkOutTime
          })
          .eq('id', taskId);
      }
    }

    // 2.1 Sequential Complaint Ticket Progression (C04 Job Card -> C05 Sign-off)
    if (complaintTicketId) {
      try {
        const { data: ticket } = await supabase
          .from('party_complaints')
          .select('*')
          .eq('id', complaintTicketId)
          .single();

        if (ticket) {
          if (work_outcome === 'WORK_INCOMPLETE') {
            // Incomplete on-site visit: stays at C04 (In Progress), scheduled for next visit
            const historyEntry = {
              stage_id: 'C04',
              stage_name: 'On-Site Execution & Digital Job Card',
              stage_color: '#f59e0b',
              executed_at: checkOutTime,
              executed_by: 'Field Service Engineer',
              notes: `[Work Incomplete / Follow-up Needed] ${discussion_notes || 'Visit executed, follow-up required.'}. Next visit scheduled: ${next_followup_at || 'Pending'}`,
              metadata: {
                work_status: 'INCOMPLETE',
                next_followup_at,
                job_card_no: cheque_utr_no || `JC-${Math.floor(1000 + Math.random() * 9000)}`,
                photos: photo_watermark_urls,
                customer_signature_url,
                duration_minutes: durationMinutes,
                check_in_time,
                check_out_time: checkOutTime
              }
            };

            const updatedHistory = Array.isArray(ticket.stage_history) ? [...ticket.stage_history, historyEntry] : [historyEntry];

            await supabase
              .from('party_complaints')
              .update({
                stage_id: 'C04',
                ticket_status: 'IN_PROGRESS',
                action_taken_type: 'On-Site Visit Done (Incomplete - Follow-up Scheduled)',
                action_notes: discussion_notes || 'On-site visit executed, work incomplete.',
                scheduled_visit_date: next_followup_at,
                stage_history: updatedHistory,
                updated_at: checkOutTime
              })
              .eq('id', complaintTicketId);
          } else {
            // Work Completed! Advance C04 (Job Card) and C05 (Customer Sign-off captured)
            const c04Entry = {
              stage_id: 'C04',
              stage_name: 'On-Site Execution & Digital Job Card',
              stage_color: '#06b6d4',
              executed_at: checkOutTime,
              executed_by: 'Field Service Engineer',
              notes: discussion_notes || 'On-site execution completed successfully by field service engineer.',
              metadata: {
                work_status: 'COMPLETED',
                job_card_no: cheque_utr_no || `JC-${Math.floor(1000 + Math.random() * 9000)}`,
                photos: photo_watermark_urls,
                duration_minutes: durationMinutes,
                check_in_time,
                check_out_time: checkOutTime
              }
            };

            const c05Entry = {
              stage_id: 'C05',
              stage_name: 'Customer OTP Verification & Sign-off',
              stage_color: '#10b981',
              executed_at: checkOutTime,
              executed_by: 'Customer / Field Engineer',
              notes: 'Customer digital signature captured on-site upon work completion.',
              metadata: {
                customer_signature_url,
                verified_at: checkOutTime
              }
            };

            const updatedHistory = Array.isArray(ticket.stage_history)
              ? [...ticket.stage_history, c04Entry, c05Entry]
              : [c04Entry, c05Entry];

            await supabase
              .from('party_complaints')
              .update({
                stage_id: 'C05', // Advanced to C05! Ready for Service Manager / QA to do C06 Closure.
                ticket_status: 'ACTION_TAKEN',
                action_taken_type: 'On-Site Visit & Job Card Completed (Sign-off captured)',
                action_reference_no: cheque_utr_no || `JC-${Math.floor(1000 + Math.random() * 9000)}`,
                action_notes: discussion_notes || 'On-site execution completed.',
                closure_otp: customer_signature_url ? 'DIGITAL_SIGNATURE_VERIFIED' : 'ON_SITE_VERIFIED',
                stage_history: updatedHistory,
                updated_at: checkOutTime
              })
              .eq('id', complaintTicketId);
          }
        }
      } catch (compErr) {
        console.error('Failed to auto-update complaint ticket on checkout:', compErr);
      }
    }

    // 3. Auto-Sync CRM Pipeline Stage & Follow-up Date:
    // If Lead ID is provided
    if (lead_id) {
      const updateData = {
        updated_at: checkOutTime
      };
      if (lead_stage_updated) {
        updateData.status = lead_stage_updated;
      }
      if (next_followup_at) {
        updateData.follow_up_date = next_followup_at;
      }

      await supabase
        .from('leads')
        .update(updateData)
        .eq('id', lead_id);

      // Log note in lead_notes
      try {
        await supabase
          .from('lead_notes')
          .insert({
            lead_id,
            note: `[Field Visit - ${connectivity_mode}] Stage updated to "${lead_stage_updated || 'Updated'}". Outcome: ${outcome_status}.${next_followup_at ? ` Next Follow-up: ${next_followup_at}` : ''} Notes: ${discussion_notes || 'No notes'}`
          });
      } catch (_) {}
    }

    await logAuditAction(
      'Field Visit Completed',
      `Visit for "${party_name}" completed via ${connectivity_mode} (Duration: ${durationMinutes} mins). Outcome: ${outcome_status}`
    );

    return { success: true, submission };
  } catch (err) {
    console.error('Error during check-out:', err);
    return { success: false, error: err.message || 'Check-out submission failed' };
  }
}

/**
 * Fast search of existing CRM entities (Leads, Parties, Orders) for 1-click Field Check-In
 */
export async function getModuleEntitiesForCheckIn({ company = 'TNT00001', moduleType = 'LEAD_DATA', search = '', limit = 40 } = {}) {
  const supabase = getAdminClient();
  try {
    const trimmed = (search || '').trim();

    if (moduleType === 'LEAD_DATA') {
      let query = supabase
        .from('leads')
        .select('id, name, company, phone, status, address, city_name, district_name, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (trimmed) {
        query = query.or(`company.ilike.%${trimmed}%,name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,city_name.ilike.%${trimmed}%,district_name.ilike.%${trimmed}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching leads for check-in:', error);
        return [];
      }

      return (data || []).map(l => ({
        id: l.id,
        lead_id: l.id,
        party_name: l.company || l.name || 'Unnamed Lead',
        party_phone: l.phone || '',
        party_address: [l.address, l.city_name, l.district_name].filter(Boolean).join(', ') || 'Address not specified',
        current_stage: l.status || '01 - New Lead',
        party_lat: null,
        party_lng: null,
        module_source: 'LEAD_DATA'
      }));
    }

    if (moduleType === 'PARTY_MASTER') {
      let query = supabase
        .from('party_master')
        .select('id, firm_name, legal_name, trade_name, primary_mobile, party_status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (trimmed) {
        query = query.or(`firm_name.ilike.%${trimmed}%,legal_name.ilike.%${trimmed}%,trade_name.ilike.%${trimmed}%,primary_mobile.ilike.%${trimmed}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching party_master for check-in:', error);
        return [];
      }

      return (data || []).map(p => ({
        id: p.id,
        customer_id: p.id,
        party_name: p.firm_name || p.legal_name || p.trade_name || 'Unnamed Party',
        party_phone: p.primary_mobile || '',
        party_address: 'Registered Party Customer',
        current_stage: p.party_status || 'Existing Customer',
        party_lat: null,
        party_lng: null,
        module_source: 'PARTY_MASTER'
      }));
    }

    // Default: Check assigned field tasks
    let taskQuery = supabase
      .from('field_tasks')
      .select('*')
      .eq('company', company)
      .in('status', ['PENDING', 'SCHEDULED', 'IN_PROGRESS'])
      .order('scheduled_start_time', { ascending: true })
      .limit(limit);

    if (trimmed) {
      taskQuery = taskQuery.or(`party_name.ilike.%${trimmed}%,party_phone.ilike.%${trimmed}%`);
    }

    const { data: tasks, error: tErr } = await taskQuery;
    if (tErr) return [];

    return (tasks || []).map(t => ({
      id: t.id,
      task_id: t.id,
      lead_id: t.lead_id,
      customer_id: t.customer_id,
      party_name: t.party_name,
      party_phone: t.party_phone || '',
      party_address: t.party_address || '',
      current_stage: t.task_type || 'Assigned Task',
      party_lat: t.party_lat,
      party_lng: t.party_lng,
      module_source: 'FIELD_TASK'
    }));
  } catch (err) {
    console.error('getModuleEntitiesForCheckIn error:', err);
    return [];
  }
}

/**
 * Fetch all completed visits for an executive today (Strict IST Asia/Kolkata timezone)
 */
export async function getUserCompletedVisitsToday(userId, company = 'TNT00001', dateStr = null) {
  if (!userId) return [];
  const supabase = getAdminClient();
  try {
    const today = dateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const startOfDay = `${today}T00:00:00.000+05:30`;
    const endOfDay = `${today}T23:59:59.999+05:30`;

    const { data, error } = await supabase
      .from('field_form_submissions')
      .select('*')
      .eq('field_user_id', userId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user completed visits today:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('getUserCompletedVisitsToday error:', err);
    return [];
  }
}
