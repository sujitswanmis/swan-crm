import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { authorizePhotoScope, photoBranchForRole, photoTenantForRole, effectivePhotoPolicy,
  profilePhotoCacheKey, resolveProfilePhoto } from '../src/utils/profilePhotoPolicy.js';

const tenantA = { id: 'a', code: 'TNT00001', name: 'Company A', branches: [
  { code: 'TNT00001-B0001', name: 'HQ' }, { code: 'TNT00001-B0002', name: 'Plant', legacyCode: 'A_PLANT' }] };
const tenantB = { id: 'b', code: 'TNT00002', name: 'Company B', branches: [{ code: 'TNT00002-B0001', name: 'HQ' }] };
const directory = [tenantA, tenantB];
const user = { id: 'user-a', email: 'employee@example.com' };
const role = { tenant_id: 'a', role: 'agent', work_location_name: 'Plant' };
const tenantPolicy = { tenant_id: 'a', branch_code: '', mode: 'shared', avatar_url: 'tenant-a-photo' };

test('tenant admins cannot read or update another tenant or its branches', () => {
  const admin = { ...role, role: 'Admin' };
  assert.throws(() => authorizePhotoScope({ directory, user, role: admin, manage: true, tenantCode: 'TNT00002' }), /Tenant access denied/);
  assert.throws(() => authorizePhotoScope({ directory, user, role: admin, manage: true, branchCode: 'TNT00002-B0001' }), /Branch access denied/);
  assert.throws(() => authorizePhotoScope({ directory, user, role: admin, targetRole: { tenant_id: 'b' }, targetUserId: 'user-b' }), /Tenant access denied/);
});

test('employees cannot change policy, impersonate someone else, or select another branch', () => {
  assert.throws(() => authorizePhotoScope({ directory, user, role, manage: true }), /administrator/);
  assert.throws(() => authorizePhotoScope({ directory, user, role, targetUserId: 'other', write: true }), /own profile photo/);
  assert.throws(() => authorizePhotoScope({ directory, user, role, branchCode: 'TNT00001-B0001' }), /Branch access denied/);
  assert.equal(authorizePhotoScope({ directory, user, role }).branchCode, 'TNT00001-B0002');
});

test('admin previews are read-only and Master Admin can select verified tenants', () => {
  const admin = { ...role, role: 'Admin' };
  assert.equal(authorizePhotoScope({ directory, user, role: admin, targetUserId: 'another' }).preview, true);
  assert.throws(() => authorizePhotoScope({ directory, user, role: admin, targetUserId: 'another', write: true }), /own profile photo/);
  const master = { id: 'master', email: 'supujacreations@gmail.com' };
  assert.equal(authorizePhotoScope({ directory, user: master, role: admin, manage: true, tenantCode: 'TNT00002' }).tenant.id, 'b');
});

test('ownership never falls back from an invalid tenant ID or ambiguous company', () => {
  assert.equal(photoTenantForRole(directory, { tenant_id: 'missing', company: 'Company A' }), null);
  assert.equal(photoTenantForRole(directory, { company: 'HQ' }), null);
  assert.equal(photoTenantForRole(directory, { company: 'A_PLANT' }).id, 'a');
  assert.equal(photoTenantForRole(directory, { company: 'Default' }), null);
});

test('current work location and legacy assignment resolve only verified branches', () => {
  assert.equal(photoBranchForRole(tenantA, { ...role, branch_name: 'HQ' }), 'TNT00001-B0002');
  assert.equal(photoBranchForRole(tenantA, { module_access: { work_location_name: 'Plant' } }), 'TNT00001-B0002');
  assert.throws(() => photoBranchForRole(tenantA, { work_location_name: 'Unknown' }), /could not be verified/);
  assert.throws(() => photoBranchForRole(tenantA, { branch_code: 'TNT00002-B0001' }), /could not be verified/);
  assert.equal(photoBranchForRole(tenantA, {}), '');
});

test('branch overrides, inheritance and tenant isolation select the expected DP policy', () => {
  const branch = { tenant_id: 'a', branch_code: 'TNT00001-B0002', mode: 'individual', avatar_url: 'plant-photo' };
  const foreign = { tenant_id: 'b', branch_code: '', mode: 'shared', avatar_url: 'foreign-photo' };
  assert.deepEqual(effectivePhotoPolicy([tenantPolicy, branch, foreign], 'a', 'TNT00001-B0002'),
    { mode: 'individual', avatarUrl: 'plant-photo', inherited: false });
  assert.equal(effectivePhotoPolicy([tenantPolicy, { ...branch, inherit: true }], 'a', branch.branch_code).mode, 'shared');
  assert.equal(effectivePhotoPolicy([foreign], 'a').avatarUrl, null);
  assert.equal(effectivePhotoPolicy([tenantPolicy], 'a', 'TNT00001-B0001').inherited, true);
});

test('common mode preserves personal photos; disabling it restores the personal DP', () => {
  const personal = { avatar_url: 'my-photo' };
  const shared = { mode: 'shared', avatarUrl: 'common-photo' };
  assert.deepEqual(resolveProfilePhoto({ policy: shared, personal }), { avatarUrl: 'common-photo', personalAvatarUrl: 'my-photo', shared: true });
  assert.equal(resolveProfilePhoto({ policy: { ...shared, mode: 'individual' }, personal }).avatarUrl, 'my-photo');
  assert.equal(resolveProfilePhoto({ policy: { mode: 'individual', avatarUrl: null }, personal: { avatar_url: null }, legacyAvatar: 'old-photo' }).avatarUrl, null);
});

test('photo cache keys cannot collide between tenants, branches or users', () => {
  const keys = [profilePhotoCacheKey('TNT00001', 'TNT00001-B0001', 'user-a'), profilePhotoCacheKey('TNT00001', 'TNT00001-B0002', 'user-a'),
    profilePhotoCacheKey('TNT00002', 'TNT00002-B0001', 'user-a'), profilePhotoCacheKey('TNT00001', 'TNT00001-B0001', 'user-b')];
  assert.equal(new Set(keys).size, 4);
  assert.equal(profilePhotoCacheKey('TNT00001', 'TNT00002-B0001', 'user-a'), null);
  assert.equal(profilePhotoCacheKey(null, null, 'user-a'), null);
});

// Exercise the actual Server Action implementation with only its I/O imports replaced.
// No live employee data, auth metadata, policies or storage objects are mutated by tests.
let actionSource = await readFile(new URL('../src/app/actions/userProfile.js', import.meta.url), 'utf8');
actionSource = actionSource
  .replace("import { createClient as createSupabaseClient } from '@supabase/supabase-js';", 'const createSupabaseClient = () => globalThis.__photoTest.db;')
  .replace("import { createClient as createServerAuthClient } from '@/utils/supabase/server';", 'const createServerAuthClient = async () => globalThis.__photoTest.session;')
  .replace("import { readFile } from 'node:fs/promises';", "const readFile = async () => '{}';")
  .replace("'@/utils/profilePhotoPolicy'", JSON.stringify(pathToFileURL(path.resolve('src/utils/profilePhotoPolicy.js')).href));
const actions = await import('data:text/javascript;base64,' + Buffer.from(actionSource).toString('base64'));
const actorId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
const dbTenantId = '33333333-3333-3333-3333-333333333333';

function fakeContext({ signedIn = true, actorRole = 'Admin', policies = [], personal = [], setupPending = false, storageFails = false, rpcFails = false } = {}) {
  const calls = { reads: [], rpc: [], uploads: [], targetAuth: [] };
  const actor = { id: actorId, email: 'admin@example.com', user_metadata: { avatar_url: 'admin-legacy-photo' } };
  const rows = {
    user_roles: [actorId, otherId].map(id => ({ user_id: id, tenant_id: dbTenantId, role: actorRole, is_approved: true, work_location_name: 'Plant' })),
    tenants: [{ id: dbTenantId, tenant_code: 'TNT00001', name: 'Company A', status: 'ACTIVE' }],
    tenant_branches: [{ tenant_id: dbTenantId, branch_code: 'TNT00001-B0002', branch_name: 'Plant' }],
    profile_photo_policies: policies.map(row => ({ ...row, tenant_id: dbTenantId })), scoped_profile_photos: personal,
  };
  const db = {
    from(table) {
      const filters = [];
      const query = { select() { return this; }, limit() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        maybeSingle() { this.single = true; return this; },
        then(resolve, reject) {
          calls.reads.push(table);
          if (setupPending && table === 'profile_photo_policies') return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve, reject);
          const data = (rows[table] || []).filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({ data: this.single ? data[0] || null : data, error: null }).then(resolve, reject);
        } };
      return query;
    },
    async rpc(name, args) { calls.rpc.push({ name, args }); return rpcFails
      ? { data: null, error: { message: 'photo_policy_locked', code: 'P0001' } } : { data: 1, error: null }; },
    auth: { admin: { async getUserById(id) { calls.targetAuth.push(id); return { data: { user: { user_metadata: { avatar_url: 'employee-legacy-photo' } } }, error: null }; } } },
    storage: { async getBucket() { return { data: { name: 'avatars' } }; }, from() { return {
      async upload(filePath) { calls.uploads.push(filePath); return storageFails ? { error: { code: 'upload_failed' } } : { data: { path: filePath } }; },
      getPublicUrl(filePath) { return { data: { publicUrl: `https://storage.example/${filePath}` } }; },
    }; } },
  };
  globalThis.__photoTest = { db, session: { auth: { async getUser() { return { data: { user: signedIn ? actor : null }, error: null }; } } } };
  return { calls, rows };
}

test('anonymous and forged-user uploads are rejected before privileged photo writes', async () => {
  let fake = fakeContext({ signedIn: false });
  let input = new FormData(); input.set('userId', actorId);
  assert.equal((await actions.uploadUserAvatar(input)).success, false);
  assert.equal(fake.calls.uploads.length + fake.calls.rpc.length, 0);
  fake = fakeContext(); input = new FormData(); input.set('userId', otherId);
  const result = await actions.uploadUserAvatar(input);
  assert.match(result.error, /own profile photo/);
  assert.equal(fake.calls.uploads.length + fake.calls.rpc.length + fake.calls.targetAuth.length, 0);
});

test('shared policy blocks both personal upload and removal on the server', async () => {
  const fake = fakeContext({ policies: [{ branch_code: '', mode: 'shared', avatar_url: 'common', revision: 1 }] });
  const input = new FormData(); input.set('userId', actorId); input.set('base64', 'data:image/jpeg;base64,/9j/AA==');
  assert.match((await actions.uploadUserAvatar(input)).error, /shared profile photo/);
  assert.equal(fake.calls.uploads.length, 0);
  // The database RPC rechecks the policy under the same tenant lock used by admin changes.
  fakeContext({ rpcFails: true });
  assert.match((await actions.removeUserAvatar(actorId)).error, /shared profile photo/);
});

test('upload paths contain verified tenant, branch and user; failed storage never reports success', async () => {
  let fake = fakeContext();
  const input = new FormData(); input.set('userId', actorId); input.set('base64', 'data:image/jpeg;base64,/9j/AA==');
  assert.equal((await actions.uploadUserAvatar(input)).success, true);
  assert.ok(fake.calls.uploads[0].startsWith(`TNT00001/TNT00001-B0002/${actorId}/`));
  assert.equal(fake.calls.rpc[0].args.p_tenant_id, dbTenantId);
  fake = fakeContext({ storageFails: true });
  assert.equal((await actions.uploadUserAvatar(input)).success, false);
  assert.equal(fake.calls.rpc.length, 0);
});

test('View As reads the authorized employee photo and does not reuse the admin avatar', async () => {
  const fake = fakeContext();
  const result = await actions.getProfilePhoto({ userId: otherId });
  assert.equal(result.avatarUrl, 'employee-legacy-photo');
  assert.equal(result.canChange, false);
  assert.deepEqual(fake.calls.targetAuth, [otherId]);
});

test('policy saves require admin, verified scope, expected revision and a common image', async () => {
  let fake = fakeContext({ actorRole: 'agent' });
  assert.equal((await actions.saveProfilePhotoPolicy({ mode: 'individual', inherit: false, revision: 0 })).success, false);
  assert.equal(fake.calls.rpc.length, 0);
  fake = fakeContext();
  assert.match((await actions.saveProfilePhotoPolicy({ tenantCode: 'TNT00002', mode: 'individual', inherit: false, revision: 0 })).error, /Tenant access denied/);
  assert.match((await actions.saveProfilePhotoPolicy({ mode: 'shared', inherit: false, revision: 0 })).error, /Upload a common photo/);
  assert.match((await actions.saveProfilePhotoPolicy({ mode: 'individual', inherit: false, revision: 5 })).error, /policy changed/);
  assert.equal(fake.calls.rpc.length, 0);
  assert.equal((await actions.saveProfilePhotoPolicy({ mode: 'individual', inherit: false, revision: 0 })).success, true);
  assert.equal(fake.calls.rpc[0].args.p_tenant_id, dbTenantId);
});

test('missing setup fails closed for photos and remains local to the photo settings', async () => {
  fakeContext({ setupPending: true });
  const snapshot = await actions.getProfilePhoto({ userId: actorId });
  assert.equal(snapshot.canChange, false);
  assert.equal(snapshot.avatarUrl, null);
  const settings = await actions.getProfilePhotoPolicy();
  assert.equal(settings.success, true);
  assert.equal(settings.ready, false);
  assert.equal(settings.tenants[0].code, 'TNT00001');
});

test('removal writes a scoped tombstone and never deletes files or updates auth metadata', async () => {
  const fake = fakeContext();
  assert.equal((await actions.removeUserAvatar(actorId)).success, true);
  assert.equal(fake.calls.rpc[0].name, 'set_scoped_profile_photo');
  assert.equal(fake.calls.rpc[0].args.p_avatar_url, null);
  assert.equal(fake.calls.rpc[0].args.p_branch_code, 'TNT00001-B0002');
  assert.equal(fake.calls.uploads.length, 0);
  assert.doesNotMatch(actionSource, /updateUserById|\.remove\(|\.delete\(/);
});
