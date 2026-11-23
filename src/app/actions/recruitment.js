'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { getRecruiterWorkloadLimits } from './recruiterConfig';
import { createClient } from '@/utils/supabase/server';
import { getUserBranchAccess, matchesCompanyToken } from '@/utils/branchAccess';
import { checkIsAdminRole, checkIsMasterAdmin, getModulePermissions, getSubItemPermissions } from '@/utils/permissionUtils';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function getPositionDetails(positionId) {
  if (!positionId) return null;
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('recruitment_positions')
    .select('*')
    .eq('id', positionId)
    .single();

  if (error) {
    console.error('Error fetching position details:', error);
    return null;
  }
  const meta = parsePositionWorkspace(data);

  let branchName = '';
  let branchCode = data.branch_code || meta.branch_code || 'TNT00001-B0001';
  let companyName = data.company || meta.company || 'SuPuja Creations';
  let logoUrl = null;

  if (meta.tenant_code === 'TNT00001' || String(companyName).toLowerCase().includes('supuja')) {
    logoUrl = '/supuja-logo.png';
  }

  try {
    const { data: branchRow } = await adminClient
      .from('tenant_branches')
      .select('branch_name, branch_code, company')
      .eq('branch_code', branchCode)
      .maybeSingle();

    if (branchRow) {
      branchName = branchRow.branch_name || '';
      companyName = branchRow.company || companyName;
    }
  } catch (err) {
    console.warn('Failed to query branch in getPositionDetails:', err);
  }

  if (!branchName) {
    if (branchCode === 'TNT00001-B0001') branchName = 'SuPuja Creation (Headquarters)';
    else if (branchCode === 'TNT00002-B0001') branchName = 'New Swan Group (Headquarters)';
    else if (branchCode === 'TNT00002-B0002') branchName = 'New Swan Multitech Limited Raian';
    else if (branchCode === 'TNT00002-B0003') branchName = 'New Swan Technologies Limited Paharuwal';
    else branchName = companyName || 'Headquarters';
  }

  return {
    ...data,
    jd_text: meta.cleanJd,
    workspace_tenant_id: meta.tenant_id,
    workspace_tenant_code: meta.tenant_code,
    workspace_company: companyName,
    workspace_branch_code: branchCode,
    branch_name: branchName,
    branch_code: branchCode,
    company: companyName,
    logo_url: logoUrl,
    recruiter_assigned: data.recruiter_assigned || data.created_by || 'HR Recruitment Team',
    job_type: meta.job_type,
    experience_required: meta.experience_required,
    min_qualification: meta.min_qualification,
    urgency: meta.urgency,
    work_mode: meta.work_mode,
    shift_type: meta.shift_type,
    gender_preference: meta.gender_preference,
    key_skills: meta.key_skills,
    vacancy_reason: meta.vacancy_reason || 'New Position'
  };
}

export async function uploadResumeToServer(fileName, base64Data) {
  try {
    const adminClient = getAdminClient();
    const buffer = Buffer.from(base64Data, 'base64');
    
    const fileExt = fileName.split('.').pop();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `resumes/${uniqueName}`;

    const { data, error } = await adminClient.storage
      .from('recruitment_resumes')
      .upload(filePath, buffer, {
        contentType: getContentType(fileExt),
        duplex: 'half'
      });

    if (error) {
      console.error('Storage upload error:', error);
      return { success: false, error: error.message };
    }

    const { data: publicUrlData } = adminClient.storage
      .from('recruitment_resumes')
      .getPublicUrl(filePath);

    return { success: true, url: publicUrlData.publicUrl };
  } catch (err) {
    console.error('Exception in uploadResumeToServer:', err);
    return { success: false, error: err.message };
  }
}

export async function submitApplication(positionId, formData) {
  try {
    const adminClient = getAdminClient();
    
    const expected_salary_min = formData.expected_salary_min ? parseInt(formData.expected_salary_min) : null;
    const expected_salary_max = formData.expected_salary_max ? parseInt(formData.expected_salary_max) : null;
    const current_salary = formData.current_salary ? parseInt(formData.current_salary) : null;

    // Get count of existing candidates for this position to generate display ID
    const { count, error: countError } = await adminClient
      .from('recruitment_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('position_id', positionId);

    if (countError) throw countError;

    const nextSeq = (count || 0) + 1;
    const posShort = positionId.substring(0, 8).toUpperCase();
    const candidateCode = `POS-${posShort}-${String(nextSeq).padStart(3, '0')}`;

    // Get position details to inherit workspace scoping
    const { data: parentPos } = await adminClient
      .from('recruitment_positions')
      .select('*')
      .eq('id', positionId)
      .single();

    const meta = parentPos ? parsePositionWorkspace(parentPos) : null;

    const applicantProfile = {
      current_city: formData.current_city ? String(formData.current_city).trim() : '',
      total_experience: formData.total_experience ? String(formData.total_experience).trim() : '',
      current_salary: current_salary,
      notice_period: formData.notice_period ? String(formData.notice_period).trim() : '',
      highest_qualification: formData.highest_qualification ? String(formData.highest_qualification).trim() : '',
      cover_note: formData.cover_note ? String(formData.cover_note).trim() : '',
      alternate_phone: formData.alternate_phone ? String(formData.alternate_phone).trim() : ''
    };

    // Insert candidate
    const insertData = {
      position_id: positionId,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      expected_salary_min,
      expected_salary_max,
      resume_url: formData.resume_url || '',
      candidate_code: candidateCode,
      current_stage: 'S02',
      candidate_status: 'Awaiting Screening',
      created_by: 'Online Application',
      joining_details: JSON.stringify({ applicant_profile: applicantProfile }),
      alternate_phone: applicantProfile.alternate_phone,
      current_city: applicantProfile.current_city,
      total_experience: applicantProfile.total_experience,
      highest_qualification: applicantProfile.highest_qualification,
      notice_period: applicantProfile.notice_period,
      current_salary: current_salary,
      cover_note: applicantProfile.cover_note
    };

    if (meta) {
      insertData.tenant_id = meta.tenant_id;
      insertData.tenant_code = meta.tenant_code;
      insertData.company = meta.company;
      insertData.branch_code = meta.branch_code;
    }

    let insertRes = await adminClient
      .from('recruitment_candidates')
      .insert([insertData])
      .select()
      .single();

    if (insertRes.error && insertRes.error.code === 'PGRST204') {
      const cleanInsert = { ...insertData };
      delete cleanInsert.alternate_phone;
      delete cleanInsert.current_city;
      delete cleanInsert.total_experience;
      delete cleanInsert.highest_qualification;
      delete cleanInsert.notice_period;
      delete cleanInsert.current_salary;
      delete cleanInsert.cover_note;
      insertRes = await adminClient
        .from('recruitment_candidates')
        .insert([cleanInsert])
        .select()
        .single();
    }

    if (insertRes.error) {
      console.error('Error submitting application:', insertRes.error);
      return { success: false, error: insertRes.error.message };
    }

    // Get position details to log a rich note
    const { data: posData } = await adminClient
      .from('recruitment_positions')
      .select('title')
      .eq('id', positionId)
      .single();

    const posTitle = posData?.title || 'this position';

    const noteLines = [
      `Candidate applied online for "${posTitle}" via public application link.`,
      `• Application Reference ID: ${candidateCode}`,
      formData.phone ? `• Contact Mobile: ${formData.phone}` : null,
      applicantProfile.alternate_phone ? `• Alternate Mobile: ${applicantProfile.alternate_phone}` : null,
      applicantProfile.current_city ? `• City / Location: ${applicantProfile.current_city}` : null,
      applicantProfile.total_experience ? `• Total Experience: ${applicantProfile.total_experience}` : null,
      applicantProfile.highest_qualification ? `• Highest Qualification: ${applicantProfile.highest_qualification}` : null,
      applicantProfile.current_salary ? `• Current Salary: ₹${applicantProfile.current_salary.toLocaleString('en-IN')}/month` : null,
      (expected_salary_min || expected_salary_max) ? `• Expected Salary: ₹${(expected_salary_min || 0).toLocaleString('en-IN')} - ₹${(expected_salary_max || 0).toLocaleString('en-IN')}/month` : null,
      applicantProfile.notice_period ? `• Notice Period: ${applicantProfile.notice_period}` : null,
      applicantProfile.cover_note ? `• Remarks: ${applicantProfile.cover_note}` : null
    ].filter(Boolean).join('\n');

    // Insert log note
    await adminClient
      .from('recruitment_candidate_notes')
      .insert([{
        candidate_id: data.id,
        note_text: noteLines,
        created_by: 'Online Application'
      }]);

    return { success: true, candidateCode, candidateId: data.id };
  } catch (err) {
    console.error('Exception in submitApplication:', err);
    return { success: false, error: err.message };
  }
}

function getContentType(ext) {
  switch (ext.toLowerCase()) {
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

// =========================================================================
// WORKSPACE MULTI-TENANT ISOLATION HELPERS & SERVER ACTIONS
// =========================================================================

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SUPUJA_TENANT_ID = '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];

function resolveTenantCode(tenantId) {
  if (tenantId === SUPUJA_TENANT_ID) return 'TNT00001';
  if (tenantId === '922d3e72-6588-457f-a562-4f1bdbf10d98') return 'TNT00003';
  return 'TNT00002';
}

function isSwanWorkspace(tenantId, company) {
  if (tenantId && tenantId === DEFAULT_TENANT_ID) return true;
  const c = String(company || '').toLowerCase().trim();
  if (c && SWAN_COMPANIES.includes(c)) return true;
  return !company && (!tenantId || tenantId === DEFAULT_TENANT_ID);
}

function parsePositionWorkspace(pos) {
  const directTenantId = pos.tenant_id;
  const directTenantCode = pos.tenant_code;
  const directBranchCode = pos.branch_code;
  const directCompany = pos.company;

  const text = pos.jd_text || '';
  const match = text.match(/<!--WORKSPACE:(\{.*?\})-->/);
  let meta = {};
  if (match) {
    try {
      meta = JSON.parse(match[1]);
    } catch (_) {}
  }

  const tenant_id = directTenantId || meta.tenant_id || DEFAULT_TENANT_ID;
  const tenant_code = directTenantCode || meta.tenant_code || resolveTenantCode(tenant_id);
  const company = directCompany || meta.company || (tenant_code === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
  const branch_code = directBranchCode || meta.branch_code || (company === 'NSMLR' ? 'TNT00002-B0002' : `${tenant_code}-B0001`);
  const cleanJd = match ? text.replace(match[0], '').trim() : text;

  const job_type = pos.job_type || meta.job_type || 'Full Time (Permanent)';
  const experience_required = pos.experience_required || meta.experience_required || 'Any Experience';
  const min_qualification = pos.min_qualification || meta.min_qualification || 'Any / Uneducated';
  const urgency = pos.urgency || meta.urgency || '🟡 Medium Priority';
  const work_mode = pos.work_mode || meta.work_mode || 'On-Site (Plant / Office)';
  const shift_type = pos.shift_type || meta.shift_type || 'General Shift (Day)';
  const gender_preference = pos.gender_preference || meta.gender_preference || 'No Preference (Any)';
  const key_skills = pos.key_skills || meta.key_skills || '';
  const vacancy_reason = pos.vacancy_reason || meta.vacancy_reason || 'New Position';
  const posting_status = pos.posting_status || meta.posting_status || 'Draft';
  const posting_sources = Array.isArray(pos.posting_sources)
    ? pos.posting_sources
    : (Array.isArray(meta.posting_sources) ? meta.posting_sources : []);

  return {
    tenant_id,
    tenant_code,
    branch_code,
    company,
    cleanJd,
    job_type,
    experience_required,
    min_qualification,
    urgency,
    work_mode,
    shift_type,
    gender_preference,
    key_skills,
    vacancy_reason,
    posting_status,
    posting_sources
  };
}

function embedPositionWorkspace(jdText, tenantId, company, branchCode = null, tenantCode = null, extraSpecs = {}) {
  const tid = tenantId || DEFAULT_TENANT_ID;
  const tcode = tenantCode || resolveTenantCode(tid);
  const comp = company || (tcode === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
  const bcode = branchCode || (comp === 'NSMLR' ? 'TNT00002-B0002' : `${tcode}-B0001`);

  const meta = {
    tenant_id: tid,
    tenant_code: tcode,
    company: comp,
    branch_code: bcode,
    job_type: extraSpecs.job_type || 'Full Time (Permanent)',
    experience_required: extraSpecs.experience_required || 'Any Experience',
    min_qualification: extraSpecs.min_qualification || 'Any / Uneducated',
    urgency: extraSpecs.urgency || '🟡 Medium Priority',
    work_mode: extraSpecs.work_mode || 'On-Site (Plant / Office)',
    shift_type: extraSpecs.shift_type || 'General Shift (Day)',
    gender_preference: extraSpecs.gender_preference || 'No Preference (Any)',
    key_skills: extraSpecs.key_skills || '',
    vacancy_reason: extraSpecs.vacancy_reason || 'New Position',
    posting_status: extraSpecs.posting_status || 'Draft',
    posting_sources: Array.isArray(extraSpecs.posting_sources) ? extraSpecs.posting_sources : []
  };
  const tag = `<!--WORKSPACE:${JSON.stringify(meta)}-->`;
  const clean = (jdText || '').replace(/<!--WORKSPACE:(\{.*?\})-->/g, '').trim();
  return clean ? `${clean}\n\n${tag}` : tag;
}

/**
 * Fetch positions isolated strictly to the requesting workspace tenant/company/branch
 */
export async function getPositions(tenantId = DEFAULT_TENANT_ID, userCompany = null, branchCode = null, adminCompanyFilter = null) {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('recruitment_positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(data)) return [];

    const effectiveFilter = String(adminCompanyFilter || '').trim();
    const isAllFilter = !effectiveFilter || effectiveFilter.toLowerCase() === 'all';
    const isSwan = isSwanWorkspace(tenantId, userCompany);
    const targetComp = String(userCompany || '').toLowerCase().trim();

    const filtered = data.filter(pos => {
      const meta = parsePositionWorkspace(pos);

      // If user has specific filter selected in navbar (e.g. NSMLR, TNT00002-B0002, SuPuja Creations)
      if (!isAllFilter) {
        const filt = effectiveFilter.toLowerCase();
        const matchComp = String(meta.company || '').toLowerCase() === filt;
        const matchBranch = String(meta.branch_code || '').toLowerCase() === filt;
        const matchTenant = String(meta.tenant_code || '').toLowerCase() === filt;
        return matchComp || matchBranch || matchTenant;
      }

      // If branchCode specified explicitly
      if (branchCode) {
        const b = branchCode.toLowerCase();
        return String(meta.branch_code || '').toLowerCase() === b || String(meta.company || '').toLowerCase() === b;
      }

      // Single tenant scoping
      if (tenantId && tenantId === SUPUJA_TENANT_ID) {
        // Scoped strictly to SuPuja Creations unless All filter is explicitly applied
        return meta.tenant_id === SUPUJA_TENANT_ID || meta.tenant_code === 'TNT00001';
      }

      if (isSwan) {
        return meta.tenant_id === DEFAULT_TENANT_ID || SWAN_COMPANIES.includes(String(meta.company).toLowerCase().trim());
      }
      return meta.tenant_id === tenantId || (targetComp && String(meta.company).toLowerCase().trim() === targetComp);
    });

    return filtered.map(formatRecruiterPosition);
  } catch (err) {
    console.error('getPositions error:', err);
    return [];
  }
}

function formatRecruiterPosition(pos) {
  const meta = parsePositionWorkspace(pos);
  return {
    ...pos,
    jd_text: meta.cleanJd,
    workspace_tenant_id: meta.tenant_id,
    workspace_tenant_code: meta.tenant_code,
    workspace_company: meta.company,
    workspace_branch_code: meta.branch_code,
    job_type: meta.job_type,
    experience_required: meta.experience_required,
    min_qualification: meta.min_qualification,
    urgency: meta.urgency,
    work_mode: meta.work_mode,
    shift_type: meta.shift_type,
    gender_preference: meta.gender_preference,
    key_skills: meta.key_skills,
    vacancy_reason: meta.vacancy_reason,
    posting_status: meta.posting_status || 'Draft',
    posting_sources: Array.isArray(meta.posting_sources) ? meta.posting_sources : []
  };
}

function sanitizeDate(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim();
  if (!clean || clean.includes('NaN') || clean === 'null' || clean === 'undefined' || clean === '-') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const candidate = clean.slice(0, 10);
    const d = new Date(candidate);
    return isNaN(d.getTime()) ? null : candidate;
  }
  const parsed = new Date(clean);
  if (isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(parsed);
}

/**
 * Create or update a recruitment position scoped to the workspace
 */
export async function savePosition(posForm, tenantId = DEFAULT_TENANT_ID, userCompany = null, userName = '', branchCode = null, tenantCode = null) {
  return writePosition(posForm, tenantId, userCompany, userName, branchCode, tenantCode);
}

async function writePosition(posForm, tenantId, userCompany, userName, branchCode, tenantCode, writer = null) {
  try {
    const adminClient = getAdminClient();
    const isUpdate = Boolean(posForm.id);

    const resolvedTenantId = tenantId || DEFAULT_TENANT_ID;
    const resolvedTenantCode = tenantCode || resolveTenantCode(resolvedTenantId);
    const resolvedCompany = userCompany || (resolvedTenantCode === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
    const resolvedBranchCode = branchCode || (resolvedCompany === 'NSMLR' ? 'TNT00002-B0002' : `${resolvedTenantCode}-B0001`);

    const extraSpecs = {
      job_type: posForm.job_type || 'Full Time (Permanent)',
      experience_required: posForm.experience_required || 'Any Experience',
      min_qualification: posForm.min_qualification || 'Any / Uneducated',
      urgency: posForm.urgency || '🟡 Medium Priority',
      work_mode: posForm.work_mode || 'On-Site (Plant / Office)',
      shift_type: posForm.shift_type || 'General Shift (Day)',
      gender_preference: posForm.gender_preference || 'No Preference (Any)',
      key_skills: posForm.key_skills || '',
      vacancy_reason: posForm.vacancy_reason || 'New Position',
      posting_status: posForm.posting_status || 'Draft',
      posting_sources: Array.isArray(posForm.posting_sources) ? posForm.posting_sources : []
    };

    let res;

    if (isUpdate) {
      // Build safe partial update payload: NEVER overwrite unprovided fields to null
      const updatePayload = {};
      if (posForm.title !== undefined) updatePayload.title = posForm.title;
      if (posForm.department !== undefined) updatePayload.department = posForm.department;
      if (posForm.openings !== undefined) updatePayload.openings = parseInt(posForm.openings, 10) || 1;
      if (posForm.status !== undefined) updatePayload.status = posForm.status;
      if (posForm.deadline_date !== undefined) updatePayload.deadline_date = sanitizeDate(posForm.deadline_date);
      if (posForm.interviewer_name !== undefined) updatePayload.interviewer_name = posForm.interviewer_name || null;
      if (posForm.recruiter_assigned !== undefined) updatePayload.recruiter_assigned = posForm.recruiter_assigned || null;
      if (posForm.salary_min !== undefined) {
        updatePayload.salary_min = (posForm.salary_min !== '' && posForm.salary_min !== null) 
          ? parseInt(posForm.salary_min, 10) 
          : null;
      }
      if (posForm.salary_max !== undefined) {
        updatePayload.salary_max = (posForm.salary_max !== '' && posForm.salary_max !== null) 
          ? parseInt(posForm.salary_max, 10) 
          : null;
      }
      if (posForm.branch_code !== undefined) updatePayload.branch_code = posForm.branch_code;
      if (posForm.company !== undefined) updatePayload.company = posForm.company;
      if (posForm.tenant_id !== undefined) updatePayload.tenant_id = posForm.tenant_id;
      if (posForm.tenant_code !== undefined) updatePayload.tenant_code = posForm.tenant_code;

      if (posForm.job_type !== undefined) updatePayload.job_type = posForm.job_type;
      if (posForm.experience_required !== undefined) updatePayload.experience_required = posForm.experience_required;
      if (posForm.min_qualification !== undefined) updatePayload.min_qualification = posForm.min_qualification;
      if (posForm.urgency !== undefined) updatePayload.urgency = posForm.urgency;
      if (posForm.work_mode !== undefined) updatePayload.work_mode = posForm.work_mode;
      if (posForm.shift_type !== undefined) updatePayload.shift_type = posForm.shift_type;
      if (posForm.gender_preference !== undefined) updatePayload.gender_preference = posForm.gender_preference;
      if (posForm.key_skills !== undefined) updatePayload.key_skills = posForm.key_skills;
      if (posForm.vacancy_reason !== undefined) updatePayload.vacancy_reason = posForm.vacancy_reason;
      if (posForm.posting_status !== undefined) updatePayload.posting_status = posForm.posting_status;
      if (posForm.posting_sources !== undefined) updatePayload.posting_sources = posForm.posting_sources;

      if (posForm.jd_text !== undefined) {
        updatePayload.jd_text = embedPositionWorkspace(
          posForm.jd_text, 
          posForm.tenant_id || resolvedTenantId, 
          posForm.company || resolvedCompany, 
          posForm.branch_code || resolvedBranchCode, 
          posForm.tenant_code || resolvedTenantCode,
          extraSpecs
        );
      }

      res = writer ? await writer('update', updatePayload) : await adminClient
        .from('recruitment_positions')
        .update(updatePayload)
        .eq('id', posForm.id)
        .select()
        .single();

      if (!writer && res.error?.code === 'PGRST204') {
        const cleanPayload = { ...updatePayload };
        delete cleanPayload.tenant_id;
        delete cleanPayload.tenant_code;
        delete cleanPayload.branch_code;
        delete cleanPayload.company;
        delete cleanPayload.job_type;
        delete cleanPayload.experience_required;
        delete cleanPayload.min_qualification;
        delete cleanPayload.urgency;
        delete cleanPayload.work_mode;
        delete cleanPayload.shift_type;
        delete cleanPayload.gender_preference;
        delete cleanPayload.key_skills;
        delete cleanPayload.vacancy_reason;
        delete cleanPayload.posting_status;
        delete cleanPayload.posting_sources;
        res = await adminClient
          .from('recruitment_positions')
          .update(cleanPayload)
          .eq('id', posForm.id)
          .select()
          .single();
      }
    } else {
      // Create new position
      const taggedJd = embedPositionWorkspace(
        posForm.jd_text || '', 
        resolvedTenantId, 
        resolvedCompany, 
        resolvedBranchCode, 
        resolvedTenantCode,
        extraSpecs
      );

      const basePayload = {
        title: posForm.title,
        department: posForm.department,
        openings: parseInt(posForm.openings, 10) || 1,
        status: posForm.status || 'S00',
        jd_text: taggedJd,
        deadline_date: sanitizeDate(posForm.deadline_date),
        interviewer_name: posForm.interviewer_name || null,
        recruiter_assigned: posForm.recruiter_assigned || null,
        salary_min: (posForm.salary_min !== '' && posForm.salary_min !== null && posForm.salary_min !== undefined) 
          ? parseInt(posForm.salary_min, 10) 
          : null,
        salary_max: (posForm.salary_max !== '' && posForm.salary_max !== null && posForm.salary_max !== undefined) 
          ? parseInt(posForm.salary_max, 10) 
          : null
      };

      const fullPayload = {
        ...basePayload,
        posting_status: posForm.posting_status || 'Draft',
        posting_sources: Array.isArray(posForm.posting_sources) ? posForm.posting_sources : [],
        tenant_id: resolvedTenantId,
        tenant_code: resolvedTenantCode,
        branch_code: resolvedBranchCode,
        company: resolvedCompany,
        created_by: userName || 'Admin',
        ...extraSpecs
      };

      res = writer ? await writer('insert', fullPayload) : await adminClient
        .from('recruitment_positions')
        .insert([fullPayload])
        .select()
        .single();

      if (!writer && res.error?.code === 'PGRST204') {
        res = await adminClient
          .from('recruitment_positions')
          .insert([{ ...basePayload, created_by: userName || 'Admin' }])
          .select()
          .single();
      }
    }

    if (res.error) throw res.error;
    const meta = parsePositionWorkspace(res.data);
    return { 
      success: true, 
      data: { 
        ...res.data, 
        jd_text: meta.cleanJd,
        workspace_tenant_id: meta.tenant_id,
        workspace_tenant_code: meta.tenant_code,
        workspace_company: meta.company,
        workspace_branch_code: meta.branch_code,
        job_type: meta.job_type,
        experience_required: meta.experience_required,
        min_qualification: meta.min_qualification,
        urgency: meta.urgency,
        work_mode: meta.work_mode,
        shift_type: meta.shift_type,
        gender_preference: meta.gender_preference,
        key_skills: meta.key_skills,
        vacancy_reason: meta.vacancy_reason
      } 
    };
  } catch (err) {
    console.error('savePosition error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a recruitment position and clean up candidates & notes
 */
export async function deletePosition(posId, tenantId = DEFAULT_TENANT_ID, userCompany = null) {
  try {
    const adminClient = getAdminClient();
    if (!posId) throw new Error('Position ID is required');

    // Fetch position to verify ownership
    const { data: pos } = await adminClient
      .from('recruitment_positions')
      .select('*')
      .eq('id', posId)
      .single();

    if (!pos) throw new Error('Position not found');

    const meta = parsePositionWorkspace(pos);
    const isSwan = isSwanWorkspace(tenantId, userCompany);
    if (!isSwan && meta.tenant_id !== tenantId && String(meta.company).toLowerCase().trim() !== String(userCompany || '').toLowerCase().trim()) {
      throw new Error('Unauthorized: Position belongs to another workspace');
    }

    // Find linked candidates to clean up their notes
    const { data: candidates } = await adminClient
      .from('recruitment_candidates')
      .select('id')
      .eq('position_id', posId);

    const candIds = (candidates || []).map(c => c.id);
    if (candIds.length > 0) {
      await adminClient.from('recruitment_candidate_notes').delete().in('candidate_id', candIds);
      await adminClient.from('recruitment_candidates').delete().eq('position_id', posId);
    }

    const { error: delErr } = await adminClient
      .from('recruitment_positions')
      .delete()
      .eq('id', posId);

    if (delErr) throw delErr;
    return { success: true };
  } catch (err) {
    console.error('deletePosition error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch candidates strictly linked to workspace positions
 */
export async function getCandidates(workspacePositionIds = []) {
  try {
    if (!Array.isArray(workspacePositionIds) || workspacePositionIds.length === 0) {
      return [];
    }

    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('recruitment_candidates')
      .select('*, recruitment_positions(title, department, jd_text)')
      .in('position_id', workspacePositionIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(data)) return [];

    return data.map(formatRecruiterCandidate);
  } catch (err) {
    console.error('getCandidates error:', err);
    return [];
  }
}

function formatRecruiterCandidate(cand) {
  const parentPos = cand.recruitment_positions;
  const meta = parentPos ? parsePositionWorkspace(parentPos) : null;

  let applicantProfile = {};
  let evaluation = {};
  if (cand.joining_details) {
    try {
      const parsed = typeof cand.joining_details === 'string' ? JSON.parse(cand.joining_details) : cand.joining_details;
      if (parsed && typeof parsed === 'object') {
        applicantProfile = parsed.applicant_profile || parsed;
        evaluation = parsed.evaluation || {};
      }
    } catch (_) {}
  }

  return {
    ...cand,
    current_city: cand.current_city || applicantProfile.current_city || '',
    total_experience: cand.total_experience || applicantProfile.total_experience || '',
    highest_qualification: cand.highest_qualification || applicantProfile.highest_qualification || '',
    notice_period: cand.notice_period || applicantProfile.notice_period || '',
    current_salary: (cand.current_salary !== null && cand.current_salary !== undefined) ? cand.current_salary : (applicantProfile.current_salary !== undefined ? applicantProfile.current_salary : null),
    cover_note: cand.cover_note || applicantProfile.cover_note || '',
    alternate_phone: cand.alternate_phone || applicantProfile.alternate_phone || '',
    applicant_profile: applicantProfile,
    evaluation: evaluation,
    interview_rating: (cand.interview_rating !== null && cand.interview_rating !== undefined) ? cand.interview_rating : (evaluation.interview_rating !== undefined ? evaluation.interview_rating : null),
    technical_score: cand.technical_score || evaluation.technical_score || cand.test_results || null,
    evaluation_recommendation: cand.recommendation || evaluation.recommendation || '',
    workspace_tenant_id: cand.tenant_id || meta?.tenant_id || DEFAULT_TENANT_ID,
    workspace_tenant_code: cand.tenant_code || meta?.tenant_code || 'TNT00002',
    workspace_company: cand.company || meta?.company || 'NSMLR',
    workspace_branch_code: cand.branch_code || meta?.branch_code || 'TNT00002-B0002'
  };
}

/**
 * Save candidate (Create or Update)
 */
export async function saveCandidate(candForm, userName = '') {
  return writeCandidate(candForm, userName);
}

async function writeCandidate(candForm, userName, writer = null) {
  try {
    const adminClient = getAdminClient();

    if (candForm.id) {
      // Build safe partial update payload: NEVER overwrite omitted fields to null
      const updatePayload = {};
      if (candForm.name !== undefined) updatePayload.name = candForm.name;
      if (candForm.email !== undefined) updatePayload.email = candForm.email;
      if (candForm.phone !== undefined) updatePayload.phone = candForm.phone;
      if (candForm.current_stage !== undefined) updatePayload.current_stage = candForm.current_stage;
      if (candForm.candidate_status !== undefined) updatePayload.candidate_status = candForm.candidate_status;
      if (candForm.expected_salary_min !== undefined) {
        updatePayload.expected_salary_min = (candForm.expected_salary_min !== '' && candForm.expected_salary_min !== null) 
          ? parseInt(candForm.expected_salary_min, 10) 
          : null;
      }
      if (candForm.expected_salary_max !== undefined) {
        updatePayload.expected_salary_max = (candForm.expected_salary_max !== '' && candForm.expected_salary_max !== null) 
          ? parseInt(candForm.expected_salary_max, 10) 
          : null;
      }
      if (candForm.actual_salary !== undefined) {
        updatePayload.actual_salary = (candForm.actual_salary !== '' && candForm.actual_salary !== null) 
          ? parseInt(candForm.actual_salary, 10) 
          : null;
      }
      if (candForm.interview_feedback !== undefined) updatePayload.interview_feedback = candForm.interview_feedback;
      if (candForm.test_results !== undefined) updatePayload.test_results = candForm.test_results;
      if (candForm.ed_approval_status !== undefined) updatePayload.ed_approval_status = candForm.ed_approval_status;
      if (candForm.salary_negotiation_details !== undefined) updatePayload.salary_negotiation_details = candForm.salary_negotiation_details;
      if (candForm.formal_structure_approved !== undefined) updatePayload.formal_structure_approved = !!candForm.formal_structure_approved;
      if (candForm.loi_status !== undefined) updatePayload.loi_status = candForm.loi_status;
      if (candForm.joining_details !== undefined) updatePayload.joining_details = candForm.joining_details;
      if (candForm.interviewer_name !== undefined) updatePayload.interviewer_name = candForm.interviewer_name;
      if (candForm.joining_date !== undefined) updatePayload.joining_date = sanitizeDate(candForm.joining_date);
      if (candForm.actual_joining_date !== undefined) updatePayload.actual_joining_date = sanitizeDate(candForm.actual_joining_date);
      if (candForm.resume_url !== undefined) updatePayload.resume_url = candForm.resume_url;

      if (candForm.alternate_phone !== undefined) updatePayload.alternate_phone = candForm.alternate_phone;
      if (candForm.current_city !== undefined) updatePayload.current_city = candForm.current_city;
      if (candForm.total_experience !== undefined) updatePayload.total_experience = candForm.total_experience;
      if (candForm.highest_qualification !== undefined) updatePayload.highest_qualification = candForm.highest_qualification;
      if (candForm.notice_period !== undefined) updatePayload.notice_period = candForm.notice_period;
      if (candForm.current_salary !== undefined) {
        updatePayload.current_salary = (candForm.current_salary !== '' && candForm.current_salary !== null) 
          ? parseInt(candForm.current_salary, 10) 
          : null;
      }
      if (candForm.cover_note !== undefined) updatePayload.cover_note = candForm.cover_note;
      if (candForm.interview_rating !== undefined) {
        updatePayload.interview_rating = (candForm.interview_rating !== '' && candForm.interview_rating !== null) 
          ? parseFloat(candForm.interview_rating) 
          : null;
      }
      if (candForm.technical_score !== undefined) updatePayload.technical_score = candForm.technical_score;
      if (candForm.recommendation !== undefined) updatePayload.recommendation = candForm.recommendation;

      let res = writer ? await writer('update', updatePayload) : await adminClient
        .from('recruitment_candidates')
        .update(updatePayload)
        .eq('id', candForm.id)
        .select('*, recruitment_positions(title, department)')
        .single();

      if (!writer && res.error?.code === 'PGRST204') {
        const cleanPayload = { ...updatePayload };
        delete cleanPayload.alternate_phone;
        delete cleanPayload.current_city;
        delete cleanPayload.total_experience;
        delete cleanPayload.highest_qualification;
        delete cleanPayload.notice_period;
        delete cleanPayload.current_salary;
        delete cleanPayload.cover_note;
        delete cleanPayload.interview_rating;
        delete cleanPayload.technical_score;
        delete cleanPayload.recommendation;
        res = await adminClient
          .from('recruitment_candidates')
          .update(cleanPayload)
          .eq('id', candForm.id)
          .select('*, recruitment_positions(title, department)')
          .single();
      }

      if (res.error) throw res.error;
      return { success: true, data: res.data };
    } else {
      // Create new candidate
      const positionId = candForm.position_id;
      if (!positionId) throw new Error('Position ID is required');

      const { count } = await adminClient
        .from('recruitment_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('position_id', positionId);

      const nextSeq = (count || 0) + 1;
      const posShort = positionId.substring(0, 8).toUpperCase();
      const candidateCode = `POS-${posShort}-${String(nextSeq).padStart(3, '0')}`;

      // Get position details to inherit workspace scoping
      const { data: parentPos } = await adminClient
        .from('recruitment_positions')
        .select('*')
        .eq('id', positionId)
        .single();

      const meta = parentPos ? parsePositionWorkspace(parentPos) : null;

      const current_salary = (candForm.current_salary !== '' && candForm.current_salary !== null && candForm.current_salary !== undefined)
        ? parseInt(candForm.current_salary, 10)
        : null;

      const applicantProfile = {
        current_city: candForm.current_city ? String(candForm.current_city).trim() : '',
        total_experience: candForm.total_experience ? String(candForm.total_experience).trim() : '',
        current_salary: current_salary,
        notice_period: candForm.notice_period ? String(candForm.notice_period).trim() : '',
        highest_qualification: candForm.highest_qualification ? String(candForm.highest_qualification).trim() : '',
        cover_note: candForm.cover_note ? String(candForm.cover_note).trim() : '',
        alternate_phone: candForm.alternate_phone ? String(candForm.alternate_phone).trim() : ''
      };

      const insertPayload = {
        position_id: positionId,
        name: candForm.name,
        email: candForm.email,
        phone: candForm.phone,
        current_stage: candForm.current_stage || 'S02',
        candidate_status: candForm.candidate_status || 'Awaiting Screening',
        expected_salary_min: candForm.expected_salary_min ? parseInt(candForm.expected_salary_min, 10) : null,
        expected_salary_max: candForm.expected_salary_max ? parseInt(candForm.expected_salary_max, 10) : null,
        resume_url: candForm.resume_url || '',
        candidate_code: candidateCode,
        created_by: userName || 'Admin',
        joining_details: JSON.stringify({ applicant_profile: applicantProfile }),
        alternate_phone: applicantProfile.alternate_phone,
        current_city: applicantProfile.current_city,
        total_experience: applicantProfile.total_experience,
        highest_qualification: applicantProfile.highest_qualification,
        notice_period: applicantProfile.notice_period,
        current_salary: current_salary,
        cover_note: applicantProfile.cover_note
      };

      if (meta) {
        insertPayload.tenant_id = meta.tenant_id;
        insertPayload.tenant_code = meta.tenant_code;
        insertPayload.company = meta.company;
        insertPayload.branch_code = meta.branch_code;
      }

      let res = writer ? await writer('insert', insertPayload) : await adminClient
        .from('recruitment_candidates')
        .insert([insertPayload])
        .select('*, recruitment_positions(title, department)')
        .single();

      if (!writer && res.error?.code === 'PGRST204') {
        const cleanInsert = { ...insertPayload };
        delete cleanInsert.alternate_phone;
        delete cleanInsert.current_city;
        delete cleanInsert.total_experience;
        delete cleanInsert.highest_qualification;
        delete cleanInsert.notice_period;
        delete cleanInsert.current_salary;
        delete cleanInsert.cover_note;
        res = await adminClient
          .from('recruitment_candidates')
          .insert([cleanInsert])
          .select('*, recruitment_positions(title, department)')
          .single();
      }

      if (res.error) throw res.error;
      return { success: true, data: res.data };
    }
  } catch (err) {
    console.error('saveCandidate error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a candidate and candidate notes
 */
export async function deleteCandidate(candId) {
  try {
    const adminClient = getAdminClient();
    if (!candId) throw new Error('Candidate ID is required');

    await adminClient.from('recruitment_candidate_notes').delete().eq('candidate_id', candId);
    const { error } = await adminClient.from('recruitment_candidates').delete().eq('id', candId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('deleteCandidate error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Add a candidate note
 */
export async function addCandidateNote(candidateId, noteText, createdBy = 'Admin') {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('recruitment_candidate_notes')
      .insert([{
        candidate_id: candidateId,
        note_text: noteText,
        created_by: createdBy
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('addCandidateNote error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Release a claimed position back to Open Pool with mandatory audit reason
 */
export async function releasePosition(positionId, reason, actor = 'Recruiter') {
  try {
    const adminClient = getAdminClient();
    if (!positionId) throw new Error('Position ID is required');

    const { data: pos, error: fetchErr } = await adminClient
      .from('recruitment_positions')
      .select('title, recruiter_assigned, jd_text')
      .eq('id', positionId)
      .single();

    if (fetchErr) throw fetchErr;

    const previousRecruiter = pos?.recruiter_assigned || 'Recruiter';

    let updatedJd = pos?.jd_text || '';
    const releaseEntry = { actor: actor || previousRecruiter, reason, timestamp: new Date().toISOString() };
    if (!updatedJd.includes('<!--RELEASE_HISTORY:')) {
      updatedJd = `${updatedJd}\n\n<!--RELEASE_HISTORY:[${JSON.stringify(releaseEntry)}]-->`;
    } else {
      updatedJd = updatedJd.replace(/<!--RELEASE_HISTORY:(\[.*?\])-->/, (_, json) => {
        try {
          const list = JSON.parse(json);
          list.push(releaseEntry);
          return `<!--RELEASE_HISTORY:${JSON.stringify(list)}-->`;
        } catch (_) {
          return `<!--RELEASE_HISTORY:[${JSON.stringify(releaseEntry)}]-->`;
        }
      });
    }

    const { data, error } = await adminClient
      .from('recruitment_positions')
      .update({
        recruiter_assigned: 'All',
        jd_text: updatedJd
      })
      .eq('id', positionId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('releasePosition error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Admin / Manager Force Stage Override with audit log note
 */
export async function adminOverrideCandidateStage(candidateId, newStage, newStatus, reason, actor = 'Admin') {
  try {
    const adminClient = getAdminClient();
    if (!candidateId || !newStage) throw new Error('Candidate ID and Target Stage are required');

    const { data: cand, error: fetchErr } = await adminClient
      .from('recruitment_candidates')
      .select('name, current_stage')
      .eq('id', candidateId)
      .single();

    if (fetchErr) throw fetchErr;

    const oldStage = cand?.current_stage || 'S02';

    const { data, error } = await adminClient
      .from('recruitment_candidates')
      .update({
        current_stage: newStage,
        candidate_status: newStatus || 'Stage Updated by Admin'
      })
      .eq('id', candidateId)
      .select('*, recruitment_positions(title, department)')
      .single();

    if (error) throw error;

    await adminClient.from('recruitment_candidate_notes').insert([{
      candidate_id: candidateId,
      note_text: `🔀 ADMIN STAGE OVERRIDE: Stage changed from ${oldStage} to ${newStage} by ${actor}. Mandatory Reason: ${reason || 'Administrative Decision'}`,
      created_by: actor
    }]);

    return { success: true, data };
  } catch (err) {
    console.error('adminOverrideCandidateStage error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Auto-assign positions unclaimed for >= 24h to recruiter with least active positions
 */
export async function autoAssignUnclaimedPositions(input = {}) {
  try {
    const scope = await recruiterScope(input);
    if (!scope.manager || !scope.canWrite) return { success: true, count: 0 };
    const adminClient = scope.db;
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    const { data: allPositions, error: posErr } = await positionsQuery(scope, adminClient
      .from('recruitment_positions')
      .select('id,created_at,jd_text,recruiter_assigned,status'))
      .in('status', ['S00', 'S01'])
      .order('created_at', { ascending: true });

    if (posErr) throw posErr;
    if (!Array.isArray(allPositions) || allPositions.length === 0) return { success: true, count: 0 };

    const unclaimed = allPositions.filter(p => {
      const isUnclaimed = !p.recruiter_assigned || p.recruiter_assigned === 'All';
      const isLiveStage = p.status === 'S00' || p.status === 'S01';
      const createdTime = p.created_at ? new Date(p.created_at).getTime() : 0;
      const isOlderThan24h = (now - createdTime) >= twentyFourHoursMs;
      return isUnclaimed && isLiveStage && isOlderThan24h;
    });

    if (unclaimed.length === 0) return { success: true, count: 0 };

    let recruiterQuery = adminClient.from('user_roles')
      .select('user_id,emp_name,name,email,role,branch_code,emp_status,module_access')
      .eq('tenant_id', scope.tenant.id);
    if (scope.codes) recruiterQuery = recruiterQuery.in('branch_code', scope.codes);
    const { data: users, error: userErr } = await recruiterQuery;

    if (userErr) throw userErr;

    const recruiters = (users || []).filter(u => {
      const r = (u.role || '').toLowerCase();
      const n = (u.emp_name || u.name || '').toLowerCase();
      return !['inactive', 'terminated', 'suspended', 'trash'].includes(String(u.emp_status || '').toLowerCase()) &&
        (u.module_access?.recruiter?.view === true || r.includes('recruiter') || r.includes('hr') || n.includes('hr') || r === 'admin');
    }).map(user => ({ id: user.user_id, email: user.email, name: user.emp_name || user.name }));

    if (recruiters.length === 0) return { success: true, count: 0 };

    let limitsConfig = {};
    try {
      const limitsRes = await getRecruiterWorkloadLimits(scope.tenant.tenant_code);
      if (limitsRes?.success) limitsConfig = limitsRes.workload_limits || {};
    } catch (_) {}

    const workloadMap = {};
    recruiters.forEach(r => {
      const rName = r.name || r.email;
      workloadMap[rName] = allPositions.filter(p => (p.status === 'S00' || p.status === 'S01') && p.recruiter_assigned === rName).length;
    });

    let assignedCount = 0;

    for (const pos of unclaimed) {
      let bestRecruiter = null;
      let minWorkload = Infinity;

      // Pass 1: Unreleased recruiters who are NOT at capacity
      recruiters.forEach(r => {
        const rName = r.name || r.email;
        const isReleased = (pos.jd_text || '').includes(rName);
        const rKey = r.id || r.email;
        const lim = limitsConfig[rKey] || limitsConfig[r.email] || limitsConfig[r.name] || {};
        const isFixed = lim.limit_mode === 'Fixed Limit';
        const maxLimit = parseInt(lim.fixed_limit, 10) || 0;
        const atCapacity = isFixed && maxLimit > 0 && workloadMap[rName] >= maxLimit;

        if (!isReleased && !atCapacity && workloadMap[rName] < minWorkload) {
          minWorkload = workloadMap[rName];
          bestRecruiter = rName;
        }
      });

      // Pass 2: Fallback to any recruiter not at capacity
      if (!bestRecruiter) {
        recruiters.forEach(r => {
          const rName = r.name || r.email;
          const rKey = r.id || r.email;
          const lim = limitsConfig[rKey] || limitsConfig[r.email] || limitsConfig[r.name] || {};
          const isFixed = lim.limit_mode === 'Fixed Limit';
          const maxLimit = parseInt(lim.fixed_limit, 10) || 0;
          const atCapacity = isFixed && maxLimit > 0 && workloadMap[rName] >= maxLimit;

          if (!atCapacity && workloadMap[rName] < minWorkload) {
            minWorkload = workloadMap[rName];
            bestRecruiter = rName;
          }
        });
      }

      if (bestRecruiter) {
        let claim = positionsQuery(scope, adminClient
          .from('recruitment_positions')
          .update({
            recruiter_assigned: bestRecruiter
          })
          .eq('id', pos.id));
        claim = pos.recruiter_assigned === null
          ? claim.is('recruiter_assigned', null)
          : claim.eq('recruiter_assigned', pos.recruiter_assigned);
        const { data: claimed, error } = await claim.select('id').maybeSingle();
        if (error || !claimed) continue;

        workloadMap[bestRecruiter] = (workloadMap[bestRecruiter] || 0) + 1;
        assignedCount++;
      }
    }

    return { success: true, count: assignedCount };
  } catch (err) {
    console.error('autoAssignUnclaimedPositions error:', err);
    return { success: false, error: err.message };
  }
}


const RECRUITER_UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const RECRUITER_PAGE_SIZE = 150;
const RECRUITER_CANDIDATE_STAGES = Array.from({ length: 11 }, (_, index) => 'S' + String(index + 2).padStart(2, '0'));
const RECRUITER_PARENT_FIELDS = 'id,title,department,status,tenant_id,tenant_code,branch_code,company';
const RECRUITER_CANDIDATE_SELECT = '*,recruitment_positions!inner(' + RECRUITER_PARENT_FIELDS + ')';
const RECRUITER_ENTITIES = {
  positions: 'recruitment_positions',
  candidates: 'recruitment_candidates',
  notes: 'recruitment_candidate_notes'
};

function recruiterDenied(message) {
  const error = new Error(message);
  error.code = 'denied';
  return error;
}

function recruiterData({ data, error }) {
  if (error) throw error;
  return data;
}

function recruiterFailure(error) {
  if (['42P01', 'PGRST202', 'PGRST205', '42703'].includes(error?.code)) {
    return { success: false, code: 'setup', error: 'Recruiter sync requires the database migration.' };
  }
  return { success: false, code: error?.code, error: error?.message || 'Recruiter sync could not finish.' };
}

async function recruiterScope(input = {}) {
  const session = await createClient();
  const { data: { user } = {}, error } = await session.auth.getUser();
  if (error || !user || user.id !== input.userId) throw recruiterDenied('Recruiter session could not be verified.');
  const db = getAdminClient();
  const member = recruiterData(await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle());
  if (!member || member.is_approved === false || member.can_read === false ||
      ['inactive', 'terminated', 'suspended', 'trash'].includes(String(member.emp_status || member.status || '').toLowerCase())) {
    throw recruiterDenied('Recruiter access denied.');
  }
  const access = { ...(member.module_access || {}), _userEmail: user.email };
  const master = checkIsMasterAdmin(access, member.role, user.email);
  const role = master ? 'master_admin' : member.role;
  const permissions = getModulePermissions(access, role, 'recruiter');
  if (!permissions.view || !RECRUITER_UUID.test(input.tenantId || '')) throw recruiterDenied('Recruiter access denied.');
  const tenant = recruiterData(await db.from('tenants').select('id,tenant_code,name,status').eq('id', input.tenantId).maybeSingle());
  const ownTenant = member.tenant_id || access._tenantId;
  if (!tenant || (!master && (ownTenant
    ? ![tenant.id, tenant.tenant_code].includes(ownTenant)
    : ![tenant.name, tenant.tenant_code].some(value => value && value.toLowerCase() === String(member.company || '').toLowerCase()))) ||
    ['SUSPENDED', 'ARCHIVED', 'DRAFT'].includes(String(tenant.status).toUpperCase())) {
    throw recruiterDenied('Recruiter tenant access denied.');
  }
  const branchAccess = getUserBranchAccess({ ...member, role, module_access: access }, tenant.id);
  const tenantWide = branchAccess.isAllBranches;
  const assigned = new Set((access.assigned_branch_codes || []).filter?.(value => /^TNT\d+-B\d+$/.test(value)) || []);
  if (member.branch_code && !assigned.size) assigned.add(member.branch_code);
  const choices = recruiterData(await db.from('tenant_branches')
    .select('branch_code,branch_name,company,legacy_code,custom_code,is_active')
    .eq('tenant_id', tenant.id)) || [];
  const permitted = choices.filter(branch => branch.is_active !== false && (tenantWide || (
    assigned.size ? assigned.has(branch.branch_code) : [branch.branch_name, branch.legacy_code, branch.custom_code]
      .some(value => matchesCompanyToken(value, branchAccess.allowedCompanies))
  )));
  const norm = value => String(value || '').trim().toLowerCase();
  const filter = norm(input.filter);
  const narrowed = !['', 'all', 'all branches', norm(tenant.tenant_code), norm(tenant.name)].includes(filter);
  const selected = narrowed ? permitted.filter(branch => [
    branch.branch_code, branch.branch_name, branch.legacy_code, branch.custom_code
  ].some(value => norm(value) === filter)) : permitted;
  if ((narrowed || !tenantWide) && !selected.length) throw recruiterDenied('Recruiter branch access denied.');
  const codes = tenantWide && !narrowed ? null : selected.map(branch => branch.branch_code).sort();
  const manager = checkIsAdminRole(role) || permissions.is_manager;
  const configured = access.recruiter || {};
  const stages = {};
  for (const stage of ['S00', 'S01', ...RECRUITER_CANDIDATE_STAGES]) {
    const granular = getSubItemPermissions(access, role, 'recruiter', stage);
    const viewSteps = configured.assigned_steps_view || configured.assigned_steps;
    const editSteps = configured.assigned_steps_edit || configured.assigned_steps;
    const entry = configured.sub_items?.[stage];
    stages[stage] = {
      view: manager || (granular.view && (!Array.isArray(viewSteps) || !viewSteps.length || viewSteps.includes(stage) || entry?.view === true)),
      edit: (manager || (granular.edit && (!Array.isArray(editSteps) || !editSteps.length || editSteps.includes(stage)))) &&
        entry?.edit !== false,
      delete: manager || granular.delete === true,
      add: manager || granular.add === true
    };
  }
  const token = createHash('sha256').update(JSON.stringify([user.id, tenant.id, codes, stages])).digest('hex');
  return {
    db, tenant, codes, branches: permitted, token, stages, user,
    manager, canWrite: member.can_write !== false && String(tenant.status).toUpperCase() !== 'READ_ONLY',
    canDemote: manager || configured.can_decrease_stage === true || access.can_decrease_recruiter_stage === true,
    actor: member.emp_name || member.name || user.email?.split('@')[0] || 'Recruiter'
  };
}

function positionInScope(scope, row) {
  return row?.tenant_id === scope.tenant.id && (!scope.codes || scope.codes.includes(row.branch_code));
}

function positionsQuery(scope, query, prefix = '') {
  query = query.eq(prefix + 'tenant_id', scope.tenant.id);
  return scope.codes ? query.in(prefix + 'branch_code', scope.codes) : query;
}

function visiblePosition(scope, row) {
  if (!positionInScope(scope, row)) return null;
  if (scope.stages[row.status]?.view) return formatRecruiterPosition(row);
  return {
    id: row.id, status: row.status, title: row.title, department: row.department,
    created_at: row.created_at, updated_at: row.updated_at, branch_code: row.branch_code,
    workspace_branch_code: row.branch_code, restricted_position: true
  };
}

function visibleCandidate(scope, row) {
  if (!row || !scope.stages[row.current_stage]?.view || !positionInScope(scope, row.recruitment_positions)) return null;
  const candidate = formatRecruiterCandidate(row);
  const parent = row.recruitment_positions;
  candidate.recruitment_positions = { title: parent.title, department: parent.department };
  candidate.workspace_tenant_id = parent.tenant_id;
  candidate.workspace_tenant_code = parent.tenant_code;
  candidate.workspace_company = parent.company;
  candidate.workspace_branch_code = parent.branch_code;
  return candidate;
}

async function recruiterPosition(scope, id) {
  const row = recruiterData(await scope.db.from(RECRUITER_ENTITIES.positions).select('*').eq('id', id).maybeSingle());
  if (!positionInScope(scope, row)) throw recruiterDenied('Recruiter vacancy is outside your workspace.');
  return row;
}

async function recruiterCandidate(scope, id) {
  const row = recruiterData(await scope.db.from(RECRUITER_ENTITIES.candidates)
    .select(RECRUITER_CANDIDATE_SELECT).eq('id', id).maybeSingle());
  if (!visibleCandidate(scope, row)) throw recruiterDenied('Recruiter candidate is outside your permitted stages or workspace.');
  return row;
}

async function recruiterWatermark(scope) {
  try {
    const { data, error } = await scope.db.from('recruiter_sync_clock').select('revision')
      .eq('tenant_id', scope.tenant.id).maybeSingle();
    if (error) {
      if (['42P01', 'PGRST202', 'PGRST205', '42703'].includes(error?.code)) {
        return '0';
      }
      throw error;
    }
    return String(data?.revision || 0);
  } catch (err) {
    if (['42P01', 'PGRST202', 'PGRST205', '42703'].includes(err?.code)) {
      return '0';
    }
    throw err;
  }
}

function recruiterCursor(value) {
  const cursor = String(value ?? '0');
  if (!/^\d{1,16}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) throw new Error('Invalid recruiter sync cursor.');
  return cursor;
}

async function recruiterSnapshot(scope, candidateId, page) {
  const entity = candidateId ? 'notes' : page?.entity === 'candidates' ? 'candidates' : 'positions';
  const watermark = page ? recruiterCursor(page.end) : await recruiterWatermark(scope);
  const after = page?.after;
  let query = scope.db.from(RECRUITER_ENTITIES[entity]).select(entity === 'candidates' ? RECRUITER_CANDIDATE_SELECT : '*');
  if (entity === 'notes') query = query.eq('candidate_id', candidateId);
  else query = positionsQuery(scope, query, entity === 'candidates' ? 'recruitment_positions.' : '');
  if (after) {
    if (!RECRUITER_UUID.test(after)) throw new Error('Invalid recruiter snapshot page.');
    query = query.gt('id', after);
  }
  const data = recruiterData(await query.order('id').limit(RECRUITER_PAGE_SIZE)) || [];
  const changes = data.map(item => ({
    entity, id: item.id, row: entity === 'positions' ? visiblePosition(scope, item)
      : entity === 'candidates' ? visibleCandidate(scope, item) : item
  })).filter(item => item.row);
  let continuation = null;
  if (data.length === RECRUITER_PAGE_SIZE) {
    continuation = { entity, after: data.at(-1).id, end: watermark };
  } else if (entity === 'positions') {
    continuation = { entity: 'candidates', end: watermark };
  }
  return { success: true, changes, cursor: watermark, token: scope.token, continuation };
}

async function recruiterDelta(scope, candidateId, from, page) {
  const cursor = recruiterCursor(page?.after ?? from);
  const watermark = page ? recruiterCursor(page.end) : await recruiterWatermark(scope);
  if (Number(cursor) > Number(watermark)) return { success: true, reset: true };
  let query = scope.db.from('recruiter_sync_changes').select('revision,entity,row_id,scope_changed')
    .eq('tenant_id', scope.tenant.id).gt('revision', cursor).lte('revision', watermark);
  query = candidateId ? query.eq('candidate_id', candidateId).eq('entity', 'notes') : query.neq('entity', 'notes');
  const { data: events, error } = await query.order('revision').limit(RECRUITER_PAGE_SIZE);
  if (error) {
    if (['42P01', 'PGRST202', 'PGRST205', '42703'].includes(error?.code)) {
      return await recruiterSnapshot(scope, candidateId, page);
    }
    throw error;
  }
  const changes = [];
  const moved = new Set(events.filter(event => event.entity === 'positions' && event.scope_changed).map(event => event.row_id));
  for (const entity of Object.keys(RECRUITER_ENTITIES)) {
    const ids = [...new Set(events.filter(event => event.entity === entity).map(event => event.row_id))];
    if (!ids.length) continue;
    const data = recruiterData(await scope.db.from(RECRUITER_ENTITIES[entity])
      .select(entity === 'candidates' ? RECRUITER_CANDIDATE_SELECT : '*').in('id', ids)) || [];
    const byId = new Map(data.map(row => [row.id, row]));
    for (const id of ids) {
      const row = byId.get(id);
      changes.push({
        entity, id, row: entity === 'positions' ? visiblePosition(scope, row)
          : entity === 'candidates' ? visibleCandidate(scope, row)
          : row?.candidate_id === candidateId ? row : null
      });
    }
  }
  // Branch moves can make unchanged children newly visible under this scope.
  for (const { entity, id, row } of changes.slice()) {
    if (entity !== 'positions' || !row || !moved.has(id)) continue;
    let after = null;
    for (;;) {
      let children = scope.db.from(RECRUITER_ENTITIES.candidates).select(RECRUITER_CANDIDATE_SELECT).eq('position_id', id);
      if (after) children = children.gt('id', after);
      const data = recruiterData(await children.order('id').limit(RECRUITER_PAGE_SIZE)) || [];
      for (const item of data) changes.push({ entity: 'candidates', id: item.id, row: visibleCandidate(scope, item) });
      if (data.length < RECRUITER_PAGE_SIZE) break;
      after = data.at(-1).id;
    }
  }
  return {
    success: true, changes, cursor: watermark, token: scope.token,
    continuation: events.length === RECRUITER_PAGE_SIZE ? { after: String(events.at(-1).revision), end: watermark } : null
  };
}

export async function readRecruiterSync(input = {}) {
  try {
    const scope = await recruiterScope(input);
    const candidateId = input.candidateId || null;
    if (candidateId) await recruiterCandidate(scope, candidateId);
    if (input.token && input.token !== scope.token) return { success: true, reset: true };
    return input.token
      ? await recruiterDelta(scope, candidateId, input.cursor, input.continuation)
      : await recruiterSnapshot(scope, candidateId, input.continuation);
  } catch (error) {
    return recruiterFailure(error);
  }
}

function requireRecruiterWrite(scope, stage, permission) {
  if (!scope.canWrite || !scope.stages[stage]?.[permission]) throw recruiterDenied('Recruiter change is outside your stage permissions.');
}

function releaseRecruiterPayload(row, reason, actor) {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('Enter a reason for releasing this vacancy.');
  const entry = { actor, reason: reason.trim(), timestamp: new Date().toISOString() };
  const current = row.jd_text || '';
  const tag = /<!--RELEASE_HISTORY:(\[.*?\])-->/;
  let list = [];
  try { list = JSON.parse(current.match(tag)?.[1] || '[]'); } catch { /* Start a new history if legacy JSON is malformed. */ }
  const history = '<!--RELEASE_HISTORY:' + JSON.stringify([...list, entry]) + '-->';
  return { recruiter_assigned: 'All', jd_text: tag.test(current) ? current.replace(tag, () => history) : current + '\n\n' + history };
}

export async function applyRecruiterMutation(input = {}) {
  try {
    const { mutationId, operation, payload, create } = input;
    if (!RECRUITER_UUID.test(mutationId || '') || !RECRUITER_UUID.test(payload?.id || '')) throw new Error('Invalid recruiter change.');
    const scope = await recruiterScope(input.scope);
    const [kind, intent] = String(operation || '').split(':');
    const entity = { position: 'positions', candidate: 'candidates', note: 'notes' }[kind];
    if (!entity || !['position:save', 'position:delete', 'position:release', 'candidate:save',
      'candidate:delete', 'candidate:override', 'note:add'].includes(operation)) throw new Error('Unsupported recruiter change.');
    let prior = null;
    try {
      const { data, error } = await scope.db.from('recruiter_mutation_receipts').select('tenant_id,entity,row_id')
        .eq('user_id', scope.user.id).eq('mutation_id', mutationId).maybeSingle();
      if (!error) prior = data;
    } catch (_) {}
    if (prior) {
      if (prior.tenant_id !== scope.tenant.id || prior.entity !== entity || prior.row_id !== payload.id) throw recruiterDenied('Recruiter request does not match its original record.');
      return { success: true, data: { id: prior.row_id } };
    }

    let current = null;
    let note = typeof input.note === 'string' ? input.note.trim().slice(0, 4000) : '';
    const fallbackWriter = async (action, fields) => {
      const table = RECRUITER_ENTITIES[entity];
      if (fields && typeof fields === 'object') {
        if (fields.joining_date !== undefined) fields.joining_date = sanitizeDate(fields.joining_date);
        if (fields.actual_joining_date !== undefined) fields.actual_joining_date = sanitizeDate(fields.actual_joining_date);
        if (fields.deadline_date !== undefined) fields.deadline_date = sanitizeDate(fields.deadline_date);
      }
      let result = null;
      if (action === 'insert') {
        const { data, error } = await scope.db.from(table).insert({ ...fields, id: payload.id }).select().single();
        if (error) throw error;
        result = data;
      } else if (action === 'update') {
        let res = await scope.db.from(table).update(fields).eq('id', payload.id).select().single();
        if (res.error?.code === 'PGRST204') {
          const clean = { ...fields };
          delete clean.job_type;
          delete clean.experience_required;
          delete clean.min_qualification;
          delete clean.urgency;
          delete clean.work_mode;
          delete clean.shift_type;
          delete clean.gender_preference;
          delete clean.key_skills;
          delete clean.vacancy_reason;
          delete clean.posting_status;
          delete clean.posting_sources;
          res = await scope.db.from(table).update(clean).eq('id', payload.id).select().single();
        }
        if (res.error) throw res.error;
        result = res.data;
      } else if (action === 'delete') {
        const { data, error } = await scope.db.from(table).delete().eq('id', payload.id);
        if (error) throw error;
        result = { id: payload.id };
      }
      if (note && entity === 'candidates') {
        try {
          await scope.db.from('recruitment_candidate_notes').insert({
            candidate_id: payload.id,
            note_text: note,
            created_by: scope.actor
          });
        } catch (_) {}
      }
      return { data: result, error: null };
    };

    const writer = async (action, fields) => {
      try {
        const res = await scope.db.rpc('recruiter_apply_mutation', {
          p_user: scope.user.id,
          p_mutation: mutationId,
          p_tenant: scope.tenant.id,
          p_entity: entity,
          p_operation: action,
          p_id: payload.id,
          p_payload: fields,
          p_expected: input.expected || current?.updated_at || null,
          p_note: note || null,
          p_actor: scope.actor
        });
        if (res?.error) {
          if (['42883', 'PGRST202', 'PGRST205', '42P01'].includes(res.error?.code)) {
            return await fallbackWriter(action, fields);
          }
          return res;
        }
        return res;
      } catch (rpcErr) {
        if (['42883', 'PGRST202', 'PGRST205', '42P01'].includes(rpcErr?.code)) {
          return await fallbackWriter(action, fields);
        }
        throw rpcErr;
      }
    };

    if (entity === 'positions') {
      if (!(intent === 'save' && create)) current = await recruiterPosition(scope, payload.id);
      requireRecruiterWrite(scope, current?.status || payload.status || 'S00', create ? 'add' : intent === 'delete' ? 'delete' : 'edit');
      if (intent === 'delete') return { success: true, data: recruiterData(await writer('delete', {})) };
      if (intent === 'release') return { success: true, data: recruiterData(await writer('update', releaseRecruiterPayload(current, payload.reason, scope.actor))) };
      if (payload.status && !['S00', 'S01'].includes(payload.status)) throw new Error('Invalid recruiter vacancy stage.');
      const branchCode = payload.branch_code || current?.branch_code;
      const branch = scope.branches.find(item => item.branch_code === branchCode);
      if (!branch || (scope.codes && !scope.codes.includes(branchCode))) throw recruiterDenied('Select an available branch in your recruiter scope.');
      const form = { ...payload, id: create ? undefined : payload.id,
        tenant_id: scope.tenant.id, tenant_code: scope.tenant.tenant_code,
        company: branch.company || scope.tenant.name, branch_code: branchCode };
      return writePosition(form, scope.tenant.id, form.company, scope.actor, branchCode, scope.tenant.tenant_code, writer);
    }
    if (entity === 'notes') {
      current = await recruiterCandidate(scope, payload.candidate_id);
      requireRecruiterWrite(scope, current.current_stage, 'edit');
      const text = typeof payload.note_text === 'string' ? payload.note_text.trim().slice(0, 4000) : '';
      if (!text) throw new Error('Enter a note before saving.');
      return { success: true, data: recruiterData(await writer('insert', {
        candidate_id: current.id, note_text: text, created_by: scope.actor
      })) };
    }

    if (!(intent === 'save' && create)) current = await recruiterCandidate(scope, payload.id);
    else await recruiterPosition(scope, payload.position_id);
    requireRecruiterWrite(scope, current?.current_stage || 'S02', create ? 'add' : intent === 'delete' ? 'delete' : 'edit');
    if (intent === 'delete') return { success: true, data: recruiterData(await writer('delete', {})) };
    const stage = payload.current_stage || current?.current_stage || 'S02';
    if (!RECRUITER_CANDIDATE_STAGES.includes(stage) || (create && stage !== 'S02')) throw new Error('Invalid recruiter candidate stage.');
    if (intent === 'override') {
      if (!scope.manager || !String(payload.reason || '').trim()) throw recruiterDenied('A manager and an audit reason are required for a stage override.');
      note = 'ADMIN STAGE OVERRIDE: Stage changed from ' + current.current_stage + ' to ' + stage + ' by ' + scope.actor +
        '. Mandatory Reason: ' + String(payload.reason).trim().slice(0, 2000);
    } else if (current && stage !== current.current_stage) {
      const from = Number(current.current_stage.slice(1));
      const to = Number(stage.slice(1));
      if (to > from + 1 || (to < from && !scope.canDemote)) throw recruiterDenied('This candidate stage transition is not permitted.');
    }
    const form = { ...payload, id: create ? undefined : payload.id, current_stage: stage };
    return writeCandidate(form, scope.actor, writer);
  } catch (error) {
    return recruiterFailure(error);
  }
}

