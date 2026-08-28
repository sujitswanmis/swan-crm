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

  const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today);
  const evaluation = evaluateMorningInPunch(now, monthlyUsage, empName || email.split('@')[0]);

  let resultRecord = {
    id: existingLocal?.id || `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    tenant_id: tenantId,
    user_id: userId || null,
    emp_code: empCode || '',
    emp_name: empName || email.split('@')[0],
    email: normalizedEmail,
    department: department || '',
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

  // Try inserting/saving to Supabase via upsert
  try {
    const { data: upsertedDb } = await adminClient
      .from('attendance_records')
      .upsert({
        ...resultRecord,
        tenant_id: tenantId,
        user_id: userId || null,
        emp_code: empCode || '',
        emp_name: empName || email.split('@')[0],
        email: normalizedEmail,
        department: department || '',
        attendance_date: today,
        in_time: nowIso,
        in_location: location,
        in_method: method,
        status: evaluation.status,
        short_leave_type: evaluation.short_leave_type,
        is_grace_applied: evaluation.is_grace_applied,
        shift_name: 'Regular Shift',
        remarks: evaluation.remarks,
        is_regularized: false,
        updated_at: nowIso
      }, { onConflict: 'email,attendance_date' })
      .select()
      .maybeSingle();
    if (upsertedDb) resultRecord = upsertedDb;
  } catch (dbErr) {
    // If Supabase table is not yet migrated, we continue with local JSON persistence
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

  // Try updating/upserting in Supabase
  try {
    const { data: updatedDb } = await adminClient
      .from('attendance_records')
      .upsert({
        ...updatedRecord,
        tenant_id: existing.tenant_id || tenantId,
        user_id: existing.user_id || userId || null,
        emp_code: existing.emp_code || '',
        emp_name: existing.emp_name || empName || '',
        email: normalizedEmail,
        department: existing.department || '',
        attendance_date: today,
        in_time: existing.in_time,
        out_time: nowIso,
        in_location: existing.in_location || location,
        out_location: location,
        in_method: existing.in_method || method,
        out_method: method,
        total_working_minutes: evaluation.total_working_minutes,
        status: evaluation.status,
        short_leave_type: evaluation.short_leave_type,
        remarks: evaluation.remarks,
        updated_at: nowIso
      }, { onConflict: 'email,attendance_date' })
      .select()
      .maybeSingle();

    if (updatedDb) updatedRecord = updatedDb;
  } catch {}

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
        adminClient.from('attendance_records').upsert(lr, { onConflict: 'email,attendance_date' }).then(()=>{}).catch(()=>{});
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
    const inDateObj = new Date(`${attendanceDate}T${requestedInTime.length === 5 ? requestedInTime + ':00' : requestedInTime}`);
    finalInIso = isNaN(inDateObj.getTime()) ? requestedInTime : inDateObj.toISOString();
  }

  if (requestType === 'MISSED_OUT' || requestType === 'BOTH') {
    if (!requestedOutTime) throw new Error('Requested Out Time is required.');
    const outDateObj = new Date(`${attendanceDate}T${requestedOutTime.length === 5 ? requestedOutTime + ':00' : requestedOutTime}`);
    finalOutIso = isNaN(outDateObj.getTime()) ? requestedOutTime : outDateObj.toISOString();
  }

  const newRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    tenant_id: tenantId,
    user_id: userId || null,
    emp_code: empCode || '',
    emp_name: empName || email.split('@')[0],
    email: email,
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
    const { data: dbReq } = await adminClient
      .from('attendance_regularization_requests')
      .insert([newRequest])
      .select()
      .single();
    if (dbReq) newRequest.id = dbReq.id;
  } catch {}

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
  const isAdmin = userRole === 'admin' || userRole === 'Admin';

  // Always load local fallback
  const local = await getFallbackData();
  const localFiltered = local.requests.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (departmentFilter && departmentFilter !== 'All' && r.department !== departmentFilter) return false;
    if (!isAdmin && hodEmail) {
      return r.assigned_hod_email === hodEmail || (r.assigned_hod_name && r.assigned_hod_name.includes(hodEmail.split('@')[0]));
    }
    return true;
  });
  const localMap = {};
  for (const r of localFiltered) localMap[r.id] = r;

  let requests = [];

  try {
    let query = adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!isAdmin && hodEmail) {
      query = query.or(`assigned_hod_email.eq."${hodEmail}",assigned_hod_name.ilike."%${hodEmail.split('@')[0]}%"`);
    }

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter);
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
      requests = Object.values(dbMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      requests = localFiltered;
    }
  } catch {
    requests = localFiltered;
  }

  return {
    success: true,
    requests,
    pendingCount: requests.filter(r => r.status === 'PENDING').length
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
  const reqIdx = local.requests.findIndex(r => r.id === requestId);
  if (reqIdx < 0) {
    return { success: false, error: 'Regularization request not found.' };
  }

  const request = local.requests[reqIdx];
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
  local.requests[reqIdx] = request;

  // CRITICAL: Update attendance record for that date in local + Supabase
  let attIdx = local.records.findIndex(r => r.email === request.email && r.attendance_date === request.attendance_date);
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
      regularization_id: requestId,
      remarks: `Regularized & Approved by HOD: ${request.reason_details}`,
      updated_at: nowIso
    };
    updatedAtt = local.records[attIdx];
  } else {
    updatedAtt = {
      id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      tenant_id: tenantId,
      user_id: request.user_id || null,
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
      regularization_id: requestId,
      remarks: `Regularized by HOD: ${request.reason_details}`,
      created_at: nowIso,
      updated_at: nowIso
    };
    local.records.unshift(updatedAtt);
  }

  await saveFallbackData(local);

  // Try updating Supabase database if tables exist
  try {
    await adminClient
      .from('attendance_regularization_requests')
      .update({
        status: 'APPROVED',
        action_by_name: actionByName || 'HOD Approver',
        action_by_email: actionByEmail || '',
        action_at: nowIso,
        action_remarks: actionRemarks || 'Approved by HOD',
        updated_at: nowIso
      })
      .eq('id', requestId);

    await adminClient
      .from('attendance_records')
      .upsert({
        tenant_id: tenantId,
        user_id: request.user_id || null,
        emp_code: request.emp_code || '',
        emp_name: request.emp_name,
        email: request.email,
        department: request.department || '',
        attendance_date: request.attendance_date,
        in_time: finalInTime,
        out_time: finalOutTime,
        total_working_minutes: totalMinutes,
        status: finalStatus,
        is_regularized: true,
        regularization_id: requestId,
        remarks: `Regularized by HOD: ${request.reason_details}`,
        updated_at: nowIso
      }, { onConflict: 'email,attendance_date' });
  } catch {}

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'REGULARIZATION_APPROVED',
      details: `HOD (${actionByName || actionByEmail}) APPROVED regularization for ${request.emp_name} on date ${request.attendance_date}. In: ${finalInTime ? new Date(finalInTime).toLocaleTimeString() : 'N/A'}, Out: ${finalOutTime ? new Date(finalOutTime).toLocaleTimeString() : 'N/A'}`,
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
  const reqIdx = local.requests.findIndex(r => r.id === requestId);
  if (reqIdx < 0) return { success: false, error: 'Request not found.' };

  const request = local.requests[reqIdx];
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
  local.requests[reqIdx] = request;

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
      .eq('id', requestId);
  } catch {}

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
  department = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  let dbRecords = [];
  let allUsers = [];

  try {
    const { data: usersData } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_code, department, emp_status');
    if (usersData) allUsers = usersData;
  } catch {}

  try {
    let query = adminClient
      .from('attendance_records')
      .select('*')
      .eq('attendance_date', date);

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
    if (r.attendance_date !== date) return false;
    if (department && department !== 'All' && r.department !== department) return false;
    return true;
  });

  const dayMap = new Map();
  dbRecords.forEach(r => dayMap.set((r.email || '').toLowerCase(), r));
  localDayRecs.forEach(lr => {
    const existing = dayMap.get((lr.email || '').toLowerCase());
    if (!existing || (lr.out_time && !existing.out_time)) {
      dayMap.set((lr.email || '').toLowerCase(), lr);
    }
  });
  dbRecords = Array.from(dayMap.values());

  const userMapByEmail = new Map((allUsers || []).map(u => [u.email?.toLowerCase(), u]));

  const enrichedDbRecords = dbRecords.map(r => {
    const user = userMapByEmail.get(r.email?.toLowerCase());
    return {
      ...r,
      emp_code: r.emp_code || user?.emp_code || '',
      emp_name: r.emp_name || user?.emp_name || r.email?.split('@')[0],
      department: r.department || user?.department || 'General'
    };
  });

  const punchedEmails = new Set(enrichedDbRecords.map(r => r.email?.toLowerCase()));
  const absentUsers = (allUsers || [])
    .filter(u => u.emp_status !== 'InActive' && u.emp_status !== 'Terminated' && !punchedEmails.has(u.email?.toLowerCase()))
    .map(u => ({
      id: `absent-${u.email}`,
      email: u.email,
      emp_name: u.emp_name || u.email.split('@')[0],
      emp_code: u.emp_code || '',
      department: u.department || 'General',
      attendance_date: date,
      in_time: null,
      out_time: null,
      total_working_minutes: 0,
      status: 'ABSENT',
      is_regularized: false
    }));

  const combinedRecords = [...enrichedDbRecords, ...absentUsers];

  return {
    success: true,
    date,
    records: combinedRecords,
    summary: {
      totalEmployees: allUsers.length > 0 ? allUsers.length : combinedRecords.length,
      totalPresent: enrichedDbRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'REGULARIZED').length,
      totalHalfDay: enrichedDbRecords.filter(r => r.status === 'HALF_DAY').length,
      totalLate: enrichedDbRecords.filter(r => r.status === 'LATE').length,
      totalAbsent: absentUsers.length,
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
    const { data: usersData } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_code, department, emp_status');
    if (usersData) {
      allUsers = usersData.filter(u => u.emp_status !== 'InActive' && u.emp_status !== 'Terminated');
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
    const d = new Date(`${dateStr}T00:00:00`);
    const dayOfWeek = d.getDay(); // 0 is Sunday
    monthDates.push({
      dayNumber: day,
      dateStr,
      dayOfWeek,
      dayNameShort: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      isSunday: dayOfWeek === 0
    });
  }

  const todayStr = getTodayDateString();

  // Process matrix rows
  const matrixRows = targetUsers.map(user => {
    const userEmail = user.email?.toLowerCase();
    const userRecords = allRecords.filter(r => r.email?.toLowerCase() === userEmail);
    const recordsMapByDate = new Map(userRecords.map(r => [r.attendance_date, r]));

    let totalPresent = 0;
    let totalHalfDays = 0;
    let totalAbsent = 0;
    let totalShortLeaves = 0;
    let totalSundays = 0;
    let totalMinutesWorked = 0;

    const days = monthDates.map(mDate => {
      const rec = recordsMapByDate.get(mDate.dateStr);
      const isPastOrToday = mDate.dateStr <= todayStr;

      if (mDate.isSunday) {
        totalSundays++;
        if (rec) {
          totalMinutesWorked += (rec.total_working_minutes || 0);
          return {
            code: 'WO-P',
            status: 'PRESENT',
            label: 'Sunday Work',
            record: rec
          };
        }
        return {
          code: 'WO',
          status: 'WEEK_OFF',
          label: 'Week Off (Sunday)',
          record: null
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
            label: 'Absent',
            record: rec
          };
        }
      } else {
        // No record
        if (isPastOrToday) {
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

    const totalPayableDays = totalPresent + (totalHalfDays * 0.5) + totalSundays;

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
        totalSundays,
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

