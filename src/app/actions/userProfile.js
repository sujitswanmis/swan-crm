'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PHOTO_TENANT_CODE, PHOTO_BRANCH_CODE, isPhotoMaster, authorizePhotoScope,
  effectivePhotoPolicy, profilePhotoCacheKey, resolveProfilePhoto } from '@/utils/profilePhotoPolicy';

// No cross-request identity or policy cache: an admin change applies to the next photo operation.
const AVATAR_BUCKET = 'avatars';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class PhotoError extends Error {
  constructor(message, setupRequired = false) { super(message); this.setupRequired = setupRequired; }
}

function checked(result) {
  if (!result.error) return result.data;
  if (['42P01', 'PGRST205', 'PGRST202'].includes(result.error.code)) {
    throw new PhotoError('Profile photo setup is pending. Apply the scoped profile photos migration.', true);
  }
  if (result.error.message?.includes('photo_policy_locked')) throw new PhotoError('Your administrator has enabled a shared profile photo.');
  if (result.error.message?.includes('photo_policy_changed')) throw new PhotoError('Photo policy changed. Reload this section before saving.');
  console.warn('Profile photo operation failed:', result.error.code || 'storage');
  throw new PhotoError('Could not save or load the profile photo. Please try again.');
}

function failure(error) {
  if (!(error instanceof PhotoError)) console.warn('Profile photo request failed.');
  return { success: false, canChange: false, ready: false, avatarUrl: null,
    setupRequired: error?.setupRequired === true,
    error: error instanceof PhotoError ? error.message : 'Could not load profile photos. Please try again.' };
}

async function directoryFor(db, user, role) {
  const master = isPhotoMaster(user, role);
  let query = db.from('tenants').select('id,tenant_code,name,status').limit(1000);
  if (!master && UUID.test(role.tenant_id || '')) query = query.eq('id', role.tenant_id);
  const tenants = checked(await query) || [];
  let local = [];
  try {
    const content = JSON.parse(await readFile(path.join(process.cwd(), 'src/config/tenant_branches.json'), 'utf8'));
    local = Object.values(content).filter(Array.isArray).flat();
  } catch { /* Missing local branch configuration never invents a tenant or branch. */ }
  let branchesQuery = db.from('tenant_branches').select('*').limit(5000);
  if (!master && UUID.test(role.tenant_id || '')) branchesQuery = branchesQuery.eq('tenant_id', role.tenant_id);
  const remote = await branchesQuery;
  if (remote.error && !['42P01', 'PGRST205'].includes(remote.error.code)) checked(remote);
  return tenants.filter(tenant => PHOTO_TENANT_CODE.test(tenant.tenant_code || '')).map(tenant => {
    const branches = new Map();
    for (const branch of [...(remote.data || []), ...local]) {
      if (branch.is_active === false || (branch.tenant_id ? branch.tenant_id !== tenant.id : branch.tenant_code !== tenant.tenant_code)) continue;
      const code = branch.branch_code;
      if (PHOTO_BRANCH_CODE.test(code || '') && code.startsWith(tenant.tenant_code + '-B') && !branches.has(code)) {
        branches.set(code, { code, name: branch.branch_name || code, legacyCode: branch.legacy_code || '' });
      }
    }
    return { ...tenant, code: tenant.tenant_code, branches: [...branches.values()] };
  });
}

async function contextFor(input = {}, { manage = false, write = false } = {}) {
  const session = await createServerAuthClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new PhotoError('Please sign in again.');
  const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }) } });
  const role = checked(await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle()) || {};
  const active = record => record.is_approved !== false && !['inactive', 'terminated', 'suspended'].includes(
    String(record.emp_status || record.module_access?.emp_status || '').toLowerCase());
  if (!active(role) || role.can_read === false) throw new PhotoError('Workspace access denied.');
  const targetUserId = input.userId || user.id;
  if (!UUID.test(targetUserId)) throw new PhotoError('Invalid profile photo request.');
  // Reject writes against any client-supplied other identity before loading a target account.
  if (write && !manage && targetUserId !== user.id) throw new PhotoError('You can only change your own profile photo.');
  const targetRole = targetUserId === user.id ? role
    : checked(await db.from('user_roles').select('*').eq('user_id', targetUserId).maybeSingle());
  if (!targetRole || !active(targetRole)) throw new PhotoError('Workspace access denied.');
  const directory = await directoryFor(db, user, role);
  let scope;
  try { scope = authorizePhotoScope({ directory, user, role, targetRole, targetUserId,
    tenantCode: input.tenantCode, branchCode: input.branchCode || '', manage, write }); }
  catch (error) { throw new PhotoError(error.message); }
  if ((write || manage) && ['SUSPENDED', 'ARCHIVED', 'DRAFT', 'READ_ONLY'].includes(String(scope.tenant.status).toUpperCase())) {
    throw new PhotoError('Profile photo changes are unavailable for this tenant.');
  }
  if (write && role.can_write === false) throw new PhotoError('Profile photo write access denied.');
  return { db, user, role, targetRole, targetUserId, directory, ...scope };
}

async function policyRows(context) {
  return checked(await context.db.from('profile_photo_policies').select('tenant_id,branch_code,mode,inherit,avatar_url,revision')
    .eq('tenant_id', context.tenant.id).in('branch_code', context.branchCode ? ['', context.branchCode] : [''])) || [];
}

async function snapshot(context) {
  const [rows, personalResult] = await Promise.all([policyRows(context), context.db.from('scoped_profile_photos')
    .select('avatar_url').eq('tenant_id', context.tenant.id).eq('branch_code', context.branchCode)
    .eq('user_id', context.targetUserId).maybeSingle()]);
  const personal = checked(personalResult);
  let legacyAvatar = null;
  if (!personal) {
    const target = context.preview ? checked(await context.db.auth.admin.getUserById(context.targetUserId))?.user : context.user;
    legacyAvatar = target?.user_metadata?.avatar_url || null;
  }
  const policy = effectivePhotoPolicy(rows, context.tenant.id, context.branchCode);
  const resolved = resolveProfilePhoto({ policy, personal, legacyAvatar });
  return { success: true, ready: true, ...resolved, canChange: !resolved.shared && !context.preview
    && context.role.can_write !== false && !['SUSPENDED', 'ARCHIVED', 'DRAFT', 'READ_ONLY'].includes(String(context.tenant.status).toUpperCase()),
    userId: context.targetUserId, tenantCode: context.tenant.code, branchCode: context.branchCode,
    cacheKey: profilePhotoCacheKey(context.tenant.code, context.branchCode, context.targetUserId) };
}

// Called after mount: photo lookup failure cannot delay rendering of the operational workspace.
export async function getProfilePhoto(input = {}) {
  try { return await snapshot(await contextFor(input)); } catch (error) { return failure(error); }
}

async function uploadImage(context, base64, shared = false) {
  if (typeof base64 !== 'string' || base64.length > 14 * 1024 * 1024) throw new PhotoError('Select an image smaller than 10MB.');
  const matches = base64.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!matches) throw new PhotoError('Please select a JPG, PNG or WEBP image.');
  const buffer = Buffer.from(matches[2], 'base64');
  const type = matches[1];
  const valid = type === 'jpeg' ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : type === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!valid || buffer.length > 10 * 1024 * 1024) throw new PhotoError('Invalid image or image exceeds 10MB.');
  const bucket = await context.db.storage.getBucket(AVATAR_BUCKET);
  if (!bucket.data) checked(await context.db.storage.createBucket(AVATAR_BUCKET,
    { public: true, fileSizeLimit: 10485760, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }));
  const filePath = `${context.tenant.code}/${context.branchCode || 'tenant'}/${shared ? 'shared' : context.user.id}/${randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
  checked(await context.db.storage.from(AVATAR_BUCKET).upload(filePath, buffer, { contentType: `image/${type}`, upsert: false }));
  const { data } = context.db.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new PhotoError('Could not save the profile photo. Please try again.');
  return data.publicUrl;
}

export async function uploadUserAvatar(formData) {
  try {
    const context = await contextFor({ userId: formData.get('userId'), tenantCode: formData.get('tenantCode'),
      branchCode: formData.get('branchCode') }, { write: true });
    const current = await snapshot(context);
    if (!current.canChange) throw new PhotoError('Your administrator has enabled a shared profile photo.');
    const avatarUrl = await uploadImage(context, formData.get('base64'));
    checked(await context.db.rpc('set_scoped_profile_photo', { p_tenant_id: context.tenant.id,
      p_branch_code: context.branchCode, p_user_id: context.user.id, p_avatar_url: avatarUrl }));
    return await snapshot(context);
  } catch (error) { return failure(error); }
}

export async function removeUserAvatar(userId, input = {}) {
  try {
    const context = await contextFor({ ...input, userId }, { write: true });
    // A null scoped row hides the photo; existing storage files and auth metadata are preserved.
    checked(await context.db.rpc('set_scoped_profile_photo', { p_tenant_id: context.tenant.id,
      p_branch_code: context.branchCode, p_user_id: context.user.id, p_avatar_url: null }));
    return await snapshot(context);
  } catch (error) { return failure(error); }
}

// Backward-compatible URL return type, now protected by session and tenant checks.
export async function getUserAvatar(userId) {
  const result = await getProfilePhoto({ userId });
  return result.success ? result.avatarUrl : null;
}

export async function getProfilePhotoPolicy(input = {}) {
  try {
    const context = await contextFor(input, { manage: true });
    let rows;
    try { rows = await policyRows(context); }
    catch (error) { if (!error.setupRequired) throw error; rows = null; }
    const selected = rows?.find(row => row.branch_code === context.branchCode);
    const effective = effectivePhotoPolicy(rows || [], context.tenant.id, context.branchCode);
    return { success: true, canManage: true, ready: rows !== null,
      tenantCode: context.tenant.code, branchCode: context.branchCode,
      tenants: context.directory.filter(tenant => isPhotoMaster(context.user, context.role) || tenant.id === context.tenant.id)
        .map(tenant => ({ code: tenant.code, name: tenant.name })),
      branches: context.tenant.branches.map(branch => ({ code: branch.code, name: branch.name })),
      revision: selected?.revision || 0,
      policy: { mode: selected?.mode || 'individual', inherit: Boolean(context.branchCode && (!selected || selected.inherit)), avatarUrl: selected?.avatar_url || null },
      effective, companyDefault: effectivePhotoPolicy(rows || [], context.tenant.id) };
  } catch (error) { return failure(error); }
}

export async function saveProfilePhotoPolicy(input = {}) {
  try {
    const context = await contextFor(input, { manage: true, write: true });
    if (!['individual', 'shared'].includes(input.mode) || typeof input.inherit !== 'boolean'
      || (!context.branchCode && input.inherit) || !Number.isSafeInteger(input.revision) || input.revision < 0) {
      throw new PhotoError('Select valid profile photo settings.');
    }
    const rows = await policyRows(context);
    const selected = rows.find(row => row.branch_code === context.branchCode);
    if ((selected?.revision || 0) !== input.revision) throw new PhotoError('Photo policy changed. Reload this section before saving.');
    const changeAvatar = typeof input.base64 === 'string' && input.base64.length > 0;
    const avatarUrl = changeAvatar ? await uploadImage(context, input.base64, true) : selected?.avatar_url || null;
    const tenantAvatar = rows.find(row => row.branch_code === '')?.avatar_url;
    if (input.mode === 'shared' && !input.inherit && !avatarUrl && !tenantAvatar) throw new PhotoError('Upload a common photo before enabling the same DP for everyone.');
    checked(await context.db.rpc('set_profile_photo_policy', { p_tenant_id: context.tenant.id, p_branch_code: context.branchCode,
      p_mode: input.mode, p_inherit: input.inherit, p_avatar_url: avatarUrl, p_change_avatar: changeAvatar,
      p_revision: input.revision, p_actor: context.user.id }));
    return { success: true };
  } catch (error) { return failure(error); }
}
