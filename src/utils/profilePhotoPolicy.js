// Shared, side-effect-free rules. Identity inputs must come from the verified server session.
export const PHOTO_TENANT_CODE = /^TNT\d{5,}$/;
export const PHOTO_BRANCH_CODE = /^TNT\d{5,}-B\d{4,}$/;
const normalized = value => String(value || '').trim().toLowerCase().replaceAll('_', ' ');

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
    ...tenant.branches.flatMap(branch => [branch.code, branch.name, branch.legacyCode])]
    .some(value => normalized(value) === company));
  return matches.length === 1 ? matches[0] : null;
}

export function photoBranchForRole(tenant, role) {
  const explicit = role?.branch_code || role?.module_access?.branch_code;
  const location = explicit || role?.work_location_name || role?.module_access?.work_location_name
    || role?.branch_name || role?.module_access?.branch_name;
  if (location) {
    const matches = tenant.branches.filter(branch => [branch.code, ...(explicit ? [] : [branch.name, branch.legacyCode])]
      .some(value => normalized(value) === normalized(location)));
    if (matches.length !== 1) throw new Error('Your assigned branch could not be verified. Contact your administrator.');
    return matches[0].code;
  }
  // Legacy operating-company assignments identify a branch only when unambiguous.
  const matches = tenant.branches.filter(branch => [branch.name, branch.legacyCode]
    .some(value => value && normalized(value) === normalized(role?.company)));
  return matches.length === 1 ? matches[0].code : '';
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
