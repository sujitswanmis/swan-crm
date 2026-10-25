'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { getHodTeam } from '@/utils/reportingHierarchy';
import { logAuditAction } from './audit';
import { 
  getTodayDateString, 
  calculateMinutesBetween, 
  formatMinutesToHours,
  evaluateMorningInPunch,
  evaluateEveningOutPunch,
  calculateMonthlyShortLeaveUsage,
  SHIFT_RULES,
  getPolicyBoundaries,
  parseTimeToSeconds,
  formatSecondsToTime,
  resolveShiftFromPolicy,
  matchShiftForPunch
} from '@/utils/attendanceUtils';
import { calculateDistanceMeters } from '@/utils/geoAttendance';
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
    short_leave_type: rec.short_leave_type || 'NONE',
    is_grace_applied: !!rec.is_grace_applied,
    shift_name: rec.shift_name || 'Regular Shift',
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
const POLICIES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_attendance_policies.json');

const DEFAULT_ATTENDANCE_POLICIES = {
  '00000000-0000-0000-0000-000000000001': {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company_name: 'New Swan Group',
    policy_version: 'v2.4',
    shift_name: 'Regular Shift (NSMLR / New Swan Group)',
    start_time: '09:00',
    end_time: '18:30',
    grace_minutes: 5,
    short_leave_total_monthly: 4,
    max_short_leave_per_day: 1,
    short_leave_1_name: '20-Minute Short Leave',
    short_leave_1_minutes: 20,
    short_leave_1_quota: 2,
    short_leave_2_name: '2-Hour Short Leave',
    short_leave_2_minutes: 120,
    short_leave_2_quota: 2,
    min_half_day_minutes: 270,
    min_full_day_minutes: 450,
    half_day_deduction_credit: 0.5,
    absent_deduction_credit: 0,
    enable_short_leaves: true,
    enable_voice_alerts: true,
    policy_notes: 'Official attendance guidelines for New Swan Group / NSMLR employees. 5-min morning grace period (09:00 - 09:05:59). Maximum 1 short leave per calendar day.',
    leave_policy: {
      enable_min_weekly_days_for_sunday: false,
      min_weekly_working_days: 3,
      enable_sandwich_rule: true,
      sandwich_mode: 'UNAPPROVED_ONLY',
      cl_quota_annual: 8,
      sl_quota_annual: 6,
      el_quota_annual: 15,
      el_lockin_months: 12,
      el_validity_years: 3,
      el_encashable: true
    },
    updated_by: 'system_default'
  },
  '0a37b8e8-1c28-4e19-8891-951fc3f8f8af': {
    tenant_id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
    company_name: 'SuPuja Creations',
    policy_version: 'v1.0',
    shift_name: 'SuPuja General Shift',
    start_time: '09:00',
    end_time: '18:30',
    grace_minutes: 5,
    short_leave_total_monthly: 4,
    max_short_leave_per_day: 1,
    short_leave_1_name: '20-Minute Short Leave',
    short_leave_1_minutes: 20,
    short_leave_1_quota: 2,
    short_leave_2_name: '2-Hour Short Leave',
    short_leave_2_minutes: 120,
    short_leave_2_quota: 2,
    min_half_day_minutes: 270,
    min_full_day_minutes: 450,
    half_day_deduction_credit: 0.5,
    absent_deduction_credit: 0,
    enable_short_leaves: true,
    enable_voice_alerts: true,
    policy_notes: 'SuPuja Creations Enterprise Attendance Guidelines. Fully customizable by company administration.',
    leave_policy: {
      enable_min_weekly_days_for_sunday: false,
      min_weekly_working_days: 3,
      enable_sandwich_rule: true,
      sandwich_mode: 'UNAPPROVED_ONLY',
      cl_quota_annual: 8,
      sl_quota_annual: 6,
      el_quota_annual: 15,
      el_lockin_months: 12,
      el_validity_years: 3,
      el_encashable: true
    },
    updated_by: 'system_default'
  },
  '922d3e72-6588-457f-a562-4f1bdbf10d98': {
    tenant_id: '922d3e72-6588-457f-a562-4f1bdbf10d98',
    company_name: 'Testing New Swan Group',
    policy_version: 'v1.0',
    shift_name: 'Testing Regular Shift',
    start_time: '09:00',
    end_time: '18:30',
    grace_minutes: 5,
    short_leave_total_monthly: 4,
    max_short_leave_per_day: 1,
    short_leave_1_name: '20-Minute Short Leave',
    short_leave_1_minutes: 20,
    short_leave_1_quota: 2,
    short_leave_2_name: '2-Hour Short Leave',
    short_leave_2_minutes: 120,
    short_leave_2_quota: 2,
    min_half_day_minutes: 270,
    min_full_day_minutes: 450,
    half_day_deduction_credit: 0.5,
    absent_deduction_credit: 0,
    enable_short_leaves: true,
    enable_voice_alerts: true,
    policy_notes: 'Testing Sandbox Attendance Policy.',
    leave_policy: {
      enable_min_weekly_days_for_sunday: false,
      min_weekly_working_days: 3,
      enable_sandwich_rule: true,
      sandwich_mode: 'UNAPPROVED_ONLY',
      cl_quota_annual: 8,
      sl_quota_annual: 6,
      el_quota_annual: 15,
      el_lockin_months: 12,
      el_validity_years: 3,
      el_encashable: true
    },
    updated_by: 'system_default'
  }
};

async function getFallbackPolicies() {
  try {
    const raw = await fs.readFile(POLICIES_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ATTENDANCE_POLICIES, ...parsed };
  } catch {
    return DEFAULT_ATTENDANCE_POLICIES;
  }
}

async function saveFallbackPolicies(data) {
  try {
    await fs.mkdir(path.dirname(POLICIES_FILE_PATH), { recursive: true });
    await fs.writeFile(POLICIES_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving tenant attendance policies:', err);
  }
}

/**
 * Resolve effective tenant_id from company string or tenant code if not an explicit UUID
 */
function resolveTenantId(tenantId, userCompany = '') {
  const comp = (userCompany || '').toLowerCase().trim();
  const rawId = String(tenantId || '').toLowerCase().trim();

  if (comp.includes('supuja') || comp.includes('tnt00001') || rawId === 'tnt00001' || rawId === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af') {
    return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
  }
  if (comp.includes('testing') || comp.includes('tnt00003') || rawId === 'tnt00003' || rawId === '922d3e72-6588-457f-a562-4f1bdbf10d98') {
    return '922d3e72-6588-457f-a562-4f1bdbf10d98';
  }
  if (comp.includes('swan') || comp.includes('nsmlr') || comp.includes('nstlp') || comp.includes('tnt00002') || rawId === 'tnt00002') {
    return '00000000-0000-0000-0000-000000000001';
  }

  if (tenantId && isValidUuid(tenantId) && tenantId !== '00000000-0000-0000-0000-000000000001') {
    return tenantId;
  }
  return tenantId || '00000000-0000-0000-0000-000000000001';
}

/**
 * 0. Get Tenant Attendance Policy (Dynamic for each company/tenant)
 */
export async function getTenantAttendancePolicy(tenantId = null, userCompany = '', branchName = '') {
  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const cleanBranch = branchName && branchName !== 'All Branches' ? branchName.trim() : '';
  const adminClient = getAdminClient();

  // 1. Try Supabase Database first
  try {
    const fallbackPolicies = await getFallbackPolicies();
    if (cleanBranch) {
      const { data: dbBranchPolicy, error: branchErr } = await adminClient
        .from('attendance_shift_policies')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .eq('branch_name', cleanBranch)
        .maybeSingle();

      if (!branchErr && dbBranchPolicy && dbBranchPolicy.tenant_id) {
        const fb = fallbackPolicies[`${effectiveTenantId}:${cleanBranch}`] || fallbackPolicies[effectiveTenantId] || {};
        return {
          success: true,
          data: {
            ...fb,
            ...dbBranchPolicy,
            leave_policy: dbBranchPolicy.leave_policy || fb.leave_policy || DEFAULT_ATTENDANCE_POLICIES[effectiveTenantId]?.leave_policy || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]?.leave_policy
          }
        };
      }
    }

    const { data: dbPolicy, error: dbErr } = await adminClient
      .from('attendance_shift_policies')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .is('branch_name', null)
      .maybeSingle();

    if (!dbErr && dbPolicy && dbPolicy.tenant_id) {
      const fb = fallbackPolicies[effectiveTenantId] || fallbackPolicies[`${effectiveTenantId}:All Branches`] || {};
      return {
        success: true,
        data: {
          ...fb,
          ...dbPolicy,
          leave_policy: dbPolicy.leave_policy || fb.leave_policy || DEFAULT_ATTENDANCE_POLICIES[effectiveTenantId]?.leave_policy || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]?.leave_policy
        }
      };
    }

    const { data: fallbackDbPolicy } = await adminClient
      .from('attendance_shift_policies')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .maybeSingle();

    if (fallbackDbPolicy && fallbackDbPolicy.tenant_id) {
      const fb = fallbackPolicies[effectiveTenantId] || fallbackPolicies[`${effectiveTenantId}:All Branches`] || {};
      return {
        success: true,
        data: {
          ...fb,
          ...fallbackDbPolicy,
          leave_policy: fallbackDbPolicy.leave_policy || fb.leave_policy || DEFAULT_ATTENDANCE_POLICIES[effectiveTenantId]?.leave_policy || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]?.leave_policy
        }
      };
    }
  } catch (err) {
    // Database table not created yet or offline, continue to fallback
  }

  // 2. Try Local File Fallback
  const fallbackPolicies = await getFallbackPolicies();
  if (cleanBranch && fallbackPolicies[`${effectiveTenantId}:${cleanBranch}`]) {
    return {
      success: true,
      data: fallbackPolicies[`${effectiveTenantId}:${cleanBranch}`]
    };
  }

  if (!cleanBranch && fallbackPolicies[`${effectiveTenantId}:All Branches`]) {
    return {
      success: true,
      data: fallbackPolicies[`${effectiveTenantId}:All Branches`]
    };
  }

  if (fallbackPolicies[effectiveTenantId]) {
    return {
      success: true,
      data: fallbackPolicies[effectiveTenantId]
    };
  }

  // 3. Match by company name in fallback
  for (const pol of Object.values(fallbackPolicies)) {
    if (userCompany && matchesCompany(userCompany, pol.company_name)) {
      return { success: true, data: pol };
    }
  }

  // 4. Default Enterprise Template
  const defaultPol = {
    ...DEFAULT_ATTENDANCE_POLICIES['00000000-0000-0000-0000-000000000001'],
    tenant_id: effectiveTenantId,
    company_name: userCompany || 'Enterprise'
  };

  return { success: true, data: defaultPol };
}

/**
 * Save / Update Tenant Attendance Policy (Admin / Master Admin)
 */
export async function saveTenantAttendancePolicy(tenantId, userCompany, policyData, updatedBy = 'Admin', branchName = '') {
  if (!policyData) return { success: false, error: 'Policy data is required' };
  const effectiveTenantId = resolveTenantId(tenantId, userCompany || policyData.company_name);
  const rawBranch = branchName || policyData.branch_name || '';
  const cleanBranch = (rawBranch && rawBranch !== 'All Branches' && rawBranch !== 'All Branches (Default)') ? rawBranch.trim() : null;

  // Normalize shifts array if provided
  const rawShifts = Array.isArray(policyData.shifts) && policyData.shifts.length > 0 
    ? policyData.shifts 
    : [];

  let cleanShifts = rawShifts.map((s, idx) => ({
    id: s.id || `shift_${idx + 1}`,
    shift_code: s.shift_code || `SHIFT_${idx + 1}`,
    shift_name: s.shift_name || `Shift ${idx + 1}`,
    is_default: !!s.is_default,
    start_time: s.start_time || '09:00',
    end_time: s.end_time || '18:30',
    grace_minutes: Number(s.grace_minutes ?? 5),
    short_leave_1_name: s.short_leave_1_name || '20-Minute Short Leave',
    short_leave_1_minutes: Number(s.short_leave_1_minutes ?? 20),
    short_leave_1_quota: Number(s.short_leave_1_quota ?? 2),
    short_leave_2_name: s.short_leave_2_name || '2-Hour Short Leave',
    short_leave_2_minutes: Number(s.short_leave_2_minutes ?? 120),
    short_leave_2_quota: Number(s.short_leave_2_quota ?? 2),
    min_half_day_minutes: Number(s.min_half_day_minutes ?? 270),
    min_full_day_minutes: Number(s.min_full_day_minutes ?? 450)
  }));

  if (cleanShifts.length > 0 && !cleanShifts.some(s => s.is_default)) {
    cleanShifts[0].is_default = true;
  }

  const defaultShift = cleanShifts.find(s => s.is_default) || cleanShifts[0] || null;

  const cleanPolicy = {
    tenant_id: effectiveTenantId,
    branch_name: cleanBranch || null,
    company_name: policyData.company_name || userCompany || 'Enterprise',
    policy_version: policyData.policy_version || 'v1.0',
    shift_name: defaultShift ? defaultShift.shift_name : (policyData.shift_name || 'Regular Shift'),
    start_time: defaultShift ? defaultShift.start_time : (policyData.start_time || '09:00'),
    end_time: defaultShift ? defaultShift.end_time : (policyData.end_time || '18:30'),
    grace_minutes: defaultShift ? defaultShift.grace_minutes : Number(policyData.grace_minutes ?? 5),
    short_leave_total_monthly: Number(policyData.short_leave_total_monthly ?? 4),
    max_short_leave_per_day: Number(policyData.max_short_leave_per_day ?? 1),
    short_leave_1_name: defaultShift ? defaultShift.short_leave_1_name : (policyData.short_leave_1_name || '20-Minute Short Leave'),
    short_leave_1_minutes: defaultShift ? defaultShift.short_leave_1_minutes : Number(policyData.short_leave_1_minutes ?? 20),
    short_leave_1_quota: defaultShift ? defaultShift.short_leave_1_quota : Number(policyData.short_leave_1_quota ?? 2),
    short_leave_2_name: defaultShift ? defaultShift.short_leave_2_name : (policyData.short_leave_2_name || '2-Hour Short Leave'),
    short_leave_2_minutes: defaultShift ? defaultShift.short_leave_2_minutes : Number(policyData.short_leave_2_minutes ?? 120),
    short_leave_2_quota: defaultShift ? defaultShift.short_leave_2_quota : Number(policyData.short_leave_2_quota ?? 2),
    min_half_day_minutes: defaultShift ? defaultShift.min_half_day_minutes : Number(policyData.min_half_day_minutes ?? 270),
    min_full_day_minutes: defaultShift ? defaultShift.min_full_day_minutes : Number(policyData.min_full_day_minutes ?? 450),
    half_day_deduction_credit: Number(policyData.half_day_deduction_credit ?? 0.5),
    absent_deduction_credit: Number(policyData.absent_deduction_credit ?? 0.0),
    enable_short_leaves: policyData.enable_short_leaves !== false,
    enable_voice_alerts: policyData.enable_voice_alerts !== false,
    shifts: cleanShifts.length > 0 ? cleanShifts : (Array.isArray(policyData.shifts) ? policyData.shifts : []),
    policy_notes: policyData.policy_notes || '',
    enable_geofence: Boolean(policyData.enable_geofence),
    require_gps: (policyData.require_gps === 'AUTO' || policyData.require_gps === 'auto')
      ? 'AUTO'
      : (policyData.require_gps === true || policyData.require_gps === 'ON' || policyData.require_gps === 'true' || policyData.require_gps === 'STRICT')
        ? 'ON'
        : 'OFF',
    geofence_mode: policyData.geofence_mode || 'STRICT_BLOCK',
    geofence_locations: Array.isArray(policyData.geofence_locations) ? policyData.geofence_locations : [],
    updated_by: updatedBy,
    updated_at: new Date().toISOString()
  };

  // 1. Dual-write to local JSON fallback
  const fallbackPolicies = await getFallbackPolicies();
  const fileKey = cleanBranch ? `${effectiveTenantId}:${cleanBranch}` : effectiveTenantId;
  fallbackPolicies[fileKey] = cleanPolicy;
  if (!cleanBranch) {
    fallbackPolicies[`${effectiveTenantId}:All Branches`] = cleanPolicy;
  }
  await saveFallbackPolicies(fallbackPolicies);

  // 2. Dual-write to Supabase DB
  try {
    const adminClient = getAdminClient();
    if (cleanBranch) {
      const { data: existing } = await adminClient
        .from('attendance_shift_policies')
        .select('id')
        .eq('tenant_id', effectiveTenantId)
        .eq('branch_name', cleanBranch)
        .maybeSingle();

      if (existing?.id) {
        await adminClient
          .from('attendance_shift_policies')
          .update(cleanPolicy)
          .eq('id', existing.id);
      } else {
        await adminClient
          .from('attendance_shift_policies')
          .insert(cleanPolicy);
      }
    } else {
      await adminClient
        .from('attendance_shift_policies')
        .upsert(cleanPolicy, { onConflict: 'tenant_id' });
    }
  } catch (err) {
    console.warn('Notice: Could not write attendance policy to Supabase table (saved to local config file):', err?.message);
  }

  // 3. Log Audit
  try {
    await logAuditAction({
      action: 'UPDATE_ATTENDANCE_POLICY',
      module: 'ATTENDANCE',
      performedBy: updatedBy,
      tenantId: effectiveTenantId,
      details: {
        branch_name: cleanBranch || 'All Branches',
        shift_name: cleanPolicy.shift_name,
        start_time: cleanPolicy.start_time,
        end_time: cleanPolicy.end_time,
        grace_minutes: cleanPolicy.grace_minutes,
        shifts_count: cleanPolicy.shifts.length
      }
    });
  } catch {}

  return { success: true, policy: cleanPolicy };
}

/**
 * Get All Tenant Attendance Policies (Master Admin)
 */
export async function getAllTenantAttendancePolicies() {
  const fallbackPolicies = await getFallbackPolicies();
  try {
    const adminClient = getAdminClient();
    const { data: dbPolicies } = await adminClient
      .from('attendance_shift_policies')
      .select('*');

    if (dbPolicies && dbPolicies.length > 0) {
      const merged = { ...fallbackPolicies };
      dbPolicies.forEach(p => {
        merged[p.tenant_id] = p;
      });
      return { success: true, data: Object.values(merged) };
    }
  } catch {}

  return { success: true, data: Object.values(fallbackPolicies) };
}

/**
 * Helper to match company / workspace branch
 */
function matchesCompany(userComp, targetCompany) {
  if (!targetCompany || targetCompany.toLowerCase() === 'all') return true;
  const target = targetCompany.toLowerCase().trim();
  const uComp = (userComp || '').toLowerCase().trim();
  if (target === 'nsmlr') return uComp.includes('nsmlr');
  if (target === 'nstlp' || target.includes('nstl')) return uComp.includes('nstl');
  if (target.startsWith('nse')) return uComp.includes('nse');
  if (target.includes('supuja')) return uComp.includes('supuja');
  if (target.includes('testing')) return uComp.includes('testing');
  if (target.includes('swan') || target.includes('new swan')) {
    return uComp.includes('swan') || ['nsmlr', 'nstlp', 'nse', ''].includes(uComp);
  }
  return uComp === target || uComp.includes(target);
}

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

const LEAVES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'employee_leaves.json');

// Helper to read JSON leaves fallback data
async function getFallbackLeavesData() {
  try {
    const raw = await fs.readFile(LEAVES_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      cpl_grants: Array.isArray(parsed.cpl_grants) ? parsed.cpl_grants : []
    };
  } catch (err) {
    const initial = { requests: [] };
    try {
      await fs.mkdir(path.dirname(LEAVES_FILE_PATH), { recursive: true });
      await fs.writeFile(LEAVES_FILE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    } catch {}
    return initial;
  }
}

// Helper to save JSON leaves fallback data
async function saveFallbackLeavesData(data) {
  try {
    await fs.mkdir(path.dirname(LEAVES_FILE_PATH), { recursive: true });
    await fs.writeFile(LEAVES_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving fallback leaves data:', err);
  }
}

/**
 * 1. Get Today's Attendance for Current User
 */
export async function getTodayAttendance(userEmail, userId, tenantId = DEFAULT_TENANT_ID, userCompany = '') {
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
  const localRec = local.records.find(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    (r.email || '').toLowerCase() === normalizedEmail && 
    r.attendance_date === today
  );

  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [monthRes, todayRes] = await Promise.all([
      adminClient
        .from('attendance_records')
        .select('*')
        .ilike('email', normalizedEmail)
        .eq('tenant_id', tenantId)
        .gte('attendance_date', startDateStr)
        .lte('attendance_date', endDateStr),
      adminClient
        .from('attendance_records')
        .select('*')
        .ilike('email', normalizedEmail)
        .eq('tenant_id', tenantId)
        .eq('attendance_date', today)
        .maybeSingle()
    ]);

    const dbMonthRecs = monthRes?.data;
    const dbToday = todayRes?.data;

    if (dbMonthRecs && dbMonthRecs.length > 0) {
      monthlyRecords = dbMonthRecs;
    } else {
      monthlyRecords = local.records.filter(r => 
        (r.tenant_id || DEFAULT_TENANT_ID) === tenantId && 
        (r.email || '').toLowerCase() === normalizedEmail
      );
    }

    let tenantPolicy = null;
    try {
      const policyRes = await getTenantAttendancePolicy(tenantId, userCompany);
      tenantPolicy = policyRes?.data || null;
    } catch {}
    const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today, tenantPolicy);

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
    const monthlyUsage = calculateMonthlyShortLeaveUsage(local.records.filter(r => (r.tenant_id || DEFAULT_TENANT_ID) === tenantId && (r.email || '').toLowerCase() === normalizedEmail), nowYear, nowMonth, today);
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
  tenantId = DEFAULT_TENANT_ID,
  shiftName = null,
  userCompany = ''
}) {
  if (!email) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Fetch current today record from local or DB - Strict 1-Time Punch In Rule
  const local = await getFallbackData();
  const existingLocal = local.records.find(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    (r.email || '').toLowerCase() === normalizedEmail && 
    r.attendance_date === today
  );
  let existingDb = null;

  try {
    const { data: dbRec } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('tenant_id', tenantId)
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

  let monthlyRecords = local.records.filter(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    (r.email || '').toLowerCase() === normalizedEmail
  );
  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: dbMonthRecs } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('tenant_id', tenantId)
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
  let assignedShiftFromDb = null;

  try {
    const { data: userRole } = await adminClient
      .from('user_roles')
      .select('emp_id, emp_name, emp_department, assigned_shift')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (userRole) {
      if (!resolvedEmpCode) resolvedEmpCode = userRole.emp_id || '';
      if (!resolvedDepartment) resolvedDepartment = userRole.emp_department || 'General';
      if (!resolvedEmpName || resolvedEmpName === email.split('@')[0]) resolvedEmpName = userRole.emp_name || resolvedEmpName;
      if (userRole.assigned_shift) assignedShiftFromDb = userRole.assigned_shift;
    }
  } catch {}

  const effectiveCompany = userCompany || '';
  const effectiveTenant = resolveTenantId(tenantId, effectiveCompany);
  const policyRes = await getTenantAttendancePolicy(effectiveTenant, effectiveCompany);
  const tenantPolicy = policyRes?.data || null;

  // 1. Mandatory GPS Permission Check (ON / OFF / AUTO)
  const rawGpsMode = tenantPolicy?.require_gps;
  const isStrictGps = rawGpsMode === true || rawGpsMode === 'ON' || rawGpsMode === 'true' || rawGpsMode === 'STRICT';
  const isAutoGps = rawGpsMode === 'AUTO' || rawGpsMode === 'auto';
  const isGpsPunch = location && typeof location === 'string' && location.startsWith('GPS');

  let geofenceRemarks = '';

  if (!isGpsPunch) {
    if (isStrictGps) {
      return {
        success: false,
        error: '⚠️ Mandatory GPS Policy Enforced: Location / GPS permission allow karna anivarya hai. Bina location permission ke Punch In nahi ho sakta.'
      };
    }
    if (isAutoGps) {
      geofenceRemarks = '[⚠️ GPS Unavailable (Punch Allowed via Auto Fallback)]';
    }
  }

  // 2. Geofence Boundary Check
  if (tenantPolicy?.enable_geofence && Array.isArray(tenantPolicy?.geofence_locations) && tenantPolicy.geofence_locations.length > 0) {
    const activeLocations = tenantPolicy.geofence_locations.filter(loc => loc.is_active !== false && loc.latitude && loc.longitude);
    if (activeLocations.length > 0) {
      const gpsMatch = location?.match(/GPS\s*\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/i);
      if (gpsMatch) {
        const userLat = parseFloat(gpsMatch[1]);
        const userLon = parseFloat(gpsMatch[2]);

        let minDistance = Infinity;
        let nearestOffice = null;

        for (const loc of activeLocations) {
          const dist = calculateDistanceMeters(userLat, userLon, Number(loc.latitude), Number(loc.longitude));
          if (dist < minDistance) {
            minDistance = dist;
            nearestOffice = loc;
          }
        }

        if (nearestOffice) {
          const allowedRadius = Number(nearestOffice.radius_meters || 200);
          const isWithin = minDistance <= allowedRadius;

          if (!isWithin) {
            if (tenantPolicy.geofence_mode === 'FLAG_OUTSIDE') {
              geofenceRemarks = (geofenceRemarks ? geofenceRemarks + ' ' : '') + `[Outside Geofence: ${minDistance}m from ${nearestOffice.name || 'Office'}]`;
            } else {
              return {
                success: false,
                error: `🚫 Office Geofence Violation: Aap "${nearestOffice.name || 'Office'}" se ${minDistance}m door hain (Allowed radius: ${allowedRadius}m). Kripya office campus me aakar punch karein.`
              };
            }
          } else {
            geofenceRemarks = (geofenceRemarks ? geofenceRemarks + ' ' : '') + `[Inside Geofence: ${minDistance}m from ${nearestOffice.name || 'Office'}]`;
          }
        }
      } else if (isStrictGps) {
        return {
          success: false,
          error: '⚠️ Mandatory GPS Policy Enforced: Valid GPS coordinates prapt nahi ho sake. Kripya location check karein.'
        };
      }
    }
  }

  // Multi-Shift Resolution:
  // 1. Explicitly selected shift during punch (shiftName)
  // 2. Employee's assigned shift in user_roles (assignedShiftFromDb)
  // 3. Proximity-based auto-matched shift from tenantPolicy based on current time
  const preferredShift = shiftName || assignedShiftFromDb || null;
  const activeShift = matchShiftForPunch(tenantPolicy, now, preferredShift);
  const resolvedShiftName = activeShift?.shift_name || tenantPolicy?.shift_name || 'Regular Shift';

  const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today, activeShift || tenantPolicy);
  const evaluation = evaluateMorningInPunch(now, monthlyUsage, resolvedEmpName, activeShift || tenantPolicy);

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
    shift_name: resolvedShiftName,
    is_regularized: false,
    remarks: [geofenceRemarks, evaluation.remarks].filter(Boolean).join(' '),
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
  tenantId = DEFAULT_TENANT_ID,
  userCompany = ''
}) {
  if (!email) return { success: false, error: 'User email is required' };
  const adminClient = getAdminClient();
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Fetch current today record from local or DB
  const local = await getFallbackData();
  let existingLocal = local.records.find(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    (r.email || '').toLowerCase() === normalizedEmail && 
    r.attendance_date === today
  );
  let existingDb = null;

  try {
    const { data: dbRec } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('tenant_id', tenantId)
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

  let monthlyRecords = local.records.filter(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    (r.email || '').toLowerCase() === normalizedEmail
  );
  try {
    const startDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(nowYear, nowMonth, 0).getDate();
    const endDateStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: dbMonthRecs } = await adminClient
      .from('attendance_records')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('tenant_id', tenantId)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr);

    if (dbMonthRecs && dbMonthRecs.length > 0) {
      monthlyRecords = dbMonthRecs;
    }
  } catch {}

  let effectiveCompany = userCompany || existing.company_name || '';
  if (!effectiveCompany) {
    try {
      const { data: uRole } = await adminClient
        .from('user_roles')
        .select('company_name, tenant_id')
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (uRole?.company_name) effectiveCompany = uRole.company_name;
    } catch {}
  }
  const effectiveTenant = resolveTenantId(tenantId, effectiveCompany);
  const policyRes = await getTenantAttendancePolicy(effectiveTenant, effectiveCompany);
  const tenantPolicy = policyRes?.data || null;

  // 1. Mandatory GPS Permission Check (ON / OFF / AUTO)
  const rawGpsMode = tenantPolicy?.require_gps;
  const isStrictGps = rawGpsMode === true || rawGpsMode === 'ON' || rawGpsMode === 'true' || rawGpsMode === 'STRICT';
  const isAutoGps = rawGpsMode === 'AUTO' || rawGpsMode === 'auto';
  const isGpsPunch = location && typeof location === 'string' && location.startsWith('GPS');

  let geofenceRemarks = '';

  if (!isGpsPunch) {
    if (isStrictGps) {
      return {
        success: false,
        error: '⚠️ Mandatory GPS Policy Enforced: Location / GPS permission allow karna anivarya hai. Bina location permission ke Punch Out nahi ho sakta.'
      };
    }
    if (isAutoGps) {
      geofenceRemarks = '[⚠️ GPS Unavailable (Punch Allowed via Auto Fallback)]';
    }
  }

  // 2. Geofence Boundary Check
  if (tenantPolicy?.enable_geofence && Array.isArray(tenantPolicy?.geofence_locations) && tenantPolicy.geofence_locations.length > 0) {
    const activeLocations = tenantPolicy.geofence_locations.filter(loc => loc.is_active !== false && loc.latitude && loc.longitude);
    if (activeLocations.length > 0) {
      const gpsMatch = location?.match(/GPS\s*\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/i);
      if (gpsMatch) {
        const userLat = parseFloat(gpsMatch[1]);
        const userLon = parseFloat(gpsMatch[2]);

        let minDistance = Infinity;
        let nearestOffice = null;

        for (const loc of activeLocations) {
          const dist = calculateDistanceMeters(userLat, userLon, Number(loc.latitude), Number(loc.longitude));
          if (dist < minDistance) {
            minDistance = dist;
            nearestOffice = loc;
          }
        }

        if (nearestOffice) {
          const allowedRadius = Number(nearestOffice.radius_meters || 200);
          const isWithin = minDistance <= allowedRadius;

          if (!isWithin) {
            if (tenantPolicy.geofence_mode === 'FLAG_OUTSIDE') {
              geofenceRemarks = (geofenceRemarks ? geofenceRemarks + ' ' : '') + `[Outside Geofence: ${minDistance}m from ${nearestOffice.name || 'Office'}]`;
            } else {
              return {
                success: false,
                error: `🚫 Office Geofence Violation: Aap "${nearestOffice.name || 'Office'}" se ${minDistance}m door hain (Allowed radius: ${allowedRadius}m). Kripya office campus me aakar punch out karein.`
              };
            }
          } else {
            geofenceRemarks = (geofenceRemarks ? geofenceRemarks + ' ' : '') + `[Inside Geofence: ${minDistance}m from ${nearestOffice.name || 'Office'}]`;
          }
        }
      } else if (isStrictGps) {
        return {
          success: false,
          error: '⚠️ Mandatory GPS Policy Enforced: Valid GPS coordinates prapt nahi ho sake. Kripya location check karein.'
        };
      }
    }
  }

  const activeShift = resolveShiftFromPolicy(tenantPolicy, existing.shift_name);

  const monthlyUsage = calculateMonthlyShortLeaveUsage(monthlyRecords, nowYear, nowMonth, today, activeShift || tenantPolicy);
  const evaluation = evaluateEveningOutPunch(now, existing.in_time, existing, monthlyUsage, empName || email.split('@')[0], activeShift || tenantPolicy);

  let updatedRecord = {
    ...existing,
    email: normalizedEmail,
    out_time: nowIso,
    out_location: location,
    out_method: method,
    total_working_minutes: evaluation.total_working_minutes,
    status: evaluation.status,
    short_leave_type: evaluation.short_leave_type,
    remarks: [geofenceRemarks, evaluation.remarks].filter(Boolean).join(' '),
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
      remarks: [geofenceRemarks, evaluation.remarks].filter(Boolean).join(' '),
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
export async function getMyAttendanceHistory(userEmail, year, month, tenantId = DEFAULT_TENANT_ID, userCompany = '') {
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
      .eq('tenant_id', tenantId)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr)
      .order('attendance_date', { ascending: false });

    if (!error && data) {
      dbRecords = data;
    }
  } catch (e) {}

  const local = await getFallbackData();
  const localRecords = (local.records || []).filter(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
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

  let tenantPolicy = null;
  try {
    const policyRes = await getTenantAttendancePolicy(tenantId, userCompany);
    if (policyRes?.success && policyRes.data) {
      tenantPolicy = policyRes.data;
    }
  } catch {}
  const shortLeaveUsage = calculateMonthlyShortLeaveUsage(records, targetYear, targetMonth, null, tenantPolicy);

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
  const localReqs = local.requests.filter(r => 
    (r.tenant_id || DEFAULT_TENANT_ID) === tenantId &&
    r.email && r.email.trim().toLowerCase() === normalizedEmail
  );
  const localMap = {};
  for (const r of localReqs) localMap[r.id] = r;

  try {
    const { data, error } = await adminClient
      .from('attendance_regularization_requests')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('tenant_id', tenantId)
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
  tenantId = DEFAULT_TENANT_ID,
  company = ''
}) {
  const adminClient = getAdminClient();
  const isAdmin = userRole === 'admin' || userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'super_admin' || userRole === 'management';

  // Resolve allowed employee emails by company / branch filter if specified
  let allowedEmails = null;
  if (company && company.toLowerCase() !== 'all') {
    try {
      const { data: uData } = await adminClient
        .from('user_roles')
        .select('email, company');
      if (uData && Array.isArray(uData)) {
        const matchingUsers = uData.filter(u => matchesCompany(u.company, company));
        allowedEmails = new Set(matchingUsers.map(u => (u.email || '').toLowerCase().trim()));
      }
    } catch {}
  }

  // Always load local fallback scoped to tenant and branch
  const local = await getFallbackData();
  const localFiltered = local.requests.filter(r => {
    if ((r.tenant_id || DEFAULT_TENANT_ID) !== tenantId) return false;
    if (departmentFilter && departmentFilter !== 'All' && r.department !== departmentFilter) return false;
    if (allowedEmails && !allowedEmails.has((r.email || '').toLowerCase().trim())) return false;
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
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!isAdmin && hodEmail) {
      query = query.or(`assigned_hod_email.eq."${hodEmail}",assigned_hod_name.ilike."%${hodEmail.split('@')[0]}%"`);
    }

    if (departmentFilter && departmentFilter !== 'All') {
      query = query.eq('department', departmentFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      // Filter DB records by allowed company emails if branch-scoped
      let filteredData = data;
      if (allowedEmails) {
        filteredData = data.filter(r => allowedEmails.has((r.email || '').toLowerCase().trim()));
      }
      // Merge: DB takes priority; add local-only records (newly submitted, not yet synced to DB)
      const dbMap = {};
      for (const r of filteredData) dbMap[r.id] = r;
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
      .eq('id', ensureUuid(requestId))
      .eq('tenant_id', tenantId);

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
  actionRemarks = 'Rejected by HOD',
  tenantId = DEFAULT_TENANT_ID
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
        .eq('tenant_id', tenantId)
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
      .eq('id', ensureUuid(requestId))
      .eq('tenant_id', tenantId);
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
  actionRemarks = 'Bulk Rejected by HOD',
  tenantId = DEFAULT_TENANT_ID
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
        actionRemarks,
        tenantId
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
  tenantId = DEFAULT_TENANT_ID,
  company = ''
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
      .select('user_id, emp_name, email, emp_id, emp_department, module_access, created_at, is_approved, role, company');
    if (!uErr && Array.isArray(usersData)) {
      let filteredUsers = usersData;
      if (company && company !== 'all') {
        filteredUsers = usersData.filter(u => matchesCompany(u.company, company));
      }

      allUsers = filteredUsers
        .filter(u => {
          // Team Management Approval Status = Approved
          if (u.is_approved !== true) return false;
          // Must not be a customer
          if (u.role === 'customer') return false;
          const status = u.module_access?.emp_status;
          return status !== 'InActive' && status !== 'Terminated' && status !== 'Resigned' && status !== 'Trash' && status !== 'Draft';
        })
        .map(u => ({
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

  const approvedUserEmails = new Set(allUsers.map(u => u.email?.toLowerCase()));
  const approvedUserIds = new Set(allUsers.map(u => u.user_id).filter(Boolean));

  try {
    let query = adminClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', tenantId);

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
      // Keep records only for approved team members
      dbRecords = data.filter(r => {
        if (r.user_id && approvedUserIds.has(r.user_id)) return true;
        if (r.email && approvedUserEmails.has((r.email || '').toLowerCase())) return true;
        return false;
      });
    }
  } catch {}

  const local = await getFallbackData();
  const localDayRecs = (local.records || []).filter(r => {
    if ((r.tenant_id || DEFAULT_TENANT_ID) !== tenantId) return false;
    if (isRange) {
      if (r.attendance_date < effectiveStart || r.attendance_date > effectiveEnd) return false;
    } else {
      if (r.attendance_date !== effectiveStart) return false;
    }
    if (department && department !== 'All' && r.department !== department) return false;
    // Only approved team members
    if (r.user_id && approvedUserIds.has(r.user_id)) return true;
    if (r.email && approvedUserEmails.has((r.email || '').toLowerCase())) return true;
    return false;
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
    const punchedIds = new Set(enrichedDbRecords.map(r => r.user_id).filter(Boolean));
    const absentUsers = (allUsers || [])
      .filter(u => {
        if (department && department !== 'All' && u.department !== department) return false;
        if (u.user_id && punchedIds.has(u.user_id)) return false;
        if (punchedEmails.has(u.email?.toLowerCase())) return false;
        return true;
      })
      .map(u => ({
        id: `absent-${u.email}`,
        user_id: u.user_id,
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

  const activeEmployeesCount = (department && department !== 'All') 
    ? allUsers.filter(u => u.department === department).length 
    : allUsers.length;

  return {
    success: true,
    date: effectiveStart,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    isRange,
    records: combinedRecords,
    summary: {
      totalEmployees: activeEmployeesCount > 0 ? activeEmployeesCount : combinedRecords.length,
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
  todayStr,
  policy = null
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

  // 2. Rule 1: Weekly Min Working Days Rule (OPTIONAL TOGGLE: Configurable by company)
  const minWeeklyEnabled = policy?.leave_policy?.enable_min_weekly_days_for_sunday === true;
  const minRequiredSetting = Number(policy?.leave_policy?.min_weekly_working_days ?? 3);

  if (minWeeklyEnabled) {
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
          if (dayRec.status === 'PRESENT' || dayRec.status === 'LATE' || dayRec.status === 'REGULARIZED' || dayRec.is_regularized || dayRec.is_paid_leave) {
            weeklyPresentDays += 1;
          } else if (dayRec.status === 'HALF_DAY') {
            weeklyPresentDays += 0.5;
          }
        }
      }
    }

    const requiredMinDays = Math.min(minRequiredSetting, totalDaysEvaluated);
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
  }

  // 3. Rule 2: Sandwich Rule
  const sandwichMode = policy?.leave_policy?.sandwich_mode || (policy?.leave_policy?.enable_sandwich_rule !== false ? 'UNAPPROVED_ONLY' : 'OFF');
  if (sandwichMode !== 'OFF') {
    const satDate = new Date(sunday);
    satDate.setDate(sunday.getDate() - 1);
    const satDateStr = satDate.toISOString().split('T')[0];

    const monDate = new Date(sunday);
    monDate.setDate(sunday.getDate() + 1);
    const monDateStr = monDate.toISOString().split('T')[0];

    const satRec = recordsMapByDate.get(satDateStr);
    const monRec = recordsMapByDate.get(monDateStr);

    let isSatAbsent = false;
    let isMonAbsent = false;

    if (satDateStr <= todayStr) {
      if (!satRec || (!satRec.in_time && !satRec.out_time)) {
        isSatAbsent = true;
      } else if (satRec.status === 'ABSENT' || satRec.status === 'LWP') {
        isSatAbsent = true;
      } else if (sandwichMode === 'STRICT' && satRec.status === 'ON_LEAVE') {
        isSatAbsent = true;
      }
    }

    if (monDateStr <= todayStr) {
      if (!monRec || (!monRec.in_time && !monRec.out_time)) {
        isMonAbsent = true;
      } else if (monRec.status === 'ABSENT' || monRec.status === 'LWP') {
        isMonAbsent = true;
      } else if (sandwichMode === 'STRICT' && monRec.status === 'ON_LEAVE') {
        isMonAbsent = true;
      }
    }

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
  tenantId = DEFAULT_TENANT_ID,
  company = '',
  periodType = 'FULL_MONTH',
  adjustLeaves = true
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
      .select('user_id, emp_name, email, emp_id, emp_department, module_access, created_at, is_approved, role, company, salary_amount');
    if (!uErr && Array.isArray(usersData)) {
      let filteredUsers = usersData;
      if (company && company !== 'all') {
        filteredUsers = usersData.filter(u => matchesCompany(u.company, company));
      }

      allUsers = filteredUsers
        .filter(u => {
          // Team Management Approval Status = Approved
          if (u.is_approved !== true) return false;
          // Must not be a customer
          if (u.role === 'customer') return false;
          const status = u.module_access?.emp_status;
          return status !== 'InActive' && status !== 'Terminated' && status !== 'Resigned' && status !== 'Trash' && status !== 'Draft';
        })
        .map(u => ({
          user_id: u.user_id,
          emp_name: u.emp_name,
          email: (u.email || '').trim().toLowerCase(),
          emp_code: u.emp_id || '',
          emp_id: u.emp_id || '',
          department: u.emp_department || 'General',
          created_at: u.created_at,
          module_access: u.module_access,
          salary_amount: Number(u.salary_amount || u.module_access?.emp_salary || 0)
        }));
    }
  } catch {}

  const approvedUserEmails = new Set(allUsers.map(u => u.email?.toLowerCase()));
  const approvedUserIds = new Set(allUsers.map(u => u.user_id).filter(Boolean));

  let allRecords = [];
  try {
    const { data, error } = await adminClient
      .from('attendance_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('attendance_date', startDateStr)
      .lte('attendance_date', endDateStr);

    if (!error && data && data.length > 0) {
      allRecords = data.filter(r => {
        if (r.user_id && approvedUserIds.has(r.user_id)) return true;
        if (r.email && approvedUserEmails.has((r.email || '').toLowerCase())) return true;
        return false;
      });
    }
  } catch {}

  const local = await getFallbackData();
  const localMonthRecs = (local.records || []).filter(r => {
    if ((r.tenant_id || DEFAULT_TENANT_ID) !== tenantId) return false;
    if (r.attendance_date < startDateStr || r.attendance_date > endDateStr) return false;
    if (r.user_id && approvedUserIds.has(r.user_id)) return true;
    if (r.email && approvedUserEmails.has((r.email || '').toLowerCase())) return true;
    return false;
  });

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

  // If no user_roles found at all, synthesize from unique emails in allRecords as emergency fallback
  if (allUsers.length === 0 && targetUsers.length === 0) {
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

  // Period boundaries: FULL_MONTH (1 to daysInMonth), ADVANCE_HALF (1 to 15), SECOND_HALF (16 to daysInMonth)
  let startDay = 1;
  let endDay = daysInMonth;
  if (periodType === 'ADVANCE_HALF' || periodType === 'FIRST_HALF') {
    startDay = 1;
    endDay = Math.min(15, daysInMonth);
  } else if (periodType === 'SECOND_HALF') {
    startDay = 16;
    endDay = daysInMonth;
  }

  // Build dates array for the chosen period
  const monthDates = [];
  for (let day = startDay; day <= endDay; day++) {
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

  // Fetch tenant policy for optional Sunday and Sandwich rules
  let activePolicy = null;
  try {
    const policyRes = await getTenantAttendancePolicy(effectiveTenantId, company);
    if (policyRes?.success && policyRes.data) {
      activePolicy = policyRes.data;
    }
  } catch {}

  // Load approved leaves for this month
  const localLeaves = await getFallbackLeavesData();
  const allLeaveReqs = Array.isArray(localLeaves?.requests) ? localLeaves.requests : [];
  const approvedLeaves = allLeaveReqs.filter(r => r.status === 'APPROVED');
  const leavesByEmpDate = new Map();

  approvedLeaves.forEach(l => {
    const lEmail = (l.email || '').toLowerCase();
    const lStart = new Date(`${l.from_date}T00:00:00`);
    const lEnd = new Date(`${l.to_date}T00:00:00`);
    const iter = new Date(lStart);
    while (iter <= lEnd) {
      const iterStr = iter.toISOString().split('T')[0];
      leavesByEmpDate.set(`${lEmail}_${iterStr}`, l);
      iter.setDate(iter.getDate() + 1);
    }
  });

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
    let totalApprovedLeaves = 0;
    let totalLeavePayableDays = 0;

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
          todayStr,
          policy: activePolicy
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

      // Check if employee has an Approved Leave for this date
      const approvedLeave = leavesByEmpDate.get(`${userEmail}_${mDate.dateStr}`);
      if (approvedLeave) {
        const isPaidLeave = approvedLeave.leave_type !== 'LWP';
        const leaveDays = approvedLeave.leave_type === 'HALF_DAY' ? 0.5 : 1;
        totalApprovedLeaves += leaveDays;

        if (adjustLeaves && isPaidLeave) {
          totalLeavePayableDays += leaveDays;
        }

        const leaveCode = approvedLeave.leave_type === 'HALF_DAY' ? 'HD-L' : (approvedLeave.leave_type || 'CL');
        return {
          code: leaveCode,
          status: 'ON_LEAVE',
          label: `Approved ${approvedLeave.leave_type} (${adjustLeaves ? (isPaidLeave ? 'Paid Adjusted' : 'Unpaid LWP') : 'Raw / Unadjusted'})`,
          isPaid: adjustLeaves && isPaidLeave,
          record: rec || null
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
        } else if (rec.status === 'ON_LEAVE') {
          const isPaid = rec.is_paid_leave !== false && rec.leave_type !== 'LWP';
          const lDays = rec.leave_type === 'HALF_DAY' ? 0.5 : 1;
          totalApprovedLeaves += lDays;
          if (adjustLeaves && isPaid) {
            totalLeavePayableDays += lDays;
          }
          const lCode = rec.leave_type || 'L';
          return {
            code: lCode,
            status: 'ON_LEAVE',
            label: rec.remarks || `Approved Leave (${adjustLeaves ? 'Paid Adjusted' : 'Raw / Unadjusted'})`,
            isPaid: adjustLeaves && isPaid,
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

    const totalPayableDays = totalPresent + (totalHalfDays * 0.5) + totalPaidSundays + (adjustLeaves ? totalLeavePayableDays : 0);
    const baseSalary = Number(user.salary_amount || 0);
    const perDayRate = baseSalary > 0 ? (baseSalary / daysInMonth) : 0;
    const calculatedSalary = Math.round(perDayRate * totalPayableDays);

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
        totalApprovedLeaves,
        totalLeavePayableDays,
        leavesAdjusted: adjustLeaves,
        totalPayableDays,
        totalMinutesWorked,
        totalHoursFormatted: formatMinutesToHours(totalMinutesWorked),
        baseSalary,
        perDayRate: Math.round(perDayRate),
        calculatedSalary,
        periodType,
        periodDays: (endDay - startDay + 1)
      }
    };
  });

  const totalPayrollAmount = matrixRows.reduce((sum, r) => sum + (r.summary?.calculatedSalary || 0), 0);
  const totalApprovedLeavesCount = matrixRows.reduce((sum, r) => sum + (r.summary?.totalApprovedLeaves || 0), 0);
  const grandTotalMinutes = matrixRows.reduce((sum, r) => sum + (r.summary?.totalMinutesWorked || 0), 0);

  return {
    success: true,
    year: targetYear,
    month: targetMonth,
    daysInMonth,
    periodType,
    startDay,
    endDay,
    periodDays: (endDay - startDay + 1),
    monthDates,
    rows: matrixRows,
    summary: {
      totalEmployees: matrixRows.length,
      daysInMonth,
      periodDays: (endDay - startDay + 1),
      totalDepartmentCount: new Set(matrixRows.map(r => r.department)).size,
      totalHoursLoggedFormatted: formatMinutesToHours(grandTotalMinutes),
      totalAdvanceAmount: periodType === 'ADVANCE_HALF' ? totalPayrollAmount : 0,
      totalPayrollAmount,
      totalApprovedLeavesCount,
      leavesAdjustedInReport: adjustLeaves
    }
  };
}

async function getHodReportContext() {
  try {
    const session = await createSessionClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return { success: false, error: 'Please sign in again.' };

    const db = getAdminClient();
    const { data: actor, error: actorError } = await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
    if (actorError || !actor) return { success: false, error: 'Employee profile unavailable.' };
    const actorStatus = String(actor.emp_status || actor.module_access?.emp_status || 'Active').toLowerCase();
    if (['inactive', 'in_active', 'terminated', 'resigned', 'trash', 'draft'].includes(actorStatus)) {
      return { success: false, error: 'Employee profile unavailable.' };
    }

    const { data: users, error: usersError } = await db.from('user_roles').select('*');
    if (usersError || !Array.isArray(users)) return { success: false, error: 'HOD team unavailable.' };
    const actorTenant = actor.tenant_id || actor.module_access?._tenantId;
    const eligible = users.filter(employee => {
      if (employee.is_approved !== true || employee.role === 'customer') return false;
      const status = String(employee.emp_status || employee.module_access?.emp_status || 'Active').toLowerCase();
      if (['inactive', 'in_active', 'terminated', 'resigned', 'trash', 'draft'].includes(status)) return false;
      if (!matchesCompany(employee.company, actor.company)) return false;
      const employeeTenant = employee.tenant_id || employee.module_access?._tenantId;
      return !actorTenant || !employeeTenant || actorTenant === employeeTenant;
    });
    const team = getHodTeam(eligible.some(employee => employee.user_id === actor.user_id) ? eligible : [actor, ...eligible], actor);
    return { success: true, team };
  } catch {
    return { success: false, error: 'HOD team unavailable.' };
  }
}

export async function getHodTeamReportAccess() {
  const context = await getHodReportContext();
  return context.success
    ? { success: true, hasTeam: context.team.length > 0 }
    : { success: false, hasTeam: false, error: context.error };
}

export async function getHodTeamAttendanceMaster(options = {}) {
  const context = await getHodReportContext();
  if (!context.success) return { success: false, error: context.error };
  const report = await getTeamAttendanceMaster(options);
  if (!report.success) return report;

  const team = context.team.filter(employee =>
    (!options.department || options.department === 'All' || employee.emp_department === options.department) &&
    (!options.company || matchesCompany(employee.company, options.company))
  );
  const ids = new Set(team.map(employee => employee.user_id).filter(Boolean));
  const emails = new Set(team.map(employee => String(employee.email || '').trim().toLowerCase()).filter(Boolean));
  const records = report.records.filter(record =>
    (record.user_id && ids.has(record.user_id)) || emails.has(String(record.email || '').trim().toLowerCase())
  );
  return {
    ...report,
    records,
    summary: {
      ...report.summary,
      totalEmployees: team.length,
      totalRecords: records.length,
      totalPresent: records.filter(record => ['PRESENT', 'LATE', 'REGULARIZED'].includes(record.status)).length,
      totalHalfDay: records.filter(record => record.status === 'HALF_DAY').length,
      totalLate: records.filter(record => record.status === 'LATE').length,
      totalAbsent: records.filter(record => record.status === 'ABSENT').length,
      totalRegularized: records.filter(record => record.is_regularized).length
    }
  };
}

export async function getHodTeamMonthlyMatrix(options = {}) {
  const context = await getHodReportContext();
  if (!context.success) return { success: false, error: context.error };
  const report = await getTeamMonthlyMatrix(options);
  if (!report.success) return report;

  const emails = new Set(context.team.filter(employee =>
    (!options.department || options.department === 'All' || employee.emp_department === options.department) &&
    (!options.company || matchesCompany(employee.company, options.company))
  ).map(employee => String(employee.email || '').trim().toLowerCase()).filter(Boolean));
  const rows = report.rows.filter(row => emails.has(String(row.email || '').trim().toLowerCase()));
  return { ...report, rows, summary: { ...report.summary, totalEmployees: rows.length } };
}

/**
 * Assign Employee Default Shift (Admin / HR)
 */
export async function assignEmployeeShift({ email, shiftCodeOrName, assignedBy = 'Admin' }) {
  if (!email) return { success: false, error: 'Employee email is required' };
  const adminClient = getAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { data, error } = await adminClient
      .from('user_roles')
      .update({ assigned_shift: shiftCodeOrName || null })
      .ilike('email', normalizedEmail)
      .select('id, email, emp_name, assigned_shift')
      .maybeSingle();

    if (error) {
      console.error('Supabase error assigning employee shift:', error);
      return { success: false, error: error.message };
    }

    try {
      await logAuditAction({
        module: 'attendance',
        action: 'ASSIGN_EMPLOYEE_SHIFT',
        details: `Assigned shift "${shiftCodeOrName || 'Default'}" to employee ${normalizedEmail} by ${assignedBy}`,
        userEmail: normalizedEmail,
        userName: data?.emp_name || normalizedEmail
      });
    } catch {}

    return {
      success: true,
      message: `Shift "${shiftCodeOrName || 'Default'}" successfully assigned to ${normalizedEmail}`,
      data
    };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to assign shift' };
  }
}

/**
 * 13. Get Employee Leave Balance & Ledger (with CL, SL, and EL 1-Year Lock-in status)
 */
export async function getEmployeeLeaveBalance({
  email,
  tenantId = null,
  userCompany = '',
  targetYear = null
}) {
  if (!email) return { success: false, error: 'Employee email is required' };
  const normalizedEmail = email.trim().toLowerCase();
  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const currentYear = targetYear || new Date().getFullYear();

  try {
    const policyRes = await getTenantAttendancePolicy(effectiveTenantId, userCompany);
    const policy = policyRes?.data || {};
    const leavePolicy = policy.leave_policy || {
      cl_quota_annual: 8,
      sl_quota_annual: 6,
      el_quota_annual: 15,
      el_lockin_months: 12,
      el_validity_years: 3,
      el_encashable: true
    };

    // Get employee joining date from user_roles
    let doj = null;
    let empName = '';
    let empCode = '';
    let department = '';
    const adminClient = getAdminClient();
    try {
      const { data: userRole } = await adminClient
        .from('user_roles')
        .select('created_at, date_of_joining, emp_name, emp_code, department')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (userRole) {
        doj = userRole.date_of_joining || userRole.created_at || null;
        empName = userRole.emp_name || '';
        empCode = userRole.emp_code || '';
        department = userRole.department || '';
      }
    } catch {}

    // Evaluate EL 1-Year Lock-in
    let isElLocked = false;
    let elUnlockDateStr = null;
    let tenureMonths = 0;
    const lockinMonths = Number(leavePolicy.el_lockin_months ?? 12);

    if (doj && lockinMonths > 0) {
      const joinDate = new Date(doj);
      const now = new Date();
      tenureMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
      if (tenureMonths < lockinMonths) {
        isElLocked = true;
        const unlockDate = new Date(joinDate);
        unlockDate.setMonth(unlockDate.getMonth() + lockinMonths);
        elUnlockDateStr = unlockDate.toISOString().split('T')[0];
      }
    }

    // Get availed leaves for this year from employee_leaves.json (and DB)
    const localLeaves = await getFallbackLeavesData();
    const allRequests = Array.isArray(localLeaves?.requests) ? localLeaves.requests : [];
    const userLeavesThisYear = allRequests.filter(req => {
      if ((req.email || '').toLowerCase() !== normalizedEmail) return false;
      if (req.status !== 'APPROVED') return false;
      const reqYear = new Date(req.from_date || req.applied_at).getFullYear();
      return reqYear === currentYear;
    });

    let clAvailed = 0;
    let slAvailed = 0;
    let elAvailed = 0;
    let cplAvailed = 0;
    let lwpAvailed = 0;

    userLeavesThisYear.forEach(req => {
      const days = Number(req.total_days || 1);
      if (req.leave_type === 'CL') clAvailed += days;
      else if (req.leave_type === 'SL') slAvailed += days;
      else if (req.leave_type === 'EL') elAvailed += days;
      else if (req.leave_type === 'CPL') cplAvailed += days;
      else if (req.leave_type === 'LWP') lwpAvailed += days;
      else if (req.leave_type === 'HALF_DAY') clAvailed += 0.5;
    });

    const clQuota = Number(leavePolicy.cl_quota_annual ?? 8);
    const slQuota = Number(leavePolicy.sl_quota_annual ?? 6);
    const elQuota = Number(leavePolicy.el_quota_annual ?? 15);

    const clBalance = Math.max(0, clQuota - clAvailed);
    const slBalance = Math.max(0, slQuota - slAvailed);
    const elBalance = isElLocked ? 0 : Math.max(0, elQuota - elAvailed);

    // Calculate CPL (Compensatory Off)
    const cplPolicy = leavePolicy.cpl_policy || {
      enabled: true,
      validity_days: 60,
      min_work_hours_full_cpl: 8.0,
      min_work_hours_half_cpl: 4.5,
      auto_credit_on_sunday_work: true,
      max_cpl_accumulation: 10
    };

    let cplEarned = 0;
    const nowMs = Date.now();
    const validityDays = Number(cplPolicy.validity_days ?? 60);
    const validityWindowMs = validityDays * 24 * 60 * 60 * 1000;

    // 1. Manual Grants from employee_leaves.json
    const allCplGrants = Array.isArray(localLeaves?.cpl_grants) ? localLeaves.cpl_grants : [];
    const userGrants = allCplGrants.filter(g => {
      if ((g.email || '').toLowerCase() !== normalizedEmail) return false;
      if (g.status && g.status !== 'ACTIVE') return false;
      const grantedTime = new Date(g.granted_at || g.work_date).getTime();
      return (nowMs - grantedTime) <= validityWindowMs;
    });

    userGrants.forEach(g => {
      cplEarned += Number(g.days || 1);
    });

    // 2. Auto-credit on Sunday / Holiday work if enabled
    if (cplPolicy.enabled && cplPolicy.auto_credit_on_sunday_work) {
      try {
        const attData = await getFallbackData();
        const userRecs = (attData.records || []).filter(r => (r.email || '').toLowerCase() === normalizedEmail);
        userRecs.forEach(r => {
          if (!r.attendance_date) return;
          const recTime = new Date(`${r.attendance_date}T00:00:00+05:30`).getTime();
          if ((nowMs - recTime) > validityWindowMs) return; // Expired
          
          const d = new Date(`${r.attendance_date}T00:00:00+05:30`);
          const isSunday = d.getDay() === 0;
          if (isSunday && (r.status === 'PRESENT' || r.in_time)) {
            const alreadyGranted = userGrants.some(g => g.work_date === r.attendance_date);
            if (!alreadyGranted) {
              const workMins = r.total_working_minutes || 0;
              const fullMins = (cplPolicy.min_work_hours_full_cpl || 8.0) * 60;
              const halfMins = (cplPolicy.min_work_hours_half_cpl || 4.5) * 60;
              if (workMins >= fullMins || r.status === 'PRESENT') {
                cplEarned += 1.0;
              } else if (workMins >= halfMins) {
                cplEarned += 0.5;
              }
            }
          }
        });
      } catch {}
    }

    if (cplPolicy.max_cpl_accumulation && cplEarned > cplPolicy.max_cpl_accumulation) {
      cplEarned = cplPolicy.max_cpl_accumulation;
    }

    const cplBalance = Math.max(0, cplEarned - cplAvailed);

    return {
      success: true,
      data: {
        email: normalizedEmail,
        empName,
        empCode,
        department,
        doj,
        currentYear,
        tenureMonths,
        cl: {
          quota: clQuota,
          availed: clAvailed,
          balance: clBalance,
          status: 'UNLOCKED',
          statusLabel: '🟢 Unlocked (Day 1 Available)'
        },
        sl: {
          quota: slQuota,
          availed: slAvailed,
          balance: slBalance,
          status: 'UNLOCKED',
          statusLabel: '🟢 Unlocked'
        },
        el: {
          quota: elQuota,
          availed: elAvailed,
          balance: elBalance,
          status: isElLocked ? 'LOCKED' : 'UNLOCKED',
          statusLabel: isElLocked 
            ? `🔒 Blocked (1-Year Probation Lock: Unlocks on ${elUnlockDateStr})`
            : `🟢 Unlocked (Valid for ${leavePolicy.el_validity_years || 3} Yrs / Encashable)`,
          unlockDate: elUnlockDateStr,
          isEncashable: leavePolicy.el_encashable !== false,
          validityYears: leavePolicy.el_validity_years || 3
        },
        cpl: {
          earned: cplEarned,
          availed: cplAvailed,
          balance: cplBalance,
          status: cplBalance > 0 ? 'AVAILABLE' : 'ZERO_BALANCE',
          statusLabel: cplBalance > 0
            ? `🎉 ${cplBalance} Day(s) Available (Valid ${validityDays} Days)`
            : '⚪ 0 Days (Earned from Sunday/Holiday Work)',
          validityDays,
          grants: userGrants
        },
        lwp: {
          availed: lwpAvailed,
          statusLabel: '⚪ Leave Without Pay (Unpaid Deduction)'
        },
        policy: leavePolicy
      }
    };
  } catch (err) {
    console.error('Error fetching employee leave balance:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 14. Apply for Employee Leave (Single day or Date range)
 */
export async function applyEmployeeLeave({
  userId,
  email,
  empName,
  empCode,
  department,
  tenantId = null,
  userCompany = '',
  leaveType = 'CL', // 'CL' | 'SL' | 'EL' | 'HALF_DAY' | 'LWP'
  fromDate,
  toDate,
  reason = '',
  halfDaySession = 'FIRST_HALF'
}) {
  if (!email || !fromDate) {
    return { success: false, error: 'Employee email and fromDate are required' };
  }

  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const normalizedEmail = email.trim().toLowerCase();
  const cleanToDate = toDate || fromDate;

  // Calculate days
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${cleanToDate}T00:00:00`);
  if (end < start) {
    return { success: false, error: 'To date cannot be earlier than From date' };
  }

  const diffTime = Math.abs(end - start);
  let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (leaveType === 'HALF_DAY') totalDays = 0.5;

  // Balance & Lock-in Check
  const balanceRes = await getEmployeeLeaveBalance({ email: normalizedEmail, tenantId: effectiveTenantId, userCompany });
  if (balanceRes.success && balanceRes.data) {
    const b = balanceRes.data;
    if (leaveType === 'EL') {
      if (b.el.status === 'LOCKED') {
        return {
          success: false,
          error: `Earned Leave (EL) is locked for employees under 1 year of service. Unlocks on ${b.el.unlockDate || '1st anniversary'}. Please choose Casual Leave (CL) or LWP.`
        };
      }
      if (b.el.balance < totalDays) {
        return {
          success: false,
          error: `Insufficient EL balance! Available: ${b.el.balance} days, Requested: ${totalDays} days. Consider applying remaining days as LWP.`
        };
      }
    } else if (leaveType === 'CL' && b.cl.balance < totalDays) {
      return {
        success: false,
        error: `Insufficient Casual Leave (CL) balance! Available: ${b.cl.balance} days, Requested: ${totalDays} days.`
      };
    } else if (leaveType === 'SL' && b.sl.balance < totalDays) {
      return {
        success: false,
        error: `Insufficient Sick Leave (SL) balance! Available: ${b.sl.balance} days, Requested: ${totalDays} days.`
      };
    } else if (leaveType === 'CPL' && (!b.cpl || b.cpl.balance < totalDays)) {
      return {
        success: false,
        error: `Insufficient CPL balance! Available: ${b.cpl?.balance || 0} day(s), Requested: ${totalDays} day(s). CPL is earned when you work on Sundays or Holidays.`
      };
    }
  }

  const newLeaveRequest = {
    id: `leave_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenant_id: effectiveTenantId,
    user_id: userId || null,
    email: normalizedEmail,
    emp_name: empName || normalizedEmail.split('@')[0],
    emp_code: empCode || '',
    department: department || 'General',
    leave_type: leaveType,
    from_date: fromDate,
    to_date: cleanToDate,
    total_days: totalDays,
    half_day_session: leaveType === 'HALF_DAY' ? halfDaySession : null,
    reason: (reason || '').trim(),
    status: 'PENDING',
    applied_at: new Date().toISOString(),
    approver_id: null,
    approver_name: null,
    approver_remarks: null,
    action_at: null
  };

  const localLeaves = await getFallbackLeavesData();
  localLeaves.requests = localLeaves.requests || [];
  localLeaves.requests.unshift(newLeaveRequest);
  await saveFallbackLeavesData(localLeaves);

  try {
    const adminClient = getAdminClient();
    await adminClient.from('employee_leaves').insert([newLeaveRequest]);
  } catch {}

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'APPLY_LEAVE',
      details: `${newLeaveRequest.emp_name} applied for ${totalDays} day(s) ${leaveType} from ${fromDate} to ${cleanToDate}`,
      userEmail: normalizedEmail,
      userName: newLeaveRequest.emp_name
    });
  } catch {}

  return {
    success: true,
    message: `Leave application for ${totalDays} day(s) (${leaveType}) submitted successfully! Awaiting HOD approval.`,
    data: newLeaveRequest
  };
}

/**
 * 15. Get Employee's own Leave Applications
 */
export async function getMyLeaveRequests({ email, tenantId = null }) {
  if (!email) return { success: false, error: 'Email is required' };
  const normalizedEmail = email.trim().toLowerCase();
  const localLeaves = await getFallbackLeavesData();
  const requests = (localLeaves?.requests || [])
    .filter(r => (r.email || '').toLowerCase() === normalizedEmail)
    .sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
  return { success: true, data: requests };
}

/**
 * 16. Get Pending Leave Requests for HOD / Manager
 */
export async function getHodPendingLeaveRequests({ tenantId = null, userCompany = '', department = 'All' } = {}) {
  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const localLeaves = await getFallbackLeavesData();
  let requests = (localLeaves?.requests || []).filter(r => {
    if (r.tenant_id && r.tenant_id !== effectiveTenantId) return false;
    if (department && department !== 'All' && r.department !== department) return false;
    return true;
  });
  requests.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
  return { success: true, data: requests };
}

/**
 * 17. Approve Leave Request (HOD / Manager)
 */
export async function approveLeaveRequest({ requestId, approverId, approverName = 'HOD', remarks = '' }) {
  if (!requestId) return { success: false, error: 'Request ID is required' };
  const localLeaves = await getFallbackLeavesData();
  const req = (localLeaves?.requests || []).find(r => r.id === requestId);
  if (!req) return { success: false, error: 'Leave request not found' };

  req.status = 'APPROVED';
  req.approver_id = approverId || null;
  req.approver_name = approverName;
  req.approver_remarks = remarks || 'Approved by HOD';
  req.action_at = new Date().toISOString();

  await saveFallbackLeavesData(localLeaves);

  // Sync to database if available
  try {
    const adminClient = getAdminClient();
    await adminClient.from('employee_leaves').update({
      status: 'APPROVED',
      approver_id: approverId,
      approver_name: approverName,
      approver_remarks: req.approver_remarks,
      action_at: req.action_at
    }).eq('id', requestId);
  } catch {}

  // Update fallback attendance records for each date in leave period
  const localAttendance = await getFallbackData();
  const start = new Date(`${req.from_date}T00:00:00`);
  const end = new Date(`${req.to_date}T00:00:00`);
  const cur = new Date(start);

  while (cur <= end) {
    const dStr = cur.toISOString().split('T')[0];
    const isPaid = req.leave_type !== 'LWP';

    const existingRecIdx = localAttendance.records.findIndex(
      r => (r.email || '').toLowerCase() === (req.email || '').toLowerCase() && r.attendance_date === dStr
    );

    const leaveRec = {
      id: existingRecIdx >= 0 ? localAttendance.records[existingRecIdx].id : `rec_leave_${Date.now()}_${dStr}`,
      tenant_id: req.tenant_id,
      email: req.email,
      emp_name: req.emp_name,
      emp_code: req.emp_code,
      department: req.department,
      attendance_date: dStr,
      status: req.leave_type === 'HALF_DAY' ? 'HALF_DAY' : 'ON_LEAVE',
      remarks: `Approved ${req.leave_type} Leave: ${req.reason || ''}`.trim(),
      is_regularized: false,
      is_paid_leave: isPaid,
      leave_type: req.leave_type
    };

    if (existingRecIdx >= 0) {
      localAttendance.records[existingRecIdx] = { ...localAttendance.records[existingRecIdx], ...leaveRec };
    } else {
      localAttendance.records.push(leaveRec);
    }

    try {
      const adminClient = getAdminClient();
      await adminClient.from('attendance_records').upsert(leaveRec, { onConflict: 'email,attendance_date' });
    } catch {}

    cur.setDate(cur.getDate() + 1);
  }

  await saveFallbackData(localAttendance);

  return { success: true, message: `Leave request for ${req.emp_name} approved successfully!` };
}

/**
 * 18. Reject Leave Request (HOD / Manager)
 */
export async function rejectLeaveRequest({ requestId, approverId, approverName = 'HOD', remarks = '' }) {
  if (!requestId) return { success: false, error: 'Request ID is required' };
  const localLeaves = await getFallbackLeavesData();
  const req = (localLeaves?.requests || []).find(r => r.id === requestId);
  if (!req) return { success: false, error: 'Leave request not found' };

  req.status = 'REJECTED';
  req.approver_id = approverId || null;
  req.approver_name = approverName;
  req.approver_remarks = remarks || 'Rejected by HOD';
  req.action_at = new Date().toISOString();

  await saveFallbackLeavesData(localLeaves);

  try {
    const adminClient = getAdminClient();
    await adminClient.from('employee_leaves').update({
      status: 'REJECTED',
      approver_id: approverId,
      approver_name: approverName,
      approver_remarks: req.approver_remarks,
      action_at: req.action_at
    }).eq('id', requestId);
  } catch {}

  return { success: true, message: `Leave request rejected.` };
}

/**
 * 19. Grant Employee CPL (Compensatory Off) Credit (Admin / HOD)
 */
export async function grantEmployeeCPLCredit({
  tenantId = null,
  userCompany = '',
  email,
  empName = '',
  days = 1.0,
  reason = '',
  workDate = null,
  validityDays = 60,
  grantedBy = null,
  grantedByName = 'HOD / Admin'
}) {
  if (!email) return { success: false, error: 'Employee email is required' };
  const numDays = Number(days);
  if (isNaN(numDays) || numDays <= 0) return { success: false, error: 'Valid days (> 0) required' };

  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const normalizedEmail = email.trim().toLowerCase();
  const valDays = Number(validityDays || 60);

  const grantRecord = {
    id: `cpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenant_id: effectiveTenantId,
    email: normalizedEmail,
    emp_name: empName || normalizedEmail.split('@')[0],
    days: numDays,
    reason: (reason || 'Sunday / Holiday work credit').trim(),
    work_date: workDate || new Date().toISOString().split('T')[0],
    granted_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + valDays * 24 * 60 * 60 * 1000).toISOString(),
    granted_by: grantedBy,
    granted_by_name: grantedByName,
    status: 'ACTIVE'
  };

  const localLeaves = await getFallbackLeavesData();
  localLeaves.cpl_grants = localLeaves.cpl_grants || [];
  localLeaves.cpl_grants.unshift(grantRecord);
  await saveFallbackLeavesData(localLeaves);

  try {
    await logAuditAction({
      module: 'attendance',
      action: 'GRANT_CPL_CREDIT',
      details: `Granted ${numDays} CPL day(s) to ${normalizedEmail} by ${grantedByName}. Reason: ${grantRecord.reason}`,
      userEmail: normalizedEmail,
      userName: empName || normalizedEmail
    });
  } catch {}

  return {
    success: true,
    message: `Successfully credited ${numDays} CPL day(s) to ${empName || normalizedEmail}. Valid for ${valDays} days.`,
    data: grantRecord
  };
}

/**
 * 20. Update Tenant Leave & CPL Policy (Admin / HOD)
 */
export async function updateTenantLeavePolicy({
  tenantId = null,
  userCompany = '',
  leavePolicy = {},
  updatedBy = 'Admin'
}) {
  const effectiveTenantId = resolveTenantId(tenantId, userCompany);

  try {
    let allPolicies = {};
    try {
      const raw = await fs.readFile(POLICIES_FILE_PATH, 'utf8');
      allPolicies = JSON.parse(raw);
    } catch {
      allPolicies = { ...DEFAULT_ATTENDANCE_POLICIES };
    }

    if (!allPolicies[effectiveTenantId]) {
      allPolicies[effectiveTenantId] = {
        tenant_id: effectiveTenantId,
        company_name: userCompany || 'Default Company',
        ...DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]
      };
    }

    const currentTenantPolicy = allPolicies[effectiveTenantId];
    currentTenantPolicy.leave_policy = {
      ...(currentTenantPolicy.leave_policy || {}),
      ...leavePolicy,
      cpl_policy: {
        ...(currentTenantPolicy.leave_policy?.cpl_policy || {}),
        ...(leavePolicy.cpl_policy || {})
      }
    };
    currentTenantPolicy.updated_by = updatedBy;
    currentTenantPolicy.updated_at = new Date().toISOString();

    // Also sync to branch keys if they exist
    for (const key of Object.keys(allPolicies)) {
      if (key.startsWith(`${effectiveTenantId}:`)) {
        allPolicies[key].leave_policy = currentTenantPolicy.leave_policy;
      }
    }

    await fs.writeFile(POLICIES_FILE_PATH, JSON.stringify(allPolicies, null, 2) + '\n', 'utf8');

    // Dual-write attempt to Supabase DB if table/column exists
    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('attendance_shift_policies')
        .update({
          leave_policy: currentTenantPolicy.leave_policy,
          updated_by: updatedBy,
          updated_at: currentTenantPolicy.updated_at
        })
        .eq('tenant_id', effectiveTenantId);
    } catch {}

    try {
      await logAuditAction({
        module: 'attendance',
        action: 'UPDATE_LEAVE_POLICY',
        details: `Updated leave policy for tenant ${effectiveTenantId} by ${updatedBy}`,
        userEmail: updatedBy,
        userName: updatedBy
      });
    } catch {}

    return {
      success: true,
      message: 'Company leave policy updated successfully!',
      data: currentTenantPolicy.leave_policy
    };
  } catch (err) {
    console.error('Error updating tenant leave policy:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 20B. Get All Tenant Leave Policies (for Tab 7 Master Directory Table)
 */
export async function getAllTenantLeavePolicies() {
  try {
    const fallbackPolicies = await getFallbackPolicies();
    const tenantsMap = {};

    const knownTenants = [
      { id: '00000000-0000-0000-0000-000000000001', name: 'New Swan Group' },
      { id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', name: 'SuPuja Creations' },
      { id: '922d3e72-6588-457f-a562-4f1bdbf10d98', name: 'Testing New Swan Group' }
    ];

    knownTenants.forEach(kt => {
      const pol = fallbackPolicies[kt.id] || DEFAULT_ATTENDANCE_POLICIES[kt.id] || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID] || {};
      tenantsMap[kt.id] = {
        tenant_id: kt.id,
        company_name: pol.company_name || kt.name,
        leave_policy: pol.leave_policy || DEFAULT_ATTENDANCE_POLICIES[kt.id]?.leave_policy || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]?.leave_policy || {},
        updated_at: pol.updated_at || null,
        updated_by: pol.updated_by || 'Default System'
      };
    });

    for (const [key, pol] of Object.entries(fallbackPolicies)) {
      if (!key.includes(':') && !tenantsMap[key]) {
        tenantsMap[key] = {
          tenant_id: pol.tenant_id || key,
          company_name: pol.company_name || 'Enterprise',
          leave_policy: pol.leave_policy || DEFAULT_ATTENDANCE_POLICIES[DEFAULT_TENANT_ID]?.leave_policy || {},
          updated_at: pol.updated_at || null,
          updated_by: pol.updated_by || 'Admin'
        };
      }
    }

    return {
      success: true,
      data: Object.values(tenantsMap)
    };
  } catch (err) {
    console.error('Error fetching all tenant leave policies:', err);
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * 21. Get Comprehensive Team Leave Report & Balances Ledger (Admin / HOD)
 */
export async function getTeamLeaveReport({
  tenantId = null,
  userCompany = '',
  department = 'All',
  year = null
}) {
  const effectiveTenantId = resolveTenantId(tenantId, userCompany);
  const targetYear = year || new Date().getFullYear();
  const adminClient = getAdminClient();

  try {
    let query = adminClient
      .from('user_roles')
      .select('id, user_id, email, emp_name, emp_code, department, role, date_of_joining, created_at')
      .order('emp_name', { ascending: true });

    if (effectiveTenantId) {
      query = query.eq('tenant_id', effectiveTenantId);
    }
    const { data: users, error } = await query;
    if (error) throw error;

    let targetUsers = users || [];
    if (department && department !== 'All') {
      targetUsers = targetUsers.filter(u => u.department === department);
    }

    const localLeaves = await getFallbackLeavesData();
    const allRequests = Array.isArray(localLeaves?.requests) ? localLeaves.requests : [];
    const tenantRequests = allRequests.filter(r => !r.tenant_id || r.tenant_id === effectiveTenantId);

    let totalEmployees = targetUsers.length;
    let totalLeavesTaken = 0;
    let pendingApprovals = 0;
    let activeCplPool = 0;

    const roster = await Promise.all(targetUsers.map(async (u) => {
      const balanceRes = await getEmployeeLeaveBalance({
        email: u.email,
        tenantId: effectiveTenantId,
        userCompany,
        targetYear
      });

      const bData = balanceRes.data || {};
      const cl = bData.cl || { quota: 8, availed: 0, balance: 8 };
      const sl = bData.sl || { quota: 6, availed: 0, balance: 6 };
      const el = bData.el || { quota: 15, availed: 0, balance: 15, status: 'UNLOCKED' };
      const cpl = bData.cpl || { earned: 0, availed: 0, balance: 0 };
      const lwp = bData.lwp || { availed: 0 };

      const userLeaves = (cl.availed || 0) + (sl.availed || 0) + (el.availed || 0) + (cpl.availed || 0);
      totalLeavesTaken += userLeaves;
      activeCplPool += (cpl.balance || 0);

      const userPending = tenantRequests.filter(r => (r.email || '').toLowerCase() === (u.email || '').toLowerCase() && r.status === 'PENDING').length;

      return {
        userId: u.user_id || u.id,
        email: u.email,
        empName: u.emp_name || u.email.split('@')[0],
        empCode: u.emp_code || '',
        department: u.department || 'General',
        role: u.role || 'employee',
        doj: bData.doj || u.date_of_joining || u.created_at || null,
        tenureMonths: bData.tenureMonths || 0,
        cl,
        sl,
        el,
        cpl,
        lwp,
        totalLeavesAvailed: userLeaves,
        pendingRequestsCount: userPending
      };
    }));

    pendingApprovals = tenantRequests.filter(r => r.status === 'PENDING').length;

    const relevantEmails = new Set(targetUsers.map(u => (u.email || '').toLowerCase()));
    const history = tenantRequests
      .filter(r => relevantEmails.has((r.email || '').toLowerCase()))
      .sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));

    return {
      success: true,
      data: {
        kpis: {
          totalEmployees,
          totalLeavesTaken,
          pendingApprovals,
          activeCplPool
        },
        roster,
        history,
        year: targetYear,
        department
      }
    };
  } catch (err) {
    console.error('Error fetching team leave report:', err);
    return { success: false, error: err.message };
  }
}
