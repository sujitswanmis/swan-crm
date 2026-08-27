'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from './audit';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

import { getTodayDateString, calculateMinutesBetween, formatMinutesToHours } from '@/utils/attendanceUtils';

/**
 * 1. Get Today's Attendance for Current User
 */
export async function getTodayAttendance(userEmail, userId, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();

  try {
    const { data, error } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', userEmail)
      .eq('attendance_date', today)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Error fetching today attendance:', error.message);
    }

    return {
      success: true,
      data: data || null,
      date: today
    };
  } catch (err) {
    console.error('getTodayAttendance exception:', err);
    return { success: false, error: err.message, data: null };
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

  try {
    // 1. Check if user has already punched in today
    const { data: existing, error: checkErr } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', email)
      .eq('attendance_date', today)
      .maybeSingle();

    if (existing && existing.in_time) {
      return {
        success: false,
        error: `Already punched in today at ${new Date(existing.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}. Only 1 punch-in per day is allowed.`,
        data: existing
      };
    }

    // Determine initial status (e.g. check if late after 9:45 AM)
    const now = new Date();
    const isLate = (now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 45));
    const initialStatus = isLate ? 'LATE' : 'PRESENT';

    let resultRecord = null;

    if (existing) {
      // Update existing record
      const { data: updated, error: updateErr } = await adminClient
        .from('attendance_records')
        .update({
          in_time: nowIso,
          in_location: location,
          in_method: method,
          status: initialStatus,
          updated_at: nowIso
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message);
      resultRecord = updated;
    } else {
      // Insert new record
      const { data: inserted, error: insertErr } = await adminClient
        .from('attendance_records')
        .insert([{
          tenant_id: tenantId,
          user_id: userId || null,
          emp_code: empCode || '',
          emp_name: empName || email.split('@')[0],
          email: email,
          department: department || '',
          attendance_date: today,
          in_time: nowIso,
          in_location: location,
          in_method: method,
          status: initialStatus,
          is_regularized: false,
          created_at: nowIso,
          updated_at: nowIso
        }])
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      resultRecord = inserted;
    }

    // Log audit action
    try {
      await logAuditAction({
        module: 'attendance',
        action: 'PUNCH_IN',
        details: `Employee ${empName || email} punched in at ${new Date(nowIso).toLocaleTimeString()} on ${today} (${location})`,
        userEmail: email,
        userName: empName
      });
    } catch (aErr) { /* ignore audit error */ }

    return {
      success: true,
      message: 'Punch In registered successfully!',
      data: resultRecord
    };
  } catch (err) {
    console.error('punchIn exception:', err);
    return { success: false, error: err.message };
  }
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

  try {
    // 1. Fetch today's record
    const { data: existing, error: checkErr } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', email)
      .eq('attendance_date', today)
      .maybeSingle();

    if (!existing || !existing.in_time) {
      return {
        success: false,
        error: 'Cannot Punch Out: No Punch In recorded for today. Please punch in first or apply for regularization.'
      };
    }

    if (existing.out_time) {
      return {
        success: false,
        error: `Already punched out today at ${new Date(existing.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}. Only 1 punch-out per day is allowed.`,
        data: existing
      };
    }

    // Calculate working duration
    const totalMinutes = calculateMinutesBetween(existing.in_time, nowIso);
    let finalStatus = existing.status || 'PRESENT';
    if (totalMinutes < 240) { // < 4 hours
      finalStatus = 'HALF_DAY';
    } else if (existing.status !== 'LATE' && !existing.is_regularized) {
      finalStatus = 'PRESENT';
    }

    // Update attendance record with out_time
    const { data: updated, error: updateErr } = await adminClient
      .from('attendance_records')
      .update({
        out_time: nowIso,
        out_location: location,
        out_method: method,
        total_working_minutes: totalMinutes,
        status: finalStatus,
        updated_at: nowIso
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // Log audit action
    try {
      await logAuditAction({
        module: 'attendance',
        action: 'PUNCH_OUT',
        details: `Employee ${empName || email} punched out at ${new Date(nowIso).toLocaleTimeString()} on ${today} (Worked: ${formatMinutesToHours(totalMinutes)})`,
        userEmail: email,
        userName: empName
      });
    } catch (aErr) { /* ignore */ }

    return {
      success: true,
      message: `Punch Out registered successfully! Total time worked: ${formatMinutesToHours(totalMinutes)}`,
      data: updated
    };
  } catch (err) {
    console.error('punchOut exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 4. Get Monthly Attendance History for an Employee
 */
export async function getMyAttendanceHistory(userEmail, year, month, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, error: 'User email is required', records: [] };
  const adminClient = getAdminClient();

  const targetYear = parseInt(year, 10) || new Date().getFullYear();
  const targetMonth = parseInt(month, 10) || (new Date().getMonth() + 1);

  // Calculate start and end date for the selected month
  const startDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  try {
    const { data, error } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', userEmail)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr)
      .order('attendance_date', { ascending: false });

    if (error) {
      console.warn('Error fetching attendance history:', error.message);
      return { success: true, records: [], summary: {} };
    }

    const records = data || [];

    // Calculate monthly summary KPIs
    let totalPresent = 0;
    let totalLate = 0;
    let totalHalfDay = 0;
    let totalMissedPunches = 0;
    let totalRegularized = 0;
    let totalMinutesWorked = 0;

    records.forEach(r => {
      if (r.status === 'PRESENT') totalPresent++;
      if (r.status === 'LATE') { totalPresent++; totalLate++; }
      if (r.status === 'HALF_DAY') totalHalfDay++;
      if (r.status === 'REGULARIZED' || r.is_regularized) totalRegularized++;
      if (r.in_time && !r.out_time) totalMissedPunches++;
      totalMinutesWorked += (r.total_working_minutes || 0);
    });

    return {
      success: true,
      records,
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        totalPresent,
        totalLate,
        totalHalfDay,
        totalMissedPunches,
        totalRegularized,
        totalHoursFormatted: formatMinutesToHours(totalMinutesWorked),
        totalMinutesWorked,
        totalLoggedDays: records.length
      }
    };
  } catch (err) {
    console.error('getMyAttendanceHistory exception:', err);
    return { success: false, error: err.message, records: [], summary: {} };
  }
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
  requestType, // 'MISSED_IN' | 'MISSED_OUT' | 'BOTH'
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

  try {
    // 1. Fetch current punch for that date if exists
    const { data: existingPunch } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', email)
      .eq('attendance_date', attendanceDate)
      .maybeSingle();

    // 2. Check if a pending request already exists for this date
    const { data: existingPending } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .eq('email', email)
      .eq('attendance_date', attendanceDate)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (existingPending) {
      return {
        success: false,
        error: `You already have a pending regularization request for ${attendanceDate}. Please wait for HOD approval.`
      };
    }

    // 3. Auto-detect HOD if not provided
    let finalHodEmail = assignedHodEmail;
    let finalHodName = assignedHodName;

    if (!finalHodEmail) {
      const { data: userRole } = await adminClient
        .from('user_roles')
        .select('hod_person, primary_reporting_person, module_access')
        .eq('email', email)
        .maybeSingle();

      const hodCandidate = userRole?.hod_person || 
        userRole?.primary_reporting_person || 
        userRole?.module_access?.hod_person || 
        userRole?.module_access?.primary_reporting_person;

      if (hodCandidate) {
        finalHodName = hodCandidate;
        // Lookup candidate email
        const { data: hodUser } = await adminClient
          .from('user_roles')
          .select('email, emp_name')
          .or(`emp_name.eq."${hodCandidate}",email.eq."${hodCandidate}"`)
          .maybeSingle();
        
        if (hodUser) {
          finalHodEmail = hodUser.email;
          finalHodName = hodUser.emp_name || finalHodName;
        }
      }
    }

    // Prepare requested in/out timestamps based on date and time string
    let finalInIso = null;
    let finalOutIso = null;

    if (requestType === 'MISSED_IN' || requestType === 'BOTH') {
      if (!requestedInTime) throw new Error('Requested In Time is required.');
      // Combine attendanceDate + requestedInTime (e.g. 09:30)
      const inDateObj = new Date(`${attendanceDate}T${requestedInTime.length === 5 ? requestedInTime + ':00' : requestedInTime}`);
      finalInIso = isNaN(inDateObj.getTime()) ? requestedInTime : inDateObj.toISOString();
    } else if (existingPunch?.in_time) {
      finalInIso = existingPunch.in_time;
    }

    if (requestType === 'MISSED_OUT' || requestType === 'BOTH') {
      if (!requestedOutTime) throw new Error('Requested Out Time is required.');
      const outDateObj = new Date(`${attendanceDate}T${requestedOutTime.length === 5 ? requestedOutTime + ':00' : requestedOutTime}`);
      finalOutIso = isNaN(outDateObj.getTime()) ? requestedOutTime : outDateObj.toISOString();
    } else if (existingPunch?.out_time) {
      finalOutIso = existingPunch.out_time;
    }

    // Insert regularization request
    const insertPayload = {
      tenant_id: tenantId,
      user_id: userId || null,
      emp_code: empCode || '',
      emp_name: empName || email.split('@')[0],
      email: email,
      department: department || '',
      attendance_date: attendanceDate,
      request_type: requestType,
      current_in_time: existingPunch?.in_time || null,
      current_out_time: existingPunch?.out_time || null,
      requested_in_time: finalInIso,
      requested_out_time: finalOutIso,
      reason_type: reasonType,
      reason_details: reasonDetails,
      assigned_hod_email: finalHodEmail || null,
      assigned_hod_name: finalHodName || 'HOD / Manager',
      status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso
    };

    const { data: requestRecord, error: insertErr } = await adminClient
      .from('attendance_regularization_requests')
      .insert([insertPayload])
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    // Audit log
    try {
      await logAuditAction({
        module: 'attendance',
        action: 'REGULARIZATION_APPLIED',
        details: `Missing Attendance applied by ${empName || email} for date ${attendanceDate} (${requestType}: ${reasonType})`,
        userEmail: email,
        userName: empName
      });
    } catch (aErr) { /* ignore */ }

    return {
      success: true,
      message: 'Missing attendance regularization application submitted successfully! Waiting for HOD approval.',
      data: requestRecord
    };
  } catch (err) {
    console.error('applyMissingAttendance exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 6. Get User's Regularization Requests
 */
export async function getMyRegularizationRequests(userEmail, tenantId = DEFAULT_TENANT_ID) {
  if (!userEmail) return { success: false, requests: [] };
  const adminClient = getAdminClient();

  try {
    const { data, error } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .eq('email', userEmail)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching my regularization requests:', error.message);
      return { success: true, requests: [] };
    }

    return { success: true, requests: data || [] };
  } catch (err) {
    console.error('getMyRegularizationRequests exception:', err);
    return { success: false, error: err.message, requests: [] };
  }
}

/**
 * 7. Get HOD Pending Regularization Requests
 */
export async function getHodPendingRequests({
  hodEmail,
  userRole = 'agent',
  statusFilter = 'ALL', // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  departmentFilter = '',
  tenantId = DEFAULT_TENANT_ID
}) {
  const adminClient = getAdminClient();
  const isAdmin = userRole === 'admin' || userRole === 'Admin';

  try {
    let query = adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // Admins see all requests; HODs see requests assigned to them or their department
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

    if (error) {
      console.warn('Error fetching HOD requests:', error.message);
      return { success: true, requests: [] };
    }

    return {
      success: true,
      requests: data || [],
      pendingCount: (data || []).filter(r => r.status === 'PENDING').length
    };
  } catch (err) {
    console.error('getHodPendingRequests exception:', err);
    return { success: false, error: err.message, requests: [] };
  }
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

  try {
    // 1. Fetch the request
    const { data: request, error: fetchErr } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !request) {
      throw new Error('Regularization request not found');
    }

    if (request.status !== 'PENDING') {
      return {
        success: false,
        error: `This request has already been ${request.status.toLowerCase()} by ${request.action_by_name || 'HOD'}.`
      };
    }

    // 2. Mark request as APPROVED
    const { data: updatedRequest, error: updateReqErr } = await adminClient
      .from('attendance_regularization_requests')
      .update({
        status: 'APPROVED',
        action_by_name: actionByName || actionByEmail || 'HOD Approver',
        action_by_email: actionByEmail || '',
        action_at: nowIso,
        action_remarks: actionRemarks || 'Approved by HOD',
        updated_at: nowIso
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateReqErr) throw new Error(updateReqErr.message);

    // 3. CRITICAL: Automatically update or create the attendance record for that date
    const { data: existingAttendance } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('email', request.email)
      .eq('attendance_date', request.attendance_date)
      .maybeSingle();

    const finalInTime = request.requested_in_time || existingAttendance?.in_time || null;
    const finalOutTime = request.requested_out_time || existingAttendance?.out_time || null;
    const totalMinutes = calculateMinutesBetween(finalInTime, finalOutTime);

    let finalStatus = 'REGULARIZED';
    if (totalMinutes > 0 && totalMinutes < 240) {
      finalStatus = 'HALF_DAY';
    }

    let updatedAttendance = null;

    if (existingAttendance) {
      // Update existing record
      const { data: attUpdate, error: attErr } = await adminClient
        .from('attendance_records')
        .update({
          in_time: finalInTime,
          out_time: finalOutTime,
          in_method: request.request_type === 'MISSED_IN' || request.request_type === 'BOTH' ? 'REGULARIZED' : existingAttendance.in_method,
          out_method: request.request_type === 'MISSED_OUT' || request.request_type === 'BOTH' ? 'REGULARIZED' : existingAttendance.out_method,
          total_working_minutes: totalMinutes,
          status: finalStatus,
          is_regularized: true,
          regularization_id: requestId,
          remarks: `Regularized & Approved by HOD (${actionByName || actionByEmail}): ${request.reason_details}`,
          updated_at: nowIso
        })
        .eq('id', existingAttendance.id)
        .select()
        .single();

      if (attErr) throw new Error(attErr.message);
      updatedAttendance = attUpdate;
    } else {
      // Insert brand new attendance record for that date
      const { data: attInsert, error: attInsErr } = await adminClient
        .from('attendance_records')
        .insert([{
          tenant_id: tenantId,
          user_id: request.user_id || null,
          emp_code: request.emp_code || '',
          emp_name: request.emp_name,
          email: request.email,
          department: request.department || '',
          attendance_date: request.attendance_date,
          in_time: finalInTime,
          out_time: finalOutTime,
          in_method: 'REGULARIZED',
          out_method: 'REGULARIZED',
          total_working_minutes: totalMinutes,
          status: finalStatus,
          is_regularized: true,
          regularization_id: requestId,
          remarks: `Regularized by HOD (${actionByName || actionByEmail}): ${request.reason_details}`,
          created_at: nowIso,
          updated_at: nowIso
        }])
        .select()
        .single();

      if (attInsErr) throw new Error(attInsErr.message);
      updatedAttendance = attInsert;
    }

    // 4. Log Audit Action
    try {
      await logAuditAction({
        module: 'attendance',
        action: 'REGULARIZATION_APPROVED',
        details: `HOD (${actionByName || actionByEmail}) APPROVED regularization for ${request.emp_name} on date ${request.attendance_date}. Attendance updated with In: ${finalInTime ? new Date(finalInTime).toLocaleTimeString() : 'N/A'}, Out: ${finalOutTime ? new Date(finalOutTime).toLocaleTimeString() : 'N/A'}`,
        userEmail: actionByEmail,
        userName: actionByName
      });
    } catch (aErr) { /* ignore */ }

    return {
      success: true,
      message: `Regularization request for ${request.emp_name} (${request.attendance_date}) approved successfully! Attendance record updated.`,
      request: updatedRequest,
      attendance: updatedAttendance
    };
  } catch (err) {
    console.error('approveRegularizationRequest exception:', err);
    return { success: false, error: err.message };
  }
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

  try {
    const { data: request, error: fetchErr } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !request) throw new Error('Request not found');

    if (request.status !== 'PENDING') {
      return {
        success: false,
        error: `Request has already been ${request.status.toLowerCase()}.`
      };
    }

    const { data: updatedRequest, error: updateErr } = await adminClient
      .from('attendance_regularization_requests')
      .update({
        status: 'REJECTED',
        action_by_name: actionByName || actionByEmail || 'HOD',
        action_by_email: actionByEmail || '',
        action_at: nowIso,
        action_remarks: actionRemarks,
        updated_at: nowIso
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // Audit log
    try {
      await logAuditAction({
        module: 'attendance',
        action: 'REGULARIZATION_REJECTED',
        details: `HOD (${actionByName || actionByEmail}) REJECTED missing attendance request for ${request.emp_name} on date ${request.attendance_date}. Reason: ${actionRemarks}`,
        userEmail: actionByEmail,
        userName: actionByName
      });
    } catch (aErr) { /* ignore */ }

    return {
      success: true,
      message: `Regularization request for ${request.emp_name} rejected.`,
      request: updatedRequest
    };
  } catch (err) {
    console.error('rejectRegularizationRequest exception:', err);
    return { success: false, error: err.message };
  }
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

  try {
    let query = adminClient
      .from('attendance_records')
      .select('*')
      .eq('attendance_date', date)
      .order('in_time', { ascending: true, nullsFirst: false });

    if (department && department !== 'All') {
      query = query.eq('department', department);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Error fetching team master attendance:', error.message);
      return { success: true, records: [] };
    }

    // Also get active team members to calculate who hasn't punched yet today
    const { data: allUsers } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_code, department, emp_status');

    const punchedEmails = new Set((data || []).map(r => r.email));
    const absentUsers = (allUsers || [])
      .filter(u => u.emp_status !== 'InActive' && u.emp_status !== 'Terminated' && !punchedEmails.has(u.email))
      .map(u => ({
        id: `absent-${u.email}`,
        email: u.email,
        emp_name: u.emp_name || u.email.split('@')[0],
        emp_code: u.emp_code || '',
        department: u.department || '',
        attendance_date: date,
        in_time: null,
        out_time: null,
        total_working_minutes: 0,
        status: 'ABSENT',
        is_regularized: false
      }));

    const combinedRecords = [...(data || []), ...absentUsers];

    return {
      success: true,
      date,
      records: combinedRecords,
      summary: {
        totalEmployees: allUsers ? allUsers.length : combinedRecords.length,
        totalPresent: (data || []).filter(r => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'REGULARIZED').length,
        totalHalfDay: (data || []).filter(r => r.status === 'HALF_DAY').length,
        totalLate: (data || []).filter(r => r.status === 'LATE').length,
        totalAbsent: absentUsers.length,
        totalRegularized: (data || []).filter(r => r.is_regularized).length
      }
    };
  } catch (err) {
    console.error('getTeamAttendanceMaster exception:', err);
    return { success: false, error: err.message, records: [] };
  }
}
