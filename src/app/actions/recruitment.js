'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
  return data;
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

    // Get count of existing candidates for this position to generate display ID
    const { count, error: countError } = await adminClient
      .from('recruitment_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('position_id', positionId);

    if (countError) throw countError;

    const nextSeq = (count || 0) + 1;
    const posShort = positionId.substring(0, 8).toUpperCase();
    const candidateCode = `POS-${posShort}-${String(nextSeq).padStart(3, '0')}`;

    // Insert candidate
    const { data, error } = await adminClient
      .from('recruitment_candidates')
      .insert([{
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
        created_by: 'Online Application'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error submitting application:', error);
      return { success: false, error: error.message };
    }

    // Get position details to log a rich note
    const { data: posData } = await adminClient
      .from('recruitment_positions')
      .select('title')
      .eq('id', positionId)
      .single();

    const posTitle = posData?.title || 'this position';

    // Insert log note
    await adminClient
      .from('recruitment_candidate_notes')
      .insert([{
        candidate_id: data.id,
        note_text: `Candidate applied online for "${posTitle}" via public application link.`,
        created_by: 'System'
      }]);

    return { success: true };
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

  return {
    tenant_id,
    tenant_code,
    branch_code,
    company,
    cleanJd
  };
}

function embedPositionWorkspace(jdText, tenantId, company, branchCode = null, tenantCode = null) {
  const tid = tenantId || DEFAULT_TENANT_ID;
  const tcode = tenantCode || resolveTenantCode(tid);
  const comp = company || (tcode === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
  const bcode = branchCode || (comp === 'NSMLR' ? 'TNT00002-B0002' : `${tcode}-B0001`);

  const meta = {
    tenant_id: tid,
    tenant_code: tcode,
    company: comp,
    branch_code: bcode
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

    return filtered.map(pos => {
      const meta = parsePositionWorkspace(pos);
      return {
        ...pos,
        jd_text: meta.cleanJd,
        workspace_tenant_id: meta.tenant_id,
        workspace_tenant_code: meta.tenant_code,
        workspace_company: meta.company,
        workspace_branch_code: meta.branch_code
      };
    });
  } catch (err) {
    console.error('getPositions error:', err);
    return [];
  }
}

/**
 * Create or update a recruitment position scoped to the workspace
 */
export async function savePosition(posForm, tenantId = DEFAULT_TENANT_ID, userCompany = null, userName = '', branchCode = null, tenantCode = null) {
  try {
    const adminClient = getAdminClient();
    const taggedJd = embedPositionWorkspace(posForm.jd_text, tenantId, userCompany, branchCode, tenantCode);

    const basePayload = {
      title: posForm.title,
      department: posForm.department,
      openings: parseInt(posForm.openings, 10) || 1,
      status: posForm.status || 'S01',
      jd_text: taggedJd,
      deadline_date: posForm.deadline_date || null,
      interviewer_name: posForm.interviewer_name || null,
      recruiter_assigned: posForm.recruiter_assigned || null,
      salary_min: posForm.salary_min ? parseInt(posForm.salary_min, 10) : null,
      salary_max: posForm.salary_max ? parseInt(posForm.salary_max, 10) : null
    };

    const resolvedTenantId = tenantId || DEFAULT_TENANT_ID;
    const resolvedTenantCode = tenantCode || resolveTenantCode(resolvedTenantId);
    const resolvedCompany = userCompany || (resolvedTenantCode === 'TNT00001' ? 'SuPuja Creations' : 'NSMLR');
    const resolvedBranchCode = branchCode || (resolvedCompany === 'NSMLR' ? 'TNT00002-B0002' : `${resolvedTenantCode}-B0001`);

    const fullPayload = {
      ...basePayload,
      tenant_id: resolvedTenantId,
      tenant_code: resolvedTenantCode,
      branch_code: resolvedBranchCode,
      company: resolvedCompany
    };

    const executeSave = async (payloadToUse) => {
      if (posForm.id) {
        return adminClient
          .from('recruitment_positions')
          .update(payloadToUse)
          .eq('id', posForm.id)
          .select()
          .single();
      } else {
        const insertData = { ...payloadToUse, created_by: userName || 'Admin' };
        return adminClient
          .from('recruitment_positions')
          .insert([insertData])
          .select()
          .single();
      }
    };

    // Try saving with tenant columns; if columns not yet added to DB, gracefully fall back to basePayload
    let res = await executeSave(fullPayload);
    if (res.error && res.error.code === 'PGRST204') {
      res = await executeSave(basePayload);
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
        workspace_branch_code: meta.branch_code
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

    return data.map(cand => {
      const parentPos = cand.recruitment_positions;
      const meta = parentPos ? parsePositionWorkspace(parentPos) : null;
      return {
        ...cand,
        workspace_tenant_id: cand.tenant_id || meta?.tenant_id || DEFAULT_TENANT_ID,
        workspace_tenant_code: cand.tenant_code || meta?.tenant_code || 'TNT00002',
        workspace_company: cand.company || meta?.company || 'NSMLR',
        workspace_branch_code: cand.branch_code || meta?.branch_code || 'TNT00002-B0002'
      };
    });
  } catch (err) {
    console.error('getCandidates error:', err);
    return [];
  }
}

/**
 * Save candidate (Create or Update)
 */
export async function saveCandidate(candForm, userName = '') {
  try {
    const adminClient = getAdminClient();

    if (candForm.id) {
      const updatePayload = {
        name: candForm.name,
        email: candForm.email,
        phone: candForm.phone,
        current_stage: candForm.current_stage,
        candidate_status: candForm.candidate_status,
        expected_salary_min: candForm.expected_salary_min ? parseInt(candForm.expected_salary_min, 10) : null,
        expected_salary_max: candForm.expected_salary_max ? parseInt(candForm.expected_salary_max, 10) : null,
        actual_salary: candForm.actual_salary ? parseInt(candForm.actual_salary, 10) : null,
        interview_feedback: candForm.interview_feedback || '',
        test_results: candForm.test_results || '',
        ed_approval_status: candForm.ed_approval_status || 'Pending',
        salary_negotiation_details: candForm.salary_negotiation_details || '',
        formal_structure_approved: !!candForm.formal_structure_approved,
        loi_status: candForm.loi_status || 'Pending',
        joining_details: candForm.joining_details || '',
        interviewer_name: candForm.interviewer_name || '',
        joining_date: candForm.joining_date || null,
        actual_joining_date: candForm.actual_joining_date || null
      };

      if (candForm.resume_url !== undefined) {
        updatePayload.resume_url = candForm.resume_url;
      }

      const { data, error } = await adminClient
        .from('recruitment_candidates')
        .update(updatePayload)
        .eq('id', candForm.id)
        .select('*, recruitment_positions(title, department)')
        .single();

      if (error) throw error;
      return { success: true, data };
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
        created_by: userName || 'Admin'
      };

      const { data, error } = await adminClient
        .from('recruitment_candidates')
        .insert([insertPayload])
        .select('*, recruitment_positions(title, department)')
        .single();

      if (error) throw error;
      return { success: true, data };
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
