// Shared, side-effect-free rules. Identity inputs must come from the verified server session.
export const PHOTO_TENANT_CODE = /^TNT\d{5,}$/;
export const PHOTO_BRANCH_CODE = /^TNT\d{5,}-B\d{4,}$/;
const normalized = value => String(value || '').trim().toLowerCase().replaceAll('_', ' ');
const alphaNumeric = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function matchBranch(branches, candidate) {
  if (!candidate) return null;
  const norm = normalized(candidate);
  const alpha = alphaNumeric(candidate);
  if (!norm || norm === 'none' || norm === 'wfh') return null;

  // 1. Exact match on code, name, legacyCode, customCode
  let matches = branches.filter(b => [b.code, b.name, b.legacyCode, b.customCode]
    .some(v => v && normalized(v) === norm));
  if (matches.length === 1) return matches[0].code;

  // 2. Alphanumeric match (handles NSE-1 vs NSE1, NSACPL vs NSACPL1, etc.)
  if (alpha) {
    matches = branches.filter(b => [b.code, b.name, b.legacyCode, b.customCode].some(v => {
      if (!v) return false;
      const bAlpha = alphaNumeric(v);
      return bAlpha === alpha || (alpha.length >= 4 && bAlpha.startsWith(alpha)) || (bAlpha.length >= 4 && alpha.startsWith(bAlpha));
    }));
    if (matches.length === 1) return matches[0].code;
  }

  // 3. Substring match on branch name
  matches = branches.filter(b => normalized(b.name).includes(norm) || norm.includes(normalized(b.name)));
  if (matches.length === 1) return matches[0].code;

  return null;
}

export function isPhotoMaster(user, role) {
  return normalized(user?.email) === 'supujacreations@gmail.com'
    || ['masteradmin', 'master admin'].includes(normalized(role?.role))
    || role?.module_access?.is_master_admin === true;
}

export function canManagePhotoPolicy(user, role) {
  return isPhotoMaster(user, role) || (role?.can_write !== false
    && ['admin', 'superadmin', 'super admin'].includes(normalized(role?.role)));
}

export function photoTenantForRole(directory, role) {
  const identity = role?.tenant_id || role?.module_access?._tenantId;
  if (identity) return directory.find(tenant => tenant.id === identity || tenant.code === identity) || null;
  const company = normalized(role?.company);
  if (!company || company === 'default') return null;
  const matches = directory.filter(tenant => [tenant.name, tenant.code,
    ...tenant.branches.flatMap(branch => [branch.code, branch.name, branch.legacyCode, branch.customCode].filter(Boolean))]
    .some(value => normalized(value) === company));
  return matches.length === 1 ? matches[0] : null;
}

export function photoBranchForRole(tenant, role) {
  const explicit = role?.branch_code || role?.module_access?.branch_code
    || (Array.isArray(role?.assigned_branch_codes) && role.assigned_branch_codes.length > 0 ? role.assigned_branch_codes[0] : null)
    || (Array.isArray(role?.module_access?.assigned_branch_codes) && role.module_access.assigned_branch_codes.length > 0 ? role.module_access.assigned_branch_codes[0] : null);

  if (explicit) {
    const match = tenant.branches.find(b => b.code === explicit || normalized(b.name) === normalized(explicit) || b.legacyCode === explicit || b.customCode === explicit);
    if (!match) throw new Error('Your assigned branch could not be verified. Contact your administrator.');
    return match.code;
  }

  const company = role?.company || role?.company_name;
  const locName = role?.work_location_name || role?.module_access?.work_location_name;
  const branchName = role?.branch_name || role?.module_access?.branch_name;

  // If the location explicitly identifies the whole tenant/company, return company default ('')
  if ([tenant.name, tenant.code].some(t => t && [normalized(locName), normalized(branchName), normalized(company)].includes(normalized(t)))) {
    return '';
  }

  // Match location or branch name against branches
  for (const candidate of [locName, branchName]) {
    const matched = matchBranch(tenant.branches, candidate);
    if (matched) return matched;
  }

  // Legacy operating-company assignments
  const compMatches = tenant.branches.filter(b => [b.name, b.legacyCode, b.customCode].some(v => v && normalized(v) === normalized(company)));
  if (compMatches.length === 1) return compMatches[0].code;

  if (company) {
    const compMatched = matchBranch(tenant.branches, company);
    if (compMatched) return compMatched;
  }

  // If a location was provided but couldn't be matched
  if (locName) {
    if (['none', 'wfh', 'headquarters', 'corporate', 'all branches'].includes(normalized(locName))) {
      return '';
    }
    if (normalized(company) === normalized(tenant.name)) return '';
    throw new Error('Your assigned branch could not be verified. Contact your administrator.');
  }

  return '';
}

export function authorizePhotoScope({ directory, user, role, targetRole = role, targetUserId = user?.id,
  tenantCode, branchCode = '', manage = false, write = false }) {
  const master = isPhotoMaster(user, role);
  const own = photoTenantForRole(directory, role);
  const target = photoTenantForRole(directory, targetRole);
  if (manage) {
    if (!canManagePhotoPolicy(user, role)) throw new Error('Only an administrator can change profile photo policy.');
    const tenant = tenantCode ? directory.find(item => item.code === tenantCode) : own || (master ? directory[0] : null);
    if (!tenant || (!master && tenant.id !== own?.id)) throw new Error('Tenant access denied.');
    if (branchCode && !tenant.branches.some(branch => branch.code === branchCode)) throw new Error('Branch access denied.');
    return { tenant, branchCode, preview: false };
  }
  const preview = targetUserId !== user?.id;
  if (preview && (write || !canManagePhotoPolicy(user, role))) throw new Error('You can only change your own profile photo.');
  if (!target || (!master && target.id !== own?.id)) throw new Error('Tenant access denied.');
  if (tenantCode && tenantCode !== target.code) throw new Error('Tenant access denied.');
  const assigned = photoBranchForRole(target, targetRole);
  if (branchCode && branchCode !== assigned) throw new Error('Branch access denied.');
  return { tenant: target, branchCode: assigned, preview };
}

export function effectivePhotoPolicy(rows, tenantId, branchCode = '') {
  const tenant = rows.find(row => row.tenant_id === tenantId && row.branch_code === '') || null;
  const branch = branchCode ? rows.find(row => row.tenant_id === tenantId && row.branch_code === branchCode) : null;
  const selected = branch && branch.inherit !== true ? branch : tenant;
  return { mode: selected?.mode === 'shared' ? 'shared' : 'individual',
    avatarUrl: selected?.avatar_url || tenant?.avatar_url || null,
    inherited: Boolean(branchCode && (!branch || branch.inherit === true)) };
}

export function profilePhotoCacheKey(tenantCode, branchCode, userId) {
  if (!PHOTO_TENANT_CODE.test(tenantCode || '') || !userId
    || (branchCode && (!PHOTO_BRANCH_CODE.test(branchCode) || !branchCode.startsWith(tenantCode + '-B')))) return null;
  return `crm_profile_photo_v1:${tenantCode}:${branchCode || 'tenant'}:${userId}`;
}

export function resolveProfilePhoto({ policy, personal, legacyAvatar = null }) {
  // A row with a null URL intentionally suppresses the legacy avatar after removal.
  const personalAvatarUrl = personal ? personal.avatar_url || null : legacyAvatar;
  return { avatarUrl: policy.mode === 'shared' ? policy.avatarUrl : personalAvatarUrl || policy.avatarUrl,
    personalAvatarUrl, shared: policy.mode === 'shared' };
}
