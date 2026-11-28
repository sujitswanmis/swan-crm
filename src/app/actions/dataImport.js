'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { logAuditAction } from '@/app/actions/audit';
import {
  checkIsAdminRole,
  checkIsMasterAdmin,
  getModulePermissions,
  getSubItemPermissions
} from '@/utils/permissionUtils';
import { getUserBranchAccess, matchesCompanyToken } from '@/utils/branchAccess';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ALLOWED_DB_BATCH_STATUSES = new Set(['PENDING', 'DRY_RUN_PASSED', 'COMPLETED', 'ROLLED_BACK', 'FAILED']);

export async function createImportBatch(importModule, isDryRun = true, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const batchRef = `IMP-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('data_import_batches')
    .insert([{
      tenant_id: tenantId,
      batch_ref_code: batchRef,
      import_module: importModule,
      is_dry_run: isDryRun,
      status: 'PENDING'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function executeImportDryRun(batchId, records = []) {
  const adminClient = getAdminClient();
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  records.forEach((rec, idx) => {
    if (!rec || Object.keys(rec).length === 0) {
      failCount++;
      errors.push({ line: idx + 1, error: 'Empty record row' });
    } else {
      successCount++;
    }
  });

  const status = failCount === 0 ? 'DRY_RUN_PASSED' : 'FAILED';

  const { data, error } = await adminClient
    .from('data_import_batches')
    .update({
      total_records: records.length,
      successful_records: successCount,
      failed_records: failCount,
      status,
      error_report_json: errors
    })
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function getISTDateStamp() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).replace(/-/g, '');
}

function generateISTBatchRef() {
  const stamp = getISTDateStamp();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `IMP-${stamp}-${suffix}`;
}

function formatISTLabel(dateInput) {
  if (!dateInput) return '—';
  try {
    const dt = new Date(dateInput);
    if (Number.isNaN(dt.getTime())) return String(dateInput);
    return `${dt.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })} IST`;
  } catch {
    return String(dateInput);
  }
}

function formatBytesLabel(bytes) {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function inferFileType(fileName = '') {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return 'XLSX';
  if (lower.endsWith('.xls')) return 'XLS';
  if (lower.endsWith('.csv')) return 'CSV';
  return 'FILE';
}

function computeDisplayStatus({ successfulRecords = 0, failedRecords = 0, duplicatesCount = 0, requestedStatus = '' } = {}) {
  const normReq = String(requestedStatus || '').toUpperCase();
  if (normReq === 'FAILED' && successfulRecords === 0) return 'FAILED';
  if (successfulRecords === 0 && failedRecords > 0) return 'FAILED';
  if (successfulRecords > 0 && failedRecords > 0) return 'PARTIAL';
  if (successfulRecords === 0 && duplicatesCount > 0) return 'DUPLICATES_SKIPPED';
  return 'COMPLETED';
}

function normalizeImportBatchRow(row) {
  if (!row || typeof row !== 'object') return null;
  const rawMeta = row.error_report_json;
  const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
    ? rawMeta
    : {};
  const legacyErrors = Array.isArray(rawMeta) ? rawMeta : [];

  const fileName = String(meta.file_name || 'Unknown File');
  const fileSize = Number(meta.file_size || 0);
  const totalRecords = Number(row.total_records || 0);
  const successfulRecords = Number(row.successful_records || 0);
  const failedRecords = Number(row.failed_records || 0);
  const duplicatesCount = Number(meta.duplicates_count || 0);
  const draftsCount = Number(meta.drafts_count || 0);
  const registeredCount = Number(meta.registered_count || 0);
  const alreadyInReportCount = Number(meta.already_in_report_count || 0);
  const potentialMatchesCount = Number(meta.potential_matches_count || 0);
  const errorsSummary = Array.isArray(meta.errors_summary)
    ? meta.errors_summary
    : (Array.isArray(meta.errors) ? meta.errors : legacyErrors);
  const duplicatesSummary = Array.isArray(meta.duplicates_summary) ? meta.duplicates_summary : [];
  const createdRefsSample = Array.isArray(meta.created_refs_sample) ? meta.created_refs_sample : [];
  const mapping = meta.mapping && typeof meta.mapping === 'object' && !Array.isArray(meta.mapping)
    ? meta.mapping
    : {};

  const displayStatus = String(
    meta.display_status ||
    computeDisplayStatus({
      successfulRecords,
      failedRecords,
      duplicatesCount,
      requestedStatus: row.status
    })
  );

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    batch_ref_code: row.batch_ref_code || '',
    import_module: row.import_module || 'lead_registration',
    created_at: row.created_at,
    total_records: totalRecords,
    successful_records: successfulRecords,
    failed_records: failedRecords,
    status: row.status || 'COMPLETED',
    display_status: displayStatus,
    imported_by: row.imported_by || null,
    file_name: fileName,
    file_size: fileSize,
    file_size_label: meta.file_size_label || formatBytesLabel(fileSize),
    file_type: meta.file_type || inferFileType(fileName),
    uploader_name: String(meta.uploader_name || 'Unknown User'),
    uploader_email: String(meta.uploader_email || ''),
    uploader_role: String(meta.uploader_role || ''),
    our_company: String(meta.our_company || ''),
    uploaded_at_ist: formatISTLabel(meta.uploaded_at || row.created_at),
    drafts_count: draftsCount,
    registered_count: registeredCount,
    duplicates_count: duplicatesCount,
    already_in_report_count: alreadyInReportCount,
    potential_matches_count: potentialMatchesCount,
    default_data_status: String(meta.default_data_status || ''),
    mapping,
    duplicates_summary: duplicatesSummary,
    errors_summary: errorsSummary,
    created_refs_sample: createdRefsSample,
    first_lead_ref: meta.first_lead_ref || createdRefsSample[0] || '',
    last_lead_ref: meta.last_lead_ref || createdRefsSample[createdRefsSample.length - 1] || ''
  };
}

async function resolveTenantIdForMember(adminClient, member, userCompany = '') {
  if (member?.tenant_id) return member.tenant_id;
  const companyCandidate = String(userCompany || member?.company || '').trim();
  if (companyCandidate) {
    try {
      const { data: tenantsList } = await adminClient
        .from('tenants')
        .select('id, name, tenant_code');
      if (Array.isArray(tenantsList) && tenantsList.length > 0) {
        const lower = companyCandidate.toLowerCase();
        const match = tenantsList.find(t =>
          String(t.name || '').toLowerCase() === lower ||
          String(t.tenant_code || '').toLowerCase() === lower
        );
        if (match?.id) return match.id;
      }
    } catch (e) {
      console.warn('Tenant lookup fallback in dataImport:', e?.message || e);
    }
  }
  return DEFAULT_TENANT_ID;
}

/**
 * Resolves the authenticated CRM member, registration permissions, tenant ID, and branch scope.
 */
async function resolveImportAuthContext({ write = false, userCompany = '' } = {}) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error('Please sign in to continue.');

  const adminClient = getAdminClient();
  const { data: member, error } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !member) {
    throw new Error('Registration access could not be verified.');
  }

  const access = { ...(member.module_access || {}), _userEmail: user.email };
  const isMaster = checkIsMasterAdmin(access, member.role, user.email);
  const effectiveRole = isMaster ? 'master_admin' : (member.role || 'agent');
  const isAdmin = isMaster || checkIsAdminRole(effectiveRole);

  const regPerms = getModulePermissions(access, effectiveRole, 'registration');
  if (regPerms.view !== true || (!isAdmin && member.is_approved === false)) {
    throw new Error('Registration access denied.');
  }

  if (write) {
    const formSubPerms = getSubItemPermissions(access, effectiveRole, 'registration', 'form');
    const canWrite = isAdmin || (
      regPerms.add === true &&
      formSubPerms.view === true &&
      member.can_write !== false &&
      access.registration?.write !== false
    );
    if (!canWrite) {
      throw new Error('Registration write access denied.');
    }
  }

  const tenantId = await resolveTenantIdForMember(adminClient, member, userCompany);
  const branchScope = getUserBranchAccess({ ...member, module_access: access }, tenantId);
  const canViewAllUploads = isAdmin || access.can_view_all_drafts === true;
  const uploaderName = String(member.emp_name || user.email?.split('@')[0] || 'User').trim();
  const uploaderEmail = String(user.email || member.email || '').trim();

  return {
    adminClient,
    user,
    member,
    access,
    isMaster,
    isAdmin,
    effectiveRole,
    tenantId,
    branchScope,
    canViewAllUploads,
    uploaderName,
    uploaderEmail
  };
}

/**
 * Records a completed/partial/failed bulk upload batch in data_import_batches and audit_logs.
 */
export async function recordImportBatch(payload = {}) {
  try {
    const ctx = await resolveImportAuthContext({
      write: true,
      userCompany: payload.userCompany || payload.ourCompany || ''
    });

    const totalRecords = Math.max(0, Number(payload.totalRecords || 0));
    const successfulRecords = Math.max(0, Number(payload.successfulRecords || 0));
    const failedRecords = Math.max(0, Number(payload.failedRecords || 0));
    const duplicatesCount = Math.max(0, Number(payload.duplicatesCount || 0));
    const draftsCount = Math.max(0, Number(payload.draftsCount || 0));
    const registeredCount = Math.max(0, Number(payload.registeredCount || 0));
    const alreadyInReportCount = Math.max(0, Number(payload.alreadyInReportCount || 0));
    const potentialMatchesCount = Math.max(0, Number(payload.potentialMatchesCount || 0));

    const requestedStatus = String(payload.status || '').toUpperCase();
    const dbStatus = (successfulRecords === 0 && failedRecords > 0 && duplicatesCount === 0) ||
      (requestedStatus === 'FAILED' && successfulRecords === 0)
      ? 'FAILED'
      : (ALLOWED_DB_BATCH_STATUSES.has(requestedStatus) ? requestedStatus : 'COMPLETED');

    const displayStatus = computeDisplayStatus({
      successfulRecords,
      failedRecords,
      duplicatesCount,
      requestedStatus
    });

    const fileName = String(payload.fileName || 'Bulk_Upload.csv').trim();
    const fileSize = Math.max(0, Number(payload.fileSize || 0));
    const importModule = String(payload.importModule || 'lead_registration').trim();
    const ourCompany = String(payload.ourCompany || payload.userCompany || ctx.member.company || '').trim();

    const duplicatesSummary = Array.isArray(payload.duplicatesSummary)
      ? payload.duplicatesSummary.slice(0, 250)
      : [];
    const errorsSummary = Array.isArray(payload.errorsSummary)
      ? payload.errorsSummary.slice(0, 250)
      : [];
    const createdRefsSample = Array.isArray(payload.createdRefsSample)
      ? payload.createdRefsSample.slice(0, 100)
      : [];
    const mapping = payload.mapping && typeof payload.mapping === 'object' && !Array.isArray(payload.mapping)
      ? payload.mapping
      : {};

    const metadataJson = {
      file_name: fileName,
      file_size: fileSize,
      file_size_label: formatBytesLabel(fileSize),
      file_type: inferFileType(fileName),
      uploader_name: ctx.uploaderName,
      uploader_email: ctx.uploaderEmail,
      uploader_role: ctx.effectiveRole,
      our_company: ourCompany,
      uploaded_at: new Date().toISOString(),
      display_status: displayStatus,
      drafts_count: draftsCount,
      registered_count: registeredCount,
      duplicates_count: duplicatesCount,
      already_in_report_count: alreadyInReportCount,
      potential_matches_count: potentialMatchesCount,
      default_data_status: String(payload.defaultDataStatus || ''),
      mapping,
      duplicates_summary: duplicatesSummary,
      errors_summary: errorsSummary,
      created_refs_sample: createdRefsSample,
      first_lead_ref: String(payload.firstLeadRef || createdRefsSample[0] || ''),
      last_lead_ref: String(payload.lastLeadRef || createdRefsSample[createdRefsSample.length - 1] || '')
    };

    let batchRefCode = String(payload.batchRef || '').trim() || generateISTBatchRef();
    let insertedRow = null;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await ctx.adminClient
        .from('data_import_batches')
        .insert([{
          tenant_id: ctx.tenantId,
          batch_ref_code: batchRefCode,
          import_module: importModule,
          total_records: totalRecords,
          successful_records: successfulRecords,
          failed_records: failedRecords,
          is_dry_run: false,
          status: dbStatus,
          imported_by: ctx.user.id || null,
          error_report_json: metadataJson
        }])
        .select()
        .single();

      if (!error && data) {
        insertedRow = data;
        break;
      }
      lastError = error;
      if (error?.code === '23505') {
        batchRefCode = generateISTBatchRef();
        continue;
      }
      break;
    }

    if (!insertedRow) {
      throw new Error(lastError?.message || 'Failed to save bulk upload history batch.');
    }

    try {
      await logAuditAction(
        'Bulk Upload Leads',
        `[${batchRefCode}] File "${fileName}" — Total: ${totalRecords}, Imported: ${successfulRecords} (Drafts: ${draftsCount}, Registered: ${registeredCount}), Duplicates Skipped: ${duplicatesCount}, Failed: ${failedRecords}`
      );
    } catch (auditErr) {
      console.warn('Non-blocking audit log error during bulk upload:', auditErr?.message || auditErr);
    }

    return {
      success: true,
      batch: normalizeImportBatchRow(insertedRow)
    };
  } catch (err) {
    console.error('recordImportBatch failed:', err);
    return {
      success: false,
      error: err?.message || 'Failed to record import batch.'
    };
  }
}

/**
 * Fetches bulk upload history batches for the authorized user / tenant with optional delta cursor.
 */
export async function getImportBatches({
  importModule = 'lead_registration',
  sinceCursor = null,
  userCompany = '',
  limit = 300
} = {}) {
  try {
    const ctx = await resolveImportAuthContext({ write: false, userCompany });
    const boundedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

    let query = ctx.adminClient
      .from('data_import_batches')
      .select('*')
      .eq('import_module', importModule)
      .eq('tenant_id', ctx.tenantId);

    if (!ctx.canViewAllUploads) {
      query = query.eq('imported_by', ctx.user.id);
    }

    if (sinceCursor) {
      query = query.gt('created_at', sinceCursor);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(boundedLimit);

    if (error) {
      throw new Error(error.message);
    }

    let batches = (data || []).map(normalizeImportBatchRow).filter(Boolean);

    if (
      !ctx.isMaster &&
      !ctx.branchScope.isAllBranches &&
      Array.isArray(ctx.branchScope.allowedCompanies) &&
      ctx.branchScope.allowedCompanies.length > 0
    ) {
      batches = batches.filter(row =>
        !row.our_company ||
        matchesCompanyToken(row.our_company, ctx.branchScope.allowedCompanies) ||
        row.imported_by === ctx.user.id
      );
    }

    return {
      success: true,
      batches,
      canViewAllUploads: ctx.canViewAllUploads,
      currentUserId: ctx.user.id
    };
  } catch (err) {
    console.error('getImportBatches failed:', err);
    return {
      success: false,
      error: err?.message || 'Could not load bulk upload history.',
      batches: []
    };
  }
}

/**
 * Fetches full details for a single bulk upload batch after verifying tenant & ownership access.
 */
export async function getImportBatchDetails(batchId, userCompany = '') {
  try {
    if (!batchId) throw new Error('Batch ID is required.');
    const ctx = await resolveImportAuthContext({ write: false, userCompany });

    const { data, error } = await ctx.adminClient
      .from('data_import_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Upload batch record not found.');
    if (data.tenant_id !== ctx.tenantId) {
      throw new Error('Access denied for this tenant upload batch.');
    }
    if (!ctx.canViewAllUploads && data.imported_by !== ctx.user.id) {
      throw new Error('You do not have permission to view this upload batch.');
    }

    return {
      success: true,
      batch: normalizeImportBatchRow(data)
    };
  } catch (err) {
    console.error('getImportBatchDetails failed:', err);
    return {
      success: false,
      error: err?.message || 'Could not load upload batch details.'
    };
  }
}
