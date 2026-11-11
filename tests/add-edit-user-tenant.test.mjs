import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';

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

const modalCode = await compile('src/components/UserManagement/modals/AddEditUserModal.jsx');
const teamCode = await compile('src/app/actions/team.js');
const branchAccessCode = await compile('src/utils/branchAccess.js');
const attendanceCode = await compile('src/app/actions/attendance.js');
const icons = new Proxy({}, { get: () => () => null });

function loadDefault(code, dependencies) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    setTimeout,
    clearTimeout
  });
  return loadedModule.exports.default;
}

function loadExports(code, dependencies) {
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
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    process: { cwd: () => '.', env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'key' } }
  });
  return loadedModule.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : '';
}

function createModalHarness({ tenantId = '00000000-0000-0000-0000-000000000001', currentUserCompany = 'New Swan Group', isMasterAdmin = false, user = null, onSave = () => {} } = {}) {
  const states = [];
  const effects = [];
  let cursor = 0;
  let effectCursor = 0;
  let mounted = false;

  const react = {
    ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect: (fn, deps) => {
      const idx = effectCursor++;
      const prev = effects[idx];
      const changed = !prev || !deps || deps.length !== prev.deps.length || deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        effects[idx] = { fn, deps };
      }
    }
  };

  const branchCalls = [];
  const shiftCalls = [];
  const nsgBranches = [
    { id: 'TNT00002-B0001', company: 'New Swan Group', tenant_id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', branch_code: 'TNT00002-B0001', custom_code: 'NSG', branch_name: 'New Swan Group (Headquarters)', location_type: 'Headquarters', is_active: true },
    { id: 'TNT00002-B0002', company: 'New Swan Group', tenant_id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', branch_code: 'TNT00002-B0002', custom_code: 'NSMLR', branch_name: 'New Swan Multitech Limited Raian', location_type: 'Factory / Plant', is_active: true },
    { id: 'TNT00002-B0003', company: 'New Swan Group', tenant_id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', branch_code: 'TNT00002-B0003', custom_code: 'NSTLP', branch_name: 'New Swan Technologies Limited Paharuwal', location_type: 'Factory / Plant', is_active: true }
  ];

  const branchAccessModule = loadExports(branchAccessCode, {});

  const Modal = loadDefault(modalCode, {
    react,
    'lucide-react': icons,
    '@/components/common/SearchableEmployeeSelect': () => null,
    '@/utils/reportingHierarchy': { getReportingEmail: () => '', getReportingFields: () => ({}) },
    '@/utils/branchAccess': branchAccessModule,
    '../utils/userManagementUtils': {
      DEFAULT_DEPARTMENTS: ['Sales', 'Human Resource'],
      DESIGNATIONS: ['Sales Executive'],
      WORK_LOCATION_TYPES: ['Headquarters', 'Branch Office', 'Factory / Plant', 'Field-Based'],
      EMP_STATUS_OPTIONS: ['Active', 'Draft']
    },
    '../utils/rolePresets': { ROLE_PRESETS: [] },
    '@/app/actions/tenantBranches': {
      resolveKnownTenant: async key => {
        if (String(key).includes('00000000-0000-0000-0000-000000000001') || String(key).toLowerCase().includes('new swan')) {
          return { tenantCode: 'TNT00002', companyName: 'New Swan Group', tenantId: '00000000-0000-0000-0000-000000000001' };
        }
        return { tenantCode: 'TNT00001', companyName: 'SuPuja Creations', tenantId: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' };
      },
      getTenantBranches: async key => {
        branchCalls.push(key);
        return {
          success: true,
          branches: nsgBranches,
          tenant: { tenantId: '00000000-0000-0000-0000-000000000001', tenantCode: 'TNT00002', companyName: 'New Swan Group' }
        };
      }
    },
    '@/app/actions/attendance': {
      getTenantAttendancePolicy: async (tid, comp, br) => {
        shiftCalls.push({ tid, comp, br });
        return { success: true, data: { shifts: [{ id: 's1', shift_name: 'Regular Shift', start_time: '09:00', end_time: '18:30', is_default: true }] } };
      }
    },
    '@/app/actions/saasSubscription': {
      getAllTenantsWithSubscriptions: async () => ({
        success: true,
        tenants: [
          { id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', tenant_code: 'TNT00001', name: 'SuPuja Creations' },
          { id: '00000000-0000-0000-0000-000000000001', tenant_code: 'TNT00002', name: 'New Swan Group' }
        ]
      })
    },
    '@/app/actions/team': { getTeamMembers: async () => [] }
  });

  function render() {
    cursor = 0;
    effectCursor = 0;
    const tree = Modal({
      isOpen: true,
      onClose: () => {},
      onSave,
      user,
      currentUserCompany,
      tenantId,
      isMasterAdmin
    });
    if (!mounted) {
      mounted = true;
    }
    return tree;
  }

  async function flushEffects() {
    for (const item of effects) {
      if (item && !item.ran) {
        item.ran = true;
        item.fn();
      }
    }
    await new Promise(r => setTimeout(r, 15));
  }

  return { render, flushEffects, states, branchCalls, shiftCalls };
}

test('Step 1 Personal & Contact removes Company Name and avoids SuPuja hardcoding for New Swan Group', async () => {
  const harness = createModalHarness();
  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  const allNodes = nodes(tree);
  const labels = allNodes.filter(n => n.type === 'label').map(l => text(l));
  assert.equal(labels.some(l => l.includes('Company Name')), false, 'Company Name must not appear in Personal & Contact');
  assert.equal(labels.some(l => l.includes('Full Name')), true);
  assert.equal(labels.some(l => l.includes('Email Address')), true);

  const inputs = allNodes.filter(n => n.type === 'input');
  assert.equal(inputs.some(i => String(i.props.value || '').includes('SuPuja')), false);
  assert.equal(inputs.some(i => String(i.props.placeholder || '').includes('supujacreations')), false);
  assert.equal(harness.branchCalls.includes('Swan Hosting'), false);
});

test('Step 2 Job & Location loads tenant-wise branches in order Branch Name -> Work Location Type -> Location/Branch/Plant and supports Vehicle Type NONE', async () => {
  const harness = createModalHarness();
  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  // Switch to step 'job'
  const stepBtns = nodes(tree).filter(n => n.type === 'button' && text(n).includes('2. Job & Location'));
  assert.equal(stepBtns.length, 1);
  stepBtns[0].props.onClick();

  tree = harness.render();
  const fullText = text(tree);
  assert.equal(fullText.includes('TNT00002 · New Swan Group'), true, 'Tenant badge must display TNT00002 · New Swan Group');
  assert.equal(fullText.includes('00000000-0000-0000-0000-000000000001'), false, 'Raw tenant UUID must never be exposed in UI');

  const branchIdx = fullText.indexOf('Branch Name');
  const locTypeIdx = fullText.indexOf('Work Location Type');
  const locPlantIdx = fullText.indexOf('Location / Branch / Plant Name');
  assert.ok(branchIdx > -1 && locTypeIdx > branchIdx && locPlantIdx > locTypeIdx, 'Field order must be Branch Name -> Work Location Type -> Location / Branch / Plant Name');

  // Verify tenant branch options exist and Swan Hosting does not
  assert.equal(fullText.includes('New Swan Multitech Limited Raian'), true);
  assert.equal(fullText.includes('Swan Hosting'), false);
  assert.equal(fullText.includes('+ Enter Custom Location...'), true);

  // Switch tracking policy to LIVE_TRACKING
  const liveRadio = nodes(tree).find(n => n.type === 'input' && n.props.name === 'tracking_policy' && n.props.value === 'LIVE_TRACKING');
  assert.ok(liveRadio);
  liveRadio.props.onChange();

  tree = harness.render();
  const vehicleSelect = nodes(tree).find(n => n.type === 'select' && ['NONE', 'BIKE', 'CAR', 'PUBLIC_TRANSPORT'].includes(n.props.value));
  assert.ok(vehicleSelect, 'Vehicle Type select must render when LIVE_TRACKING is enabled');
  const optionValues = nodes(vehicleSelect).filter(n => n.type === 'option').map(o => o.props.value);
  assert.equal(optionValues.includes('NONE'), true, 'Vehicle Type must include NONE option');

  // Select NONE -> conveyance rate becomes 0 and input disabled
  vehicleSelect.props.onChange({ target: { value: 'NONE' } });
  tree = harness.render();
  const rateInput = nodes(tree).find(n => n.type === 'input' && n.props.type === 'number' && n.props.step === '0.25');
  assert.ok(rateInput);
  assert.equal(rateInput.props.value, 0);
  assert.equal(rateInput.props.disabled, true);
});

test('team.js registerEmployeeDetails & updateEmployeeDetailsAdmin persist tenant_id, branch_name, LIVE_TRACKING, NONE vehicle and 0 conveyance rate', async () => {
  const writes = [];
  const fakeDb = {
    from() {
      let mode = 'select';
      let payload = null;
      const query = {
        select() { return query; },
        eq() { return query; },
        or() { return query; },
        neq() { return query; },
        order() { return query; },
        limit() { return query; },
        single() {
          if (mode === 'select') return Promise.resolve({ data: { user_id: 'u1', role: 'agent', emp_id: 'E1', tenant_id: '00000000-0000-0000-0000-000000000001', module_access: {} }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: { email: 'u1@newswangroup.com' }, error: null });
        },
        update(val) {
          mode = 'update';
          payload = val;
          return {
            eq() {
              writes.push({ op: 'update', payload });
              return Promise.resolve({ error: null });
            }
          };
        },
        insert(val) {
          writes.push({ op: 'insert', payload: val });
          return Promise.resolve({ error: null });
        }
      };
      return query;
    },
    auth: { admin: { updateUserById: async () => ({ error: null }) } }
  };

  const team = loadExports(teamCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': { createClient: async () => fakeDb },
    './adminMessageConfig': { sendAdminAccountEmailOtp: async () => ({}) },
    './audit': { logAuditAction: async () => ({}) },
    '@/lib/impersonateStore': { saveImpersonateToken: async () => ({}) },
    '@/utils/reportingHierarchy': { getReportingFields: d => d },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber: x => x },
    '@/utils/permissionUtils': { getSubItemPermissions: () => ({}) }
  });

  const res = await team.updateEmployeeDetailsAdmin('u1', {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    emp_id: 'E1',
    emp_name: 'Field Exec',
    emp_department: 'Sales',
    emp_designation: 'Sales Executive',
    emp_mobile: '9876543210',
    company: 'NSMLR',
    branch_name: 'New Swan Multitech Limited Raian',
    work_location_type: 'Factory / Plant',
    work_location_name: 'New Swan Multitech Limited Raian',
    tracking_policy: 'LIVE_TRACKING',
    vehicle_type: 'NONE',
    conveyance_rate_per_km: 0
  });

  assert.equal(res.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.tenant_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(writes[0].payload.company, 'NSMLR');
  assert.equal(writes[0].payload.branch_name, 'New Swan Multitech Limited Raian');
  assert.equal(writes[0].payload.tracking_policy, 'LIVE_TRACKING');
  assert.equal(writes[0].payload.vehicle_type, 'NONE');
  assert.equal(writes[0].payload.conveyance_rate_per_km, 0);
});

test('Edit Mode preserves custom location input visibility and maps legacy NSMLR company to tenant branch', async () => {
  const existingUser = {
    user_id: 'emp-1',
    emp_name: 'Vikram',
    email: 'vikram@newswangroup.com',
    company: 'NSMLR',
    branch_name: '',
    work_location_type: 'Field-Based',
    work_location_name: 'Delhi Field Territory',
    tracking_policy: 'LIVE_TRACKING',
    vehicle_type: 'NONE',
    conveyance_rate_per_km: 0,
    tenant_id: '00000000-0000-0000-0000-000000000001',
    module_access: {}
  };

  const harness = createModalHarness({ user: existingUser });
  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  const stepBtns = nodes(tree).filter(n => n.type === 'button' && text(n).includes('2. Job & Location'));
  stepBtns[0].props.onClick();
  tree = harness.render();

  const customLocInput = nodes(tree).find(n => n.type === 'input' && n.props.value === 'Delhi Field Territory');
  assert.ok(customLocInput, 'Custom work_location_name must render automatically as editable input in Edit Mode');

  const removePrimaryChip = nodes(tree).find(n => n.type === 'button' && n.props['aria-label'] === 'Remove New Swan Multitech Limited Raian');
  assert.ok(removePrimaryChip, 'Legacy NSMLR company should hydrate into a removable Branch Name chip');

  const rateInput = nodes(tree).find(n => n.type === 'input' && n.props.type === 'number' && n.props.step === '0.25');
  assert.ok(rateInput);
  assert.equal(rateInput.props.value, 0);
  assert.equal(rateInput.props.disabled, true);
});

test('Branch Name chip multi-select supports 2 branches, All Branches, and Primary promotion + save payload', async () => {
  const savedPayloads = [];
  const harness = createModalHarness({
    user: {
      user_id: 'emp-multi',
      emp_name: 'Aman',
      email: 'aman@newswangroup.com',
      company: 'NSMLR',
      branch_name: 'New Swan Multitech Limited Raian',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      module_access: {}
    },
    onSave: payload => savedPayloads.push(payload)
  });

  let tree = harness.render();
  await harness.flushEffects();
  tree = harness.render();

  const stepBtns = nodes(tree).filter(n => n.type === 'button' && text(n).includes('2. Job & Location'));
  stepBtns[0].props.onClick();
  tree = harness.render();

  // Dropdown is the one containing __ALL__ option
  const branchSelect = nodes(tree).find(n =>
    n.type === 'select' && nodes(n).some(o => o.type === 'option' && o.props.value === '__ALL__')
  );
  assert.ok(branchSelect, 'Branch Name selector dropdown must offer All Branches & branch chips');

  // Add second branch: NSTLP
  branchSelect.props.onChange({ target: { value: 'New Swan Technologies Limited Paharuwal' } });
  tree = harness.render();

  assert.equal(text(tree).includes('Primary ·'), true, 'Multiple selected branches must tag first chip as Primary');
  assert.equal(text(tree).includes('Multi-branch enabled (2 branches)'), true);

  // Save and verify MULTI payload
  const formNode = nodes(tree).find(n => n.type === 'form');
  formNode.props.onSubmit({ preventDefault: () => {} });
  const multiSaved = JSON.parse(JSON.stringify(savedPayloads[0]));
  assert.equal(savedPayloads.length, 1);
  assert.equal(multiSaved.assigned_branch_scope, 'MULTI');
  assert.deepEqual(multiSaved.assigned_branches, ['NSMLR', 'NSTLP']);
  assert.deepEqual(multiSaved.assigned_branch_names, [
    'New Swan Multitech Limited Raian',
    'New Swan Technologies Limited Paharuwal'
  ]);
  assert.deepEqual(multiSaved.assigned_branch_codes, ['TNT00002-B0002', 'TNT00002-B0003']);

  // Now switch to All Branches (re-query form from refreshed tree)
  branchSelect.props.onChange({ target: { value: '__ALL__' } });
  tree = harness.render();
  assert.equal(text(tree).includes('All Branches (Full Tenant Access)'), true);

  const allBranchesForm = nodes(tree).find(n => n.type === 'form');
  allBranchesForm.props.onSubmit({ preventDefault: () => {} });
  const allSaved = JSON.parse(JSON.stringify(savedPayloads[1]));
  assert.equal(savedPayloads.length, 2);
  assert.equal(allSaved.assigned_branch_scope, 'ALL');
  assert.deepEqual(allSaved.assigned_branches, ['ALL']);
});

test('branchAccess.js enforces single, multi, and ALL scope while ignoring misleading preset can_view_all_companies flag', () => {
  const { getUserBranchAccess, evaluateLeadCompanyScope } = loadExports(branchAccessCode, {});

  // 1. Single-branch preset that sets can_view_all_companies: true MUST remain SINGLE!
  const singleAccess = getUserBranchAccess({
    moduleAccess: {
      can_view_all_companies: true,
      branch_name: 'New Swan Multitech Limited Raian'
    },
    userCompany: 'NSMLR',
    userRole: 'agent',
    isSwanWorkspace: true
  });
  assert.equal(singleAccess.scope, 'SINGLE');
  assert.equal(singleAccess.isAllBranches, false);
  assert.equal(singleAccess.matchesLeadCompany('NSMLR'), true);
  assert.equal(singleAccess.matchesLeadCompany('NSTLP'), false);

  // 2. Explicit 2-branch assignment inside New Swan Group
  const multiAccess = getUserBranchAccess({
    moduleAccess: {
      assigned_branch_scope: 'MULTI',
      assigned_branches: ['NSMLR', 'NSTLP'],
      assigned_branch_names: ['New Swan Multitech Limited Raian', 'New Swan Technologies Limited Paharuwal']
    },
    userCompany: 'NSMLR',
    userRole: 'agent',
    isSwanWorkspace: true
  });
  assert.equal(multiAccess.scope, 'MULTI');
  assert.equal(multiAccess.isMultiBranch, true);
  assert.equal(multiAccess.isAllBranches, false);
  assert.equal(multiAccess.matchesLeadCompany('NSMLR'), true);
  assert.equal(multiAccess.matchesLeadCompany('NSTL'), true);
  assert.equal(multiAccess.matchesLeadCompany('SuPuja Creations'), false);

  // Filtering header to NSTLP hides NSMLR
  const nsmlrScoped = evaluateLeadCompanyScope('NSMLR', {
    isSwanWorkspace: true,
    userCompany: 'NSMLR',
    adminCompanyFilter: 'NSTLP',
    userBranchAccess: multiAccess,
    isAdmin: false
  });
  assert.equal(nsmlrScoped.inCompanyScope, false);

  // 3. Explicit ALL assignment for non-admin staff inside tenant
  const allAccess = getUserBranchAccess({
    moduleAccess: {
      assigned_branch_scope: 'ALL',
      assigned_branches: ['ALL']
    },
    userCompany: 'NSMLR',
    userRole: 'agent',
    isSwanWorkspace: true
  });
  assert.equal(allAccess.scope, 'ALL');
  assert.equal(allAccess.isAllBranches, true);
  assert.equal(allAccess.matchesLeadCompany('NSMLR'), true);
  assert.equal(allAccess.matchesLeadCompany('NSTLP'), true);
  assert.equal(allAccess.matchesLeadCompany('SuPuja Creations'), false);

  // 4. Client tenant isolation: SuPuja staff stays locked to SuPuja even with ALL scope
  const clientAll = getUserBranchAccess({
    moduleAccess: { assigned_branch_scope: 'ALL', assigned_branches: ['ALL'] },
    userCompany: 'SuPuja Creations',
    userRole: 'agent',
    isSwanWorkspace: false
  });
  assert.equal(clientAll.matchesLeadCompany('SuPuja Creations'), true);
  assert.equal(clientAll.matchesLeadCompany('NSMLR'), false);
});

test('team.js preserves assigned_branch_scope and assigned_branches during role preset module_access updates', async () => {
  const writes = [];
  const existingAccess = {
    assigned_branch_scope: 'MULTI',
    assigned_branches: ['NSMLR', 'NSTLP'],
    assigned_branch_names: ['New Swan Multitech Limited Raian', 'New Swan Technologies Limited Paharuwal'],
    assigned_branch_codes: ['TNT00002-B0002', 'TNT00002-B0003'],
    _tenantId: '00000000-0000-0000-0000-000000000001'
  };
  const fakeDb = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        single() {
          return Promise.resolve({ data: { role: 'agent', module_access: existingAccess }, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: { emp_name: 'Multi User', email: 'multi@newswangroup.com', role: 'agent', module_access: existingAccess }, error: null });
        },
        update(val) {
          return {
            eq() {
              writes.push(val);
              return Promise.resolve({ error: null });
            }
          };
        }
      };
      return query;
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
    '@/utils/permissionUtils': { getSubItemPermissions: () => ({}) }
  });

  const res = await team.updateModuleAccess('u1', { can_view_all_companies: true, role_preset_key: 'sales_coord' });
  assert.equal(res.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].module_access.assigned_branch_scope, 'MULTI');
  assert.deepEqual(writes[0].module_access.assigned_branches, ['NSMLR', 'NSTLP']);
  assert.equal(writes[0].module_access._tenantId, '00000000-0000-0000-0000-000000000001');
});

test('attendance.js punchIn and punchOut avoid missing user_roles.company_name and fall back cleanly on 42703', async () => {
  const pathMod = await import('node:path');
  const cryptoMod = await import('node:crypto');
  const attendanceUtils = await import('../src/utils/attendanceUtils.js');

  const userRoleSelects = [];
  const attendanceRows = [];

  const fakeDb = {
    from(table) {
      let operation = 'select';
      let selectedCols = '*';
      let payload = null;
      const eqFilters = {};
      const query = {
        select(cols) { selectedCols = cols; return query; },
        eq(col, val) { eqFilters[col] = val; return query; },
        is() { return query; },
        ilike() { return query; },
        gte() { return query; },
        lte() { return query; },
        order() { return query; },
        limit() { return query; },
        single() {
          if (table === 'attendance_records') {
            if (operation === 'upsert') {
              attendanceRows.push(payload);
              return Promise.resolve({ data: { ...payload }, error: null });
            }
            if (operation === 'update' && attendanceRows[0]) {
              Object.assign(attendanceRows[0], payload);
              return Promise.resolve({ data: { ...attendanceRows[0] }, error: null });
            }
          }
          return Promise.resolve({ data: attendanceRows[0] ? { ...attendanceRows[0] } : null, error: null });
        },
        maybeSingle() {
          if (table === 'attendance_records') {
            if (operation === 'upsert') {
              attendanceRows.push(payload);
              return Promise.resolve({ data: { ...payload }, error: null });
            }
            if (operation === 'update' && attendanceRows[0]) {
              Object.assign(attendanceRows[0], payload);
              return Promise.resolve({ data: { ...attendanceRows[0] }, error: null });
            }
          }
          if (table === 'user_roles') {
            userRoleSelects.push(selectedCols);
            // Simulate older DB schema missing branch_name/assigned_shift, firing 42703 on explicit select
            if (selectedCols !== '*') {
              return Promise.resolve({ data: null, error: { code: '42703', message: 'column user_roles.branch_name does not exist' } });
            }
            return Promise.resolve({
              data: {
                emp_id: 'EMP-99',
                emp_name: 'Riya',
                emp_department: 'Sales',
                company: 'NSMLR',
                tenant_id: '00000000-0000-0000-0000-000000000001',
                module_access: { branch_name: 'New Swan Multitech Limited Raian', assigned_branch_scope: 'SINGLE' }
              },
              error: null
            });
          }
          if (table === 'attendance_records') {
            const existing = attendanceRows.find(r => r.email === eqFilters.email || r.attendance_date === eqFilters.attendance_date) || null;
            return Promise.resolve({ data: existing ? { ...existing } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(row) {
          operation = 'upsert';
          payload = { ...row };
          return query;
        },
        update(row) {
          operation = 'update';
          payload = { ...row };
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'attendance_records') {
              if (operation === 'upsert') {
                attendanceRows.push(payload);
                return { data: { ...payload }, error: null };
              }
              if (operation === 'update' && attendanceRows[0]) {
                Object.assign(attendanceRows[0], payload);
                return { data: { ...attendanceRows[0] }, error: null };
              }
              return { data: [...attendanceRows], error: null };
            }
            return { data: null, error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };

  const attendance = loadExports(attendanceCode, {
    '@supabase/supabase-js': { createClient: () => fakeDb },
    '@/utils/supabase/server': {},
    '@/utils/reportingHierarchy': {},
    './audit': { logAuditAction: async () => ({}) },
    '@/utils/attendanceUtils': attendanceUtils,
    '@/utils/geoAttendance': { calculateDistanceMeters: () => 0 },
    'fs/promises': {
      readFile: async () => JSON.stringify({ records: [], requests: [] }),
      mkdir: async () => {},
      writeFile: async () => {}
    },
    path: pathMod.default,
    crypto: cryptoMod.default
  });

  const inRes = await attendance.punchIn({
    email: 'riya@newswangroup.com',
    tenantId: '00000000-0000-0000-0000-000000000001'
  });
  assert.equal(inRes.success, true);
  assert.equal(inRes.data.emp_code, 'EMP-99');
  assert.equal(inRes.data.department, 'Sales');

  const outRes = await attendance.punchOut({
    email: 'riya@newswangroup.com',
    tenantId: '00000000-0000-0000-0000-000000000001'
  });
  assert.equal(outRes.success, true);
  assert.equal(outRes.data.emp_code, 'EMP-99');

  assert.equal(userRoleSelects.some(s => String(s).includes('company_name')), false, 'user_roles query must never select company_name');
  assert.equal(userRoleSelects.includes('*'), true, '42703 on explicit columns must fall back to select(*)');
});



