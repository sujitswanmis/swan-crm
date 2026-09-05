'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from './audit';
import { 
  getTodayDateString, 
  calculateMinutesBetween, 
  formatMinutesToHours,
  evaluateMorningInPunch,
  evaluateEveningOutPunch,
  calculateMonthlyShortLeaveUsage,
  SHIFT_RULES
} from '@/utils/attendanceUtils';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function ensureUuid(id) {
  if (isValidUuid(id)) return id;
  return crypto.randomUUID();
}

function cleanAttendanceRecordForDb(rec, tenantId = DEFAULT_TENANT_ID) {
  return {
    id: ensureUuid(rec.id),
    tenant_id: rec.tenant_id || tenantId,
    user_id: rec.user_id && isValidUuid(rec.user_id) ? rec.user_id : null,
    emp_code: rec.emp_code || '',
    emp_name: rec.emp_name || '',
    email: (rec.email || '').trim().toLowerCase(),
    department: rec.department || '',
    attendance_date: rec.attendance_date,
    in_time: rec.in_time || null,
    out_time: rec.out_time || null,
    in_location: rec.in_location || 'Office Web Terminal',
    out_location: rec.out_location || null,
    in_method: rec.in_method || 'WEB_PUNCH',
    out_method: rec.out_method || null,
    total_working_minutes: rec.total_working_minutes || 0,
    status: rec.status || 'PRESENT',
    is_regularized: !!rec.is_regularized,
    regularization_id: rec.regularization_id && isValidUuid(rec.regularization_id) ? rec.regularization_id : null,
    remarks: rec.remarks || null,
    created_at: rec.created_at || new Date().toISOString(),
    updated_at: rec.updated_at || new Date().toISOString()
  };
}

function cleanRequestForDb(req, tenantId = DEFAULT_TENANT_ID) {
  return {
    id: ensureUuid(req.id),
    tenant_id: req.tenant_id || tenantId,
    user_id: req.user_id && isValidUuid(req.user_id) ? req.user_id : null,
    emp_code: req.emp_code || '',
    emp_name: req.emp_name || '',
    email: (req.email || '').trim().toLowerCase(),
    department: req.department || '',
    attendance_date: req.attendance_date,
    request_type: req.request_type,
    current_in_time: req.current_in_time || null,
    current_out_time: req.current_out_time || null,
    requested_in_time: req.requested_in_time || null,
    requested_out_time: req.requested_out_time || null,
    reason_type: req.reason_type,
    reason_details: req.reason_details,
    assigned_hod_email: req.assigned_hod_email || null,
    assigned_hod_name: req.assigned_hod_name || 'HOD / Manager',
    status: req.status || 'PENDING',
    action_by_user_id: req.action_by_user_id && isValidUuid(req.action_by_user_id) ? req.action_by_user_id : null,
    action_by_name: req.action_by_name || null,
    action_by_email: req.action_by_email || null,
    action_at: req.action_at || null,
    action_remarks: req.action_remarks || null,
    created_at: req.created_at || new Date().toISOString(),
    updated_at: req.updated_at || new Date().toISOString()
  };
}

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ATTENDANCE_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'attendance_data.json');

// Helper to read JSON fallback data
async function getFallbackData() {
  try {
    const raw = await fs.readFile(ATTENDANCE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : []
    };
  } catch (err) {
    const initial = { records: [], requests: [] };
    try {
      await fs.mkdir(path.dirname(ATTENDANCE_FILE_PATH), { recursive: true });
      await fs.writeFile(ATTENDANCE_FILE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    } catch {}
    return initial;
  }
}

// Helper to save JSON fallback data
async function saveFallbackData(data) {
  try {
    await fs.mkdir(path.dirname(ATTENDANCE_FILE_PATH), { recursive: true });
    await fs.writeFile(ATTENDANCE_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving fallback attendance data:', err);
  }
}

/**
 * 1. Get Today's Attendance for Current User
 */
export async function getTodayAttendance(userEmail, userId, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();
  const normalizedEmail = userEmail.trim().toLowerCase();

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  let monthlyRecords = [];

  // Local fallback first
  const local = await getFallbackData();
  const localRec = local.records.find(r => (r.email || '').toLowerCase() === normalizedEmail && r.attendance_date === today);

  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [monthRes, todayRes] = await Promise.all([
      adminClient
        .from('attendance_records')
        .select('*')
        .ilike('email', normalizedEmail)
        .gte('attendance_date', startDateStr)
        .lte('attendance_date', endDateStr),
      adminClient
        .from('attendance_records')
        .select('*')
        .ilike('email', normalizedEmail)
        .eq('attendance_date', today)
        .maybeSingle()
    ]);

    const dbMonthRecs = monthRes?.data;
    const dbToday = todayRes?.data;

    if (dbMonthRecs && dbMonthRecs.length > 0) {
      monthlyRecords = dbMonthRecs;
    } else {
      monthlyRecords = local.records.filter(r => (r.email || '').toLowerCase() === normalizedEmail);
    }

    const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today);

    // Pick best between Supabase and Local (if local has out_time but supabase doesn't, pick local)
    let bestRec = dbToday || localRec || null;
    if (localRec && localRec.out_time && (!dbToday || !dbToday.out_time)) {
      bestRec = localRec;
    }

    return {
      success: true,
      data: bestRec,
      date: today,
      monthlyUsage,
      source: dbToday ? 'supabase' : 'local'
    };
  } catch (err) {
    const monthlyUsage = calculateMonthlyShortLeaveUsage(local.records.filter(r => (r.email || '').toLowerCase() === normalizedEmail), nowYear, nowMonth, today);
    return {
      success: true,
      data: localRec || null,
      date: today,
      monthlyUsage,
      source: 'local'
    };
  }
}

/**
 * 2. Punch In (Strict 1-Time Punch In per day)
 */
export async function punchIn({
  email,
  userId,
  empName,
  empCode,
  department,
  location = 'Web Terminal',
  method = 'WEB_PUNCH',
  tenantId = DEFAULT_TENANT_ID
}) {
  if (!email) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Fetch current today record from local or DB - Strict 1-Time Punch In Rule
  const local = await getFallbackData();
  const existingLocal = local.records.find(r => (r.email || '').toLowerCase() === normalizedEmail && r.attendance_date === today);
  let existingDb = null;

  try {
    const { data: dbRec } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('attendance_date', today)
      .maybeSingle();
    if (dbRec) existingDb = dbRec;
  } catch {}

  const currentTodayRec = existingDb || existingLocal;

  if (currentTodayRec && currentTodayRec.in_time) {
    return {
      success: false,
      error: `Aapka aaj ka Punch In (${new Date(currentTodayRec.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}) pehle se darj hai. Ek din me sirf 1 bar Punch In kiya ja sakta hai.`,
      alreadyPunched: true,
      data: currentTodayRec
    };
  }

  // 2. Fetch monthly records for short leave quota tracking
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  let monthlyRecords = local.records.filter(r => (r.email || '').toLowerCase() === normalizedEmail);
  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: dbMonthRecs } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr);

    if (dbMonthRecs && dbMonthRecs.length > 0) {
      monthlyRecords = dbMonthRecs;
    }
  } catch {}

  // Resolve emp_code and department from user_roles if not provided
  let resolvedEmpCode = empCode || '';
  let resolvedDepartment = department || '';
  let resolvedEmpName = empName || email.split('@')[0];

  try {
    const { data: userRole } = await adminClient
      .from('user_roles')
      .select('emp_id, emp_name, emp_department')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (userRole) {
      if (!resolvedEmpCode) resolvedEmpCode = userRole.emp_id || '';
      if (!resolvedDepartment) resolvedDepartment = userRole.emp_department || 'General';
      if (!resolvedEmpName || resolvedEmpName === email.split('@')[0]) resolvedEmpName = userRole.emp_name || resolvedEmpName;
    }
  } catch {}

  const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today);
  const evaluation = evaluateMorningInPunch(now, monthlyUsage, resolvedEmpName);

  let resultRecord = {
    id: ensureUuid(existingLocal?.id),
    tenant_id: tenantId,
    user_id: userId && isValidUuid(userId) ? userId : null,
    emp_code: resolvedEmpCode,
    emp_name: resolvedEmpName,
    email: normalizedEmail,
    department: resolvedDepartment,
    attendance_date: today,
    in_time: nowIso,
    out_time: null,
    in_location: location,
    out_location: null,
    in_method: method,
    out_method: null,
    total_working_minutes: 0,
    status: evaluation.status,
    short_leave_type: evaluation.short_leave_type,
    is_grace_applied: evaluation.is_grace_applied,
    shift_name: 'Regular Shift',
    is_regularized: false,
    remarks: evaluation.remarks,
    created_at: nowIso,
    updated_at: nowIso
  };

  // Try inserting/saving to Supabase via upsert with clean DB schema
  try {
    const dbPayload = cleanAttendanceRecordForDb(resultRecord, tenantId);
    const { data: upsertedDb, error: dbErr } = await adminClient
      .from('attendance_records')
      .upsert(dbPayload, { onConflict: 'email,attendance_date' })
      .select()
      .maybeSingle();
    if (upsertedDb) {
      resultRecord = { ...resultRecord, ...upsertedDb };
    }
    if (dbErr) console.error('Supabase punchIn upsert error:', dbErr);
  } catch (dbErr) {
    console.error('Supabase punchIn exception:', dbErr);
  }

  // Update local fallback storage
  const existingIdx = local.records.findIndex(r => (r.email || '').toLowerCase() === normalizedEmail && r.attendance_date === today);
  if (existingIdx >= 0) {
    local.records[existingIdx] = resultRecord;
  } else {
    local.records.unshift(resultRecord);
  }
  await saveFallbackData(local);

  // Log audit action
  try {
    await logAuditAction({
      module: 'attendance',
      action: 'PUNCH_IN',
      details: `Employee ${empName || email} punched in at ${new Date(nowIso).toLocaleTimeString()} on ${today} (${location}) [${evaluation.ruleTitle}]`,
      userEmail: normalizedEmail,
      userName: empName
    });
  } catch (aErr) {}

  return {
    success: true,
    message: `Punch In registered: ${evaluation.ruleTitle}`,
    data: resultRecord,
    evaluation,
    monthlyUsage
  };
}

/**
 * 3. Punch Out (Strict 1-Time Punch Out per day)
 */
export async function punchOut({
  email,
  userId,
  empName,
  location = 'Web Terminal',
  method = 'WEB_PUNCH',
  tenantId = DEFAULT_TENANT_ID
}) {
  if (!email) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Fetch current today record from local or DB
  const local = await getFallbackData();
  let existingLocal = local.records.find(r => (r.email || '').toLowerCase() === normalizedEmail && r.attendance_date === today);
  let existingDb = null;

  try {
    const { data: dbRec } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('attendance_date', today)
      .maybeSingle();
    if (dbRec) existingDb = dbRec;
  } catch {}

  let existing = existingDb || existingLocal;
  if (existingLocal?.in_time && !existingDb?.in_time) {
    existing = existingLocal;
  }

  if (!existing || !existing.in_time) {
    return {
      success: false,
      error: 'Aapne aaj abhi tak Punch In nahi kiya hai. Punch Out karne ke liye pehle Punch In hona zaroori hai.'
    };
  }

  if (existing.out_time) {
    return {
      success: false,
      error: `Aapka aaj ka Final Punch Out (${new Date(existing.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}) pehle hi darj ho chuka hai. Ek din me sirf 1 bar Punch Out allow hai.`,
      alreadyPunchedOut: true,
      data: existing
    };
  }

  // Fetch monthly records for short leave quota tracking
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  let monthlyRecords = local.records.filter(r => (r.email || '').toLowerCase() === normalizedEmail);
  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: dbMonthRecs } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr);

    if (dbMonthRecs && dbMonthRecs.length > 0) {
      monthlyRecords = dbMonthRecs;
    }
  } catch {}

  const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today);
  const evaluation = evaluateEveningOutPunch(now, existing.in_time, existing, monthlyUsage, empName || email.split('@')[0]);

  let updatedRecord = {
    ...existing,
    email: normalizedEmail,
    out_time: nowIso,
    out_location: location,
    out_method: method,
    total_working_minutes: evaluation.total_working_minutes,
    status: evaluation.status,
    short_leave_type: evaluation.short_leave_type,
    remarks: evaluation.remarks,
    updated_at: nowIso
  };

  let resolvedOutEmpCode = existing.emp_code || '';
  let resolvedOutDept = existing.department || '';
  let resolvedOutEmpName = existing.emp_name || empName || '';

  if (!resolvedOutEmpCode || !resolvedOutDept || resolvedOutDept === 'General') {
    try {
      const { data: userRole } = await adminClient
        .from('user_roles')
        .select('emp_id, emp_name, emp_department')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (userRole) {
        if (!resolvedOutEmpCode) resolvedOutEmpCode = userRole.emp_id || '';
        if (!resolvedOutDept || resolvedOutDept === 'General') resolvedOutDept = userRole.emp_department || 'General';
        if (!resolvedOutEmpName) resolvedOutEmpName = userRole.emp_name || '';
      }
    } catch {}
  }

  // Try updating/upserting in Supabase
  try {
    const dbPayload = cleanAttendanceRecordForDb({
      ...updatedRecord,
      id: ensureUuid(existing.id),
      tenant_id: existing.tenant_id || tenantId,
      user_id: existing.user_id || userId || null,
      emp_code: resolvedOutEmpCode,
      emp_name: resolvedOutEmpName,
      email: normalizedEmail,
      department: resolvedOutDept,
      attendance_date: today,
      in_time: existing.in_time,
      out_time: nowIso,
      in_location: existing.in_location || location,
      out_location: location,
      in_method: existing.in_method || method,
      out_method: method,
      total_working_minutes: evaluation.total_working_minutes,
      status: evaluation.status,
      remarks: evaluation.remarks,
      updated_at: nowIso
    }, tenantId);

    const { data: updatedDb, error: dbErr } = await adminClient
      .from('attendance_records')
      .upsert(dbPayload, { onConflict: 'email,attendance_date' })
      .select()
      .maybeSingle();

    if (updatedDb) updatedRecord = { ...updatedRecord, ...updatedDb };
    if (dbErr) console.error('Supabase punchOut upsert error:', dbErr);
  } catch (dbErr) {
    console.error('Supabase punchOut exception:', dbErr);
  }

  // Update local storage
  const existingIdx = local.records.findIndex(r => (r.email || '').toLowerCase() === normalizedEmail && r.attendance_date === today);
  if (existingIdx >= 0) {
    local.records[existingIdx] = updatedRecord;
  } else {
    local.records.unshift(updatedRecord);
  }
  await saveFallbackData(local);

  // Log audit action
  try {
    await logAuditAction({
      module: 'attendance',
      action: 'PUNCH_OUT',
      details: `Employee ${empName || email} punched out at ${new Date(nowIso).toLocaleTimeString()} on ${today} (Worked: ${formatMinutesToHours(evaluation.total_working_minutes)}) [${evaluation.ruleTitle}]`,
      userEmail: normalizedEmail,
      userName: empName
    });
  } catch (aErr) {}

  return {
    success: true,
    message: `Punch Out registered: ${evaluation.ruleTitle}! Total time worked: ${formatMinutesToHours(evaluation.total_working_minutes)}`,
    data: updatedRecord,
    evaluation,
    monthlyUsage
  };
}

/**
 * 4. Get Monthly Attendance History for an Employee
 */
export async function getMyAttendanceHistory(userEmail, year, month, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, error: 'User email is required', records: [], summary: {} };
  const adminClient = getAdminClient();
  const normalizedEmail = (userEmail || '').trim().toLowerCase();

  const targetYear = parseInt(year, 10) || new Date().getFullYear();
  const targetMonth = parseInt(month, 10) || (new Date().getMonth() + 1);

  const startDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let dbRecords = [];
  try {
    const { data, error } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr)
      .order('attendance_date', { ascending: false });

    if (!error && data) {
      dbRecords = data;
    }
  } catch (e) {}

  const local = await getFallbackData();
  const localRecords = (local.records || []).filter(r => 
    (r.email || '').toLowerCase() === normalizedEmail &&
    r.attendance_date >= startDateStr &&
    r.attendance_date <= endDateStr
  );

  // Merge map by attendance_date
  const recordsMap = new Map();
  
  // 1. Add DB records first
  dbRecords.forEach(r => {
    recordsMap.set(r.attendance_date, r);
  });

  // 2. Merge local records: if local record has out_time or is newer, replace and sync to DB
  localRecords.forEach(lr => {
    const existing = recordsMap.get(lr.attendance_date);
    if (!existing) {
      recordsMap.set(lr.attendance_date, lr);
    } else {
      if (lr.out_time && !existing.out_time) {
        recordsMap.set(lr.attendance_date, lr);
        // Sync to Supabase
        const cleanPayload = cleanAttendanceRecordForDb(lr, tenantId);
        adminClient.from('attendance_records').upsert(cleanPayload, { onConflict: 'email,attendance_date' }).then(()=>{}).catch(()=>{});
      }
    }
  });

  let records = Array.from(recordsMap.values()).sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));

  let totalPresent = 0;
  let totalLate = 0;
  let totalHalfDay = 0;
  let totalAbsent = 0;
  let totalMissedPunches = 0;
  let totalRegularized = 0;
  let totalMinutesWorked = 0;

  records.forEach(r => {
    if (r.status === 'PRESENT') totalPresent++;
    if (r.status === 'LATE') { totalPresent++; totalLate++; }
    if (r.status === 'HALF_DAY') totalHalfDay++;
    if (r.status === 'ABSENT') totalAbsent++;
    if (r.status === 'REGULARIZED' || r.is_regularized) totalRegularized++;
    if (r.in_time && !r.out_time) totalMissedPunches++;
    totalMinutesWorked += (r.total_working_minutes || 0);
  });

  const shortLeaveUsage = calculateMonthlyShortLeaveUsage(records, targetYear, targetMonth);

  // Evaluate Sundays in the month with Sunday rules (Min 3 working days & Sandwich rule)
  const recordsMapByDate = new Map(records.map(r => [r.attendance_date, r]));
  const todayStr = getTodayDateString();
  let totalPaidSundays = 0;
  let totalDisallowedSundays = 0;
  let totalSundaysInMonth = 0;

  for (let day = 1; day <= lastDay; day++) {
    const dStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dt = new Date(`${dStr}T00:00:00`);
    if (dt.getDay() === 0) {
      totalSundaysInMonth++;
      const sunEval = evaluateSundayEligibility({
        sundayDateStr: dStr,
        recordsMapByDate,
        todayStr
      });
      if (sunEval.isPaid && sunEval.code !== 'WO-P') {
        totalPaidSundays++;
      } else if (!sunEval.isPaid) {
        totalDisallowedSundays++;
      }
    }
  }

  const totalPayableDays = totalPresent + (totalHalfDay * 0.5) + totalPaidSundays;

  return {
    success: true,
    records,
    startDate: startDateStr,
    endDate: endDateStr,
    summary: {
      totalPresent,
      totalLate,
      totalHalfDay,
      totalAbsent,
      totalMissedPunches,
      totalRegularized,
      totalPaidSundays,
      totalDisallowedSundays,
      totalSundaysInMonth,
      totalPayableDays,
      totalHoursFormatted: formatMinutesToHours(totalMinutesWorked),
      totalMinutesWorked,
      totalLoggedDays: records.length,
      shortLeaveUsage
    }
  };
}

/**
 * 5. Apply for Missing Attendance / Regularization
 */
export async function applyMissingAttendance({
  email,
  userId,
  empName,
  empCode,
  department,
  attendanceDate,
  requestType,
  requestedInTime,
  requestedOutTime,
  reasonType,
  reasonDetails,
  assignedHodEmail,
  assignedHodName,
  tenantId = DEFAULT_TENANT_ID
}) {
  if (!email || !attendanceDate || !requestType || !reasonType || !reasonDetails) {
    return { success: false, error: 'All mandatory fields (Date, Request Type, Reason, Remarks) are required.' };
  }

  const adminClient = getAdminClient();
  const nowIso = new Date().toISOString();

  const local = await getFallbackData();
  const existingPending = local.requests.find(r => r.email === email && r.attendance_date === attendanceDate && r.status === 'PENDING');
  if (existingPending) {
    return {
      success: false,
      error: `You already have a pending regularization request for ${attendanceDate}. Please wait for HOD approval.`
    };
  }

  let finalInIso = null;
  let finalOutIso = null;

  if (requestType === 'MISSED_IN' || requestType === 'BOTH') {
    if (!requestedInTime) throw new Error('Requested In Time is required.');
    const timeClean = requestedInTime.length === 5 ? requestedInTime + ':00' : requestedInTime;
    const inDateObj = new Date(`${attendanceDate}T${timeClean}+05:30`);
    finalInIso = isNaN(inDateObj.getTime()) ? requestedInTime : inDateObj.toISOString();
  }

  if (requestType === 'MISSED_OUT' || requestType === 'BOTH') {
    if (!requestedOutTime) throw new Error('Requested Out Time is required.');
    const timeClean = requestedOutTime.length === 5 ? requestedOutTime + ':00' : requestedOutTime;
    const outDateObj = new Date(`${attendanceDate}T${timeClean}+05:30`);
    finalOutIso = isNaN(outDateObj.getTime()) ? requestedOutTime : outDateObj.toISOString();
  }

  const newRequest = {
    id: ensureUuid(),
    tenant_id: tenantId,
    user_id: userId && isValidUuid(userId) ? userId : null,
    emp_code: empCode || '',
    emp_name: empName || email.split('@')[0],
    email: email.trim().toLowerCase(),
    department: department || '',
    attendance_date: attendanceDate,
    request_type: requestType,
    current_in_time: null,
    current_out_time: null,
    requested_in_time: finalInIso,
    requested_out_time: finalOutIso,
    reason_type: reasonType,
    reason_details: reasonDetails,
    assigned_hod_email: assignedHodEmail || null,
    assigned_hod_name: assignedHodName || 'HOD / Manager',
    status: 'PENDING',
    action_by_user_id: null,
    action_by_name: null,
    action_by_email: null,
    action_at: null,
    action_remarks: null,
    created_at: nowIso,
    updated_at: nowIso
  };

  try {
    const dbPayload = cleanRequestForDb(newRequest, tenantId);
    const { data: dbReq, error: dbErr } = await adminClient
      .from('attendance_regularization_requests')
      .insert([dbPayload])
      .select()
      .single();
    if (dbReq) newRequest.id = dbReq.id;
    if (dbErr) console.error('Supabase applyMissingAttendance insert error:', dbErr);
  } catch (err) {
    console.error('Supabase applyMissingAttendance insert exception:', err);
  }

  local.requests.unshift(newRequest);
  await saveFallbackData(local);

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'REGULARIZATION_APPLIED',
      details: `Missing Attendance applied by ${empName || email} for date ${attendanceDate} (${requestType}: ${reasonType})`,
      userEmail: email,
      userName: empName
    });
  } catch (aErr) {}

  return {
    success: true,
    message: 'Missing attendance regularization application submitted successfully! Waiting for HOD approval.',
    data: newRequest
  };
}

/**
 * 6. Get User's Regularization Requests
 */
export async function getMyRegularizationRequests(userEmail, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, requests: [] };
  const adminClient = getAdminClient();
  const normalizedEmail = userEmail.trim().toLowerCase();

  // Always load local fallback
  const local = await getFallbackData();
  const localReqs = local.requests.filter(r => r.email && r.email.trim().toLowerCase() === normalizedEmail);
  const localMap = {};
  for (const r of localReqs) localMap[r.id] = r;

  try {
    const { data, error } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .ilike('email', normalizedEmail)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Merge: DB records take priority; add local-only records (newly submitted, not yet synced)
      const dbMap = {};
      for (const r of data) dbMap[r.id] = r;
      // Add local records not yet in DB (e.g., insert failed silently)
      for (const r of localReqs) {
        if (!dbMap[r.id]) dbMap[r.id] = r;
      }
      const merged = Object.values(dbMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { success: true, requests: merged };
    }
  } catch {}

  return { success: true, requests: localReqs };
}

/**
 * 7. Get HOD Pending Regularization Requests
 */
export async function getHodPendingRequests({
  hodEmail,
  userRole = 'agent',
  statusFilter = 'ALL',
  departmentFilter = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  const isAdmin = userRole === 'admin' || userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'super_admin' || userRole === 'management';

  // Always load local fallback
  const local = await getFallbackData();
  const localFiltered = local.requests.filter(r => {
    if (departmentFilter && departmentFilter !== 'All' && r.department !== departmentFilter) return false;
    if (!isAdmin && hodEmail) {
      return r.assigned_hod_email === hodEmail || (r.assigned_hod_name && r.assigned_hod_name.toLowerCase().includes(hodEmail.split('@')[0].toLowerCase()));
    }
    return true;
  });

  let allRequests = [];

  try {
    let query = adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!isAdmin && hodEmail) {
      query = query.or(`assigned_hod_email.eq."${hodEmail}",assigned_hod_name.ilike."%${hodEmail.split('@')[0]}%"`);
    }

    if (departmentFilter && departmentFilter !== 'All') {
      query = query.eq('department', departmentFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      // Merge: DB takes priority; add local-only records (newly submitted, not yet synced to DB)
      const dbMap = {};
      for (const r of data) dbMap[r.id] = r;
      for (const r of localFiltered) {
        if (!dbMap[r.id]) dbMap[r.id] = r; // local-only (DB insert may have failed silently)
      }
      allRequests = Object.values(dbMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      allRequests = localFiltered;
    }
  } catch {
    allRequests = localFiltered;
  }

  const counts = {
    all: allRequests.length,
    pending: allRequests.filter(r => r.status === 'PENDING').length,
    approved: allRequests.filter(r => r.status === 'APPROVED').length,
    rejected: allRequests.filter(r => r.status === 'REJECTED').length
  };

  const filtered = allRequests.filter(r => {
    if (statusFilter && statusFilter !== 'ALL') {
      return r.status === statusFilter;
    }
    return true;
  });

  return {
    success: true,
    requests: filtered,
    allRequests,
    counts,
    pendingCount: counts.pending,
    approvedCount: counts.approved,
    rejectedCount: counts.rejected,
    totalCount: counts.all
  };
}

/**
 * 8. HOD Approve Regularization Request -> AUTO UPDATES ATTENDANCE RECORD FOR THAT DATE
 */
export async function approveRegularizationRequest({
  requestId,
  actionByName,
  actionByEmail,
  actionRemarks = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  if (!requestId) return { success: false, error: 'Request ID is required' };
  const adminClient = getAdminClient();
  const nowIso = new Date().toISOString();

  const local = await getFallbackData();
  let reqIdx = local.requests.findIndex(r => r.id === requestId);
  let request = reqIdx >= 0 ? local.requests[reqIdx] : null;

  // If not found in local, fetch from DB
  if (!request) {
    try {
      const { data: dbReq } = await adminClient
        .from('attendance_regularization_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (dbReq) request = dbReq;
    } catch {}
  }

  if (!request) {
    return { success: false, error: 'Regularization request not found.' };
  }

  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: `This request has already been ${request.status.toLowerCase()}.`
    };
  }

  // Mark request as APPROVED
  request.status = 'APPROVED';
  request.action_by_name = actionByName || actionByEmail || 'HOD Approver';
  request.action_by_email = actionByEmail || '';
  request.action_at = nowIso;
  request.action_remarks = actionRemarks || 'Approved by HOD';
  request.updated_at = nowIso;
  
  if (reqIdx >= 0) {
    local.requests[reqIdx] = request;
  } else {
    local.requests.unshift(request);
  }

  // CRITICAL: Update attendance record for that date in local + Supabase
  let attIdx = local.records.findIndex(r => (r.email || '').toLowerCase() === (request.email || '').toLowerCase() && r.attendance_date === request.attendance_date);
  const finalInTime = request.requested_in_time || (attIdx >= 0 ? local.records[attIdx].in_time : null);
  const finalOutTime = request.requested_out_time || (attIdx >= 0 ? local.records[attIdx].out_time : null);
  const totalMinutes = calculateMinutesBetween(finalInTime, finalOutTime);

  let finalStatus = 'REGULARIZED';
  if (totalMinutes > 0 && totalMinutes < 240) {
    finalStatus = 'HALF_DAY';
  }

  let updatedAtt = null;

  if (attIdx >= 0) {
    local.records[attIdx] = {
      ...local.records[attIdx],
      in_time: finalInTime,
      out_time: finalOutTime,
      total_working_minutes: totalMinutes,
      status: finalStatus,
      is_regularized: true,
      regularization_id: isValidUuid(requestId) ? requestId : null,
      remarks: `Regularized & Approved by HOD: ${request.reason_details}`,
      updated_at: nowIso
    };
    updatedAtt = local.records[attIdx];
  } else {
    updatedAtt = {
      id: ensureUuid(),
      tenant_id: tenantId,
      user_id: request.user_id && isValidUuid(request.user_id) ? request.user_id : null,
      emp_code: request.emp_code || '',
      emp_name: request.emp_name,
      email: (request.email || '').trim().toLowerCase(),
      department: request.department || '',
      attendance_date: request.attendance_date,
      in_time: finalInTime,
      out_time: finalOutTime,
      in_location: 'Regularized',
      out_location: 'Regularized',
      in_method: 'REGULARIZED',
      out_method: 'REGULARIZED',
      total_working_minutes: totalMinutes,
      status: finalStatus,
      is_regularized: true,
      regularization_id: isValidUuid(requestId) ? requestId : null,
      remarks: `Regularized by HOD: ${request.reason_details}`,
      created_at: nowIso,
      updated_at: nowIso
    };
    local.records.unshift(updatedAtt);
  }

  await saveFallbackData(local);

  // Update Supabase database
  try {
    const { error: reqErr } = await adminClient
      .from('attendance_regularization_requests')
      .update({
        status: 'APPROVED',
        action_by_name: actionByName || 'HOD Approver',
        action_by_email: actionByEmail || '',
        action_at: nowIso,
        action_remarks: actionRemarks || 'Approved by HOD',
        updated_at: nowIso
      })
      .eq('id', ensureUuid(requestId));

    if (reqErr) console.error('Supabase approve request error:', reqErr);

    const dbAttPayload = cleanAttendanceRecordForDb({
      id: updatedAtt?.id,
      tenant_id: tenantId,
      user_id: request.user_id,
      emp_code: request.emp_code || '',
      emp_name: request.emp_name,
      email: request.email,
      department: request.department || '',
      attendance_date: request.attendance_date,
      in_time: finalInTime,
      out_time: finalOutTime,
      in_location: 'Regularized',
      out_location: 'Regularized',
      in_method: 'REGULARIZED',
      out_method: 'REGULARIZED',
      total_working_minutes: totalMinutes,
      status: finalStatus,
      is_regularized: true,
      regularization_id: isValidUuid(requestId) ? requestId : null,
      remarks: `Regularized by HOD: ${request.reason_details}`,
      updated_at: nowIso
    }, tenantId);

    const { error: attErr } = await adminClient
      .from('attendance_records')
      .upsert(dbAttPayload, { onConflict: 'email,attendance_date' });

    if (attErr) console.error('Supabase approve attendance upsert error:', attErr);
  } catch (dbErr) {
    console.error('Supabase approve exception:', dbErr);
  }

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'REGULARIZATION_APPROVED',
      details: `HOD (${actionByName || actionByEmail}) APPROVED regularization for ${request.emp_name} on date ${request.attendance_date}. In: ${finalInTime ? new Date(finalInTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}, Out: ${finalOutTime ? new Date(finalOutTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}`,
      userEmail: actionByEmail,
      userName: actionByName
    });
  } catch (aErr) {}

  return {
    success: true,
    message: `Regularization request for ${request.emp_name} (${request.attendance_date}) approved successfully! Attendance record updated.`,
    request,
    attendance: updatedAtt
  };
}

/**
 * 9. HOD Reject Regularization Request
 */
export async function rejectRegularizationRequest({
  requestId,
  actionByName,
  actionByEmail,
  actionRemarks = 'Rejected by HOD'
}) {
  if (!requestId) return { success: false, error: 'Request ID is required' };
  const adminClient = getAdminClient();
  const nowIso = new Date().toISOString();

  const local = await getFallbackData();
  let reqIdx = local.requests.findIndex(r => r.id === requestId);
  let request = reqIdx >= 0 ? local.requests[reqIdx] : null;

  if (!request) {
    try {
      const { data: dbReq } = await adminClient
        .from('attendance_regularization_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (dbReq) request = dbReq;
    } catch {}
  }

  if (!request) return { success: false, error: 'Request not found.' };

  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: `Request has already been ${request.status.toLowerCase()}.`
    };
  }

  request.status = 'REJECTED';
  request.action_by_name = actionByName || actionByEmail || 'HOD';
  request.action_by_email = actionByEmail || '';
  request.action_at = nowIso;
  request.action_remarks = actionRemarks;
  request.updated_at = nowIso;

  if (reqIdx >= 0) {
    local.requests[reqIdx] = request;
  } else {
    local.requests.unshift(request);
  }

  await saveFallbackData(local);

  try {
    await adminClient
      .from('attendance_regularization_requests')
      .update({
        status: 'REJECTED',
        action_by_name: actionByName || 'HOD',
        action_by_email: actionByEmail || '',
        action_at: nowIso,
        action_remarks: actionRemarks,
        updated_at: nowIso
      })
      .eq('id', ensureUuid(requestId));
  } catch (err) {
    console.error('Supabase reject request error:', err);
  }

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'REGULARIZATION_REJECTED',
      details: `HOD (${actionByName || actionByEmail}) REJECTED missing attendance request for ${request.emp_name} on date ${request.attendance_date}. Reason: ${actionRemarks}`,
      userEmail: actionByEmail,
      userName: actionByName
    });
  } catch (aErr) {}

  return {
    success: true,
    message: `Regularization request for ${request.emp_name} rejected.`,
    request
  };
}

/**
 * 9.1. Bulk Approve Regularization Requests
 */
export async function bulkApproveRegularizationRequests({
  requestIds = [],
  actionByName,
  actionByEmail,
  actionRemarks = 'Bulk Approved by HOD',
  tenantId = DEFAULT_TENANT_ID
}) {
  if (!requestIds || requestIds.length === 0) {
    return { success: false, error: 'No requests selected for bulk approval.' };
  }

  let approvedCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const reqId of requestIds) {
    try {
      const res = await approveRegularizationRequest({
        requestId: reqId,
        actionByName,
        actionByEmail,
        actionRemarks,
        tenantId
      });
      if (res.success) {
        approvedCount++;
      } else {
        failedCount++;
        errors.push(`Request ${reqId}: ${res.error}`);
      }
    } catch (err) {
      failedCount++;
      errors.push(`Request ${reqId}: ${err.message}`);
    }
  }

  return {
    success: approvedCount > 0,
    approvedCount,
    failedCount,
    errors,
    message: `Successfully approved ${approvedCount} request(s).${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
  };
}

/**
 * 9.2. Bulk Reject Regularization Requests
 */
export async function bulkRejectRegularizationRequests({
  requestIds = [],
  actionByName,
  actionByEmail,
  actionRemarks = 'Bulk Rejected by HOD'
}) {
  if (!requestIds || requestIds.length === 0) {
    return { success: false, error: 'No requests selected for bulk rejection.' };
  }

  let rejectedCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const reqId of requestIds) {
    try {
      const res = await rejectRegularizationRequest({
        requestId: reqId,
        actionByName,
        actionByEmail,
        actionRemarks
      });
      if (res.success) {
        rejectedCount++;
      } else {
        failedCount++;
        errors.push(`Request ${reqId}: ${res.error}`);
      }
    } catch (err) {
      failedCount++;
      errors.push(`Request ${reqId}: ${err.message}`);
    }
  }

  return {
    success: rejectedCount > 0,
    rejectedCount,
    failedCount,
    errors,
    message: `Successfully rejected ${rejectedCount} request(s).${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
  };
}

/**
 * 10. Get Master Team Attendance (for HOD / Admin Reports)
 */
export async function getTeamAttendanceMaster({
  date = getTodayDateString(),
  startDate = '',
  endDate = '',
  department = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  let dbRecords = [];
  let allUsers = [];

  const isRange = Boolean((startDate && endDate) && (startDate !== endDate));
  const effectiveStart = startDate || date;
  const effectiveEnd = endDate || date;

  try {
    const { data: usersData, error: uErr } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_id, emp_department, module_access, created_at');
    if (!uErr && Array.isArray(usersData)) {
      allUsers = usersData.map(u => ({
        user_id: u.user_id,
        emp_name: u.emp_name,
        email: (u.email || '').trim().toLowerCase(),
        emp_code: u.emp_id || '',
        emp_id: u.emp_id || '',
        department: u.emp_department || 'General',
        emp_status: u.module_access?.emp_status || 'Active',
        created_at: u.created_at,
        module_access: u.module_access
      }));
    }
  } catch {}

  try {
    let query = adminClient
      .from('attendance_records')
      .select('*');

    if (isRange) {
      query = query.gte('attendance_date', effectiveStart).lte('attendance_date', effectiveEnd);
    } else {
      query = query.eq('attendance_date', effectiveStart);
    }

    if (department && department !== 'All') {
      query = query.eq('department', department);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      dbRecords = data;
    }
  } catch {}

  const local = await getFallbackData();
  const localDayRecs = local.records.filter(r => {
    if (isRange) {
      if (r.attendance_date < effectiveStart || r.attendance_date > effectiveEnd) return false;
    } else {
      if (r.attendance_date !== effectiveStart) return false;
    }
    if (department && department !== 'All' && r.department !== department) return false;
    return true;
  });

  const dayMap = new Map();
  dbRecords.forEach(r => dayMap.set(`${(r.email || '').toLowerCase()}_${r.attendance_date}`, r));
  localDayRecs.forEach(lr => {
    const key = `${(lr.email || '').toLowerCase()}_${lr.attendance_date}`;
    const existing = dayMap.get(key);
    if (!existing || (lr.out_time && !existing.out_time)) {
      dayMap.set(key, lr);
    }
  });
  dbRecords = Array.from(dayMap.values());

  const userMapByEmail = new Map((allUsers || []).map(u => [u.email?.toLowerCase(), u]));
  const userMapById = new Map((allUsers || []).map(u => [u.user_id, u]));
  const localMap = new Map((local.records || []).map(lr => [`${(lr.email || '').toLowerCase()}_${lr.attendance_date}`, lr]));

  const enrichedDbRecords = dbRecords.map(r => {
    const user = (r.user_id && userMapById.get(r.user_id)) || userMapByEmail.get(r.email?.toLowerCase());
    const localRec = localMap.get(`${(r.email || '').toLowerCase()}_${r.attendance_date}`);
    return {
      ...r,
      short_leave_type: r.short_leave_type || localRec?.short_leave_type || 'NONE',
      is_grace_applied: r.is_grace_applied ?? localRec?.is_grace_applied ?? false,
      remarks: r.remarks || localRec?.remarks || null,
      emp_code: r.emp_code || user?.emp_code || user?.emp_id || '',
      emp_name: r.emp_name || user?.emp_name || r.email?.split('@')[0],
      department: r.department || user?.department || user?.emp_department || 'General'
    };
  });

  let combinedRecords = [];
  let absentCount = 0;

  if (!isRange) {
    // Single Day view: include absent employees who didn't punch
    const punchedEmails = new Set(enrichedDbRecords.map(r => r.email?.toLowerCase()));
    const absentUsers = (allUsers || [])
      .filter(u => u.emp_status !== 'InActive' && u.emp_status !== 'Terminated' && !punchedEmails.has(u.email?.toLowerCase()))
      .map(u => ({
        id: `absent-${u.email}`,
        email: u.email,
        emp_name: u.emp_name || u.email.split('@')[0],
        emp_code: u.emp_code || '',
        department: u.department || 'General',
        attendance_date: effectiveStart,
        in_time: null,
        out_time: null,
        total_working_minutes: 0,
        status: 'ABSENT',
        is_regularized: false
      }));

    absentCount = absentUsers.length;
    combinedRecords = [...enrichedDbRecords, ...absentUsers];
  } else {
    // Range view: show all records in that range sorted by date desc
    combinedRecords = enrichedDbRecords.sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
    absentCount = enrichedDbRecords.filter(r => r.status === 'ABSENT').length;
  }

  return {
    success: true,
    date: effectiveStart,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    isRange,
    records: combinedRecords,
    summary: {
      totalEmployees: allUsers.length > 0 ? allUsers.length : combinedRecords.length,
      totalRecords: combinedRecords.length,
      totalPresent: enrichedDbRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'REGULARIZED').length,
      totalHalfDay: enrichedDbRecords.filter(r => r.status === 'HALF_DAY').length,
      totalLate: enrichedDbRecords.filter(r => r.status === 'LATE').length,
      totalAbsent: absentCount,
      totalRegularized: enrichedDbRecords.filter(r => r.is_regularized).length
    }
  };
}

/**
 * 11. Reset Today's Punch (Helper for Testing)
 */
export async function resetTodayPunchForTesting(email) {
  if (!email) return { success: false, error: 'Email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();

  const local = await getFallbackData();
  local.records = local.records.filter(r => !(r.email === email && r.attendance_date === today));
  await saveFallbackData(local);

  try {
    await adminClient
      .from('attendance_records')
      .delete()
      .eq('email', email)
      .eq('attendance_date', today);
  } catch {}

  return { success: true, message: "Today's punch reset successfully for testing!" };
}

/**
 * Evaluate Sunday Policy:
 * Rule 1: Minimum 3 days Present mandatory in that week (Monday to Saturday); otherwise Sunday is Absent (Unpaid).
 * Rule 2: Sandwich Leave Rule: If employee is Absent/On Leave on BOTH Saturday (day before) AND Monday (day after), Sunday is Absent.
 */
function evaluateSundayEligibility({
  sundayDateStr,
  recordsMapByDate,
  todayStr
}) {
  const sunday = new Date(`${sundayDateStr}T00:00:00`);
  
  // 1. If employee actually punched / worked on Sunday
  const sunRec = recordsMapByDate.get(sundayDateStr);
  if (sunRec && (sunRec.status === 'PRESENT' || (sunRec.total_working_minutes || 0) > 0 || (sunRec.in_time && sunRec.out_time))) {
    return {
      isPaid: true,
      code: 'WO-P',
      status: 'PRESENT',
      label: 'Sunday Work (Present)',
      reason: null,
      record: sunRec
    };
  }

  // If Sunday is in the future
  if (sundayDateStr > todayStr) {
    return {
      isPaid: true,
      code: 'WO',
      status: 'WEEK_OFF',
      label: 'Week Off (Upcoming)',
      reason: null,
      record: null
    };
  }

  // 2. Rule 1: Check working days in Monday to Saturday of that week
  // Mon-Sat: Monday (Sunday - 6 days) to Saturday (Sunday - 1 day)
  let weeklyPresentDays = 0;
  let totalDaysEvaluated = 0;

  for (let offset = 6; offset >= 1; offset--) {
    const dayDate = new Date(sunday);
    dayDate.setDate(sunday.getDate() - offset);
    const dayDateStr = dayDate.toISOString().split('T')[0];

    // Only evaluate days in the current month / up to today
    if (dayDate.getMonth() === sunday.getMonth() && dayDateStr <= todayStr) {
      totalDaysEvaluated++;
      const dayRec = recordsMapByDate.get(dayDateStr);
      if (dayRec) {
        if (dayRec.status === 'PRESENT' || dayRec.status === 'LATE' || dayRec.status === 'REGULARIZED' || dayRec.is_regularized) {
          weeklyPresentDays += 1;
        } else if (dayRec.status === 'HALF_DAY') {
          weeklyPresentDays += 0.5;
        }
      }
    }
  }

  // If full week in month (6 days), required min is 3 days. If partial start of month, min is Math.min(3, totalDaysEvaluated)
  const requiredMinDays = Math.min(3, totalDaysEvaluated);
  if (totalDaysEvaluated > 0 && weeklyPresentDays < requiredMinDays) {
    return {
      isPaid: false,
      code: 'A',
      status: 'ABSENT',
      label: `Absent (Min ${requiredMinDays} working days not met: only ${weeklyPresentDays} days present in week)`,
      reason: `Min ${requiredMinDays} days present rule: Only ${weeklyPresentDays} days present in week`,
      record: sunRec || null
    };
  }

  // 3. Rule 2: Sandwich Rule (Both Saturday AND Monday Absent/Leave)
  const satDate = new Date(sunday);
  satDate.setDate(sunday.getDate() - 1);
  const satDateStr = satDate.toISOString().split('T')[0];

  const monDate = new Date(sunday);
  monDate.setDate(sunday.getDate() + 1);
  const monDateStr = monDate.toISOString().split('T')[0];

  const satRec = recordsMapByDate.get(satDateStr);
  const monRec = recordsMapByDate.get(monDateStr);

  const isSatAbsent = satDateStr <= todayStr && (!satRec || satRec.status === 'ABSENT' || satRec.status === 'ON_LEAVE' || (!satRec.in_time && !satRec.out_time));
  const isMonAbsent = monDateStr <= todayStr && (!monRec || monRec.status === 'ABSENT' || monRec.status === 'ON_LEAVE' || (!monRec.in_time && !monRec.out_time));

  if (isSatAbsent && isMonAbsent) {
    return {
      isPaid: false,
      code: 'A',
      status: 'ABSENT',
      label: 'Absent (Sandwich Rule: Sat & Mon Absent)',
      reason: 'Sandwich Rule: Absent on both Saturday and Monday',
      record: sunRec || null
    };
  }

  // 4. Default: Eligible for Paid Sunday Week Off
  return {
    isPaid: true,
    code: 'WO',
    status: 'WEEK_OFF',
    label: 'Paid Week Off (Sunday)',
    reason: null,
    record: sunRec || null
  };
}

/**
 * 12. Get Team Monthly Matrix (1st to Last Day Grid for All Employees)
 */
export async function getTeamMonthlyMatrix({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  department = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  const targetYear = parseInt(year, 10);
  const targetMonth = parseInt(month, 10);

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const startDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  let allUsers = [];
  try {
    const { data: usersData, error: uErr } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_id, emp_department, module_access, created_at');
    if (!uErr && Array.isArray(usersData)) {
      allUsers = usersData
        .filter(u => {
          const status = u.module_access?.emp_status;
          return status !== 'InActive' && status !== 'Terminated' && status !== 'Resigned';
        })
        .map(u => ({
          user_id: u.user_id,
          emp_name: u.emp_name,
          email: (u.email || '').trim().toLowerCase(),
          emp_code: u.emp_id || '',
          emp_id: u.emp_id || '',
          department: u.emp_department || 'General',
          created_at: u.created_at,
          module_access: u.module_access
        }));
    }
  } catch {}

  let allRecords = [];
  try {
    const { data, error } = await adminClient
      .from('attendance_records')
      .select('*')
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr);

    if (!error && data && data.length > 0) {
      allRecords = data;
    }
  } catch {}

  const local = await getFallbackData();
  const localMonthRecs = local.records.filter(r => r.attendance_date >= startDateStr && r.attendance_date <= endDateStr);

  const matrixMap = new Map();
  allRecords.forEach(r => matrixMap.set(`${(r.email || '').toLowerCase()}_${r.attendance_date}`, r));
  localMonthRecs.forEach(lr => {
    const key = `${(lr.email || '').toLowerCase()}_${lr.attendance_date}`;
    const existing = matrixMap.get(key);
    if (!existing || (lr.out_time && !existing.out_time)) {
      matrixMap.set(key, lr);
    }
  });
  allRecords = Array.from(matrixMap.values());

  // Filter users by department if specified
  let targetUsers = allUsers;
  if (department && department !== 'All') {
    targetUsers = targetUsers.filter(u => u.department === department);
  }

  // If no user_roles found, synthesize from unique emails in allRecords
  if (targetUsers.length === 0) {
    const uniqueEmails = [...new Set(allRecords.map(r => r.email))];
    targetUsers = uniqueEmails.map(em => {
      const sample = allRecords.find(r => r.email === em);
      return {
        user_id: sample?.user_id || em,
        emp_name: sample?.emp_name || em.split('@')[0],
        email: em,
        emp_code: sample?.emp_code || '',
        department: sample?.department || 'General'
      };
    });
  }

  // Build dates array for the month
  const monthDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(`${dateStr}T12:00:00+05:30`);
    const dayOfWeek = d.getDay(); // 0 is Sunday
    monthDates.push({
      dayNumber: day,
      dateStr,
      dayOfWeek,
      dayNameShort: d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'narrow' }),
      isSunday: dayOfWeek === 0
    });
  }

  const todayStr = getTodayDateString();

  // Process matrix rows with Sunday Rules (Min 3 working days & Sandwich Leave Rule)
  const matrixRows = targetUsers.map(user => {
    const userEmail = user.email?.toLowerCase();
    const userId = user.user_id;
    const userRecords = allRecords.filter(r => {
      if (userId && r.user_id) {
        return r.user_id === userId;
      }
      return (r.email || '').toLowerCase() === userEmail;
    });
    const recordsMapByDate = new Map(userRecords.map(r => [r.attendance_date, r]));

    // Determine effective joining date to avoid marking pre-joining days as absent
    const userCreatedAtStr = user.created_at ? user.created_at.slice(0, 10) : null;
    const explicitJoinDate = user.emp_joining_date || user.module_access?.emp_joining_date;
    const sortedRecordDates = userRecords.map(r => r.attendance_date).filter(Boolean).sort();
    const earliestRecordDate = sortedRecordDates.length > 0 ? sortedRecordDates[0] : null;

    let effectiveJoinDate = explicitJoinDate;
    if (!effectiveJoinDate) {
      if (earliestRecordDate && userCreatedAtStr) {
        effectiveJoinDate = earliestRecordDate < userCreatedAtStr ? earliestRecordDate : userCreatedAtStr;
      } else {
        effectiveJoinDate = earliestRecordDate || userCreatedAtStr;
      }
    }

    let totalPresent = 0;
    let totalHalfDays = 0;
    let totalAbsent = 0;
    let totalShortLeaves = 0;
    let totalPaidSundays = 0;
    let totalDisallowedSundays = 0;
    let totalMinutesWorked = 0;

    const days = monthDates.map(mDate => {
      const rec = recordsMapByDate.get(mDate.dateStr);
      const isPastOrToday = mDate.dateStr <= todayStr;
      const isBeforeJoin = effectiveJoinDate && mDate.dateStr < effectiveJoinDate;

      if (mDate.isSunday) {
        // If Sunday is before employee's joining date, do not penalize as Absent
        if (isBeforeJoin && !rec) {
          return {
            code: '—',
            status: 'NOT_JOINED',
            label: 'Not Joined Yet (Sunday)',
            reason: 'Before joining date',
            record: null
          };
        }

        const sunEval = evaluateSundayEligibility({
          sundayDateStr: mDate.dateStr,
          recordsMapByDate,
          todayStr
        });

        if (sunEval.isPaid) {
          if (sunEval.code === 'WO-P') {
            totalPresent++;
            totalMinutesWorked += (sunEval.record?.total_working_minutes || 0);
          } else {
            totalPaidSundays++;
          }
        } else {
          totalAbsent++;
          totalDisallowedSundays++;
        }

        return {
          code: sunEval.code,
          status: sunEval.status,
          label: sunEval.label,
          reason: sunEval.reason,
          record: sunEval.record
        };
      }

      if (rec) {
        totalMinutesWorked += (rec.total_working_minutes || 0);
        if (rec.short_leave_type && rec.short_leave_type !== 'NONE') {
          totalShortLeaves++;
        }

        if (rec.is_regularized || rec.status === 'REGULARIZED') {
          totalPresent++;
          return {
            code: 'R',
            status: 'REGULARIZED',
            label: 'Regularized by HOD',
            record: rec
          };
        } else if (rec.status === 'PRESENT') {
          totalPresent++;
          const slCode = (rec.short_leave_type === '20_MIN_IN' || rec.short_leave_type === '20_MIN_OUT') ? 'SL20' : ((rec.short_leave_type === '2_HR_IN' || rec.short_leave_type === '2_HR_OUT') ? 'SL2H' : 'P');
          return {
            code: slCode,
            status: 'PRESENT',
            label: rec.short_leave_type && rec.short_leave_type !== 'NONE' ? 'Short Leave Present' : 'Present',
            record: rec
          };
        } else if (rec.status === 'LATE') {
          totalPresent++;
          return {
            code: 'L',
            status: 'LATE',
            label: 'Late In',
            record: rec
          };
        } else if (rec.status === 'HALF_DAY') {
          totalHalfDays++;
          return {
            code: 'HD',
            status: 'HALF_DAY',
            label: 'Half Day',
            record: rec
          };
        } else {
          totalAbsent++;
          return {
            code: 'A',
            status: 'ABSENT',
            label: rec.remarks || 'Absent',
            record: rec
          };
        }
      } else {
        // No record
        if (isBeforeJoin) {
          return {
            code: '—',
            status: 'NOT_JOINED',
            label: 'Not Joined Yet',
            record: null
          };
        } else if (isPastOrToday) {
          totalAbsent++;
          return {
            code: 'A',
            status: 'ABSENT',
            label: 'Absent (No Punch)',
            record: null
          };
        } else {
          return {
            code: '—',
            status: 'UPCOMING',
            label: 'Upcoming',
            record: null
          };
        }
      }
    });

    const totalPayableDays = totalPresent + (totalHalfDays * 0.5) + totalPaidSundays;

    return {
      emp_id: user.emp_code || '',
      emp_name: user.emp_name || user.email?.split('@')[0],
      email: user.email,
      department: user.department || 'General',
      days,
      summary: {
        totalPresent,
        totalHalfDays,
        totalAbsent,
        totalShortLeaves,
        totalSundays: totalPaidSundays,
        totalDisallowedSundays,
        totalPayableDays,
        totalMinutesWorked,
        totalHoursFormatted: formatMinutesToHours(totalMinutesWorked)
      }
    };
  });

  return {
    success: true,
    year: targetYear,
    month: targetMonth,
    daysInMonth,
    monthDates,
    rows: matrixRows,
    summary: {
      totalEmployees: matrixRows.length,
      daysInMonth
    }
  };
}

