'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { logAuditAction } from '@/app/actions/audit';
import { resolveDbTenantUuid } from '@/app/actions/partyMaster';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => Boolean(val && UUID_REGEX.test(String(val).trim()));

const SWAN_OUR_COMPANIES = ['NSMLR', 'NSTLP', 'NSTL', 'New Swan Group', 'Swan Agro', 'NSE-1', 'NSE-2', 'NSE-6', 'NSCPL', 'NSACPL', ''];
const SWAN_COMPANY_MATCHERS = new Set(['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl', 'tnt00001']);
const PLACEHOLDER_VALUES = new Set(['', 'n/a', 'na', 'null', 'undefined', 'none', '-', '--']);
const VALID_TASK_PRIORITIES = new Set(['CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW']);
const VALID_EDITABLE_TASK_STATUSES = new Set(['SCHEDULED', 'PENDING', 'IN_PROGRESS', 'CANCELLED']);
const ACTIVE_TASK_STATUSES = new Set(['SCHEDULED', 'PENDING', 'IN_PROGRESS', 'IN_TRANSIT']);
const ADMIN_ROLE_SET = new Set(['admin', 'superadmin', 'super_admin', 'masteradmin', 'master_admin', 'tenant_admin']);

function cleanFieldText(value) {
  const str = String(value ?? '').trim();
  return PLACEHOLDER_VALUES.has(str.toLowerCase()) ? '' : str;
}

function dedupeAddressParts(parts = []) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const clean = cleanFieldText(part);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.join(', ');
}

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
 * Check whether a Supabase error is a duplicate key violation on field_tasks.task_code
 */
function isTaskCodeDuplicateError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  return (
    msg.includes('field_tasks_task_code_key') ||
    (code === '23505' && (msg.includes('task_code') || details.includes('task_code')))
  );
}

/**
 * Format a 6-digit zero-padded Field Code (e.g. TSK-000001 or CHK-000001)
 */
function formatFieldCode(prefix = 'TSK', num = 1) {
  const cleanPrefix = String(prefix || 'TSK').trim().toUpperCase();
  const safeNum = Math.max(1, Number.parseInt(num, 10) || 1);
  return `${cleanPrefix}-${String(safeNum).padStart(6, '0')}`;
}

/**
 * Determine the next sequential 6-digit numeric code for a prefix ('TSK' or 'CHK')
 * Note: Only considers 6+ digit padded series (^PREFIX-\d{6,}$) so legacy 5-digit TSK-10001 rows stay safe without shifting TSK-000001.
 */
async function getNextFieldCodeNumber(supabase, prefix = 'TSK') {
  const cleanPrefix = String(prefix || 'TSK').trim().toUpperCase();
  const pattern = new RegExp(`^${cleanPrefix}-(\\d{6,})$`, 'i');
  let maxNumeric = 0;
  try {
    const { data } = await supabase
      .from('field_tasks')
      .select('task_code')
      .ilike('task_code', `${cleanPrefix}-%`)
      .order('created_at', { ascending: false })
      .limit(1000);

    for (const row of data || []) {
      const match = String(row?.task_code || '').trim().match(pattern);
      if (!match) continue;
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNumeric && num < 999999999) {
        maxNumeric = num;
      }
    }
  } catch (err) {
    console.warn(`Could not inspect existing ${cleanPrefix}- task_code values:`, err?.message || err);
  }
  return maxNumeric + 1;
}

/**
 * Insert a field_tasks row with collision-safe code generation (TSK-000001 for assigned tasks, CHK-000001 for self check-ins)
 */
async function insertFieldTaskWithUniqueCode(supabase, taskRow, prefix = 'TSK') {
  const cleanPrefix = String(prefix || 'TSK').trim().toUpperCase();
  let candidateNum = await getNextFieldCodeNumber(supabase, cleanPrefix);
  let lastResult = { data: null, error: null };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidateCode = attempt === 0 && taskRow.task_code
      ? taskRow.task_code
      : attempt < 4
        ? formatFieldCode(cleanPrefix, candidateNum)
        : `${formatFieldCode(cleanPrefix, candidateNum)}-${Math.floor(100 + Math.random() * 900)}`;

    const { data, error } = await supabase
      .from('field_tasks')
      .insert({ ...taskRow, task_code: candidateCode })
      .select()
      .single();

    if (!error) {
      return { data, error: null };
    }

    lastResult = { data, error };
    if (!isTaskCodeDuplicateError(error)) {
      return lastResult;
    }

    candidateNum = Math.max(candidateNum + 1, await getNextFieldCodeNumber(supabase, cleanPrefix));
  }

  return lastResult;
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

    const { data, error } = await insertFieldTaskWithUniqueCode(supabase, {
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
    });

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
  if (!isUuid(userId)) return [];
  const cleanUserId = String(userId).trim();
  const supabase = getAdminClient();
  try {
    let query = supabase
      .from('field_tasks')
      .select(`
        *,
        form:tenant_custom_forms(title, form_code, fields)
      `)
      .eq('assigned_to_user_id', cleanUserId)
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
 * Resolve human-readable employee names from user_roles for a list of user UUIDs
 */
async function resolveUserNameMap(supabase, rawIds = []) {
  const userIds = Array.from(new Set(
    (rawIds || []).filter(id => isUuid(id)).map(id => String(id).trim())
  ));
  const userNameMap = new Map();
  if (userIds.length === 0) return userNameMap;

  const { data: users } = await supabase
    .from('user_roles')
    .select('user_id, emp_name, email')
    .in('user_id', userIds);

  for (const u of users || []) {
    if (u?.user_id) {
      userNameMap.set(u.user_id, u.emp_name || u.email || 'Team Member');
    }
  }
  return userNameMap;
}

/**
 * Fetch field tasks and submissions for a specific Lead
 */
export async function getFieldHistoryForLead(leadId) {
  if (!leadId) return [];
  const supabase = getAdminClient();
  try {
    const [submissionsRes, tasksRes] = await Promise.all([
      supabase
        .from('field_form_submissions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('field_tasks')
        .select('id, task_code, task_type, status, priority, scheduled_start_time, actual_start_time, assigned_to_user_id, assigned_by_user_id, form_details, created_at, updated_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
    ]);

    if (submissionsRes.error) {
      console.error('Error fetching lead field submissions:', submissionsRes.error);
    }
    if (tasksRes.error) {
      console.error('Error fetching lead field tasks:', tasksRes.error);
    }

    const submissions = submissionsRes.data || [];
    const tasks = tasksRes.data || [];

    const userNameMap = await resolveUserNameMap(supabase, [
      ...tasks.map(t => t.assigned_to_user_id),
      ...tasks.map(t => t.assigned_by_user_id),
      ...submissions.map(s => s.field_user_id)
    ]);

    const taskById = new Map(tasks.map(t => [t.id, t]));
    const submittedTaskIds = new Set(submissions.map(s => s.task_id).filter(Boolean));

    const formattedSubmissions = submissions.map(s => {
      const linkedTask = s.task_id ? taskById.get(s.task_id) : null;
      return {
        ...s,
        entry_type: 'SUBMISSION',
        task_code: linkedTask?.task_code || null,
        task_type: linkedTask?.task_type || null,
        field_user_name: s.field_user_id ? (userNameMap.get(s.field_user_id) || null) : null
      };
    });

    const formattedPendingTasks = tasks
      .filter(t => !submittedTaskIds.has(t.id))
      .map(t => ({
        ...t,
        entry_type: 'TASK',
        assigned_to_name: t.assigned_to_user_id ? (userNameMap.get(t.assigned_to_user_id) || null) : null,
        assigned_by_name: t.assigned_by_user_id ? (userNameMap.get(t.assigned_by_user_id) || null) : null
      }));

    return [...formattedPendingTasks, ...formattedSubmissions].sort(
      (a, b) => new Date(b.created_at || b.scheduled_start_time || 0) - new Date(a.created_at || a.scheduled_start_time || 0)
    );
  } catch (err) {
    console.error('Error in getFieldHistoryForLead:', err);
    return [];
  }
}

/**
 * Fetch latest Field Person assignment & visit status summaries for visible Lead Table rows
 */
export async function getLeadFieldAssignmentSummaries(leadIds = []) {
  const validIds = Array.from(new Set(
    (leadIds || []).filter(id => isUuid(id)).map(id => String(id).trim())
  ));
  if (validIds.length === 0) return {};

  const supabase = getAdminClient();
  try {
    const allTasks = [];
    const allSubmissions = [];

    for (let i = 0; i < validIds.length; i += 200) {
      const chunk = validIds.slice(i, i + 200);
      const [tasksRes, submissionsRes] = await Promise.all([
        supabase
          .from('field_tasks')
          .select('id, lead_id, task_code, task_type, status, scheduled_start_time, assigned_to_user_id, created_at')
          .in('lead_id', chunk)
          .order('created_at', { ascending: false }),
        supabase
          .from('field_form_submissions')
          .select('id, lead_id, task_id, field_user_id, connectivity_mode, is_geofence_flagged, created_at')
          .in('lead_id', chunk)
          .order('created_at', { ascending: false })
      ]);

      if (tasksRes.data) allTasks.push(...tasksRes.data);
      if (submissionsRes.data) allSubmissions.push(...submissionsRes.data);
    }

    if (allTasks.length === 0 && allSubmissions.length === 0) {
      return {};
    }

    const userNameMap = await resolveUserNameMap(supabase, [
      ...allTasks.map(t => t.assigned_to_user_id),
      ...allSubmissions.map(s => s.field_user_id)
    ]);

    const taskById = new Map(allTasks.map(t => [t.id, t]));
    const latestTaskByLead = new Map();
    const taskCountsByLead = new Map();
    for (const t of allTasks) {
      if (!t?.lead_id) continue;
      if (!latestTaskByLead.has(t.lead_id)) {
        latestTaskByLead.set(t.lead_id, t);
      }
      const counts = taskCountsByLead.get(t.lead_id) || { total: 0, active: 0 };
      counts.total += 1;
      if (ACTIVE_TASK_STATUSES.has(String(t.status || 'SCHEDULED').toUpperCase())) {
        counts.active += 1;
      }
      taskCountsByLead.set(t.lead_id, counts);
    }

    const latestSubByLead = new Map();
    for (const s of allSubmissions) {
      if (s?.lead_id && !latestSubByLead.has(s.lead_id)) {
        latestSubByLead.set(s.lead_id, s);
      }
    }

    const summaries = {};
    for (const leadId of validIds) {
      const task = latestTaskByLead.get(leadId) || null;
      const sub = latestSubByLead.get(leadId) || null;
      const counts = taskCountsByLead.get(leadId) || { total: sub ? 1 : 0, active: 0 };
      if (!task && !sub) continue;

      if (task && sub && sub.task_id === task.id) {
        summaries[leadId] = {
          field_person_name: userNameMap.get(sub.field_user_id) || userNameMap.get(task.assigned_to_user_id) || 'Field Executive',
          field_task_code: task.task_code || null,
          field_task_status: task.status || 'COMPLETED',
          field_connectivity_mode: sub.connectivity_mode || null,
          is_geofence_flagged: Boolean(sub.is_geofence_flagged),
          field_scheduled_time: task.scheduled_start_time || null,
          field_tasks_count: counts.total,
          field_active_tasks_count: counts.active
        };
        continue;
      }

      const taskTime = task ? new Date(task.created_at || 0).getTime() : 0;
      const subTime = sub ? new Date(sub.created_at || 0).getTime() : 0;

      if (task && taskTime >= subTime) {
        summaries[leadId] = {
          field_person_name: userNameMap.get(task.assigned_to_user_id) || 'Field Executive',
          field_task_code: task.task_code || null,
          field_task_status: task.status || 'SCHEDULED',
          field_connectivity_mode: null,
          is_geofence_flagged: false,
          field_scheduled_time: task.scheduled_start_time || null,
          field_tasks_count: counts.total,
          field_active_tasks_count: counts.active
        };
      } else if (sub) {
        const linkedTask = sub.task_id ? taskById.get(sub.task_id) : null;
        summaries[leadId] = {
          field_person_name: userNameMap.get(sub.field_user_id) || userNameMap.get(linkedTask?.assigned_to_user_id) || 'Field Executive',
          field_task_code: linkedTask?.task_code || null,
          field_task_status: linkedTask?.status || 'COMPLETED',
          field_connectivity_mode: sub.connectivity_mode || null,
          is_geofence_flagged: Boolean(sub.is_geofence_flagged),
          field_scheduled_time: linkedTask?.scheduled_start_time || null,
          field_tasks_count: counts.total,
          field_active_tasks_count: counts.active
        };
      }
    }

    return summaries;
  } catch (err) {
    console.error('Error in getLeadFieldAssignmentSummaries:', err);
    return {};
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

    const cleanUserId = isUuid(userId) ? String(userId).trim() : null;
    const cleanEmail = userEmail ? String(userEmail).trim().toLowerCase() : '';
    if (!cleanUserId && !cleanEmail) {
      return { isPunchedIn: false, isPunchedOut: false, record: null, todayIST };
    }

    if (cleanUserId && cleanEmail) {
      query = query.or(`user_id.eq.${cleanUserId},email.ilike.${cleanEmail}`);
    } else if (cleanUserId) {
      query = query.eq('user_id', cleanUserId);
    } else if (cleanEmail) {
      query = query.ilike('email', cleanEmail);
    }

    const { data, error } = await query
      .order('in_time', { ascending: false })
      .limit(1)
      .maybeSingle();
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

    const cleanFieldUserId = isUuid(field_user_id) ? String(field_user_id).trim() : null;
    const cleanCheckInEmail = user_email ? String(user_email).trim().toLowerCase() : '';

    if (cleanFieldUserId || cleanCheckInEmail) {
      let attQuery = supabase
        .from('attendance_records')
        .select('id, in_time, out_time, status')
        .eq('attendance_date', todayIST);

      if (cleanFieldUserId && cleanCheckInEmail) {
        attQuery = attQuery.or(`user_id.eq.${cleanFieldUserId},email.ilike.${cleanCheckInEmail}`);
      } else if (cleanFieldUserId) {
        attQuery = attQuery.eq('user_id', cleanFieldUserId);
      } else {
        attQuery = attQuery.ilike('email', cleanCheckInEmail);
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
    let effectiveTaskCode = null;

    // If taskId is provided, update existing assigned task status (preserving its TSK- code)
    if (taskId) {
      const { data: updatedTask } = await supabase
        .from('field_tasks')
        .update({
          status: 'IN_PROGRESS',
          actual_start_time: checkInTime,
          updated_at: checkInTime
        })
        .eq('id', taskId)
        .select('id, task_code')
        .maybeSingle();
      if (updatedTask?.task_code) {
        effectiveTaskCode = updatedTask.task_code;
      }
    } else {
      // Self / Ad-Hoc Visit by Field Person: generate CHK-000001 sequence code
      const { data: newTask, error: adHocErr } = await insertFieldTaskWithUniqueCode(supabase, {
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
      }, 'CHK');

      if (adHocErr) {
        console.error('Error creating ad-hoc field task:', adHocErr);
      }
      if (newTask) {
        effectiveTaskId = newTask.id;
        effectiveTaskCode = newTask.task_code || null;
      }
    }

    return {
      success: true,
      task_id: effectiveTaskId,
      task_code: effectiveTaskCode,
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
    if (!isUuid(userId)) return null;
    const cleanUserId = String(userId).trim();
    const { data, error } = await supabase
      .from('field_tasks')
      .select('*')
      .eq('assigned_to_user_id', cleanUserId)
      .eq('status', 'IN_PROGRESS')
      .order('updated_at', { ascending: false })
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
    if (isUuid(lead_id)) {
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
          .insert([{
            lead_id,
            note_text: `[Field Visit - ${connectivity_mode}] Stage updated to "${lead_stage_updated || 'Updated'}". Outcome: ${outcome_status}.${next_followup_at ? ` Next Follow-up: ${next_followup_at}` : ''} Notes: ${discussion_notes || 'No notes'}`,
            created_by: 'Field Force App'
          }]);
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
export async function getModuleEntitiesForCheckIn({ company = 'TNT00001', tenantId = null, allowedCompanies = null, moduleType = 'LEAD_DATA', search = '', limit = 40 } = {}) {
  const supabase = getAdminClient();
  try {
    const trimmed = (search || '').trim();
    const cleanCompany = String(company || '').trim();
    const lowerCompany = cleanCompany.toLowerCase();
    const hasAllowedOverride = Array.isArray(allowedCompanies) && allowedCompanies.length > 0;
    const branchUtils = hasAllowedOverride ? await import('@/utils/branchAccess') : null;
    const expandedAllowed = hasAllowedOverride
      ? Array.from(new Set(allowedCompanies.flatMap(branchUtils.expandCompanyAliases).map(v => cleanFieldText(v)).filter(Boolean)))
      : [];
    const isAllCompaniesScope = !hasAllowedOverride && (!cleanCompany || lowerCompany === 'all' || lowerCompany === 'all companies');
    const isSwanGroupScope = !hasAllowedOverride && SWAN_COMPANY_MATCHERS.has(lowerCompany);

    if (moduleType === 'LEAD_DATA') {
      const buildLeadQuery = (useTenantIdFallback = false) => {
        let q = supabase
          .from('leads')
          .select('id, name, company, our_company, tenant_id, phone, status, address, city_name, district_name, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (useTenantIdFallback && isUuid(tenantId)) {
          q = q.eq('tenant_id', String(tenantId).trim());
        } else if (expandedAllowed.length > 0) {
          q = q.in('our_company', expandedAllowed);
        } else if (!isAllCompaniesScope) {
          q = isSwanGroupScope
            ? q.in('our_company', SWAN_OUR_COMPANIES)
            : q.eq('our_company', cleanCompany);
        } else if (isUuid(tenantId)) {
          q = q.eq('tenant_id', String(tenantId).trim());
        }

        if (trimmed) {
          q = q.or(`company.ilike.%${trimmed}%,name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,city_name.ilike.%${trimmed}%,district_name.ilike.%${trimmed}%`);
        }
        return q;
      };

      let { data, error } = await buildLeadQuery(false);
      if (!error && (!data || data.length === 0) && !hasAllowedOverride && !isAllCompaniesScope && isUuid(tenantId)) {
        const fb = await buildLeadQuery(true);
        if (!fb.error && Array.isArray(fb.data) && fb.data.length > 0) {
          data = fb.data;
        }
      }
      if (error) {
        console.error('Error fetching leads for check-in:', error);
        return [];
      }

      return (data || []).map(l => ({
        id: l.id,
        lead_id: l.id,
        party_name: cleanFieldText(l.company) || cleanFieldText(l.name) || 'Unnamed Lead',
        party_phone: cleanFieldText(l.phone),
        party_address: dedupeAddressParts([l.address, l.city_name, l.district_name]) || 'Address unavailable',
        current_stage: cleanFieldText(l.status) || null,
        party_lat: null,
        party_lng: null,
        module_source: 'LEAD_DATA'
      }));
    }

    if (moduleType === 'PARTY_MASTER') {
      const resolvedTenantId = (!isAllCompaniesScope || isUuid(tenantId))
        ? await resolveDbTenantUuid(tenantId || cleanCompany)
        : null;

      const buildPartyQuery = (withAddresses) => {
        let q = supabase
          .from('party_master')
          .select(
            withAddresses
              ? 'id, firm_name, legal_name, trade_name, primary_mobile, party_status, business_nature, created_at, party_addresses(address_line_1, city, state)'
              : 'id, firm_name, legal_name, trade_name, primary_mobile, party_status, business_nature, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(expandedAllowed.length > 0 ? Math.max(limit * 3, 120) : limit);

        if (resolvedTenantId) {
          q = q.eq('tenant_id', resolvedTenantId);
        }
        if (trimmed) {
          q = q.or(`firm_name.ilike.%${trimmed}%,legal_name.ilike.%${trimmed}%,trade_name.ilike.%${trimmed}%,primary_mobile.ilike.%${trimmed}%`);
        }
        return q;
      };

      let { data, error } = await buildPartyQuery(true);
      if (error) {
        const fallback = await buildPartyQuery(false);
        data = fallback.data;
        error = fallback.error;
      }
      if (error) {
        console.error('Error fetching party_master for check-in:', error);
        return [];
      }

      const isSwanTenant = !resolvedTenantId || resolvedTenantId === '00000000-0000-0000-0000-000000000001';
      const scopedParties = (expandedAllowed.length > 0 && isSwanTenant)
        ? (data || []).filter((p) => {
            let metaComp = '';
            try {
              const raw = p.business_nature;
              if (raw && typeof raw === 'string' && raw.trim().startsWith('{')) {
                metaComp = JSON.parse(raw)?.our_company || '';
              } else if (raw && typeof raw === 'object') {
                metaComp = raw.our_company || '';
              }
            } catch {}
            return branchUtils.matchesCompanyToken(metaComp || 'NSMLR', expandedAllowed);
          }).slice(0, limit)
        : (data || []).slice(0, limit);

      return scopedParties.map(p => {
        const primaryAddr = Array.isArray(p.party_addresses) ? p.party_addresses[0] : null;
        const resolvedAddr = primaryAddr
          ? dedupeAddressParts([primaryAddr.address_line_1, primaryAddr.city, primaryAddr.state])
          : '';
        return {
          id: p.id,
          customer_id: p.id,
          party_name: cleanFieldText(p.firm_name) || cleanFieldText(p.legal_name) || cleanFieldText(p.trade_name) || 'Unnamed Party',
          party_phone: cleanFieldText(p.primary_mobile),
          party_address: resolvedAddr || 'Registered Customer',
          current_stage: cleanFieldText(p.party_status) || null,
          party_lat: null,
          party_lng: null,
          module_source: 'PARTY_MASTER'
        };
      });
    }

    // Default: Check assigned field tasks
    let taskQuery = supabase
      .from('field_tasks')
      .select('*')
      .in('status', ['PENDING', 'SCHEDULED', 'IN_PROGRESS'])
      .order('scheduled_start_time', { ascending: true })
      .limit(limit);

    if (expandedAllowed.length > 0) {
      taskQuery = taskQuery.in('company', expandedAllowed);
    } else if (!isAllCompaniesScope) {
      taskQuery = taskQuery.eq('company', cleanCompany);
    }

    if (trimmed) {
      taskQuery = taskQuery.or(`party_name.ilike.%${trimmed}%,party_phone.ilike.%${trimmed}%`);
    }

    const { data: tasks, error: tErr } = await taskQuery;
    if (tErr) return [];

    return (tasks || []).map(t => ({
      id: t.id,
      task_id: t.id,
      task_code: t.task_code || null,
      task_type: t.task_type || null,
      lead_id: t.lead_id,
      customer_id: t.customer_id,
      party_name: cleanFieldText(t.party_name) || 'Assigned Visit',
      party_phone: cleanFieldText(t.party_phone),
      party_address: cleanFieldText(t.party_address),
      current_stage: cleanFieldText(t.task_type) || null,
      party_lat: t.party_lat,
      party_lng: t.party_lng,
      form_details: t.form_details || {},
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
  if (!isUuid(userId)) return [];
  const cleanUserId = String(userId).trim();
  const supabase = getAdminClient();
  try {
    const today = dateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const startOfDay = `${today}T00:00:00.000+05:30`;
    const endOfDay = `${today}T23:59:59.999+05:30`;

    const { data, error } = await supabase
      .from('field_form_submissions')
      .select('*')
      .eq('field_user_id', cleanUserId)
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

/**
 * Resolve authenticated caller UUID(s) and Admin status safely on server
 */
async function resolveActorContext(supabase, requestedUserId = null) {
  let sessionUser = null;
  try {
    const authClient = await createServerAuthClient();
    if (authClient?.auth?.getUser) {
      const { data } = await authClient.auth.getUser();
      sessionUser = data?.user || null;
    }
  } catch {
    sessionUser = null;
  }

  const candidateIds = Array.from(new Set(
    [sessionUser?.id, requestedUserId].filter(id => isUuid(id)).map(id => String(id).trim())
  ));
  const email = cleanFieldText(sessionUser?.email).toLowerCase();

  const roleRows = [];
  try {
    if (candidateIds.length > 0) {
      const { data } = await supabase
        .from('user_roles')
        .select('id, user_id, email, role, emp_name, company, tenant_id')
        .in('user_id', candidateIds);
      if (Array.isArray(data)) roleRows.push(...data);
    }
    if (roleRows.length === 0 && email) {
      const { data } = await supabase
        .from('user_roles')
        .select('id, user_id, email, role, emp_name, company, tenant_id')
        .ilike('email', email)
        .limit(3);
      if (Array.isArray(data)) roleRows.push(...data);
    }
  } catch {
    // Non-fatal fallback
  }

  const isAdmin = roleRows.some((r) => ADMIN_ROLE_SET.has(String(r?.role || '').trim().toLowerCase()));
  const actorIds = new Set(candidateIds);
  for (const r of roleRows) {
    if (isUuid(r?.user_id)) actorIds.add(String(r.user_id).trim());
    if (isUuid(r?.id)) actorIds.add(String(r.id).trim());
  }

  return {
    actorUserId: isUuid(requestedUserId)
      ? String(requestedUserId).trim()
      : (isUuid(sessionUser?.id) ? String(sessionUser.id).trim() : (roleRows[0]?.user_id || null)),
    actorIds,
    isAdmin
  };
}

/**
 * Fetch managed field tasks for Field Task Management Console
 * Supports viewScope: 'assigned_by_me' | 'all_team' | 'assigned_to_me'
 */
export async function getManagedFieldTasks({
  viewScope = 'assigned_by_me',
  currentUserId = null,
  company = 'TNT00001',
  tenantId = null,
  branchAccess = null,
  adminCompanyFilter = 'All',
  status = 'ALL',
  priority = 'ALL',
  taskType = 'ALL',
  assignedTo = 'ALL',
  leadId = null,
  search = '',
  dateFrom = '',
  dateTo = '',
  limit = 500
} = {}) {
  const supabase = getAdminClient();
  try {
    const actor = await resolveActorContext(supabase, currentUserId);
    const actorIdList = Array.from(actor.actorIds);

    if ((viewScope === 'assigned_by_me' || viewScope === 'assigned_to_me') && actorIdList.length === 0) {
      return { success: true, tasks: [], isAdmin: actor.isAdmin };
    }

    let query = supabase
      .from('field_tasks')
      .select(`
        id,
        task_code,
        tenant_id,
        company,
        branch_code,
        form_id,
        task_type,
        customer_id,
        lead_id,
        party_name,
        party_phone,
        party_address,
        assigned_by_user_id,
        assigned_to_user_id,
        priority,
        scheduled_start_time,
        scheduled_end_time,
        actual_start_time,
        actual_end_time,
        status,
        form_details,
        created_at,
        updated_at,
        form:tenant_custom_forms(title, form_code)
      `)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));

    if (viewScope === 'assigned_by_me') {
      query = actorIdList.length === 1
        ? query.eq('assigned_by_user_id', actorIdList[0])
        : query.in('assigned_by_user_id', actorIdList);
    } else if (viewScope === 'assigned_to_me') {
      query = actorIdList.length === 1
        ? query.eq('assigned_to_user_id', actorIdList[0])
        : query.in('assigned_to_user_id', actorIdList);
    } else {
      // 'all_team' enforces company / branch isolation
      const branchUtils = await import('@/utils/branchAccess');
      const allowedFromAccess = Array.isArray(branchAccess?.allowedCompanies) ? branchAccess.allowedCompanies : [];
      const hasRestrictedBranch = Boolean(branchAccess && !branchAccess.isAllBranches && allowedFromAccess.length > 0);
      const selectedAdminFilter = cleanFieldText(adminCompanyFilter);

      if (selectedAdminFilter && selectedAdminFilter.toLowerCase() !== 'all' && selectedAdminFilter.toLowerCase() !== 'all companies') {
        const filterAliases = Array.from(new Set(branchUtils.expandCompanyAliases(selectedAdminFilter).map(v => cleanFieldText(v)).filter(Boolean)));
        if (filterAliases.length > 0) {
          query = query.in('company', filterAliases);
        }
      } else if (hasRestrictedBranch) {
        const branchAliases = Array.from(new Set(allowedFromAccess.flatMap(branchUtils.expandCompanyAliases).map(v => cleanFieldText(v)).filter(Boolean)));
        if (branchAliases.length > 0) {
          query = query.in('company', branchAliases);
        }
      } else {
        const cleanCompany = String(company || '').trim();
        const lowerCompany = cleanCompany.toLowerCase();
        const isAllScope = !cleanCompany || lowerCompany === 'all' || lowerCompany === 'all companies';
        if (!isAllScope) {
          if (SWAN_COMPANY_MATCHERS.has(lowerCompany)) {
            query = query.in('company', SWAN_OUR_COMPANIES);
          } else {
            const aliases = Array.from(new Set(branchUtils.expandCompanyAliases(cleanCompany).map(v => cleanFieldText(v)).filter(Boolean)));
            query = aliases.length > 1 ? query.in('company', aliases) : query.eq('company', cleanCompany);
          }
        } else if (isUuid(tenantId)) {
          query = query.eq('tenant_id', String(tenantId).trim());
        }
      }
    }

    if (isUuid(leadId)) {
      query = query.eq('lead_id', String(leadId).trim());
    }
    if (status && status !== 'ALL') {
      query = query.eq('status', String(status).toUpperCase());
    }
    if (priority && priority !== 'ALL') {
      query = query.eq('priority', String(priority).toUpperCase());
    }
    if (isUuid(assignedTo)) {
      query = query.eq('assigned_to_user_id', String(assignedTo).trim());
    }
    if (dateFrom) {
      query = query.gte('scheduled_start_time', `${dateFrom}T00:00:00.000+05:30`);
    }
    if (dateTo) {
      query = query.lte('scheduled_start_time', `${dateTo}T23:59:59.999+05:30`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error in getManagedFieldTasks:', error);
      return { success: false, tasks: [], error: error.message, isAdmin: actor.isAdmin };
    }

    const rows = data || [];
    const userNameMap = await resolveUserNameMap(supabase, [
      ...rows.map(r => r.assigned_to_user_id),
      ...rows.map(r => r.assigned_by_user_id)
    ]);

    const trimmedSearch = String(search || '').trim().toLowerCase();
    const cleanTaskTypeFilter = String(taskType || 'ALL').trim();

    const enriched = rows
      .map(t => {
        const statusUpper = String(t.status || 'SCHEDULED').toUpperCase();
        const priorityUpper = VALID_TASK_PRIORITIES.has(String(t.priority || '').toUpperCase())
          ? String(t.priority).toUpperCase()
          : 'MEDIUM';
        const isCreator = actor.actorIds.has(String(t.assigned_by_user_id || '').trim());
        return {
          ...t,
          status: statusUpper,
          priority: priorityUpper,
          assigned_to_name: userNameMap.get(t.assigned_to_user_id) || 'Field Executive',
          assigned_by_name: t.assigned_by_user_id ? (userNameMap.get(t.assigned_by_user_id) || 'Team Member') : 'System',
          can_edit: Boolean((isCreator || actor.isAdmin) && statusUpper !== 'COMPLETED')
        };
      })
      .filter(t => {
        if (cleanTaskTypeFilter && cleanTaskTypeFilter !== 'ALL') {
          if (String(t.task_type || '').toLowerCase() !== cleanTaskTypeFilter.toLowerCase()) {
            return false;
          }
        }
        if (trimmedSearch) {
          const haystack = [
            t.task_code,
            t.party_name,
            t.party_phone,
            t.party_address,
            t.task_type,
            t.assigned_to_name,
            t.assigned_by_name,
            t.form_details?.description,
            t.form_details?.issue_description,
            t.form_details?.task_stage,
            t.form_details?.lead_status
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(trimmedSearch)) {
            return false;
          }
        }
        return true;
      });

    return { success: true, tasks: enriched, isAdmin: actor.isAdmin };
  } catch (err) {
    console.error('Error in getManagedFieldTasks:', err);
    return { success: false, tasks: [], error: err?.message || 'Failed to load field tasks', isAdmin: false };
  }
}

/**
 * Update/Edit an existing Field Task (Creator or Admin only; completed tasks remain locked)
 */
export async function updateFieldTask({ taskId, actorUserId = null, updates = {} } = {}) {
  if (!isUuid(taskId)) {
    return { success: false, error: 'Valid taskId is required.' };
  }

  const supabase = getAdminClient();
  try {
    const cleanTaskId = String(taskId).trim();
    const { data: existing, error: fetchErr } = await supabase
      .from('field_tasks')
      .select('*')
      .eq('id', cleanTaskId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return { success: false, error: fetchErr?.message || 'Field task not found.' };
    }

    const actor = await resolveActorContext(supabase, actorUserId);
    const isCreator = actor.actorIds.has(String(existing.assigned_by_user_id || '').trim());
    if (!isCreator && !actor.isAdmin) {
      return { success: false, error: 'Only the task creator or an Admin can edit this task.' };
    }

    if (String(existing.status || '').toUpperCase() === 'COMPLETED') {
      return { success: false, error: 'Completed tasks cannot be modified.' };
    }

    const patch = {
      updated_at: new Date().toISOString()
    };

    if (updates.assigned_to_user_id !== undefined) {
      if (!isUuid(updates.assigned_to_user_id)) {
        return { success: false, error: 'Please select a valid Field Executive.' };
      }
      patch.assigned_to_user_id = String(updates.assigned_to_user_id).trim();
    }

    if (updates.task_type !== undefined) {
      const nextType = String(updates.task_type || '').trim();
      if (!nextType) {
        return { success: false, error: 'Visit Purpose / Task Type cannot be empty.' };
      }
      patch.task_type = nextType;
    }

    if (updates.priority !== undefined) {
      const nextPriority = String(updates.priority || 'MEDIUM').trim().toUpperCase();
      if (!VALID_TASK_PRIORITIES.has(nextPriority)) {
        return { success: false, error: 'Invalid task priority.' };
      }
      patch.priority = nextPriority;
    }

    if (updates.status !== undefined) {
      const nextStatus = String(updates.status || '').trim().toUpperCase();
      if (!VALID_EDITABLE_TASK_STATUSES.has(nextStatus)) {
        return { success: false, error: 'Invalid task status update.' };
      }
      patch.status = nextStatus;
    }

    if (updates.scheduled_start_time !== undefined && updates.scheduled_start_time) {
      patch.scheduled_start_time = updates.scheduled_start_time;
    }
    if (updates.scheduled_end_time !== undefined) {
      patch.scheduled_end_time = updates.scheduled_end_time || null;
    }

    if (updates.party_name !== undefined) {
      const nextParty = String(updates.party_name || '').trim();
      if (!nextParty) {
        return { success: false, error: 'Party Name cannot be empty.' };
      }
      patch.party_name = nextParty;
    }
    if (updates.party_phone !== undefined) {
      patch.party_phone = String(updates.party_phone || '').trim();
    }
    if (updates.party_address !== undefined) {
      patch.party_address = String(updates.party_address || '').trim();
    }

    if (updates.form_details && typeof updates.form_details === 'object') {
      patch.form_details = {
        ...(existing.form_details && typeof existing.form_details === 'object' ? existing.form_details : {}),
        ...updates.form_details,
        edited_at: new Date().toISOString(),
        ...(actor.actorUserId ? { edited_by_user_id: actor.actorUserId } : {})
      };
    }

    const { data: updated, error: updateErr } = await supabase
      .from('field_tasks')
      .update(patch)
      .eq('id', cleanTaskId)
      .select()
      .single();

    if (updateErr) {
      console.error('Error updating field task:', updateErr);
      return { success: false, error: updateErr.message };
    }

    const userNameMap = await resolveUserNameMap(supabase, [
      updated.assigned_to_user_id,
      updated.assigned_by_user_id
    ]);

    await logAuditAction(
      'Field Task Updated',
      `Task ${updated.task_code || cleanTaskId} updated (Status: ${updated.status}, Priority: ${updated.priority}, Assignee: ${userNameMap.get(updated.assigned_to_user_id) || updated.assigned_to_user_id})`
    );

    return {
      success: true,
      task: {
        ...updated,
        assigned_to_name: userNameMap.get(updated.assigned_to_user_id) || 'Field Executive',
        assigned_by_name: updated.assigned_by_user_id ? (userNameMap.get(updated.assigned_by_user_id) || 'Team Member') : 'System',
        can_edit: String(updated.status || '').toUpperCase() !== 'COMPLETED'
      }
    };
  } catch (err) {
    console.error('Error in updateFieldTask:', err);
    return { success: false, error: err?.message || 'Failed to update field task' };
  }
}
