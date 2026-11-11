import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pathMod from 'node:path';
import cryptoMod from 'node:crypto';
import osMod from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

async function compile(file) {
  const result = await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  return result.code;
}

const branchAccessCode = await compile('src/utils/branchAccess.js');
const teamCode = await compile('src/app/actions/team.js');
const attendanceCode = await compile('src/app/actions/attendance.js');
const fieldTasksCode = await compile('src/app/actions/fieldTasks.js');
const liveTrackingCode = await compile('src/app/actions/liveTracking.js');

function loadExports(code, dependencies = {}, extraGlobals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    global: {},
    Buffer,
    URL,
    AbortController,
    process: { cwd: () => '.', env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'key' } },
    ...extraGlobals
  });
  return loadedModule.exports;
}

const branchAccessExports = loadExports(branchAccessCode);

test('branchAccess entity, employee membership, and dropdown helpers isolate SINGLE, MULTI, ALL, and admin header filters', () => {
  const nsmlrSingle = branchAccessExports.getUserBranchAccess({
    company: 'NSMLR',
    role: 'Manager',
    module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'], assigned_branch_names: ['New Swan Multitech Limited Raian'] }
  }, '00000000-0000-0000-0000-000000000001');

  assert.equal(nsmlrSingle.scope, 'SINGLE');
  assert.equal(branchAccessExports.matchesEntityBranchScope('NSMLR', nsmlrSingle, 'All'), true);
  assert.equal(branchAccessExports.matchesEntityBranchScope('NSTLP', nsmlrSingle, 'All'), false);
  assert.deepEqual([...branchAccessExports.getScopedBranchFilterOptions(nsmlrSingle)], ['NSMLR']);

  const empNsmlr = { company: 'NSMLR', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'] } };
  const empNstlp = { company: 'NSTLP', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSTLP'] } };
  const empMulti = { company: 'NSMLR', module_access: { assigned_branch_scope: 'MULTI', assigned_branches: ['NSMLR', 'NSTLP'] } };
  const empAll = { company: 'New Swan Group', module_access: { assigned_branch_scope: 'ALL', assigned_branches: ['ALL'] } };

  assert.equal(branchAccessExports.matchesUserBranchMembership(empNsmlr, nsmlrSingle), true);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empNstlp, nsmlrSingle), false);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empMulti, nsmlrSingle), true);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empAll, nsmlrSingle), true);

  const multiManager = branchAccessExports.getUserBranchAccess({
    company: 'NSMLR',
    role: 'Manager',
    module_access: {
      assigned_branch_scope: 'MULTI',
      assigned_branches: ['NSMLR', 'NSTLP'],
      assigned_branch_names: ['New Swan Multitech Limited Raian', 'New Swan Technologies Limited Paharuwal']
    }
  }, '00000000-0000-0000-0000-000000000001');

  assert.equal(multiManager.scope, 'MULTI');
  assert.equal(branchAccessExports.matchesEntityBranchScope('NSTLP', multiManager, 'All'), true);
  assert.equal(branchAccessExports.matchesEntityBranchScope('NSTLP', multiManager, 'NSMLR'), false);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empNstlp, multiManager, 'NSMLR'), false);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empNstlp, multiManager, 'NSTLP'), true);
  assert.deepEqual([...branchAccessExports.getScopedBranchFilterOptions(multiManager)], ['NSMLR', 'NSTLP']);

  const adminAll = branchAccessExports.getUserBranchAccess({
    company: 'New Swan Group',
    role: 'Admin',
    module_access: {}
  }, '00000000-0000-0000-0000-000000000001');
  assert.equal(adminAll.isAllBranches, true);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empNstlp, adminAll, 'NSMLR'), false);
  assert.equal(branchAccessExports.matchesUserBranchMembership(empNstlp, adminAll, 'All'), true);
});

test('team.js getTeamMembers enforces SINGLE, MULTI, ALL branchScope and excludes cross-tenant rows', async () => {
  const sampleUsers = [
    { user_id: 'u-nsmlr', emp_name: 'Raian Exec', company: 'NSMLR', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'agent', is_approved: true, module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'] } },
    { user_id: 'u-nstlp', emp_name: 'Paharuwal Exec', company: 'NSTLP', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'agent', is_approved: true, module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSTLP'] } },
    { user_id: 'u-multi', emp_name: 'Multi Exec', company: 'NSMLR', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'agent', is_approved: true, module_access: { assigned_branch_scope: 'MULTI', assigned_branches: ['NSMLR', 'NSE-6'] } },
    { user_id: 'u-all', emp_name: 'All Exec', company: 'New Swan Group', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'Manager', is_approved: true, module_access: { assigned_branch_scope: 'ALL', assigned_branches: ['ALL'] } },
    { user_id: 'u-supuja', emp_name: 'SuPuja Exec', company: 'SuPuja Creations', tenant_id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', role: 'agent', is_approved: true, module_access: {} }
  ];

  const fakeDb = {
    from(table) {
      const q = {
        select() { return q; },
        eq() { return q; },
        order() { return Promise.resolve({ data: table === 'user_roles' ? sampleUsers : [], error: null }); }
      };
      return q;
    }
  };

  const team = loadExports(teamCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': { createClient: async () => fakeDb },
    './adminMessageConfig': { sendAdminAccountEmailOtp: async () => ({}) },
    './audit': { logAuditAction: async () => ({}) },
    '@/lib/impersonateStore': { saveImpersonateToken: async () => ({}) },
    '@/utils/reportingHierarchy': { getReportingFields: d => d },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber: x => x },
    '@/utils/permissionUtils': { getSubItemPermissions: () => ({}) },
    '@/utils/branchAccess': branchAccessExports
  });

  const singleScope = branchAccessExports.getUserBranchAccess(sampleUsers[0], '00000000-0000-0000-0000-000000000001');
  const nsmlrList = await team.getTeamMembers('New Swan Group', '00000000-0000-0000-0000-000000000001', singleScope);
  assert.deepEqual(nsmlrList.map(u => u.user_id), ['u-nsmlr', 'u-multi', 'u-all']);

  const nse6Scope = branchAccessExports.getUserBranchAccess({ company: 'NSE-6', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSE-6'] } }, '00000000-0000-0000-0000-000000000001');
  const nse6List = await team.getTeamMembers('New Swan Group', '00000000-0000-0000-0000-000000000001', nse6Scope);
  assert.deepEqual(nse6List.map(u => u.user_id), ['u-multi', 'u-all']);

  // Legacy call without branchScope remains backwards-compatible
  const legacyList = await team.getTeamMembers('New Swan Group', '00000000-0000-0000-0000-000000000001');
  assert.deepEqual(legacyList.map(u => u.user_id), ['u-nsmlr', 'u-nstlp', 'u-multi', 'u-all']);
});

test('attendance.js getTeamAttendanceMaster & getTeamMonthlyMatrix filter team strictly by branchScope', async () => {
  const attendanceUtils = await import('../src/utils/attendanceUtils.js');
  const usersData = [
    { user_id: 'u-1', emp_name: 'Amit NSMLR', email: 'amit@newswangroup.com', emp_id: 'E1', emp_department: 'Sales', role: 'agent', is_approved: true, company: 'NSMLR', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'], emp_status: 'Active' } },
    { user_id: 'u-2', emp_name: 'Neha NSTLP', email: 'neha@newswangroup.com', emp_id: 'E2', emp_department: 'Sales', role: 'agent', is_approved: true, company: 'NSTLP', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSTLP'], emp_status: 'Active' } },
    { user_id: 'u-3', emp_name: 'Raj Multi', email: 'raj@newswangroup.com', emp_id: 'E3', emp_department: 'Sales', role: 'agent', is_approved: true, company: 'NSMLR', module_access: { assigned_branch_scope: 'MULTI', assigned_branches: ['NSMLR', 'NSTLP'], emp_status: 'Active' } }
  ];

  const fakeDb = {
    from(table) {
      const result = table === 'user_roles' ? usersData : [];
      const q = {
        select() { return q; },
        eq() { return q; },
        gte() { return q; },
        lte() { return q; },
        order() { return q; },
        in() { return q; },
        then(res, rej) { return Promise.resolve({ data: result, error: null }).then(res, rej); }
      };
      return q;
    }
  };

  const attendance = loadExports(attendanceCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': {},
    '@/utils/reportingHierarchy': {},
    './audit': { logAuditAction: async () => ({}) },
    '@/utils/attendanceUtils': attendanceUtils,
    '@/utils/geoAttendance': { calculateDistanceMeters: () => 0 },
    '@/utils/branchAccess': branchAccessExports,
    'fs/promises': { readFile: async () => JSON.stringify({ records: [], requests: [] }), mkdir: async () => {}, writeFile: async () => {} },
    path: pathMod,
    crypto: cryptoMod
  });

  const nsmlrScope = { ...branchAccessExports.getUserBranchAccess(usersData[0], '00000000-0000-0000-0000-000000000001'), selectedFilter: 'All' };
  const dailyRes = await attendance.getTeamAttendanceMaster({
    date: '2026-11-11',
    tenantId: '00000000-0000-0000-0000-000000000001',
    company: 'New Swan Group',
    branchScope: nsmlrScope
  });
  assert.equal(dailyRes.success, true);
  assert.deepEqual([...dailyRes.records.map(r => r.email)], ['amit@newswangroup.com', 'raj@newswangroup.com']);

  const adminNstlpHeader = { ...branchAccessExports.getUserBranchAccess({ role: 'Admin', company: 'New Swan Group', module_access: {} }, '00000000-0000-0000-0000-000000000001'), selectedFilter: 'NSTLP' };
  const matrixRes = await attendance.getTeamMonthlyMatrix({
    year: 2026,
    month: 11,
    tenantId: '00000000-0000-0000-0000-000000000001',
    company: 'New Swan Group',
    branchScope: adminNstlpHeader
  });
  assert.equal(matrixRes.success, true);
  assert.deepEqual([...matrixRes.rows.map(r => r.email)], ['neha@newswangroup.com', 'raj@newswangroup.com']);
});

test('fieldTasks.js getModuleEntitiesForCheckIn enforces allowedCompanies across Leads, Parties & Tasks', async () => {
  const capturedLeadFilters = [];
  const sampleParties = [
    { id: 'p-1', firm_name: 'Raian Dealer', primary_mobile: '9999990001', party_status: 'Active', business_nature: JSON.stringify({ our_company: 'NSMLR' }), party_addresses: [] },
    { id: 'p-2', firm_name: 'Paharuwal Dealer', primary_mobile: '9999990002', party_status: 'Active', business_nature: JSON.stringify({ our_company: 'NSTLP' }), party_addresses: [] },
    { id: 'p-3', firm_name: 'Unit 6 Dealer', primary_mobile: '9999990003', party_status: 'Active', business_nature: JSON.stringify({ our_company: 'NSE-6' }), party_addresses: [] }
  ];

  const fakeDb = {
    from(table) {
      const q = {
        select() { return q; },
        order() { return q; },
        limit() { return q; },
        eq() { return q; },
        in(col, vals) {
          if (table === 'leads') capturedLeadFilters.push({ col, vals });
          return q;
        },
        then(res, rej) {
          const data = table === 'party_master' ? sampleParties : [{ id: 'l-1', name: 'Lead A', company: 'Firm A', our_company: 'NSTLP', phone: '9876543210', status: 'New' }];
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return q;
    }
  };

  const fieldTasks = loadExports(fieldTasksCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': { createClient: async () => fakeDb },
    '@/app/actions/audit': { logAuditAction: async () => ({}) },
    '@/app/actions/partyMaster': { resolveDbTenantUuid: async () => '00000000-0000-0000-0000-000000000001' },
    '@/utils/branchAccess': branchAccessExports
  });

  const leadEntities = await fieldTasks.getModuleEntitiesForCheckIn({
    company: 'New Swan Group',
    tenantId: '00000000-0000-0000-0000-000000000001',
    allowedCompanies: ['NSMLR', 'NSTLP'],
    moduleType: 'LEAD_DATA'
  });
  assert.equal(leadEntities.length, 1);
  assert.equal(capturedLeadFilters[0].col, 'our_company');
  assert.ok(capturedLeadFilters[0].vals.includes('NSMLR') && capturedLeadFilters[0].vals.includes('NSTLP'));

  const partyEntities = await fieldTasks.getModuleEntitiesForCheckIn({
    company: 'New Swan Group',
    tenantId: '00000000-0000-0000-0000-000000000001',
    allowedCompanies: ['NSMLR', 'NSTLP'],
    moduleType: 'PARTY_MASTER'
  });
  assert.deepEqual(partyEntities.map(p => p.party_name), ['Raian Dealer', 'Paharuwal Dealer']);
});

test('liveTracking.js getDeviceHealthFleetReport isolates employees and branches for non-master SINGLE/MULTI caller', async () => {
  const caller = {
    user_id: 'mgr-1',
    role: 'manager',
    company: 'NSMLR',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    branch_name: 'New Swan Multitech Limited Raian',
    module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'], assigned_branch_names: ['New Swan Multitech Limited Raian'], field_force: { is_manager: true } }
  };

  const roleRows = [
    { user_id: 'u-nsmlr', emp_name: 'Raian Staff', email: 'r@newswangroup.com', company: 'NSMLR', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'agent', is_approved: true, branch_name: 'New Swan Multitech Limited Raian', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSMLR'] } },
    { user_id: 'u-nstlp', emp_name: 'Paharuwal Staff', email: 'p@newswangroup.com', company: 'NSTLP', tenant_id: '00000000-0000-0000-0000-000000000001', role: 'agent', is_approved: true, branch_name: 'New Swan Technologies Limited Paharuwal', module_access: { assigned_branch_scope: 'SINGLE', assigned_branches: ['NSTLP'] } }
  ];

  const fakeDb = {
    auth: { getUser: async () => ({ data: { user: { id: 'mgr-1', email: 'mgr@newswangroup.com' } } }) },
    from(table) {
      let limitSingle = false;
      const q = {
        select() { return q; },
        eq() { return q; },
        gte() { return q; },
        lte() { return q; },
        order() { return q; },
        limit() { limitSingle = true; return q; },
        range() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res, rej) {
          let data = [];
          if (table === 'tenants') data = [{ id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', name: 'New Swan Group', status: 'Active' }];
          else if (table === 'user_roles') data = limitSingle ? [caller] : roleRows;
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return q;
    }
  };

  const liveTracking = loadExports(liveTrackingCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': { createClient: async () => fakeDb },
    '@/utils/fieldTelemetryToken': {},
    '@/utils/routeGeometryMatcher': {},
    '@/utils/branchAccess': branchAccessExports,
    '@/app/actions/tenantBranches': {
      resolveKnownTenant: async () => ({ tenantId: '00000000-0000-0000-0000-000000000001', tenantCode: 'TNT00002', companyName: 'New Swan Group' }),
      getTenantBranches: async () => ({
        success: true,
        branches: [
          { branch_code: 'TNT00002-B0002', branch_name: 'New Swan Multitech Limited Raian', custom_code: 'NSMLR' },
          { branch_code: 'TNT00002-B0003', branch_name: 'New Swan Technologies Limited Paharuwal', custom_code: 'NSTLP' }
        ]
      })
    },
    '@/config/appReleaseConfig': {
      DEFAULT_ANDROID_RELEASE_POLICY: { latest_version_code: 4, min_supported_version_code: 4, download_url: '/api/public/android-apk' },
      sanitizeReleasePolicy: p => p,
      classifyDeviceHealth: () => ({ status: 'OFFLINE', issues: [], issueSummary: 'Offline', locationMode: 'unknown' }),
      HEALTH_STATUS_META: { OFFLINE: { label: 'Offline', shortLabel: 'Offline', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' } },
      DEVICE_HEALTH_STATUS: { HEALTHY: 'HEALTHY', NEEDS_PERMISSION_FIX: 'NEEDS_PERMISSION_FIX', OUTDATED_APK: 'OUTDATED_APK', FORCE_UPGRADE: 'FORCE_UPGRADE', BROWSER_ONLY: 'BROWSER_ONLY', OFFLINE: 'OFFLINE' }
    },
    '@/utils/platformDetection': { parseBrowserAndOsDetails: () => '', PLATFORM_LABELS: { ANDROID_APP: 'Android APK', WEB_APP: 'Browser' } },
    'fs/promises': { readFile: async () => '{}', mkdir: async () => {}, writeFile: async () => {} },
    path: pathMod,
    crypto: cryptoMod,
    os: osMod
  });

  const report = await liveTracking.getDeviceHealthFleetReport('New Swan Group', null);
  assert.equal(report.success, true);
  assert.deepEqual([...report.rows.map(r => r.userId)], ['u-nsmlr']);
  assert.equal(report.summaryCounts.total, 1);
  assert.deepEqual([...report.availableBranches.map(b => b.custom_code)], ['NSMLR']);
});
